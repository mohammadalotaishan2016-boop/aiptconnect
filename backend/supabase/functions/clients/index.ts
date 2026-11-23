import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clientTypes = new Set(['chinese', 'non_chinese', 'direct']);
const clientStatuses = new Set(['Active', 'Inactive']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clientSelect = 'id,assigned_id,company_name,fee_classification_id,email,phone,client_type,address,country_id,notes,status,created_at,updated_at,country:countries(id,name,abbreviation,flag_url),fee_classification:fee_classifications(id,description,color_indication)';

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const optionalUuid = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw Error('Select a valid record.');
  return value;
};

function validate(body: unknown) {
  const value = body as Record<string, unknown>;
  const company_name = text(value.company_name, 255);
  const email = text(value.email, 320).toLowerCase();
  const phone = text(value.phone, 80);
  const client_type = text(value.client_type, 40);
  const address = text(value.address, 2000);
  const country_id = optionalUuid(value.country_id);
  const fee_classification_id = optionalUuid(value.fee_classification_id);
  const notes = text(value.notes, 4000);
  const status = text(value.status, 20);

  if (company_name.length < 2) throw Error('Company name must contain at least 2 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Provide a valid email address.');
  if (phone.length < 3) throw Error('Provide a valid phone number.');
  if (!clientTypes.has(client_type)) throw Error('Choose a valid client type (Chinese, Non Chinese, or Direct).');
  if (address.length < 3) throw Error('Provide the client address.');
  if (!country_id) throw Error('Select a country.');
  if (!clientStatuses.has(status)) throw Error('Choose Active or Inactive status.');
  return { company_name, email, phone, client_type, address, country_id, fee_classification_id, notes, status };
}

async function ensureReferences(db: ReturnType<typeof createClient>, payload: ReturnType<typeof validate>) {
  const { data: country, error: countryError } = await db.from('countries').select('id').eq('id', payload.country_id).is('deleted_at', null).maybeSingle();
  if (countryError) throw countryError;
  if (!country) throw Error('The selected country no longer exists.');
  if (!payload.fee_classification_id) return;
  const { data: classification, error: classificationError } = await db.from('fee_classifications').select('id').eq('id', payload.fee_classification_id).is('deleted_at', null).maybeSingle();
  if (classificationError) throw classificationError;
  if (!classification) throw Error('The selected fee classification no longer exists.');
}

