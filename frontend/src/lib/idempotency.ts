import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

interface CachedResult {
  body: Record<string, unknown>;
  status: number;
}

/** Extract Idempotency-Key header from a request. Returns null if absent or invalid. */
export function extractIdempotencyKey(req: NextRequest): string | null {
  const key = req.headers.get('idempotency-key');
  if (!key || key.length < 1 || key.length > 500) return null;
  return key;
}

/** Check if an idempotency key already has a cached result. */
export async function checkIdempotencyKey(
  admin: SupabaseClient,
  key: string,
  route: string,
): Promise<CachedResult | null> {
  const { data } = await admin
    .from('idempotency_keys')
    .select('result_snapshot')
    .eq('key', key)
    .eq('route', route)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (data?.result_snapshot) {
    return data.result_snapshot as unknown as CachedResult;
  }
  return null;
}

/** Save the result of an idempotent operation. */
export async function saveIdempotencyResult(
  admin: SupabaseClient,
  key: string,
  userId: string | null,
  route: string,
  result: CachedResult,
): Promise<void> {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await admin.from('idempotency_keys').upsert(
    {
      key,
      user_id: userId,
      route,
      result_snapshot: result as unknown as Record<string, unknown>,
      expires_at: expires,
    },
    { onConflict: 'key' },
  );
}

/** Helper: return cached idempotent response as NextResponse. */
export function idempotentResponse(cached: CachedResult): NextResponse {
  return NextResponse.json(cached.body, { status: cached.status });
}
