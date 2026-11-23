import { NextRequest, NextResponse } from 'next/server';
import { strictLimiter, getClientIp, rateLimitResponse } from '../../../../src/lib/rate-limit';
import { createLogger, getRequestId } from '../../../../src/lib/logger';
import { recordRequest, recordError, recordRateLimitHit, recordLatency, recordLoginSuccess, recordLoginFailure } from '../../../../src/lib/metrics';

const ROUTE = '/api/auth/login';

export async function POST(req: NextRequest) {
  const start = Date.now();
  const ip = getClientIp(req);
  const log = createLogger({ requestId: getRequestId(req), route: ROUTE });

  const { limited, retryAfter } = strictLimiter.check(ip);
  if (limited) {
    recordRateLimitHit(ROUTE);
    log.warn('rate_limited', { ip });
    return rateLimitResponse(retryAfter);
  }

  recordRequest(ROUTE);

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    recordError(ROUTE);
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
    recordError(ROUTE);
    log.error('upstream_unreachable', { durationMs: Date.now() - start });
    return NextResponse.json(
      { error: 'Unable to reach the login service. Please try again.' },
      { status: 503 },
    );
  }

  const responseText = await upstream.text().catch(() => '{}');
  const durationMs = Date.now() - start;
  recordLatency(durationMs);

  if (upstream.status >= 400) {
    recordLoginFailure();
    log.warn('login_failed', { status: upstream.status, durationMs });
  } else {
    recordLoginSuccess();
    log.info('login_success', { durationMs });
  }

  return new NextResponse(responseText, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
