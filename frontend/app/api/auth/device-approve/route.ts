import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '../../../../src/lib/supabase/server';
import { extractIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult, idempotentResponse } from '../../../../src/lib/idempotency';

const ROUTE = '/api/auth/device-approve';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.request_id === 'string' ? body.request_id : '';
  const approverFingerprint = typeof body?.approver_fingerprint === 'string' ? body.approver_fingerprint : '';
  if (!requestId) return NextResponse.json({ error: 'request_id is required.' }, { status: 400 });
  if (!approverFingerprint) return NextResponse.json({ error: 'approver_fingerprint is required.' }, { status: 400 });

  const admin = createAdminClient();

  // Idempotency check
  const idempotencyKey = extractIdempotencyKey(req);
  if (idempotencyKey) {
    const cached = await checkIdempotencyKey(admin, idempotencyKey, ROUTE);
    if (cached) return idempotentResponse(cached);
  }

  // Atomic approval via RPC — handles validation, selective revocation,
  // new device registration, session creation, and audit logging.
  const { data: result, error } = await admin.rpc('approve_device_login', {
    p_request_id: requestId,
    p_approver_id: user.id,
    p_approver_fingerprint: approverFingerprint,
  });

  if (error) {
    console.error('approve_device_login RPC error:', error.message);
    return NextResponse.json({ error: 'Failed to process approval.' }, { status: 500 });
  }

  // The RPC returns a jsonb object
  const rpcResult = result as Record<string, unknown>;
  if (rpcResult?.error) {
    const code = rpcResult.code as string;
    const statusMap: Record<string, number> = {
      not_found: 404,
      forbidden: 403,
      already_resolved: 409,
      expired: 410,
    };
    return NextResponse.json(
      { error: rpcResult.error },
      { status: statusMap[code] ?? 400 },
    );
  }

  // Broadcast device_revoked so the approving device signs itself out immediately
  try {
    const channel = admin.channel(`user-${user.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'device_revoked',
      payload: { reason: 'New device approved' },
    });
    await admin.removeChannel(channel);
  } catch { /* non-fatal */ }

  if (idempotencyKey) {
    await saveIdempotencyResult(admin, idempotencyKey, user.id, ROUTE, { body: { ok: true }, status: 200 });
  }
  return NextResponse.json({ ok: true });
}
