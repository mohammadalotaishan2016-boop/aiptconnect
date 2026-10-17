'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

type LifecycleMetric = {
  count: number;
  previous_day_count: number;
  delta: number;
  percent_change: number | null;
};

type MonthlyPerformance = {
  month: string;
  label: string;
  filed: number;
  accepted: number;
  opposition: number;
  registered: number;
};

type LifecycleRate = {
  numerator: number;
  denominator: number;
  value: number | null;
};

type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string | null;
};

type RecentProject = {
  id: string;
  aipt_ref_no: string;
  client_ref_no: string;
  project_name: string;
  matter_type: string;
  status: string;
  filing_date: string | null;
  renewal_date: string | null;
  client: { id: string; assigned_id: number; company_name: string };
  country: Country;
  service: { id: string; service: string; color: string | null };
  procedure: { id: string; description: string };
  latest_timeline: { id: string; procedure: string; timeline_date: string } | null;
};

type DashboardSummary = {
  generated_at: string;
  filters: { day: string; timezone: string; month_start: string; month_end: string };
  daily_totals: Record<'filed' | 'accepted' | 'opposition' | 'registered', LifecycleMetric>;
  project_performance: { granularity: 'month'; series: MonthlyPerformance[] };
  business_performance: {
    period: { start: string; end: string };
    portfolio: {
      active_clients: number;
      new_clients: number;
      active_projects: number;
      new_projects: number;
      timeline_updates: number;
      documents_uploaded: number;
    };
    lifecycle_rates: {
      acceptance_rate: LifecycleRate;
      opposition_rate: LifecycleRate;
      registration_rate: LifecycleRate;
    };
  };
  recent_projects: { data: RecentProject[]; total: number; page: number; page_size: number };
};

type FeeSyncHistory = {
  id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  sheet_progress?: Record<string, 'complete' | 'processing' | 'pending'> | null;
};

type FeeSyncTabRow = {
  id: string;
  date: string;
  tab: string;
  complete: boolean;
  status: string;
  runStatus: string;
};

type IconName = 'filed' | 'accepted' | 'opposition' | 'registered' | 'download' | 'refresh' | 'arrow';

const metricCards: Array<{ key: keyof DashboardSummary['daily_totals']; label: string; icon: IconName; accent: string }> = [
  { key: 'filed', label: 'Total filed', icon: 'filed', accent: 'purple' },
  { key: 'accepted', label: 'Total accepted', icon: 'accepted', accent: 'green' },
  { key: 'opposition', label: 'Total opposition', icon: 'opposition', accent: 'rose' },
  { key: 'registered', label: 'Total registered', icon: 'registered', accent: 'blue' },
];

function riyadhToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL';
}

