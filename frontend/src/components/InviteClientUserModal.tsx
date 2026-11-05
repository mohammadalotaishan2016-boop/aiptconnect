'use client';
import ActionIcon from './ActionIcon';


import { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type ClientOption = {
  id: string;
  assigned_id: number;
  company_name: string;
  email: string;
  status: 'Active' | 'Inactive';
  invitation_status: 'not_invited' | 'account_exists' | 'invitation_exists' | 'inactive' | 'invalid_email';
  eligible: boolean;
};

type Props = { onClose: () => void; onSent: (message: string) => void };

export default function InviteClientUserModal({ onClose, onSent }: Props) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [newClient, setNewClient] = useState({ company_name: '', email: '', phone: '', client_type: 'Corporate', address: '', country_id: '' });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<'account_exists' | 'invitation_exists' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        if (!session) throw Error('Please sign in.');
        const response = await fetchSupabaseFunction('company-registration', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_clients' }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(body.error || 'Unable to load clients from the database.');
        const next = (body.data || []) as ClientOption[];
        setClients(next);
        setClientId(next.find((client) => client.eligible)?.id || next[0]?.id || '');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load clients from the database.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const term = submittedSearch.trim().toLowerCase();
    return clients.filter((client) => !term || `${client.company_name} ${client.email} ${client.assigned_id}`.toLowerCase().includes(term));
  }, [clients, submittedSearch]);
  const selected = clients.find((client) => client.id === clientId) ?? null;
  const invitationStatus = (client: ClientOption | null) => !client ? '' : ({
    not_invited: 'Eligible to invite',
    account_exists: 'User account already exists',
    invitation_exists: 'Invitation already sent',
    inactive: 'Client is inactive',
    invalid_email: 'Registered email is invalid',
  } as const)[client.invitation_status];

  const searchClients = (event: FormEvent) => { event.preventDefault(); setSubmittedSearch(search); setError(''); };

  const openAddClient = async () => {
    setAddOpen(true);
    if (countries.length) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('countries', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to load countries.');
      const rows = body as { id: string; name: string }[];
      setCountries(rows);
      if (rows[0]) setNewClient((current) => ({ ...current, country_id: rows[0].id }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load countries.'); }
  };

  const createClient = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      setAdding(true);
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('clients', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newClient, status: 'Active' }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to create client.');
      const created = body as ClientOption;
      const eligibleClient: ClientOption = { ...created, invitation_status: 'not_invited', eligible: true };
      setClients((current) => [...current, eligibleClient].sort((a, b) => a.assigned_id - b.assigned_id));
      setClientId(created.id); setSearch(''); setSubmittedSearch(''); setAddOpen(false);
      setNewClient({ company_name: '', email: '', phone: '', client_type: 'Corporate', address: '', country_id: countries[0]?.id || '' });
      onSent(`Client ${created.assigned_id} created successfully.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create client.'); }
    finally { setAdding(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setConflict(null);
    try {
      setSending(true);
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('company-registration', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_invitation', client_id: clientId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.code === 'account_exists' || body.code === 'invitation_exists') setConflict(body.code);
        throw Error(body.error || 'Unable to send invitation email.');
      }
      onSent(`Invitation email sent to ${selected?.email}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send invitation email.');
    } finally {
      setSending(false);
    }
  };

  return <div className="client-modal-backdrop modal-layer-top" onMouseDown={() => !sending && onClose()}>
    <section className="client-modal invite-client-modal" onMouseDown={(event) => event.stopPropagation()}>
      <form onSubmit={submit}>
        <header className="client-modal-heading"><div><span className="modal-kicker">CLIENT ACCESS</span><h2>Invite Client User</h2><p>Client records are loaded from the database. Invitation eligibility is shown for each record.</p></div><button type="button" className="modal-close" onClick={onClose} disabled={sending} aria-label="Close">×</button></header>
        <div className="invite-client-fields">
          <div className="invite-client-search"><label htmlFor="invite-client-search"><span>Search clients</span></label><form onSubmit={searchClients}><input id="invite-client-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client name, ID, or email" /><button className="invite-search-button" type="submit"><ActionIcon name="search" /> Search</button><button className="invite-add-button" type="button" onClick={() => void openAddClient()} disabled={loading || adding}><ActionIcon name="add" /> Add Client</button><button className="invite-list-button" type="button" onClick={() => setListOpen(true)} disabled={loading}><ActionIcon name="users" /> List of Clients</button></form></div>
          <label><span>Client <em>*</em></span><select value={clientId} onChange={(event) => setClientId(event.target.value)} required disabled={loading || !visible.length}><option value="">{loading ? 'Loading...' : 'Select client'}</option>{visible.map((client) => <option key={client.id} value={client.id}>#{client.assigned_id} — {client.company_name} · {invitationStatus(client)}</option>)}</select></label>
          <label><span>Registered email</span><input value={selected?.email || ''} readOnly /></label>
          <label><span>Company</span><input value={selected?.company_name || ''} readOnly /></label>
          <label><span>Invitation status</span><input value={invitationStatus(selected)} readOnly /></label>
        </div>
        {submittedSearch.trim() && !loading && !visible.length && <p className="invite-empty-state" role="status">No clients match “{submittedSearch.trim()}”.</p>}
        {addOpen && <div className="invite-add-overlay" onMouseDown={() => !adding && setAddOpen(false)}><form className="invite-add-dialog" onSubmit={createClient} onMouseDown={(event) => event.stopPropagation()} aria-labelledby="invite-add-title"><header><div><span className="modal-kicker">CLIENT RECORD</span><h3 id="invite-add-title">Add Client</h3><p>Complete the required client record details.</p></div><button type="button" className="modal-close" onClick={() => setAddOpen(false)} disabled={adding} aria-label="Close">×</button></header><div className="invite-add-grid"><label>Company name<input autoFocus required minLength={2} maxLength={255} value={newClient.company_name} onChange={(event) => setNewClient({ ...newClient, company_name: event.target.value })} /></label><label>Registered email<input required type="email" maxLength={320} value={newClient.email} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} /></label><label>Phone<input required minLength={3} maxLength={80} value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} /></label><label>Client type<select value={newClient.client_type} onChange={(event) => setNewClient({ ...newClient, client_type: event.target.value })}><option>Corporate</option><option>Law Firm</option><option>Consultant</option><option>Individual</option></select></label><label>Country<select required value={newClient.country_id} onChange={(event) => setNewClient({ ...newClient, country_id: event.target.value })}><option value="">Select country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label><label className="invite-add-address">Address<input required minLength={3} maxLength={2000} value={newClient.address} onChange={(event) => setNewClient({ ...newClient, address: event.target.value })} /></label></div>{error && <p className="modal-error" role="alert">{error}</p>}<footer><button type="button" className="invite-add-cancel" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</button><button type="submit" className="invite-add-save" disabled={adding || !countries.length}>{adding ? 'Saving...' : 'Save Client'}</button></footer></form></div>}
        {listOpen && <div className="invite-add-overlay" onMouseDown={() => setListOpen(false)}><section className="invite-list-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-list-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="modal-kicker">CLIENT DIRECTORY</span><h3 id="invite-list-title">All Clients</h3><p>{clients.length} client record{clients.length === 1 ? '' : 's'} loaded from the database.</p></div><button type="button" className="modal-close" onClick={() => setListOpen(false)} aria-label="Close">×</button></header><div className="invite-list-table-wrap"><table><thead><tr><th>Client ID</th><th>Company</th><th>Registered email</th><th>Status</th><th>Invitation eligibility</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td>#{client.assigned_id}</td><td>{client.company_name}</td><td>{client.email || '—'}</td><td><span className={`invite-status-pill ${client.status === 'Active' ? 'is-active' : 'is-inactive'}`}>{client.status}</span></td><td><span className={`invite-status-pill ${client.eligible ? 'is-eligible' : 'is-ineligible'}`}>{invitationStatus(client)}</span></td></tr>)}</tbody></table>{!clients.length && <p className="invite-list-empty">No client records were found.</p>}</div><footer><button type="button" className="invite-add-save" onClick={() => setListOpen(false)}>Close</button></footer></section></div>}
        {!loading && !clients.length && !error && <p className="modal-error">No client records were found in the database.</p>}
        {!loading && clients.length > 0 && !clients.some((client) => client.eligible) && <p className="modal-error">Client records loaded, but none can receive an invitation right now.</p>}
        {conflict && <div className="approval-modal"><h3>{conflict === 'account_exists' ? 'Account Already Exists' : 'Invitation Already Sent'}</h3><p>{error}</p></div>}
        {error && !conflict && <p className="modal-error" role="alert">{error}</p>}
        <footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={sending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={sending || loading || !selected?.eligible}>{sending ? 'Sending invitation...' : 'Send Invitation'}</button></footer>
      </form>
    </section>
  </div>;
}
