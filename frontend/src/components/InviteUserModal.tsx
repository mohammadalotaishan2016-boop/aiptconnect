'use client';

import { FormEvent, useEffect, useState } from 'react';
import ActionIcon from './ActionIcon';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type ClientOption = { id: string; assigned_id: number; company_name: string };
type Props = { onClose: () => void; onSent: (message: string) => void };

export default function InviteUserModal({ onClose, onSent }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'administrator' | 'client'>('client');
  const [clientId, setClientId] = useState('');
  const [maxDevices, setMaxDevices] = useState(1);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Load clients when role switches to client
  useEffect(() => {
    if (role !== 'client') return;
    setClientsLoading(true);
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        if (!session) throw Error('Please sign in.');
        const res = await fetchSupabaseFunction('clients', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw Error(body.error || 'Unable to load clients.');
        const rows = (Array.isArray(body) ? body : (body.data ?? [])) as { id: string; assigned_id: number; company_name: string }[];
        setClients(rows.filter((c) => c.company_name));
        if (rows.length) setClientId(rows[0].id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load clients.');
      } finally {
        setClientsLoading(false);
      }
    })();
  }, [role]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSending(true);
    try {
      const payload: Record<string, unknown> = { email: email.trim(), role, max_devices: maxDevices };
      if (role === 'client') payload.client_id = clientId;
      if (invitationMessage.trim()) payload.invitation_message = invitationMessage.trim();
      const res = await fetch('/api/invitation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Unable to send invitation.');
        return;
      }
      const message = body.email_delivered === false
        ? `Invitation created for ${email.trim()} but the email could not be delivered. Check SES configuration.`
        : `Invitation sent to ${email.trim()}.`;
      onSent(message);
      onClose();
    } catch {
      setError('Unable to reach the service. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="client-modal-backdrop modal-layer-top"
      onMouseDown={() => !sending && onClose()}
    >
      <section
        className="client-modal invite-user-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-user-title"
      >
        <form onSubmit={(e) => void submit(e)}>
          <header className="client-modal-heading">
            <div>
              <span className="modal-kicker">INVITATION</span>
              <h2 id="invite-user-title">Invite User</h2>
              <p>Create a pre-approved account. The invited user will set their password via email.</p>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={sending}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="invite-client-fields">
            <label>
              <span>Email address <em>*</em></span>
              <input
                type="email"
                required
                maxLength={320}
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={sending}
              />
            </label>

            <label>
              <span>Role <em>*</em></span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'administrator' | 'client')}
                disabled={sending}
              >
                <option value="client">Client</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>

            {role === 'client' && (
              <label>
                <span>Client <em>*</em></span>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required={role === 'client'}
                  disabled={sending || clientsLoading || !clients.length}
                >
                  <option value="">{clientsLoading ? 'Loading...' : 'Select client'}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.assigned_id} — {c.company_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span>Max devices</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDevices}
                onChange={(e) => setMaxDevices(Math.min(10, Math.max(1, Number(e.target.value))))}
                disabled={sending}
              />
            </label>

            <label>
              <span>Invitation message</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={invitationMessage}
                onChange={(e) => setInvitationMessage(e.target.value)}
                placeholder="Optional personal message to the recipient..."
                disabled={sending}
              />
            </label>
          </div>

          {error && <p className="modal-error" role="alert">{error}</p>}

          <footer className="client-modal-footer">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={sending}
              data-action="cancel"
              title="Cancel"
            >
              <ActionIcon name="cancel" />
              <span className="aipt-action-label">Cancel</span>
            </button>
            <button
              className="modal-primary"
              disabled={sending || !email.trim() || (role === 'client' && !clientId)}
            >
              {sending ? 'Sending invitation...' : 'Send Invitation'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
