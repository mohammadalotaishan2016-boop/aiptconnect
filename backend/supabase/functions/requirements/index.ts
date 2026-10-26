import { clientPermissionResponse, actionForRequest } from '../_shared/client-permissions.ts';
import { toPlainText } from '../_shared/plain-text.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const select = 'id,country_id,procedure_id,description,client_visible,created_at,updated_at,country:countries(id,name,abbreviation,flag_url),procedure:procedures!requirements_procedure_id_fkey(id,description,detail_text,color_indication,service_id,service:services!procedures_service_id_fkey(id,service))';

const normalize = (row: any) => ({
  ...row,
  description: toPlainText(row.description),
  service_id: row.procedure?.service_id ?? null,
  service: row.procedure?.service ?? null,
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const auth = token ? await db.auth.getUser(token) : null;
  const user = auth?.data.user;
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const profile = await db.from('profiles').select('role').eq('id', user.id).single();
  const role = profile.data?.role;
  if (role !== 'administrator' && role !== 'client') return json({ error: 'Access is denied.' }, 403);
  const url = new URL(request.url);
  const last = url.pathname.split('/').filter(Boolean).at(-1);
  const id = last === 'requirements' ? null : last;
  try {
    const denied = await clientPermissionResponse(db, user.id, 'requirements', actionForRequest(request), cors); if (denied) return denied;
    if (request.method === 'GET' && id) {
      let query = db.from('requirements').select(select).eq('id', id).is('deleted_at', null);
      if (role === 'client') query = query.eq('client_visible', true);
      if (role === 'client') {
        const { data: procedures, error } = await db.from('procedures').select('id').eq('client_visible', true).is('deleted_at', null);
        if (error) throw error;
        const procedureIds = (procedures ?? []).map((procedure: { id: string }) => procedure.id);
        if (!procedureIds.length) return json({ error: 'Requirement not found.' }, 404);
        query = query.in('procedure_id', procedureIds);
      }
      const result = await query.maybeSingle();
      if (result.error) throw result.error;
      return result.data ? json(normalize(result.data)) : json({ error: 'Requirement not found.' }, 404);
    }
    if (request.method === 'GET') {
      // The client filter catalogue is loaded once, instead of sequentially loading pages.
      if (url.searchParams.get('catalog') === 'true') {
        let query = db.from('requirements').select(select).is('deleted_at', null);
        if (role === 'client') query = query.eq('client_visible', true);
        if (role === 'client') {
          const { data: procedures, error } = await db.from('procedures').select('id').eq('client_visible', true).is('deleted_at', null);
          if (error) throw error;
          const procedureIds = (procedures ?? []).map((procedure: { id: string }) => procedure.id);
          if (!procedureIds.length) return json({ data: [] });
          query = query.in('procedure_id', procedureIds);
        }
        const result = await query.order('created_at', { ascending: false }).limit(1000);
        if (result.error) throw result.error;
        return json({ data: (result.data ?? []).map(normalize) });
      }
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const size = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? 10)));
      const search = (url.searchParams.get('search') ?? '').trim();
      const sort = url.searchParams.get('sort') ?? 'created';
      const ascending = url.searchParams.get('direction') === 'asc';
      const data: any[] = [];
      let clientProcedureIds: string[] | null = null;
      if (role === 'client') {
        const { data: procedures, error } = await db.from('procedures').select('id').eq('client_visible', true).is('deleted_at', null);
        if (error) throw error;
        clientProcedureIds = (procedures ?? []).map((procedure: { id: string }) => procedure.id);
        if (!clientProcedureIds.length) return json({ data: [], total: 0, page, page_size: size });
      }
      for (let offset = 0; ; offset += 500) {
        let query = db.from('requirements').select(select).is('deleted_at', null);
        if (role === 'client') query = query.eq('client_visible', true);
        if (clientProcedureIds) query = query.in('procedure_id', clientProcedureIds);
        const batch = await query.order('id').range(offset, offset + 499);
        if (batch.error) throw batch.error;
        data.push(...(batch.data ?? []));
        if ((batch.data ?? []).length < 500) break;
      }
      const result = { data };
      const term = search.toLowerCase();
      const filtered = (result.data ?? []).filter((item) => !term || `${item.procedure?.description ?? ''} ${item.procedure?.detail_text ?? ''} ${item.description} ${item.country?.name ?? ''} ${item.country?.abbreviation ?? ''}`.toLowerCase().includes(term));
      filtered.sort((left, right) => { const a = sort === 'country' ? left.country?.name ?? '' : sort === 'procedure' ? left.procedure?.description ?? left.description : left.created_at; const b = sort === 'country' ? right.country?.name ?? '' : sort === 'procedure' ? right.procedure?.description ?? right.description : right.created_at; return (a > b ? 1 : a < b ? -1 : 0) * (ascending ? 1 : -1); });
      return json({ data: filtered.slice((page - 1) * size, page * size).map(normalize), total: filtered.length, page, page_size: size });
    }
    if (request.method === 'PATCH') {
      if (role !== 'administrator') return json({ error: 'Only administrators can change client visibility.' }, 403);
      if (!id) return json({ error: 'Requirement id is required.' }, 400);
      const body = await request.json();
      if (typeof body.client_visible !== 'boolean') return json({ error: 'client_visible must be a boolean.' }, 400);
      const result = await db.from('requirements').update({ client_visible: body.client_visible }).eq('id', id).is('deleted_at', null).select(select).single();
      if (result.error) throw result.error;
      return json(normalize(result.data));
    }
    const body = request.method === 'DELETE' ? null : await request.json();
    let payload: { country_id: string; procedure_id: string; description: string } | null = null;
    if (body) {
      const country_id = typeof body.country_id === 'string' ? body.country_id : '';
      const service_id = typeof body.service_id === 'string' ? body.service_id : '';
      const procedure_id = typeof body.procedure_id === 'string' ? body.procedure_id : '';
      const description = typeof body.description === 'string' ? toPlainText(body.description).slice(0, 5000) : '';
      if (!country_id || !service_id || !procedure_id || description.length < 3) return json({ error: 'Service, country, procedure, and a description of at least 3 characters are required.' }, 400);
      const [{ data: country }, { data: procedure }] = await Promise.all([
        db.from('countries').select('id').eq('id', country_id).is('deleted_at', null).maybeSingle(),
        db.from('procedures').select('id,detail_text,description,service_id').eq('id', procedure_id).eq('service_id', service_id).is('deleted_at', null).maybeSingle(),
      ]);
      if (!country) return json({ error: 'The selected country no longer exists.' }, 400);
      if (!procedure) return json({ error: 'The selected procedure no longer exists.' }, 400);
      payload = { country_id, procedure_id, description };
    }
    if (request.method === 'POST') {
      const result = await db.from('requirements').insert(payload).select(select).single();
      if (result.error) throw result.error;
      return json(normalize(result.data), 201);
    }
    if (!id) return json({ error: 'Requirement id is required.' }, 400);
    if (request.method === 'PUT') {
      const result = await db.from('requirements').update(payload).eq('id', id).is('deleted_at', null).select(select).single();
      if (result.error) throw result.error;
      return json(normalize(result.data));
    }
    if (request.method === 'DELETE') {
      const result = await db.from('requirements').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
      if (result.error) throw result.error;
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : 'Request failed.' }, 400); }
});
