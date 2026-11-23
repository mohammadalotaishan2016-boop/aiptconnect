import { NextRequest, NextResponse } from 'next/server';
import { moderateLimiter, getClientIp, rateLimitResponse } from '../../../../src/lib/rate-limit';
import { createAdminClient } from '../../../../src/lib/supabase/server';
import { extractIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult, idempotentResponse } from '../../../../src/lib/idempotency';

const ROUTE = '/api/invitation/accept';

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = moderateLimiter.check(getClientIp(req));
  if (limited) return rateLimitResponse(retryAfter);

  // Idempotency check (public route — user_id is null)
  const idempotencyKey = extractIdempotencyKey(req);
  if (idempotencyKey) {
    const admin = createAdminClient();
    const cached = await checkIdempotencyKey(admin, idempotencyKey, ROUTE);
    if (cached) return idempotentResponse(cached);
  }

  const body = await req.text().catch(() => '{}');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

  const upstream = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ ...JSON.parse(body), action: 'accept' }),
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ error: 'Unable to reach the invitation service.' }, { status: 503 });
  const text = await upstream.text().catch(() => '{}');

  if (idempotencyKey) {
    try {
      const parsed = JSON.parse(text);
      await saveIdempotencyResult(createAdminClient(), idempotencyKey, null, ROUTE, { body: parsed, status: upstream.status });
    } catch { /* non-fatal */ }
  }

  return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
}
