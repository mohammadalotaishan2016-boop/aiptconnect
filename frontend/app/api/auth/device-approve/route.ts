import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '../../../../src/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.request_id === 'string' ? body.request_id : '';
  if (!requestId) return NextResponse.json({ error: 'request_id is required.' }, { status: 400 });

  const admin = createAdminClient();

  // Verify the login_request belongs to this user and is still pending
  const { data: loginReq } = await admin
    .from('login_requests')
    .select('id, user_id, device_fingerprint, session_access_token, session_refresh_token, expires_at, status')
    .eq('id', requestId)
    .single();

  if (!loginReq || loginReq.user_id !== user.id) {
    return NextResponse.json({ error: 'Login request not found.' }, { status: 404 });
  }
  if (loginReq.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been resolved.' }, { status: 409 });
  }
  if (new Date(loginReq.expires_at) < new Date()) {
    await admin.from('login_requests').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('id', requestId);
    return NextResponse.json({ error: 'This login request has expired.' }, { status: 410 });
  }

  // Revoke all existing active devices except the requesting fingerprint
  await admin
    .from('devices')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'New device approved' })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .neq('device_id', loginReq.device_fingerprint);

  // Register the new device
  if (loginReq.device_fingerprint && loginReq.device_fingerprint !== 'unknown') {
    await admin.from('devices').upsert(
      {
        user_id: user.id,
        device_id: loginReq.device_fingerprint,
        status: 'active',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id', ignoreDuplicates: false },
    );
  }

  // Mark the request as approved
  await admin
    .from('login_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', requestId);

  // Broadcast device_revoked so the existing device signs itself out immediately
  try {
    const channel = admin.channel(`user-${user.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'device_revoked',
      payload: { reason: 'New device approved' },
    });
    await admin.removeChannel(channel);
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
