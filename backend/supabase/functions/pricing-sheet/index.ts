import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const validClientTypes = new Set(['chinese', 'non_chinese', 'direct']);
const validItemKeys = new Set(['trademark', 'patent', 'design', 'copyright', 'up_to_3_classes', 'up_to_5_classes', 'multi_classes']);

function validateFee(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw Error('Fee must be a number >= 0.');
  return Math.round(n * 100) / 100;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role, account_status').eq('id', user.id).single();

  try {
    // GET — read pricing sheet (admin or authenticated for quotation lookups)
    if (request.method === 'GET') {
      if (!profile || profile.account_status !== 'active') return json({ error: 'Active account required.' }, 403);
      const url = new URL(request.url);
      const clientType = url.searchParams.get('client_type');
      let query = db.from('pricing_sheet').select('*').order('client_type').order('item_key');
      if (clientType && validClientTypes.has(clientType)) {
        query = query.eq('client_type', clientType);
      }
      const { data, error } = await query;
      if (error) throw error;
      return json(data);
    }

    // PUT — update pricing rows (admin only)
    if (request.method === 'PUT') {
      if (profile?.role !== 'administrator' || profile.account_status !== 'active') {
        return json({ error: 'Administrator access is required.' }, 403);
      }
      const url = new URL(request.url);
      const batch = url.searchParams.get('batch') === 'true';

      if (batch) {
        // Batch update: array of { id, official_fee, attorney_fee, total_fee }
        const body = await request.json();
        if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 21) {
          return json({ error: 'Provide between 1 and 21 rows.' }, 400);
        }
        const results = [];
        for (const row of body.rows) {
          const official_fee = validateFee(row.official_fee);
          const attorney_fee = validateFee(row.attorney_fee);
          const total_fee = validateFee(row.total_fee);
          const { data, error } = await db
            .from('pricing_sheet')
            .update({ official_fee, attorney_fee, total_fee, updated_by: user.id })
            .eq('id', row.id)
            .select('*')
            .single();
          if (error) throw error;
          results.push(data);
        }
        return json(results);
      }

      // Single row update: /pricing-sheet/:id
      const last = url.pathname.split('/').filter(Boolean).at(-1);
      if (!last || last === 'pricing-sheet') return json({ error: 'Row id is required.' }, 400);
      const body = await request.json();
      const official_fee = validateFee(body.official_fee);
      const attorney_fee = validateFee(body.attorney_fee);
      const total_fee = validateFee(body.total_fee);
      const { data, error } = await db
        .from('pricing_sheet')
        .update({ official_fee, attorney_fee, total_fee, updated_by: user.id })
        .eq('id', last)
        .select('*')
        .single();
      if (error) throw error;
      if (!data) return json({ error: 'Pricing row not found.' }, 404);
      return json(data);
    }

    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'An unexpected error occurred.';
    return json({ error: message }, 400);
  }
});
