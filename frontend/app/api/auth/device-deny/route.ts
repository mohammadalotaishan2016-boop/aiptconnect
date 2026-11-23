import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '../../../../src/lib/supabase/server';
import { extractIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult, idempotentResponse } from '../../../../src/lib/idempotency';

const ROUTE = '/api/auth/device-deny';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.request_id === 'string' ? body.request_id : '';
  if (!requestId) return NextResponse.json({ error: 'request_id is required.' }, { status: 400 });

  const admin = createAdminClient();

  // Idempotency check
  const idempotencyKey = extractIdempotencyKey(req);
  if (idempotencyKey) {
    const cached = await checkIdempotencyKey(admin, idempotencyKey, ROUTE);
    if (cached) return idempotentResponse(cached);
  }

  const { data: loginReq } = await admin
    .from('login_requests')
    .select('id, user_id, device_fingerprint, session_access_token, status')
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

  await admin.from('audit_logs').insert({
    actor_id: user.id,
    entity_type: 'login_request',
    entity_id: requestId,
    action: 'device_deny',
    before_data: { device_fingerprint: loginReq.device_fingerprint ?? null },
    after_data: { status: 'denied' },
    created_by: user.id,
  });

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

  if (idempotencyKey) {
    await saveIdempotencyResult(admin, idempotencyKey, user.id, ROUTE, { body: { ok: true }, status: 200 });
  }
  return NextResponse.json({ ok: true });
}
