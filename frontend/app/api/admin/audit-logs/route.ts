import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../../../src/lib/guards';
import { createAdminClient } from '../../../../src/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['administrator']);

    const url = req.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') ?? '50', 10)));
    const entityType = url.searchParams.get('entity_type') ?? '';
    const actorId = url.searchParams.get('actor_id') ?? '';
    const dateFrom = url.searchParams.get('date_from') ?? '';
    const dateTo = url.searchParams.get('date_to') ?? '';
    const action = url.searchParams.get('action') ?? '';

    const admin = createAdminClient();

    let query = admin
      .from('audit_logs')
      .select('id, actor_id, entity_type, entity_id, action, before_data, after_data, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (entityType) query = query.eq('entity_type', entityType);
    if (actorId) query = query.eq('actor_id', actorId);
    if (action) query = query.eq('action', action);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data: logs, count, error } = await query;
    if (error) throw error;

    // Enrich actor names from profiles
    const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))];
    let actorNames: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds);
      actorNames = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? 'Unknown']),
      );
    }

    const enriched = (logs ?? []).map((log) => ({
      ...log,
      actor_name: actorNames[log.actor_id] ?? 'Unknown',
    }));

    return NextResponse.json({ data: enriched, total: count ?? 0, page, page_size: pageSize });
  } catch (cause: unknown) {
    const err = cause as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? 'Unable to load audit logs.' },
      { status: err.status ?? 500 },
    );
  }
}
