import { NextRequest, NextResponse } from 'next/server';

/** 10 login attempts per IP per 10-minute window. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type RateEntry = { count: number; resetAt: number };
const ipAttempts = new Map<string, RateEntry>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false; // not limited
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  const ip = getClientIp(req);
  if (checkRateLimit(ip)) {
    return NextResponse.json(
      {
        code: 'rate_limited',
        error: 'Too many login attempts. Please wait 10 minutes before trying again.',
      },
      { status: 429 },
    );
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });
  }

  const body = await req.text().catch(() => '');

  let upstream: Response | null = null;
  try {
    upstream = await fetch(`${supabaseUrl}/functions/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        'x-forwarded-for': ip,
      },
      body,
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the login service. Please try again.' },
      { status: 503 },
    );
  }

  const responseText = await upstream.text().catch(() => '{}');
  return new NextResponse(responseText, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
