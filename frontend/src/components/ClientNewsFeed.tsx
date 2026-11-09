'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type Country = { id: string; name: string; abbreviation: string; flag_url: string };
type Service = { id: string; service: string; color?: string };
type NewsItem = {
  id: string;
  title: string;
  description: string;
  service_id: string | null;
  service: Service | null;
  created_at: string;
  updated_at: string;
  countries: Array<{ country: Country }>;
};
type FeedResponse = { items: NewsItem[] };

function Flag({ country, large = false }: { country: Country; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [country.flag_url]);
  return country.flag_url && !failed
    ? <img className={`client-newsfeed-flag${large ? ' is-large' : ''}`} src={country.flag_url} alt={`${country.name} flag`} onError={() => setFailed(true)} />
    : <span className={`client-newsfeed-flag-fallback${large ? ' is-large' : ''}`} aria-label={`${country.name} flag unavailable`}>{country.abbreviation.slice(0, 3).toUpperCase()}</span>;
}

function MegaphoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l11 5V5L7 10H3Zm4 4 2 6h4l-2.5-4.9M18 9.2a3 3 0 0 1 0 5.6" /></svg>;
}

function DetailsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 1-2Zm-1 15a3 3 0 0 1 3-3h14M8 7h9M8 10h9" /></svg>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function ClientNewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to view news feeds.');
      const response = await fetchSupabaseFunction('news-feed', {
        signal,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json().catch(() => ({})) as FeedResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load news announcements.');
      if (!Array.isArray(body.items)) throw new Error('The News Feed service returned an unexpected response.');
      const records = body.items
        .filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string')
        .map(item => ({ ...item, countries: Array.isArray(item.countries) ? item.countries.filter(entry => entry?.country && typeof entry.country.id === 'string' && typeof entry.country.name === 'string') : [] }));
      if (signal?.aborted) return;
      setItems(records);
      setSelectedId(current => current && records.some(item => item.id === current) ? current : records[0]?.id ?? null);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load news announcements.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId]);
  const visibleItems = expanded ? items : items.slice(0, 3);
  const countries = selected?.countries.map(entry => entry.country).filter(Boolean) ?? [];

  return <main className={`client-newsfeed-page${detailOpen ? ' is-detail-open' : ''}`} aria-label="Client News Feed">
    <section className="client-newsfeed-list-panel">
      <header className="client-newsfeed-panel-heading">
        <span className="client-newsfeed-heading-icon"><MegaphoneIcon /></span>
        <h1>News Feed</h1>
        {items.length > 3 && <button type="button" className="client-newsfeed-view-all" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show Less' : 'View All'}<span aria-hidden="true">→</span></button>}
      </header>
      {loading ? <div className="client-newsfeed-state" role="status"><span className="client-newsfeed-spinner" />Loading news announcements...</div>
        : error ? <div className="client-newsfeed-state is-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div>
        : !items.length ? <div className="client-newsfeed-state"><span className="client-newsfeed-empty-icon">i</span><p>No news announcements are currently available.</p></div>
        : <>
          <div className="client-newsfeed-cards">{visibleItems.map(item => {
            const leadCountry = item.countries?.[0]?.country;
            const active = item.id === selectedId;
            return <article className={`client-newsfeed-card${active ? ' is-selected' : ''}`} key={item.id}>
              <button type="button" className="client-newsfeed-card-main" aria-pressed={active} onClick={() => { setSelectedId(item.id); setDetailOpen(true); }}>
                {leadCountry ? <Flag country={leadCountry} /> : <span className="client-newsfeed-flag-fallback">News</span>}
                <span className="client-newsfeed-card-copy">
                  <span className="client-newsfeed-country-heading">{leadCountry?.name ?? 'News Announcement'}{leadCountry?.abbreviation && <b>{leadCountry.abbreviation}</b>}</span>
                  {item.countries.length > 1 && <span className="client-newsfeed-other-countries">+{item.countries.length - 1} more {item.countries.length === 2 ? 'country' : 'countries'}</span>}
                  <strong className="client-newsfeed-card-title">{item.title}</strong>
                  <span className="client-newsfeed-preview">{item.description}</span>
                </span>
              </button>
              <div className="client-newsfeed-card-footer"><span>{formatDate(item.created_at)}</span><button type="button" className="client-newsfeed-read-more" onClick={() => { setSelectedId(item.id); setDetailOpen(true); }}>Read More <span aria-hidden="true">→</span></button></div>
            </article>;
          })}</div>
          <p className="client-newsfeed-list-note"><span aria-hidden="true">i</span>Stay updated with the latest IP news and announcements.</p>
        </>}
    </section>

    <section className={`client-newsfeed-detail-panel${selected ? '' : ' is-empty'}${detailOpen ? ' has-selection' : ''}`} aria-label="News Details">
      <header className="client-newsfeed-panel-heading">
        <span className="client-newsfeed-heading-icon"><DetailsIcon /></span>
        <h2>News Details</h2>
        {selected && <button type="button" className="client-newsfeed-close" onClick={() => { setSelectedId(null); setDetailOpen(false); }} aria-label="Close news details">×</button>}
        <button type="button" className="client-newsfeed-mobile-back" onClick={() => { setSelectedId(null); setDetailOpen(false); }}><span aria-hidden="true">←</span> Back to News Feed</button>
      </header>
      {selected ? <article className="client-newsfeed-detail-content">
        <div className="client-newsfeed-detail-lead">
          <div className="client-newsfeed-detail-flags">{countries.map(country => <Flag country={country} large key={country.id} />)}</div>
          <div className="client-newsfeed-detail-heading">
            <div className="client-newsfeed-country-tags">{countries.map(country => <span key={country.id}>{country.name}<b>{country.abbreviation}</b></span>)}</div>
            {selected.service?.service && <p className="client-newsfeed-service-tag">{selected.service.service}</p>}
            <h2>{selected.title}</h2>
            {formatDate(selected.created_at) && <p className="client-newsfeed-date"><span aria-hidden="true">▦</span>{formatDate(selected.created_at)}</p>}
          </div>
        </div>
        <div className="client-newsfeed-full-description">{selected.description}</div>
        <dl className="client-newsfeed-record-meta">
          <div><dt>News ID</dt><dd><code>{selected.id}</code></dd></div>
          {selected.service_id && <div><dt>Service ID</dt><dd><code>{selected.service_id}</code></dd></div>}
          {selected.updated_at && <div><dt>Last updated</dt><dd>{formatDate(selected.updated_at)}</dd></div>}
          <div><dt>Countries</dt><dd>{countries.map(country => `${country.name} (${country.abbreviation})`).join(', ') || 'Not specified'}</dd></div>
          {countries.length > 0 && <div><dt>Country record IDs</dt><dd><code>{countries.map(country => country.id).join(', ')}</code></dd></div>}
        </dl>
      </article> : <div className="client-newsfeed-state"><p>Select a news announcement to view its details.</p></div>}
    </section>
  </main>;
}
