import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../../../src/lib/guards';
import { createAdminClient } from '../../../../src/lib/supabase/server';
import { createLogger, getRequestId } from '../../../../src/lib/logger';
import { recordRequest } from '../../../../src/lib/metrics';

/**
 * GET /api/admin/devices?user_id=X — List devices + sessions for a user.
 * POST /api/admin/devices — Revoke a specific device.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireRole(['administrator', 'sub_administrator']);
    const userId = req.nextUrl.searchParams.get('user_id') ?? '';
    if (!userId) return NextResponse.json({ error: 'user_id is required.' }, { status: 400 });

    const admin = createAdminClient();

    const { data: devices, error: devErr } = await admin
      .from('devices')
      .select('id, device_id, device_name, device_type, browser, operating_system, user_agent, ip, status, last_seen_at, revoked_at, revoked_reason, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (devErr) {
      console.error('[admin/devices] devices query error:', JSON.stringify(devErr));
      throw devErr;
    }

    const deviceIds = (devices ?? []).map((d) => d.id);
    let sessions: Record<string, unknown>[] = [];
    if (deviceIds.length > 0) {
      const { data: sessData, error: sessErr } = await admin
        .from('device_sessions')
        .select('id, device_id, status, last_active_at, revoked_at, created_at')
        .in('device_id', deviceIds)
        .order('created_at', { ascending: false });
      if (sessErr) {
        console.error('[admin/devices] sessions query error:', JSON.stringify(sessErr));
        throw sessErr;
      }
      sessions = sessData ?? [];
    }

    return NextResponse.json({ devices: devices ?? [], sessions, actor: user.id });
  } catch (err: unknown) {
    console.error('[admin/devices] handler error:', err);
    const e = err as { status?: number; message?: string };
    return NextResponse.json({ error: e.message ?? 'Server error.' }, { status: e.status ?? 500 });
  }
}

export async function POST(req: NextRequest) {
  const log = createLogger({ requestId: getRequestId(req), route: '/api/admin/devices' });
  recordRequest('/api/admin/devices');

  try {
    const { user } = await requireRole(['administrator']);
    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
    if (!deviceId) return NextResponse.json({ error: 'device_id is required.' }, { status: 400 });

    const admin = createAdminClient();

    const { data: device } = await admin
      .from('devices')
      .select('id, user_id, device_id, status, tenant_id')
      .eq('id', deviceId)
      .single();

    if (!device) return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
    if (device.status === 'revoked') return NextResponse.json({ error: 'Device is already revoked.' }, { status: 409 });

    await admin
      .from('devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'Revoked by administrator' })
      .eq('id', deviceId);

    await admin
      .from('device_sessions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'Revoked by administrator' })
      .eq('device_id', deviceId)
      .eq('status', 'active');

    try {
      const channel = admin.channel(`user-${device.user_id}`);
      await channel.send({
        type: 'broadcast',
        event: 'device_revoked',
        payload: { reason: 'Revoked by administrator', device_fingerprint: device.device_id },
      });
      await admin.removeChannel(channel);
    } catch { /* non-fatal */ }

    await admin.from('audit_logs').insert({
      actor_id: user.id,
      entity_type: 'device',
      entity_id: deviceId,
      action: 'device_revoke',
      before_data: { status: 'active', device_fingerprint: device.device_id },
      after_data: { status: 'revoked', reason: 'Revoked by administrator' },
      tenant_id: device.tenant_id,
      created_by: user.id,
    });

    log.info('device_revoked', { deviceId, userId: device.user_id, actor: user.id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    log.error('device_revoke_failed', { error: e.message });
    return NextResponse.json({ error: e.message ?? 'Server error.' }, { status: e.status ?? 500 });
  }
}
