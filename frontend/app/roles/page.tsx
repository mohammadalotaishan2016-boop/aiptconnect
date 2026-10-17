'use client';
import { useEffect, useState } from 'react';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';
import { useAdministratorAccess } from '../../src/lib/admin-documents';
import { defaultClientPermissions, permissionPages, permissionActions, type ClientPermissions, type PermissionAction, type PermissionPage } from '../../src/lib/client-permissions';
import './roles.css';
type Client = { id: string; email?: string; full_name: string; company_name: string; approval_status: string; account_status: string; client: { company_name: string; email: string } | null };
type Saved = { permissions: ClientPermissions; revision: number; updated_at: string | null; email?: string };
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchSupabaseFunction('client-permissions' + path, options);
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'Unable to load permissions.');
  return body;
}
export default function RolesPage() {
  const { access, accessError } = useAdministratorAccess();
  const [clients, setClients] = useState<Client[]>([]), [totalClients, setTotalClients] = useState(0), [selectedClient, setSelectedClient] = useState<Client | null>(null), [query, setQuery] = useState(''), [userId, setUserId] = useState('');
  const [search, setSearch] = useState(''), [clientPage, setClientPage] = useState(1);
  const [saved, setSaved] = useState<Saved | null>(null), [permissions, setPermissions] = useState<ClientPermissions>(defaultClientPermissions);
  const [loading, setLoading] = useState(false), [loadingClients, setLoadingClients] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const dirty = saved && JSON.stringify(saved.permissions) !== JSON.stringify(permissions);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(totalClients / pageSize));
  useEffect(() => {
    if (access !== 'allowed') return;
    const controller = new AbortController();
    let active = true;
    setLoadingClients(true);
    const params = new URLSearchParams({ clients: 'true', page: String(clientPage), page_size: String(pageSize), search });
    void request<{ clients: Client[]; total?: number }>('?' + params, { signal: controller.signal }).then(body => {
      if (!active) return;
      if (typeof body.total === 'number') {
        setClients(body.clients);
        setTotalClients(body.total);
      } else {
        const term = search.trim().toLowerCase();
        const matches = body.clients.filter(client => !term || [client.full_name,client.company_name,client.client?.company_name,client.email,client.client?.email].join(' ').toLowerCase().includes(term));
        setClients(matches.slice((clientPage - 1) * pageSize, clientPage * pageSize));
        setTotalClients(matches.length);
      }
    }).catch(cause => { if (active && !controller.signal.aborted) setError(cause.message); }).finally(() => { if (active) setLoadingClients(false); });
    return () => { active = false; controller.abort(); };
  }, [access, clientPage, search]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim().toLowerCase()); setClientPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setSaved(null); setNotice(''); setError('');
    if (!userId) return;
    const controller = new AbortController(); setLoading(true);
    void request<Saved>('?user_id=' + userId, { signal:controller.signal }).then(body => { if (!controller.signal.aborted) { setSaved(body); setPermissions(body.permissions); } }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  }, [dirty]);
  const change = (page: PermissionPage, action: PermissionAction, checked: boolean) => setPermissions(current => {
    const row = { ...current[page], [action]:checked };
    if (checked && action !== 'view') row.view = true;
    if (checked && action === 'update') row.edit = true;
    if (!checked && action === 'edit') row.update = false;
    if (!checked && action === 'view') permissionActions.forEach(key => { row[key] = false; });
    return { ...current, [page]:row };
  });
  const save = async () => {
    if (!saved || saving) return;
    setSaving(true); setError(''); setNotice('');
    try { const result = await request<Saved>('?user_id=' + userId,{ method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ permissions, revision:saved.revision }) }); setSaved(result); setPermissions(result.permissions); setNotice('Permissions saved. Changes apply to subsequent client requests.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save permissions.'); }
    finally { setSaving(false); }
  };
  if (access !== 'allowed') return <main className="roles-page"><p role="status">{accessError || (access === 'checking' ? 'Checking administrator access...' : 'Administrator access is required.')}</p></main>;
  const selected = selectedClient;
  return <main className="roles-page">
    <header><div><p className="roles-kicker">ACCESS MANAGEMENT</p><h1>Roles &amp; Permissions</h1><p>Assign permissions to each client login for every client dashboard page.</p></div><span className="roles-badge">Administrator</span></header>
    <div className="roles-card roles-client-picker"><label>Find a client<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, company or email" /></label><label>Client login<select aria-label="Client login" disabled={saving || loadingClients} value={userId} onChange={event => { if (dirty && !window.confirm('Discard unsaved permission changes?')) return; const nextId = event.target.value; setSelectedClient(clients.find(client => client.id === nextId) ?? null); setUserId(nextId); }}><option value="">{loadingClients ? 'Loading client logins...' : 'Select a client login'}</option>{selected && !clients.some(client => client.id === selected.id) && <option value={selected.id}>{selected.full_name || 'Client'} — {selected.client?.company_name || selected.company_name} ({selected.email || selected.client?.email})</option>}{clients.map(client => <option key={client.id} value={client.id}>{client.full_name || 'Client'} — {client.client?.company_name || client.company_name} ({client.email || client.client?.email})</option>)}</select><span className="roles-picker-pagination"><span>{totalClients ? `${(clientPage - 1) * pageSize + 1}–${Math.min(clientPage * pageSize, totalClients)} of ${totalClients} logins` : 'No matching client logins'}</span><span><button type="button" onClick={() => setClientPage(page => Math.max(1, page - 1))} disabled={clientPage <= 1 || loadingClients}>Previous</button><button type="button" onClick={() => setClientPage(page => Math.min(pageCount, page + 1))} disabled={clientPage >= pageCount || loadingClients}>Next</button></span></span></label></div>
    {error && <p className="roles-error" role="alert">{error}</p>}{notice && <p className="roles-notice" role="status">{notice}</p>}
    {!userId ? <div className="roles-card roles-empty">Select a client to review and assign permissions.</div> : loading ? <div className="roles-card roles-loading" aria-busy="true" aria-label="Loading client permissions"><span /><span /><span /><span /></div> : saved && <div className="roles-card">
      <div className="roles-matrix-heading"><div><h2>{selected?.full_name || 'Client permissions'}</h2><p>{selected?.client?.company_name} · {saved.email || selected?.email || selected?.client?.email}</p><p>{selected?.approval_status} / {selected?.account_status}</p></div><span>{saved.revision ? 'Custom permissions' : 'Current default permissions'}</span></div>
      <p className="roles-scope">Shared catalog permissions allow changes visible to other clients. Projects, quotations, statements, tickets, and account settings stay scoped to this client. Approval remains an administrator action.</p>
      <div className="roles-table-wrap"><table><thead><tr><th>Client page</th><th>Scope</th>{permissionActions.map(action => <th key={action}>{action[0].toUpperCase()+action.slice(1)}</th>)}</tr></thead><tbody>{permissionPages.map(page => <tr key={page.key}><th scope="row">{page.label}</th><td>{page.scope}</td>{permissionActions.map(action => <td key={action}>{(page.actions as readonly string[]).includes(action) ? <input type="checkbox" aria-label={`${page.label}: ${action}`} checked={permissions[page.key][action]} disabled={saving} onChange={event => change(page.key,action,event.target.checked)} /> : <span title="This page has no such action" aria-label="Not applicable">—</span>}</td>)}</tr>)}</tbody></table></div>
      <p className="roles-help">Edit opens an existing record; Update saves changes. Update also requires Edit. Read-only summary and approved invoice pages have View permission only.</p>
      <footer><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button disabled={!dirty || saving} onClick={() => setPermissions(saved.permissions)}>Discard changes</button><button className="roles-save" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save permissions'}</button></footer>
    </div>}
  </main>;
}
