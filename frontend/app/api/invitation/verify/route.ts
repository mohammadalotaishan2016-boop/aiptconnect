import { NextRequest, NextResponse } from 'next/server';
import { moderateLimiter, getClientIp, rateLimitResponse } from '../../../../src/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { limited, retryAfter } = moderateLimiter.check(getClientIp(req));
  if (limited) return rateLimitResponse(retryAfter);

  const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';
  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/invite-user?action=verify&token=${encodeURIComponent(token)}`,
    { headers: { apikey: anonKey } },
  ).catch(() => null);

  if (!upstream) return NextResponse.json({ error: 'Unable to reach the invitation service.' }, { status: 503 });
  const text = await upstream.text().catch(() => '{}');
  return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
}
