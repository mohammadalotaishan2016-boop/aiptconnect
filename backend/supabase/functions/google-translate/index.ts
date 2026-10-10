import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' },
});

const targets: Record<string, string> = { ar: 'ar', fil: 'fil', zh: 'zh-CN' };
type GoogleTranslationResponse = { data?: { translations?: Array<{ translatedText?: unknown }> } };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Google translation is not configured on the server.' }, 503);
    }

    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const db = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
    if (authError || !user || !user.email) return json({ error: 'An authenticated client account is required.' }, 401);
    if (!googleApiKey) return json({ error: 'Google translation is not configured on the server.' }, 503);

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role,client_id,approval_status,account_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'client' || profile.approval_status !== 'approved' || profile.account_status !== 'active' || !profile.client_id) {
      return json({ error: 'An approved, active client account is required.' }, 403);
    }

    const { data: client, error: clientError } = await db.from('clients')
      .select('email')
      .eq('id', profile.client_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return json({ error: 'The registered client email does not match this account.' }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'A valid translation request is required.' }, 400);
    }
    if (!body || typeof body !== 'object' || !('target' in body) || !('texts' in body)) {
      return json({ error: 'A target language and text list are required.' }, 400);
    }
    const target = typeof body.target === 'string' ? targets[body.target] : undefined;
    const texts: unknown = body.texts;
    if (!target || !Array.isArray(texts) || texts.length < 1 || texts.length > 80 ||
      texts.some((text) => typeof text !== 'string' || text.length < 1 || text.length > 5000) ||
      texts.reduce((total, text) => total + (typeof text === 'string' ? text.length : 0), 0) > 30000) {
      return json({ error: 'The translation request is invalid or too large.' }, 400);
    }

    const endpoint = new URL('https://translation.googleapis.com/language/translate/v2');
    endpoint.searchParams.set('key', googleApiKey);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, target, format: 'text' }),
    });
    const result = await response.json().catch(() => ({})) as GoogleTranslationResponse;
    const translations = result.data?.translations;
    if (!response.ok || !Array.isArray(translations) || translations.length !== texts.length ||
      translations.some((item) => typeof item?.translatedText !== 'string')) {
      console.error('Google Cloud Translation returned an unsuccessful or invalid response.', { status: response.status });
      return json({ error: 'The translation provider could not translate this content.' }, 502);
    }

    return json({ translations: translations.map((item) => item.translatedText as string) });
  } catch (cause) {
    console.error('Google Cloud Translation request failed:', cause);
    return json({ error: 'The translation provider could not translate this content.' }, 502);
  }
});
