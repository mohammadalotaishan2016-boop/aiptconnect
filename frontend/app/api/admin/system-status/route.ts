import { NextResponse } from 'next/server';
import { requireRole } from '../../../../src/lib/guards';
import { createAdminClient } from '../../../../src/lib/supabase/server';
import { getSnapshot } from '../../../../src/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole(['administrator', 'sub_administrator']);

    const admin = createAdminClient();

    // DB health check
    const dbStart = Date.now();
    const { error: dbErr } = await admin.from('profiles').select('id').limit(1);
    const dbLatencyMs = Date.now() - dbStart;

    // Active users count
    const { count: activeUsers } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Active devices count
    const { count: activeDevices } = await admin
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Recent login failures (last hour) from audit_logs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentLoginFailures } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'login_failed')
      .gte('created_at', oneHourAgo);

    // Pending unblock requests
    const { count: pendingUnblocks } = await admin
      .from('unblock_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const metrics = getSnapshot();

    return NextResponse.json({
      health: {
        database: dbErr ? 'unavailable' : 'ok',
        dbLatencyMs,
      },
      counts: {
        activeUsers: activeUsers ?? 0,
        activeDevices: activeDevices ?? 0,
        recentLoginFailures: recentLoginFailures ?? 0,
        pendingUnblocks: pendingUnblocks ?? 0,
      },
      metrics,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json({ error: e.message ?? 'Server error.' }, { status: e.status ?? 500 });
  }
}