function statusClass(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function getSummary(query: URLSearchParams) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('The dashboard connection is not configured.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw Error('Please sign in to view the dashboard.');

  const response = await fetchSupabaseFunction(`dashboard?${query.toString()}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 403 && body.error === 'Client access is required.') {
    await supabase.auth.signOut();
    window.sessionStorage.setItem('aipt-auth-message', 'Client access is required.');
    window.location.assign('/login');
    throw Error('Client access is required.');
  }
  if (!response.ok) throw Error(typeof body.error === 'string' ? body.error : 'Could not load the dashboard summary.');
  return body as DashboardSummary;
}

export default function Overview() {
  const [day, setDay] = useState(riyadhToday);
  const [months, setMonths] = useState(12);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feeSyncRows, setFeeSyncRows] = useState<FeeSyncTabRow[]>([]);
  const [syncPage,setSyncPage]=useState(1);
  const [syncSize,setSyncSize]=useState(10);
  const [syncTotal,setSyncTotal]=useState(0);
  const [syncDirection,setSyncDirection]=useState('desc');
  const [syncError,setSyncError]=useState('');
  const [syncLoading, setSyncLoading] = useState(true);
  const syncRequest = useRef<{ query: string; id: number } | null>(null);
  const syncRequestCounter = useRef(0);
  const [recentSize,setRecentSize]=useState(10);
  const deferredSearch = useDeferredValue(search);
  const requestCounter = useRef(0);

  const loadSummary = useCallback(async () => {
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        day,
        months: String(months),
        recent_page: String(page),
        recent_page_size: String(recentSize),
      });
      if (deferredSearch.trim()) query.set('recent_search', deferredSearch.trim());
      const nextSummary = await getSummary(query);
      if (requestId === requestCounter.current) setSummary(nextSummary);
    } catch (cause) {
      if (requestId === requestCounter.current) setError(cause instanceof Error ? cause.message : 'Could not load the dashboard summary.');
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [day, deferredSearch, months, page, recentSize]);

  useEffect(() => { void loadSummary(); }, [loadSummary, recentSize]);

  const loadFeeSyncHistory = useCallback(async () => {
    const query = new URLSearchParams({ history: 'true', page: String(syncPage), page_size: String(syncSize), direction: syncDirection }).toString();
    if (syncRequest.current?.query === query) return;
    const requestId = ++syncRequestCounter.current;
    syncRequest.current = { query, id: requestId };
    setSyncLoading(true);
    setSyncError('');
    try {
      const response = await fetchSupabaseFunction('sync-progress?' + query);
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Unable to load synchronization history.');
      if (!Array.isArray(body.history) || typeof body.total !== 'number') throw Error('The synchronization history response is incomplete.');
      const rows: FeeSyncTabRow[] = body.history.flatMap((run: FeeSyncHistory) => {
        const sheets = Object.entries(run.sheet_progress ?? {});
        return (sheets.length ? sheets : [['Not recorded', 'unknown']]).map(([tab, state]) => ({
          id: run.id + '-' + tab,
          date: run.completed_at || run.started_at,
          tab,
          complete: state === 'complete',
          status: state === 'complete' ? 'Complete' : state === 'processing' ? 'Processing' : state === 'pending' ? 'Pending' : 'Not recorded',
          runStatus: run.status,
        }));
      });
      if (requestId !== syncRequestCounter.current) return;
      setFeeSyncRows(rows);
      setSyncTotal(body.total);
    } catch (cause) {
      if (requestId !== syncRequestCounter.current) return;
      setFeeSyncRows([]);
      setSyncError(cause instanceof Error ? cause.message : 'Unable to load synchronization history.');
    } finally {
      if (syncRequest.current?.id === requestId) syncRequest.current = null;
      if (requestId === syncRequestCounter.current) setSyncLoading(false);
    }
  }, [syncPage, syncSize, syncDirection]);

  useEffect(() => { void loadFeeSyncHistory(); }, [loadFeeSyncHistory]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void loadFeeSyncHistory(); }, 10000);
    return () => window.clearInterval(timer);
  }, [loadFeeSyncHistory]);

  const chartMaximum = useMemo(() => Math.max(1, ...(summary?.project_performance.series.flatMap((item) => [item.filed, item.accepted, item.opposition, item.registered]) ?? [0])), [summary]);
  const recent = summary?.recent_projects;
  const totalPages = recent ? Math.max(1, Math.ceil(recent.total / recent.page_size)) : 1;

  const exportData = () => {
    if (!summary) return;
    const rows: Array<Array<string | number>> = [
      ['AIP&T Overview', `As of ${summary.filters.day}`, `Timezone ${summary.filters.timezone}`],
      [],
      ['Daily lifecycle totals', 'Count', 'Previous day', 'Change'],
      ...metricCards.map(({ key, label }) => {
        const metric = summary.daily_totals[key];
        return [label, metric.count, metric.previous_day_count, metric.delta];
      }),
      [],
      ['Monthly project performance', 'Filed', 'Accepted', 'Opposition', 'Registered'],
      ...summary.project_performance.series.map((item) => [item.month, item.filed, item.accepted, item.opposition, item.registered]),
      [],
      ['Recent client applications', 'Client', 'Country', 'Procedure', 'Status', 'Filing date', 'Latest activity'],
      ...(recent?.data ?? []).map((item) => [item.aipt_ref_no, item.client.company_name, item.country.name, item.procedure.description, item.status, item.filing_date ?? '', item.latest_timeline?.procedure ?? '']),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aipt-overview-${summary.filters.day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <main className="overview-page">
    <header className="overview-heading">
      <div>
        <p className="overview-kicker">PORTFOLIO INTELLIGENCE</p>
        <h1>Overview</h1>
      </div>
      <div className="overview-heading-actions">
        <label className="overview-day-control">Reporting day<input type="date" value={day} onChange={(event) => { setDay(event.target.value); setPage(1); }} /></label>
        <button type="button" className="overview-button overview-button-secondary" onClick={() => void loadSummary()} disabled={loading}><Icon name="refresh" /> Refresh</button>
        <button type="button" className="overview-button overview-button-primary" onClick={exportData} disabled={!summary || loading}><Icon name="download" /> Export data</button>
      </div>
    </header>

    {error && <section className="overview-message overview-message-error" role="alert"><b>Dashboard data could not be loaded.</b><span>{error}</span><button type="button" onClick={() => void loadSummary()}>Try again</button></section>}

    <section className="overview-kpi-grid" aria-label="Daily lifecycle totals">
      {metricCards.map((card) => <MetricCard key={card.key} card={card} metric={summary?.daily_totals[card.key]} loading={loading && !summary} />)}
    </section>

    <section className="overview-analytics">
      <article className="overview-panel overview-project-performance">
        <header className="overview-panel-header">
          <label className="overview-select-control">Period<select value={months} onChange={(event) => { setMonths(Number(event.target.value)); setPage(1); }}><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option></select></label>
        </header>
        <div className="overview-legend" aria-label="Chart legend"><span><i className="legend-filed" />Filed</span><span><i className="legend-accepted" />Accepted</span><span><i className="legend-opposition" />Opposition</span><span><i className="legend-registered" />Registered</span></div>
        <div className="overview-chart" aria-label="Monthly project performance chart">
          {summary?.project_performance.series.map((item) => <div key={item.month} className="overview-chart-column">
            <div className="overview-bars">
              <ChartBar label="Filed" value={item.filed} maximum={chartMaximum} tone="filed" />
              <ChartBar label="Accepted" value={item.accepted} maximum={chartMaximum} tone="accepted" />
              <ChartBar label="Opposition" value={item.opposition} maximum={chartMaximum} tone="opposition" />
              <ChartBar label="Registered" value={item.registered} maximum={chartMaximum} tone="registered" />
            </div>
            <span>{item.label}</span>
          </div>)}
          {!summary && <div className="overview-chart-empty">{loading ? 'Loading monthly performance…' : 'No monthly performance is available.'}</div>}
        </div>
      </article>

      <BusinessPerformance summary={summary} loading={loading && !summary} />
    </section>

    <section className="overview-panel overview-sync-history" aria-busy={syncLoading}>
      <header className="overview-panel-header">
        <div><h2>Fee Sync Updates</h2></div>
        <button type="button" className="overview-button overview-button-secondary" onClick={() => void loadFeeSyncHistory()} disabled={syncLoading} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button>
      </header>
      {syncError && <p role="alert">{syncError}</p>}
      <div className="overview-table-scroll"><table className="overview-table overview-sync-table">
        <thead><tr><th><button type="button" className="aipt-sort" onClick={() => { setSyncDirection(syncDirection === 'asc' ? 'desc' : 'asc'); setSyncPage(1); }}>Date {syncDirection === 'asc' ? '↑' : '↓'}</button></th><th>Worksheet</th><th>Worksheet status</th><th>Sync result</th></tr></thead>
        <tbody>{feeSyncRows.length ? feeSyncRows.map((row) => <tr key={row.id}>
          <td>{formatDate(row.date)}</td><td><b>{row.tab}</b></td>
          <td><span className={`overview-sync-status ${row.complete ? 'is-complete' : 'is-incomplete'}`}>{row.status}</span></td>
          <td>{row.runStatus.replace(/_/g, ' ')}</td>
        </tr>) : <tr><td colSpan={4} className="overview-table-state">{syncLoading ? 'Loading fee synchronization history…' : syncError ? 'Synchronization history could not be loaded.' : 'No fee synchronization history available.'}</td></tr>}</tbody>
      </table></div>
      <p>Pagination counts synchronization runs; each run lists its recorded worksheets.</p>
      <TablePagination page={syncPage} pageSize={syncSize} total={syncTotal} onPageChange={setSyncPage} onPageSizeChange={(size) => { setSyncSize(size); setSyncPage(1); }} loading={syncLoading} />
    </section>

    <section className="overview-panel overview-recent-projects">
      <header className="overview-panel-header overview-recent-header">
        <div><h2>Recent Client Applications</h2></div>
        <div className="overview-recent-actions"><label className="overview-search"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Client, project or reference…" /></label><a className="overview-button overview-button-secondary" href="/clients">View applications <Icon name="arrow" /></a></div>
      </header>
      <div className="overview-table-scroll"><table className="overview-table"><thead><tr><th>Application</th><th>Client</th><th>Country</th><th>Procedure</th><th>Status</th><th>Filing Date</th><th>Latest activity</th></tr></thead><tbody>
        {loading && !summary ? <tr><td colSpan={7} className="overview-table-state">Loading client applications…</td></tr> : (recent?.data.length ?? 0) === 0 ? <tr><td colSpan={7} className="overview-table-state">No client applications match this view.</td></tr> : recent?.data.map((project) => <tr key={project.id}>
          <td><b>{project.aipt_ref_no}</b><small>{project.project_name}</small></td>
          <td><span className="overview-client"><i>{initials(project.client.company_name)}</i><span>{project.client.company_name}<small>Client #{project.client.assigned_id}</small></span></span></td>
          <td><span className="overview-country">{project.country.flag_url ? <img src={project.country.flag_url} alt="" loading="lazy" decoding="async" /> : <i>{project.country.abbreviation}</i>}<span>{project.country.name}</span></span></td>
          <td><span className="overview-procedure">{project.procedure.description}<small>{project.service.service}</small></span></td>
          <td><span className={`overview-status overview-status-${statusClass(project.status)}`}>{project.status}</span></td>
          <td>{formatDate(project.filing_date)}</td>
          <td><span className="overview-activity">{project.latest_timeline ? <><b>{project.latest_timeline.procedure}</b><small>{formatDate(project.latest_timeline.timeline_date)}</small></> : <span>No timeline entry</span>}</span></td>
        </tr>)}</tbody></table></div>
      <TablePagination page={page} pageSize={recentSize} total={recent?.total ?? 0} onPageChange={setPage} onPageSizeChange={setRecentSize} loading={loading} />
    </section>
  </main>;
}

function MetricCard({ card, metric, loading }: { card: (typeof metricCards)[number]; metric: LifecycleMetric | undefined; loading: boolean }) {
  const previous = metric?.previous_day_count ?? 0;
  const delta = metric?.delta ?? 0;
  const change = metric?.percent_change;
  const changeText = previous === 0 ? (metric?.count ? 'New activity today' : 'No activity yesterday') : `${delta > 0 ? '+' : ''}${change ?? 0}% vs previous day`;
  return <article className={`overview-kpi overview-kpi-${card.accent}`}>
    <span className="overview-kpi-icon"><Icon name={card.icon} /></span><div><p>{card.label}</p><b>{loading ? '—' : formatNumber(metric?.count ?? 0)}</b><small className={delta < 0 ? 'negative' : delta > 0 ? 'positive' : ''}>{loading ? 'Loading…' : changeText}</small></div>
  </article>;
}

function ChartBar({ label, value, maximum, tone }: { label: string; value: number; maximum: number; tone: 'filed' | 'accepted' | 'opposition' | 'registered' }) {
  const height = value === 0 ? 3 : Math.max(8, Math.round((value / maximum) * 100));
  return <i className={`overview-bar overview-bar-${tone}`} title={`${label}: ${formatNumber(value)}`} style={{ height: `${height}%` }}><span className="sr-only">{label}: {value}</span></i>;
}

function BusinessPerformance({ summary, loading }: { summary: DashboardSummary | null; loading: boolean }) {
  const portfolio = summary?.business_performance.portfolio;
  const rates = summary?.business_performance.lifecycle_rates;
  const rateRows = [
    { label: 'Acceptance rate', data: rates?.acceptance_rate, tone: 'accepted' },
    { label: 'Opposition rate', data: rates?.opposition_rate, tone: 'opposition' },
    { label: 'Registration rate', data: rates?.registration_rate, tone: 'registered' },
  ] as const;
  return <article className="overview-panel overview-business-performance">
    <header className="overview-panel-header"><div><h2>Business Performance</h2></div></header>
    <div className="overview-business-metrics">
      <BusinessMetric label="Active clients" value={portfolio?.active_clients} loading={loading} />
      <BusinessMetric label="Active applications" value={portfolio?.active_projects} loading={loading} />
      <BusinessMetric label="New this month" value={portfolio?.new_projects} loading={loading} />
      <BusinessMetric label="Timeline updates" value={portfolio?.timeline_updates} loading={loading} />
      <BusinessMetric label="Documents saved" value={portfolio?.documents_uploaded} loading={loading} />
      <BusinessMetric label="New clients" value={portfolio?.new_clients} loading={loading} />
    </div>
    <div className="overview-rates"><h3>Lifecycle conversion</h3>{rateRows.map(({ label, data, tone }) => <div className="overview-rate" key={label}><div><span>{label}</span><b>{data?.value === null || data?.value === undefined ? '—' : `${data.value}%`}</b></div><div className="overview-rate-track"><i className={`overview-rate-fill overview-rate-${tone}`} style={{ width: `${Math.min(100, Math.max(0, data?.value ?? 0))}%` }} /></div><small>{data ? `${formatNumber(data.numerator)} of ${formatNumber(data.denominator)} filed applications` : 'Loading…'}</small></div>)}</div>
  </article>;
}

function BusinessMetric({ label, value, loading }: { label: string; value: number | undefined; loading: boolean }) {
  return <div><span>{label}</span><b>{loading ? '—' : formatNumber(value ?? 0)}</b></div>;
}

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'filed') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M7 3h7l4 4v14H7z" /><path {...common} d="M14 3v5h5M10 13h5M10 17h5" /></svg>;
  if (name === 'accepted') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  if (name === 'opposition') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m12 3 6 9-6 9-6-9z" /><path {...common} d="M12 8v5M12 16h.01" /></svg>;
  if (name === 'registered') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...common} x="5" y="4" width="14" height="16" rx="2" /><path {...common} d="M9 9h6M9 13h6M9 17h4" /></svg>;
  if (name === 'download') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" /></svg>;
  if (name === 'refresh') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M20 11a8 8 0 0 0-14.6-3.8L3 10m0 0V6m0 4h4M4 13a8 8 0 0 0 14.6 3.8L21 14m0 0v4m0-4h-4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5 12h13m-5-5 5 5-5 5" /></svg>;
}
