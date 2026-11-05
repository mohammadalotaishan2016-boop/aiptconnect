import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Kind = 'name' | 'address';
type RateEntry = { startedAt: number; count: number };
const rateByUser = new Map<string, RateEntry>();

function cleanProviderText(value: string) {
  return value.replace(/^```(?:[a-z]+)?\s*/i, '').replace(/\s*```$/, '').trim().replace(/^(["'“”‘’])(.*)\1$/s, '$2').trim();
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }); }
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const { text, kind } = input as Record<string, unknown>;
  if (typeof text !== 'string' || text.length > 500 || (kind !== 'name' && kind !== 'address')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ arabic: '' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publicKey) return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  const supabase = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = Date.now();
  const rate = rateByUser.get(user.id);
  if (!rate || now - rate.startedAt >= 60_000) rateByUser.set(user.id, { startedAt: now, count: 1 });
  else if (rate.count >= 30) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  else rate.count += 1;

  const prompt = kind === 'name'
    ? `Phonetically transliterate the following personal or company name into Arabic letters in Modern Standard Arabic. Do not translate its meaning. Return only Arabic text, no quotes or explanation.\n\n${text.trim()}`
    : `Translate only generic address words (street, road, building, city, district, province, country) into Arabic. Transliterate proper nouns and place names phonetically into Arabic. Keep every digit unchanged and in its original position. Return only Arabic text, no quotes or explanation.\n\n${text.trim()}`;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/google-translate`, {
      method: 'POST',
      headers: { Authorization: authorization!, apikey: publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'ar', texts: [prompt] }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({})) as { translations?: unknown };
    const value = Array.isArray(body.translations) ? body.translations[0] : null;
    if (!response.ok || typeof value !== 'string') return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
    const arabic = cleanProviderText(value);
    if (!arabic || /[A-Za-z]/.test(arabic)) return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
    return NextResponse.json({ arabic }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  }
}
