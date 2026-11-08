import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Kind = 'name' | 'address';
type RateEntry = { startedAt: number; count: number };
const rateByUser = new Map<string, RateEntry>();

function cleanTranslation(value: string, originalText: string) {
  const originalDigits = [...originalText.matchAll(/[0-9]+/g)].map(([digits]) => digits);
  let cleaned = value
    .replace(/^```(?:[a-z]+)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
    .replace(/^(["'“”‘’])(.*)\1$/s, '$2')
    .trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const translatedDigits = [...cleaned.matchAll(/[0-9]+/g)].map(([digits]) => digits);
  // Translation should retain each digit run exactly, in order. If the provider
  // changes the runs, restore the original runs only when their slots remain.
  if (originalDigits.length === translatedDigits.length) {
    let index = 0;
    cleaned = cleaned.replace(/[0-9]+/g, () => originalDigits[index++]);
  }
  return cleaned;
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

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.error('POA translation failed: GOOGLE_TRANSLATE_API_KEY is missing');
    return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  }
  const addressPrompt = kind === 'address'
    ? 'Translate generic address terms into Arabic; phonetically transliterate proper names and place names. Preserve every digit run exactly and in its original position. '
    : '';
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `${addressPrompt}${text.trim()}`, source: 'en', target: 'ar', format: 'text' }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({})) as { data?: { translations?: Array<{ translatedText?: unknown }> } };
    const value = body.data?.translations?.[0]?.translatedText;
    if (!response.ok || typeof value !== 'string') return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
    const arabic = cleanTranslation(value, text);
    if (!arabic || /[A-Za-z]/.test(arabic)) return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
    return NextResponse.json({ arabic }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  }
}
