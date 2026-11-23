'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/browser';

interface PendingRequest {
  request_id: string;
  user_agent: string | null;
  ip: string | null;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  created_at: string;
}

interface Props {
  userId: string;
}

export default function DeviceApprovalBanner({ userId }: Props) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`user-${userId}`)
      .on('broadcast', { event: 'login_request' }, ({ payload }) => {
        setPending(payload as PendingRequest);
        setResolved(false);
      })
      .on('broadcast', { event: 'device_revoked' }, async () => {
        // Another device was approved — sign this one out immediately
        await supabase.auth.signOut({ scope: 'local' });
        window.sessionStorage.setItem(
          'aipt-auth-message',
          'You have been signed out because a new device was approved to log in.',
        );
        window.location.href = '/login';
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function respond(action: 'approve' | 'deny') {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, string> = { request_id: pending.request_id };
      if (action === 'approve') {
        payload.approver_fingerprint = localStorage.getItem('aipt-device-fp') ?? '';
      }
      await fetch(`/api/auth/device-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setResolved(true);
      setPending(null);
    } catch {
      // Keep the banner visible so user can retry
    } finally {
      setBusy(false);
    }
  }

  if (!pending || resolved) return null;

  const time = new Date(pending.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        background: '#fff',
        border: '2px solid #17a2b8',
        borderRadius: '8px',
        padding: '1.25rem 1.5rem',
        maxWidth: '360px',
        fontFamily: '"Times New Roman", Times, serif',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        color: '#000',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
        📱 New device login request
      </strong>
      <p style={{ margin: '0 0 0.25rem' }}>
        <span style={{ color: '#555' }}>Device:</span>{' '}
        {pending.device_name || 'Unknown device'}
      </p>
      {pending.device_type && pending.device_type !== 'Unknown' && (
        <p style={{ margin: '0 0 0.25rem' }}>
          <span style={{ color: '#555' }}>Type:</span> {pending.device_type}
        </p>
      )}
      {pending.browser && pending.browser !== 'Unknown Browser' && (
        <p style={{ margin: '0 0 0.25rem' }}>
          <span style={{ color: '#555' }}>Browser:</span> {pending.browser}
        </p>
      )}
      {pending.operating_system && pending.operating_system !== 'Unknown OS' && (
        <p style={{ margin: '0 0 0.25rem' }}>
          <span style={{ color: '#555' }}>OS:</span> {pending.operating_system}
        </p>
      )}
      {pending.ip && (
        <p style={{ margin: '0 0 0.25rem' }}>
          <span style={{ color: '#555' }}>IP:</span> {String(pending.ip)}
        </p>
      )}
      <p style={{ margin: '0 0 1rem' }}>
        <span style={{ color: '#555' }}>Time:</span> {time}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => respond('approve')}
          style={{
            flex: 1,
            background: '#17a2b8',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.5rem',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {busy ? '…' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => respond('deny')}
          style={{
            flex: 1,
            background: '#fff',
            color: '#000',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.5rem',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
