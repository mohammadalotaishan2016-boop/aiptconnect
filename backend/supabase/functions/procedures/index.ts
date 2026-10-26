import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const colors = new Set(['purple', 'blue', 'green', 'orange', 'red', 'teal', 'yellow', 'gray', 'pink', 'indigo']);

function validate(body: unknown) {
  const value = body as Record<string, unknown>;
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const detail_text = typeof value.detail_text === 'string' ? value.detail_text.trim() : '';
  const color_indication = typeof value.color_indication === 'string' ? value.color_indication : '';
  const service_id = typeof value.service_id === 'string' ? value.service_id : '';
  if (description.length < 3 || description.length > 255) throw new Error('Description must be between 3 and 255 characters.');
  if (!detail_text) throw new Error('Detail text is required.');
  if (!colors.has(color_indication)) throw new Error('Choose a valid color indication.');
  if (!service_id) throw new Error('A service is required.');
  return { description, detail_text, color_indication, service_id };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);
  const url = new URL(request.url), last = url.pathname.split('/').filter(Boolean).at(-1);
  const id = last === 'procedures' ? null : last;
  const select = 'id,description,detail_text,color_indication,service_id,client_visible,created_at,updated_at,service:services(id,service)';
  try {
    if (request.method === 'GET' && id) {
      const { data, error } = await db.from('procedures').select(select).eq('id', id).is('deleted_at', null).single();
      if (error || !data) return json({ error: 'Procedure not found.' }, 404);
      return json(data);
    }
    if (request.method === 'GET') {
      const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1);
      const perPage = Math.min(Math.max(Number(url.searchParams.get('perPage') ?? 10), 1), 100);
      const search = url.searchParams.get('search')?.trim() ?? '';
      const sort = ['description', 'color_indication', 'created_at'].includes(url.searchParams.get('sort') || '') ? url.searchParams.get('sort')! : 'created_at';
      let query = db.from('procedures').select(select, { count: 'exact' }).is('deleted_at', null).order(sort, { ascending: url.searchParams.has('direction') ? url.searchParams.get('direction') === 'asc' : sort === 'description' }).order('id');
      if (search) query = query.or(`description.ilike.%${search}%,detail_text.ilike.%${search}%`);
      if (colors.has(url.searchParams.get('color') ?? '')) query = query.eq('color_indication', url.searchParams.get('color'));
      if (url.searchParams.get('service_id')) query = query.eq('service_id', url.searchParams.get('service_id'));
      const { data, error, count } = await query.range((page - 1) * perPage, page * perPage - 1);
      if (error) throw error;
      return json({ data, total: count ?? 0, page, perPage });
    }
    if (request.method === 'POST') {
      const payload = validate(await request.json());
      const { data: service } = await db.from('services').select('id').eq('id', payload.service_id).is('deleted_at', null).maybeSingle();
      if (!service) return json({ error: 'The selected service no longer exists.' }, 400);
      const { data, error } = await db.from('procedures').insert(payload).select(select).single(); if (error) throw error;
      await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'procedure', entity_id: data.id, action: 'create', after_data: data }); return json(data, 201);
    }
    if (!id) return json({ error: 'Procedure id is required.' }, 400);
    const { data: before } = await db.from('procedures').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!before) return json({ error: 'Procedure not found.' }, 404);
    if (request.method === 'PATCH') {
      const body = await request.json();
      if (typeof body.client_visible !== 'boolean') return json({ error: 'client_visible must be a boolean.' }, 400);
      const { data, error } = await db.from('procedures').update({ client_visible: body.client_visible }).eq('id', id).is('deleted_at', null).select(select).single();
      if (error) throw error;
      await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'procedure', entity_id: id, action: 'visibility', before_data: before, after_data: data });
      return json(data);
    }
    if (request.method === 'PUT') {
      const payload = validate(await request.json());
      const { data: service } = await db.from('services').select('id').eq('id', payload.service_id).is('deleted_at', null).maybeSingle();
      if (!service) return json({ error: 'The selected service no longer exists.' }, 400);
      const { data, error } = await db.from('procedures').update(payload).eq('id', id).select(select).single(); if (error) throw error; await db.from('audit_logs').insert({ actor_id:user.id, entity_type:'procedure', entity_id:id, action:'update', before_data:before, after_data:data }); return json(data);
    }
    if (request.method === 'DELETE') { const { error } = await db.from('procedures').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await db.from('audit_logs').insert({ actor_id:user.id, entity_type:'procedure', entity_id:id, action:'delete', before_data:before }); return new Response(null, { status: 204, headers: cors }); }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed.' }, 400); }
});
