'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdministratorAccess } from '../../src/lib/admin-documents';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';
import './client-dashboard-cards.css';

type CardKey = 'quotations' | 'schedule-of-fees' | 'requirements' | 'statements' | 'poa' | 'projects' | 'notifications' | 'customer-service';
type CardSetting = { card_key: CardKey; is_available: boolean; coming_soon: boolean };
type ApiResult = { data: CardSetting[] };

const cards: Array<{ key: CardKey; label: string }> = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'schedule-of-fees', label: 'Schedule of Fees' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'statements', label: 'Statements' },
  { key: 'poa', label: 'POA' },
  { key: 'projects', label: 'Project' },
  { key: 'notifications', label: 'Notification' },
  { key: 'customer-service', label: 'Customer Service' },
];

async function readSettings(): Promise<CardSetting[]> {
  const response = await fetchSupabaseFunction('video-tutorials?availability=true');
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(typeof body?.error === 'string' ? body.error : `Unable to load dashboard cards (HTTP ${response.status}).`);
  if (!Array.isArray(body?.data)) throw Error('The dashboard cards service returned invalid data.');
  return body.data;
}

export default function ClientDashboardCardsPage() {
  const { access, accessError } = useAdministratorAccess();
  const [settings, setSettings] = useState<Record<CardKey, Pick<CardSetting, 'is_available' | 'coming_soon'>>>({} as Record<CardKey, Pick<CardSetting, 'is_available' | 'coming_soon'>>);
  const [loading, setLoading] = useState(true);
  const [busyCard, setBusyCard] = useState<CardKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await readSettings();
      setSettings(Object.fromEntries(rows.map(row => [row.card_key, { is_available: row.is_available, coming_soon: row.coming_soon === true }])) as Record<CardKey, Pick<CardSetting, 'is_available' | 'coming_soon'>>);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load dashboard card settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'allowed') void load();
  }, [access, load]);

  const updateAvailability = async (key: CardKey, value: boolean) => {
    if (busyCard) return;
    const previous = settings[key] ?? { is_available: true, coming_soon: false };
    setSettings(current => ({ ...current, [key]: { ...previous, is_available: value } }));
    setBusyCard(key);
    setError('');
    setNotice('');
    try {
      const response = await fetchSupabaseFunction('video-tutorials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_key: key, is_available: value }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw Error(typeof body?.error === 'string' ? body.error : `Unable to update card availability (HTTP ${response.status}).`);
      if (typeof body?.data?.is_available !== 'boolean') throw Error('The dashboard cards service returned an invalid update result.');
      setSettings(current => ({ ...current, [key]: { ...current[key], is_available: body.data.is_available } }));
      const label = cards.find(card => card.key === key)?.label ?? 'Dashboard card';
      setNotice(`${label} is now ${body.data.is_available ? 'available' : 'coming soon'}.`);
    } catch (cause) {
      setSettings(current => ({ ...current, [key]: previous }));
      setError(cause instanceof Error ? cause.message : 'Unable to update card availability.');
    } finally {
      setBusyCard(null);
    }
  };

  const updateComingSoon = async (key: CardKey, value: boolean) => {
    if (busyCard) return;
    const previous = settings[key] ?? { is_available: true, coming_soon: false };
    setSettings(current => ({ ...current, [key]: { ...previous, coming_soon: value } }));
    setBusyCard(key);
    setError('');
    setNotice('');
    try {
      const response = await fetchSupabaseFunction('video-tutorials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_key: key, coming_soon: value }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw Error(typeof body?.error === 'string' ? body.error : `Unable to update Coming Soon (HTTP ${response.status}).`);
      if (typeof body?.data?.coming_soon !== 'boolean') throw Error('The dashboard cards service returned an invalid update result.');
      setSettings(current => ({ ...current, [key]: { ...current[key], coming_soon: body.data.coming_soon } }));
      const label = cards.find(card => card.key === key)?.label ?? 'Dashboard card';
      setNotice(`${label} Coming Soon is ${body.data.coming_soon ? 'enabled' : 'disabled'}.`);
    } catch (cause) {
      setSettings(current => ({ ...current, [key]: previous }));
      setError(cause instanceof Error ? cause.message : 'Unable to update Coming Soon.');
    } finally {
      setBusyCard(null);
    }
  };

  if (access !== 'allowed') {
    return accessError
      ? <main className="dashboard-cards-admin"><p className="dashboard-cards-error" role="alert">{accessError}</p></main>
      : <main className="dashboard-cards-admin" aria-busy="true"><p>Verifying administrator access...</p></main>;
  }

  return <main className="dashboard-cards-admin">
    <header className="dashboard-cards-heading"><div><p>CLIENT DASHBOARD</p><h1>Dashboard Cards</h1><span>Choose which service cards clients can open.</span></div><strong>{cards.length} cards</strong></header>
    {notice && <p className="dashboard-cards-notice" role="status">{notice}</p>}
    {error && <p className="dashboard-cards-error" role="alert">{error}</p>}
    <section className="dashboard-cards-panel" aria-label="Client dashboard card availability" aria-busy={loading}>
      <div className="dashboard-cards-list">
        {cards.map(card => {
          const available = settings[card.key]?.is_available !== false;
          const comingSoon = settings[card.key]?.coming_soon === true;
          return <article className="dashboard-card-setting" key={card.key}>
            <div className="dashboard-card-setting-icon" aria-hidden="true">{card.label.slice(0, 1)}</div>
            <div className="dashboard-card-setting-copy"><h2>{card.label}</h2><p>{comingSoon ? 'Clients see Coming Soon and cannot open this card.' : available ? 'Clients can open this card.' : 'Clients cannot open this card.'}</p></div>
            <div className="dashboard-card-setting-controls">
              <label className={`dashboard-card-switch${available ? ' is-on' : ''}`}>
                <input type="checkbox" checked={available} disabled={loading || busyCard !== null} onChange={event => void updateAvailability(card.key, event.target.checked)} aria-label={`${available ? 'Disable' : 'Enable'} ${card.label} card`} />
                <span aria-hidden="true" />
                <b>{available ? 'Available' : 'Unavailable'}</b>
              </label>
              <label className={`dashboard-card-switch dashboard-card-coming-soon-switch${comingSoon ? ' is-on' : ''}`}>
                <input type="checkbox" checked={comingSoon} disabled={loading || busyCard !== null} onChange={event => void updateComingSoon(card.key, event.target.checked)} aria-label={`${comingSoon ? 'Remove Coming Soon from' : 'Mark'} ${card.label} as Coming Soon`} />
                <span aria-hidden="true" />
                <b>Coming Soon</b>
              </label>
            </div>
          </article>;
        })}
      </div>
    </section>
  </main>;
}
