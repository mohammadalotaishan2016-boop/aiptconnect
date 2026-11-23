import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '../../../../src/lib/supabase/server';
import { extractIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult, idempotentResponse } from '../../../../src/lib/idempotency';

const ROUTE = '/api/invitation/create';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || profile.role !== 'administrator' || profile.status !== 'active') {
    return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  }

  // Idempotency check
  const idempotencyKey = extractIdempotencyKey(req);
  if (idempotencyKey) {
    const adminClient = createAdminClient();
    const cached = await checkIdempotencyKey(adminClient, idempotencyKey, ROUTE);
    if (cached) return idempotentResponse(cached);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

  const body = await req.text().catch(() => '{}');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

  const upstream = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...JSON.parse(body), action: 'create' }),
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ error: 'Unable to reach the invitation service.' }, { status: 503 });
  const text = await upstream.text().catch(() => '{}');

  if (idempotencyKey) {
    try {
      const parsed = JSON.parse(text);
      await saveIdempotencyResult(createAdminClient(), idempotencyKey, user.id, ROUTE, { body: parsed, status: upstream.status });
    } catch { /* non-fatal */ }
  }

  return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
}
