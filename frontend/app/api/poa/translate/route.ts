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

/** Returns true when the majority of alphabetic characters are Latin. */
function isMostlyLatin(value: string): boolean {
  let latin = 0;
  let nonLatin = 0;
  for (const ch of value) {
    if (/[A-Za-z]/.test(ch)) latin++;
    else if (/\p{L}/u.test(ch)) nonLatin++;
  }
  if (nonLatin === 0) return true;             // all-Latin or no letters
  return latin / (latin + nonLatin) > 0.4;     // >40% Latin → mostly Latin
}

const CARRIER_PREFIXES_NAME = ['أنا أعمل في ', 'أعمل في '];
const CARRIER_PREFIXES_ADDRESS = ['أنا أعيش في ', 'أعيش في '];

async function libreTranslateOnce(text: string): Promise<string | null> {
  const url = process.env.LIBRETRANSLATE_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(`${url}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: 'ar' }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({})) as { translatedText?: unknown };
    return response.ok && typeof body.translatedText === 'string' ? body.translatedText : null;
  } catch { return null; }
}

async function translateWithLibre(text: string, kind: Kind): Promise<string | null> {
  // Try direct translation first.
  const direct = await libreTranslateOnce(text);
  if (direct && !isMostlyLatin(direct)) return direct;

  // Direct failed (returned mostly-Latin text). Retry with a carrier sentence
  // that gives LibreTranslate enough context to transliterate proper nouns.
  const carrier = kind === 'name'
    ? `I work at ${text}`
    : `I live at ${text}`;
  const wrapped = await libreTranslateOnce(carrier);
  if (!wrapped) return null;

  // Strip the known Arabic carrier prefix.
  const prefixes = kind === 'name' ? CARRIER_PREFIXES_NAME : CARRIER_PREFIXES_ADDRESS;
  for (const prefix of prefixes) {
    if (wrapped.startsWith(prefix)) {
      const stripped = wrapped.slice(prefix.length).trim();
      if (stripped && !isMostlyLatin(stripped)) return stripped;
    }
  }

  // Carrier prefix not found or result still mostly Latin — give up.
  return null;
}

async function translateWithGoogle(text: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: 'ar', format: 'text' }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({})) as { data?: { translations?: Array<{ translatedText?: unknown }> } };
    const value = body.data?.translations?.[0]?.translatedText;
    return response.ok && typeof value === 'string' ? value : null;
  } catch { return null; }
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
  if (typeof text !== 'string' || (kind !== 'name' && kind !== 'address')) {
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

  const trimmed = text.trim();
  const libreRaw = await translateWithLibre(trimmed, kind as Kind);
  const libreArabic = libreRaw ? cleanTranslation(libreRaw, text) : '';
  const libreOk = Boolean(libreArabic && !isMostlyLatin(libreArabic));
  const raw = libreOk ? libreRaw! : await translateWithGoogle(trimmed);
  if (typeof raw !== 'string') return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  const arabic = libreOk ? libreArabic : cleanTranslation(raw, text);
  if (!arabic || isMostlyLatin(arabic)) return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  return NextResponse.json({ arabic }, { headers: { 'Cache-Control': 'private, no-store' } });
}
