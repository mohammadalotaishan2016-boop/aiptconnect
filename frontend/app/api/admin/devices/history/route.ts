import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../../../../src/lib/guards';
import { createAdminClient } from '../../../../../src/lib/supabase/server';

/**
 * GET /api/admin/devices/history?user_id=X — Login request history for a user.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(['administrator', 'sub_administrator']);

    const userId = req.nextUrl.searchParams.get('user_id') ?? '';
    if (!userId) return NextResponse.json({ error: 'user_id is required.' }, { status: 400 });

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('page_size') ?? '20', 10)));

    const admin = createAdminClient();

    const { data, count, error } = await admin
      .from('login_requests')
      .select('id, device_fingerprint, user_agent, ip, status, approved_by_device_id, created_at, expires_at, resolved_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json({ error: e.message ?? 'Server error.' }, { status: e.status ?? 500 });
  }
}