async function audit(db: ReturnType<typeof createClient>, actorId: string, action: 'create' | 'update' | 'delete', client: Record<string, unknown>, beforeData: Record<string, unknown> | null = null) {
  const { error } = await db.from('audit_logs').insert({ actor_id: actorId, entity_type: 'client', entity_id: client.id, action, before_data: beforeData, after_data: action === 'delete' ? null : client });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);

  const url = new URL(request.url);
  const last = url.pathname.split('/').filter(Boolean).at(-1);
  const id = last === 'clients' ? null : last;
  try {
    if (request.method === 'GET' && id) {
      const { data, error } = await db.from('clients').select(clientSelect).eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      return data ? json(data) : json({ error: 'Client not found.' }, 404);
    }
    if (request.method === 'GET') {
      const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1);
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') ?? 10), 1), 100);
      const search = (url.searchParams.get('search') ?? '').trim() || null;
      const status = url.searchParams.get('status') || null;
      const invitation = url.searchParams.get('invitation') || null;
      const deviceUsage = url.searchParams.get('device_usage') || null;
      const datePreset = url.searchParams.get('date_preset') || null;
      const dateFrom = url.searchParams.get('date_from') || null;
      const dateTo = url.searchParams.get('date_to') || null;
      const sortFields: Record<string, string> = { assigned_id: 'assigned_id', company_name: 'company_name', email: 'email', client_type: 'client_type', status: 'status', created_at: 'created_at', max_devices: 'max_devices', registered_devices: 'registered_devices' };
      const sort = sortFields[url.searchParams.get('sort') ?? ''] ?? 'assigned_id';
      const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc';
      const { data: rpcResult, error } = await db.rpc('get_tenants_page', {
        p_search: search,
        p_status: status,
        p_invitation: invitation,
        p_device_usage: deviceUsage,
        p_date_preset: datePreset,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_sort: sort,
        p_direction: direction,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return json(rpcResult);
    }
    if (request.method === 'POST' && url.searchParams.get('mode') === 'import') {
      const body = await request.json();
      if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) return json({ error: 'Import must contain between 1 and 500 rows.' }, 400);
      const payloads = body.rows.map((row: unknown, index: number) => {
        try { return validate(row); } catch (cause) { throw Error(`Row ${index + 2}: ${cause instanceof Error ? cause.message : 'Invalid client data.'}`); }
      });
      const countryIds = [...new Set(payloads.map((payload) => payload.country_id))];
      const classificationIds = [...new Set(payloads.map((payload) => payload.fee_classification_id).filter(Boolean))];
      const [{ data: validCountries, error: countryError }, { data: validClassifications, error: classificationError }] = await Promise.all([
        db.from('countries').select('id').in('id', countryIds).is('deleted_at', null),
        classificationIds.length ? db.from('fee_classifications').select('id').in('id', classificationIds).is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
      ]);
      if (countryError) throw countryError;
      if (classificationError) throw classificationError;
      if ((validCountries ?? []).length !== countryIds.length) throw Error('One or more imported country IDs are invalid.');
      if ((validClassifications ?? []).length !== classificationIds.length) throw Error('One or more imported fee classification IDs are invalid.');
      const { data, error } = await db.from('clients').insert(payloads).select(clientSelect);
      if (error) throw error;
      const auditRows = (data ?? []).map((client) => ({ actor_id: user.id, entity_type: 'client', entity_id: client.id, action: 'create', before_data: null, after_data: client }));
      if (auditRows.length) { const { error: auditError } = await db.from('audit_logs').insert(auditRows); if (auditError) throw auditError; }
      return json({ imported: data?.length ?? 0, data: data ?? [] }, 201);
    }
    if (request.method === 'POST') {
      const rawBody = await request.json();
      const payload = validate(rawBody);
      await ensureReferences(db, payload);
      const assignedId = typeof rawBody.assigned_id !== 'undefined' ? Math.floor(Number(rawBody.assigned_id)) : null;
      const insertPayload = assignedId && assignedId > 0 ? { ...payload, assigned_id: assignedId } : payload;
      const { data, error } = await db.from('clients').insert(insertPayload).select(clientSelect).single();
      if (error) throw error;
      await audit(db, user.id, 'create', data);
      return json(data, 201);
    }
    if (!id) return json({ error: 'Client id is required.' }, 400);
    const { data: before, error: beforeError } = await db.from('clients').select(clientSelect).eq('id', id).is('deleted_at', null).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return json({ error: 'Client not found.' }, 404);
    if (request.method === 'PUT') {
      const rawBody = await request.json();
      const payload = validate(rawBody);
      await ensureReferences(db, payload);
      const assignedId = typeof rawBody.assigned_id !== 'undefined' ? Math.floor(Number(rawBody.assigned_id)) : undefined;
      const updatePayload = assignedId && assignedId > 0 ? { ...payload, assigned_id: assignedId } : payload;
      const { data, error } = await db.from('clients').update(updatePayload).eq('id', id).is('deleted_at', null).select(clientSelect).single();
      if (error) throw error;
      await audit(db, user.id, 'update', data, before);
      return json(data);
    }
    if (request.method === 'DELETE') {
      const { count, error: linkedError } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).is('deleted_at', null);
      if (linkedError) throw linkedError;
      if (count) return json({ error: 'This client has linked applications and cannot be deleted until they are removed.' }, 409);
      const { error } = await db.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
      if (error) throw error;
      await audit(db, user.id, 'delete', before, before);
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Request failed.';
    return json({ error: /duplicate/i.test(message) ? 'A client with that company name already exists.' : message }, /duplicate/i.test(message) ? 409 : 400);
  }
});

