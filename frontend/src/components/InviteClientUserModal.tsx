'use client';
import ActionIcon from './ActionIcon';

import { FormEvent, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type Props = { onClose: () => void; onSent: (message: string) => void };

const DEFAULT_MESSAGE = `Hello,

You have been invited to join the Aiapait Portal

Please complete your registration by verifying your invitation and setting your password.

Your account will be activated and associated with your assigned company after successful registration.

Best regards,
Aiapait Administration Team`;

export default function InviteClientUserModal({ onClose, onSent }: Props) {
  const [clientName, setClientName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [maxDevices, setMaxDevices] = useState(1);
  const [invitationMessage, setInvitationMessage] = useState(DEFAULT_MESSAGE);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<'account_exists' | 'invitation_exists' | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setConflict(null);
    if (!clientName.trim()) { setError('Please enter the client name.'); return; }
    if (!company.trim()) { setError('Please enter the company name.'); return; }
    if (!email.trim()) { setError('Please enter the registered email.'); return; }
    setSending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('company-registration', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_invitation',
          client_name: clientName.trim(),
          company: company.trim(),
          email: email.trim(),
          max_devices: maxDevices,
          ...(invitationMessage.trim() ? { invitation_message: invitationMessage.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.code === 'account_exists' || body.code === 'invitation_exists') setConflict(body.code);
        throw Error(body.error || 'Unable to send invitation email.');
      }
      onSent(`Invitation email sent to ${email}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send invitation email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="client-modal-backdrop modal-layer-top" onMouseDown={() => !sending && onClose()}>
      <section className="client-modal invite-client-modal" onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => void submit(e)}>
          <header className="client-modal-heading">
            <div>
              <span className="modal-kicker">CLIENT ACCESS</span>
              <h2>Invite Client User</h2>
            </div>
            <button type="button" className="modal-close" onClick={onClose} disabled={sending} aria-label="Close">×</button>
          </header>

          <div className="invite-client-fields">
            {/* Client name — unique */}
            <label>
              <span>Client Name <em>*</em></span>
              <input
                autoFocus
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter a unique client name"
                disabled={sending}
                required
              />
            </label>

            {/* Company */}
            <label>
              <span>Company <em>*</em></span>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                required
                disabled={sending}
              />
            </label>

            {/* Registered email */}
            <label>
              <span>Registered Email <em>*</em></span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                required
                disabled={sending}
              />
            </label>

            {/* Max devices */}
            <label>
              <span>Max Devices Assigned</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDevices}
                onChange={(e) => setMaxDevices(Math.min(10, Math.max(1, Number(e.target.value))))}
                disabled={sending}
              />
            </label>

            {/* Invitation message */}
            <label>
              <span>Invitation Message</span>
              <textarea
                rows={14}
                maxLength={2000}
                value={invitationMessage}
                onChange={(e) => setInvitationMessage(e.target.value)}
                disabled={sending}
              />
            </label>
          </div>

          {conflict && (
            <div className="approval-modal">
              <h3>{conflict === 'account_exists' ? 'Account Already Exists' : 'Invitation Already Sent'}</h3>
              <p>{error}</p>
            </div>
          )}
          {error && !conflict && <p className="modal-error" role="alert">{error}</p>}

          <footer className="client-modal-footer">
            <button type="button" className="secondary" onClick={onClose} disabled={sending} data-action="cancel" title="Cancel">
              <ActionIcon name="cancel" />
              <span className="aipt-action-label">Cancel</span>
            </button>
            <button className="modal-primary" disabled={sending}>
              {sending ? 'Sending invitation...' : 'Send Invitation'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
