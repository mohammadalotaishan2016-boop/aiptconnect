import { NextRequest, NextResponse } from 'next/server';

type RateEntry = { count: number; resetAt: number };

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries?: number;
}

interface RateLimitResult {
  limited: boolean;
  retryAfter: number; // seconds until window resets (0 if not limited)
}

function createRateLimiter(opts: RateLimiterOptions) {
  const { windowMs, maxRequests, maxEntries = 10_000 } = opts;
  const entries = new Map<string, RateEntry>();
  let callsSinceCleanup = 0;

  function cleanup() {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now > entry.resetAt) entries.delete(key);
    }
  }

  function check(key: string): RateLimitResult {
    // Periodic cleanup every 100 calls
    callsSinceCleanup += 1;
    if (callsSinceCleanup >= 100) {
      callsSinceCleanup = 0;
      cleanup();
    }

    const now = Date.now();
    const entry = entries.get(key);

    if (!entry || now > entry.resetAt) {
      // Evict oldest if at capacity
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return { limited: false, retryAfter: 0 };
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { limited: true, retryAfter };
    }

    return { limited: false, retryAfter: 0 };
  }

  return { check };
}

/** 10 requests per 10 minutes — login, unblock-request */
export const strictLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 10 });

/** 20 requests per 10 minutes — invitation accept/verify */
export const moderateLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 20 });

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  );
}
