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

  const { data: loginReq } = await admin
    .from('login_requests')
    .select('id, user_id, session_access_token, status')
    .eq('id', requestId)
    .single();

  if (!loginReq || loginReq.user_id !== user.id) {
    return NextResponse.json({ error: 'Login request not found.' }, { status: 404 });
  }
  if (loginReq.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been resolved.' }, { status: 409 });
  }

  // Revoke the pending session that was stored
  if (loginReq.session_access_token) {
    await admin.auth.admin.signOut(loginReq.session_access_token).catch(() => undefined);
  }

  await admin
    .from('login_requests')
    .update({ status: 'denied', session_access_token: null, session_refresh_token: null, resolved_at: new Date().toISOString() })
    .eq('id', requestId);

  // Broadcast so the waiting device learns it was denied immediately
  try {
    const channel = admin.channel(`login-request-${requestId}`);
    await channel.send({
      type: 'broadcast',
      event: 'login_request_denied',
      payload: { request_id: requestId },
    });
    await admin.removeChannel(channel);
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
