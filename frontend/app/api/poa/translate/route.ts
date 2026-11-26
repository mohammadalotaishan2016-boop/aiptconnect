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
const CARRIER2_PREFIXES_ADDRESS = ['عنواني هو ', 'عنواني '];

async function libreTranslateOnce(text: string): Promise<string | null> {
  const url = process.env.LIBRETRANSLATE_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(`${url}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: 'ar' }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({})) as { translatedText?: unknown };
    return response.ok && typeof body.translatedText === 'string' ? body.translatedText : null;
  } catch { return null; }
}

function tryStripPrefixes(result: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      const stripped = result.slice(prefix.length).trim();
      if (stripped && !isMostlyLatin(stripped)) return stripped;
    }
  }
  return null;
}

async function translateOneSegment(segment: string, kind: Kind): Promise<string | null> {
  // Try direct translation first.
  const direct = await libreTranslateOnce(segment);
  if (direct && !isMostlyLatin(direct)) return direct;

  // Carrier 1: "I work at …" / "I live at …"
  const carrier1 = kind === 'name' ? `I work at ${segment}` : `I live at ${segment}`;
  const wrapped1 = await libreTranslateOnce(carrier1);
  if (wrapped1) {
    const prefixes1 = kind === 'name' ? CARRIER_PREFIXES_NAME : CARRIER_PREFIXES_ADDRESS;
    const result1 = tryStripPrefixes(wrapped1, prefixes1);
    if (result1) return result1;
  }

  // Carrier 2 (address only): "My address is …" — works better for place names.
  if (kind === 'address') {
    const wrapped2 = await libreTranslateOnce(`My address is ${segment}`);
    if (wrapped2) {
      const result2 = tryStripPrefixes(wrapped2, CARRIER2_PREFIXES_ADDRESS);
      if (result2) return result2;
    }
  }

  return null;
}

async function translateWithLibre(text: string, kind: Kind): Promise<string | null> {
  // Try the full text first (works for short inputs).
  const full = await translateOneSegment(text, kind);
  if (full) return full;

  // For long addresses with multiple parts, split and translate each segment.
  // Split on newlines or repeated address patterns (city, country boundaries).
  const segments = text.split(/\n+/).flatMap(line =>
    line.split(/(?<=(?:Saudi Arabia|Qatar|UAE|Bahrain|Kuwait|Oman|Jordan|Egypt|Iraq|Lebanon|Morocco|Tunisia|Algeria|Libya|Sudan|Yemen|Syria|Turkey|Iran|Pakistan|India|China|Japan|USA|UK|Canada|Australia|France|Germany|Italy|Spain))\s*/i)
  ).map(s => s.trim()).filter(Boolean);

  if (segments.length <= 1) return null;

  const results: string[] = [];
  for (const segment of segments) {
    const translated = await translateOneSegment(segment, kind);
    if (!translated) return null;
    results.push(translated);
  }
  return results.join('\n');
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
