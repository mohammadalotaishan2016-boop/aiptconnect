'use client';

import { useCallback, useEffect, useState } from 'react';
import { Device, DEVICE_TYPE_ICONS, formatDeviceDate, deviceStatusBadge } from '../lib/device-utils';

interface DeviceSession {
  id: string;
  device_id: string;
  status: string;
  last_active_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface LoginRequest {
  id: string;
  device_fingerprint: string;
  user_agent: string | null;
  ip: string | null;
  status: string;
  approved_by_device_id: string | null;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
}

interface Props {
  userId: string;
  onClose: () => void;
  canRevoke?: boolean;
}

type Tab = 'devices' | 'history';


export default function DeviceManagementPanel({ userId, onClose, canRevoke = false }: Props) {
  const [tab, setTab] = useState<Tab>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [history, setHistory] = useState<LoginRequest[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/devices?user_id=${userId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load devices.');
      setDevices(body.devices ?? []);
      setSessions(body.sessions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load devices.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchHistory = useCallback(async (page: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/devices/history?user_id=${userId}&page=${page}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load history.');
      setHistory(body.data ?? []);
      setHistoryTotal(body.total ?? 0);
      setHistoryPage(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (tab === 'devices') fetchDevices();
    else fetchHistory(1);
  }, [tab, fetchDevices, fetchHistory]);

  async function revokeDevice(deviceDbId: string) {
    if (revoking) return;
    setRevoking(deviceDbId);
    setError('');
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceDbId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to revoke device.');
      await fetchDevices();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke device.');
    } finally {
      setRevoking(null);
    }
  }

  function sessionsForDevice(deviceDbId: string) {
    return sessions.filter((s) => s.device_id === deviceDbId);
  }

  const statusBadge = (status: string) => {
    const c = deviceStatusBadge(status);
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        ...c,
      }}>
        {status}
      </span>
    );
  };

  const totalHistoryPages = Math.ceil(historyTotal / 20);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '720px',
          maxHeight: '85vh',
          overflow: 'auto',
          fontFamily: '"Times New Roman", Times, serif',
          color: '#000',
          padding: '1.5rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Device Management</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(['devices', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '4px',
                border: tab === t ? '2px solid #17a2b8' : '1px solid #ccc',
                background: tab === t ? '#17a2b8' : '#fff',
                color: tab === t ? '#fff' : '#000',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 'bold',
                textTransform: 'capitalize',
              }}
            >
              {t === 'devices' ? 'Registered Devices' : 'Approval History'}
            </button>
          ))}
        </div>

        {error && <p style={{ color: '#dc3545', marginBottom: '0.75rem' }}>{error}</p>}
        {loading && <p>Loading...</p>}

        {/* Devices Tab */}
        {!loading && tab === 'devices' && (
          <div>
            {devices.length === 0 ? (
              <p style={{ color: '#666' }}>No devices registered.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #17a2b8' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Device</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Browser / OS</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Last Seen</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Sessions</th>
                    {canRevoke && <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => {
                    const devSessions = sessionsForDevice(d.id);
                    const activeSessions = devSessions.filter((s) => s.status === 'active').length;
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.5rem' }}>
                          {DEVICE_TYPE_ICONS[d.device_type ?? 'Unknown'] ?? ''}{' '}
                          {d.device_name || d.device_id.slice(0, 8) + '...'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{d.device_type || '-'}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {d.browser || '-'} / {d.operating_system || '-'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{formatDeviceDate(d.last_seen_at)}</td>
                        <td style={{ padding: '0.5rem' }}>{statusBadge(d.status)}</td>
                        <td style={{ padding: '0.5rem' }}>{activeSessions} active</td>
                        {canRevoke && (
                          <td style={{ padding: '0.5rem' }}>
                            {d.status === 'active' && (
                              <button
                                type="button"
                                disabled={revoking === d.id}
                                onClick={() => revokeDevice(d.id)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '4px',
                                  border: '1px solid #dc3545',
                                  background: '#fff',
                                  color: '#dc3545',
                                  cursor: revoking === d.id ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                  fontSize: '0.8rem',
                                }}
                              >
                                {revoking === d.id ? 'Revoking...' : 'Revoke'}
                              </button>
                            )}
                            {d.status === 'revoked' && (
                              <span style={{ color: '#888', fontSize: '0.8rem' }}>
                                {d.revoked_reason || 'Revoked'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* History Tab */}
        {!loading && tab === 'history' && (
          <div>
            {history.length === 0 ? (
              <p style={{ color: '#666' }}>No approval history found.</p>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #17a2b8' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Device Fingerprint</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Approved By</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Resolved At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.5rem' }}>{formatDeviceDate(h.created_at)}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {h.device_fingerprint.slice(0, 12)}...
                        </td>
                        <td style={{ padding: '0.5rem' }}>{statusBadge(h.status)}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {h.approved_by_device_id ? h.approved_by_device_id.slice(0, 12) + '...' : '-'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{formatDeviceDate(h.resolved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalHistoryPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => fetchHistory(historyPage - 1)}
                      style={{ padding: '0.25rem 0.5rem', fontFamily: 'inherit', cursor: historyPage <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '0.25rem 0.5rem' }}>
                      Page {historyPage} of {totalHistoryPages}
                    </span>
                    <button
                      type="button"
                      disabled={historyPage >= totalHistoryPages}
                      onClick={() => fetchHistory(historyPage + 1)}
                      style={{ padding: '0.25rem 0.5rem', fontFamily: 'inherit', cursor: historyPage >= totalHistoryPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
