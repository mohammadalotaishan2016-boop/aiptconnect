import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientPermissionResponse } from '../_shared/client-permissions.ts';
import type { PermissionPage } from '../_shared/permission-matrix.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' },
});

const categoryPages: Record<string, PermissionPage> = {
  'schedule-of-fees': 'fees',
  quotations: 'quotations',
  requirements: 'requirements',
  statements: 'statements',
  poa: 'poa',
  projects: 'projects',
  notifications: 'notifications',
  'customer-service': 'customer-service',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Client update service is not configured.' }, 500);
    const db = createClient(supabaseUrl, serviceRoleKey);
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
    if (authError || !user) return json({ error: 'Authentication is required.' }, 401);

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role,client_id,approval_status,account_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'client' || profile.approval_status !== 'approved' || profile.account_status !== 'active' || !profile.client_id || !user.email) {
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

    if (request.method === 'GET') {
      const [{ data, error }, { data: config, error: configError }] = await Promise.all([
        db.from('client_dashboard_read_state')
        .select('category,last_read_at')
        .eq('user_id', user.id),
        db.from('client_dashboard_read_state_config')
          .select('tracking_started_at')
          .eq('id', true)
          .single(),
      ]);
      if (error) throw error;
      if (configError) throw configError;
      const readAt = Object.fromEntries((data ?? []).map((item) => [item.category, item.last_read_at]));
      return json({
        data: Object.fromEntries(Object.keys(categoryPages).map((category) => [
          category,
          readAt[category] ?? config.tracking_started_at,
        ])),
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'A valid category is required.' }, 400);
    }
    const category = body && typeof body === 'object' && 'category' in body ? body.category : null;
    if (typeof category !== 'string' || !categoryPages[category]) return json({ error: 'Choose a valid dashboard category.' }, 400);

    const denied = await clientPermissionResponse(db, user.id, categoryPages[category], 'view', cors);
    if (denied) return denied;

    const lastReadAt = new Date().toISOString();
    const { error } = await db.from('client_dashboard_read_state')
      .upsert({ user_id: user.id, category, last_read_at: lastReadAt }, { onConflict: 'user_id,category' });
    if (error) throw error;
    return json({ category, last_read_at: lastReadAt });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Unable to save client update status.' }, 500);
  }
});
