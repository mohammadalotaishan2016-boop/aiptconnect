'use client';
import ActionIcon from '../../src/components/ActionIcon';


import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchSupabaseFunction, getSupabaseBrowserClient, setFeeSyncActivity } from '../../src/lib/supabase/browser';

type Category = 'Trademark' | 'Patent' | 'Design' | 'Copyright' | 'Others' | 'Classes' | 'Up to 5 classes' | 'Multi-class' | 'Up to 3 classes';
type ClassFee = { official_fee?: number; attorney_fee?: number; total_fee?: number; currency?: string };
type FeeRow = {
  id: string;
  category?: Category;
  class_number?: number;
  name?: string;
  country?: string;
  flag_url?: string;
  service?: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency: string;
  claiming_priority?: ClassFee;
  [key: `class_${number}`]: ClassFee | string | number | undefined;
};
type CachedFees = { data: FeeRow[]; cursor?: string; filterKey: string };

type PaginationInfo = {
  page_size: number;
  has_next: boolean;
  has_prev: boolean;
  current_position: number;
};

type FeesApiResponse = {
  data: FeeRow[];
  error?: string;
  available_categories?: Category[];
  next_cursor?: string;
  prev_cursor?: string;
  page_info: PaginationInfo;
  message?: string;
  status?: 'no_data' | 'success' | 'error';
  action?: string;
  class_numbers?: number[];
};
type SyncProgressResponse = {
  sync_run_id?: string;
  status?: string;
  progress?: { overall_percent?: number; current_sheet?: string; processed_rows?: number; total_rows?: number };
  current_operation?: string;
  error_message?: string;
  recovery_required?: boolean;
};

const CATEGORIES: Category[] = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others', 'Up to 5 classes', 'Multi-class', 'Up to 3 classes', 'Classes'];

const MAX_CLASS_NUMBER = 45;

const formatMoney = (value: number) => 
  new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0
  }).format(value);

const classFeeValue = (value: FeeRow[keyof FeeRow], field: keyof ClassFee) => {
  if (typeof value === 'number') return field === 'total_fee' ? `$${formatMoney(value)}` : '-';
  if (!value || typeof value !== 'object') return '-';
  const amount = (value as ClassFee)[field];
  return typeof amount === 'number' ? `$${formatMoney(amount)}` : '-';
};

export default function FeesPage() {
  const router = useRouter();
  const [PAGE_SIZE,setPageSize]=useState(20);
  const [nextCursor,setNextCursor]=useState<string>();
  const [previousCursor,setPreviousCursor]=useState<string>();
  const [activeTab, setActiveTab] = useState<Category>('Trademark');
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [debouncedFilters, setDebouncedFilters] = useState({ search: '', country: '', service: '' });
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressResponse | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncMode, setSyncMode] = useState<'manual' | 'automatic'>('manual');
  const [error, setError] = useState('');
  const [noData, setNoData] = useState(false);
  const [pageInfo, setPageInfo] = useState<PaginationInfo | null>(null);
  const [matrixClassNumbers, setMatrixClassNumbers] = useState<number[]>([]);
  const [categoryCache, setCategoryCache] = useState<Record<Category, CachedFees>>({
    Trademark: { data: [], filterKey: '' },
    Patent: { data: [], filterKey: '' },
    Design: { data: [], filterKey: '' },
    Copyright: { data: [], filterKey: '' },
    Others: { data: [], filterKey: '' },
    'Up to 5 classes': { data: [], filterKey: '' },
    'Multi-class': { data: [], filterKey: '' },
    'Up to 3 classes': { data: [], filterKey: '' },
    Classes: { data: [], filterKey: '' },
  });

  const loadFees = useCallback(async (category: Category, cursor?: string, force = false) => {
    setLoading(true);
    setError('');
    setNoData(false);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured.');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const params = new URLSearchParams({
        category,
        limit: String(PAGE_SIZE),
      });

      if (cursor) params.append('cursor', cursor);
      if (debouncedFilters.search) params.append('search', debouncedFilters.search);
      if (debouncedFilters.country) params.append('country', debouncedFilters.country);
      if (debouncedFilters.service) params.append('service', debouncedFilters.service);

      const response = await fetchSupabaseFunction(`fees-api?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const body = (await response.json().catch(() => ({}))) as FeesApiResponse;

      if (!response.ok) {
        throw new Error(body.error || body.message || 'Failed to load fee data. Please try again.');
      }

      // Handle no data available status
      if (body.status === 'no_data') {
        setNoData(true);
        setFees([]);
        setPageInfo(body.page_info || null);
        setCurrentCursor(undefined);
        setPrevCursors([]);
        return;
      }

      setFees(body.data || []);
      setMatrixClassNumbers(Array.isArray(body.class_numbers) ? body.class_numbers : []);
      setPageInfo(body.page_info || null);
      setCurrentCursor(cursor);
      setNextCursor(body.next_cursor);
      setPreviousCursor(body.prev_cursor);
    } catch (cause) {
      setNoData(false);
      setError(cause instanceof Error ? cause.message : 'Unable to load fees.');
      setFees([]);
      setPageInfo(null);
    } finally {
      setLoading(false);
    }
  }, [debouncedFilters, router, PAGE_SIZE]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedFilters({ search, country: countryFilter, service: serviceFilter });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, countryFilter, serviceFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentCursor(undefined);
    setPrevCursors([]);
    void loadFees(activeTab);
  }, [activeTab, debouncedFilters, loadFees]);

  const handleNextPage = () => { if(!loading && nextCursor) void loadFees(activeTab,nextCursor); };
  const handlePrevPage = () => { if(!loading && previousCursor) void loadFees(activeTab,previousCursor); };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncProgress({ status: 'starting', progress: { overall_percent: 0 }, current_operation: 'Starting synchronization...' });
    setSyncMessage('Starting synchronization on the server...');
    setError('');

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured.');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setFeeSyncActivity(true);

      let requestComplete = false;
      const syncRequest = fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-fees`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'sync-now' }),
        }
      ).finally(() => { requestComplete = true; });

      while (!requestComplete) {
        setFeeSyncActivity(true);
        const progressResponse = await fetchSupabaseFunction('sync-progress', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const progressBody = await progressResponse.json().catch(() => ({})) as SyncProgressResponse;
        setSyncProgress(progressBody);
        if (progressBody.status === 'failed') {
          throw new Error(progressBody.error_message || 'Synchronization failed on the server.');
        }
        const percent = Math.round(progressBody.progress?.overall_percent ?? 0);
        const operation = progressBody.status === 'interrupted'
          ? progressBody.error_message || 'Recovering the interrupted synchronization safely...'
          : progressBody.current_operation || 'Synchronizing fee data...';
        setSyncMessage(`${operation}${percent ? ` ${percent}%` : ''}`);
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }

      const response = await syncRequest;
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string; sync_run_id?: string };

      if ((response.status === 202 || response.status === 409) && body.sync_run_id) {
        setSyncMessage(body.message || 'A synchronization is already running. Monitoring the active job...');
        let active = true;
        while (active) {
          setFeeSyncActivity(true);
          const progressResponse = await fetchSupabaseFunction('sync-progress', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const progressBody = await progressResponse.json().catch(() => ({})) as SyncProgressResponse;
          setSyncProgress(progressBody);
          if (progressBody.status === 'failed' || progressBody.status === 'interrupted') {
            throw new Error(progressBody.error_message || 'Synchronization failed on the server.');
          }
          active = ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'].includes(progressBody.status || '');
          if (active) {
            const percent = Math.round(progressBody.progress?.overall_percent ?? 0);
            setSyncMessage(`${progressBody.current_operation || 'Synchronizing fee data...'}${percent ? ` ${percent}%` : ''}`);
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
          }
        }
        await loadFees(activeTab, undefined, true);
        setSyncMessage('Fee data synchronized successfully.');
        return;
      }

      if (!response.ok) {
        throw new Error(body.error || body.message || 'Synchronization could not be started.');
      }

      setSyncMessage(body.message || 'Synchronization completed. Refreshing fee data...');
      await loadFees(activeTab, undefined, true);
      setSyncMessage('Fee data synchronized successfully.');
      setSyncProgress({ status: 'completed', progress: { overall_percent: 100 }, current_operation: 'Synchronization completed.' });
    } catch (cause) {
      setSyncMessage('');
      setError(cause instanceof Error ? cause.message : 'Synchronization failed.');
    } finally {
      setFeeSyncActivity(false);
      setSyncing(false);
    }
  }, [activeTab, loadFees, router]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem('aipt-fee-sync-mode');
    if (savedMode === 'automatic') setSyncMode('automatic');
  }, []);

  useEffect(() => {
    if (syncMode !== 'automatic') return;
    const interval = window.setInterval(() => {
      if (!syncing && !loading) void handleSync();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [handleSync, loading, syncMode, syncing]);

  const isClassMatrixTab = activeTab === 'Classes' || activeTab === 'Up to 5 classes' || activeTab === 'Multi-class' || activeTab === 'Up to 3 classes';
  const isDedicatedClassesTab = activeTab === 'Classes';
  const visibleClassNumbers = isClassMatrixTab ? Array.from({ length: MAX_CLASS_NUMBER }, (_, index) => index + 1) : matrixClassNumbers;
  const filteredFees = isClassMatrixTab
    ? fees.filter(row => Boolean(row.country) && Object.keys(row).some(key => /^class_([1-9]|[1-3][0-9]|4[0-5])$/.test(key)))
    : fees.filter(row => row.category?.trim().toLowerCase() === activeTab.toLowerCase());

  return (
    <main className="fees-page">
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Fees</b> <i>/</i> <b>PRICING DIRECTORY</b>
          </p>
          <div className="top-profile">
            <span>MS</span>
            <b>
              Mohammad Saleh
              <small>Administrator</small>
            </b>
          </div>
        </header>

        <div className="fees-heading">
          <div>
            <p className="fees-kicker"></p>
            <p>Government and attorney fees synchronized from Google Sheets.</p>
          </div>
          <button 
            type="button" 
            onClick={() => void loadFees(activeTab)} 
            disabled={loading}
           data-action="refresh" title="Refresh data"><ActionIcon name="refresh" /><span className="aipt-action-label">
            {loading ? 'Refreshing...' : 'Refresh data'}
          </span></button>
          <label className="fees-sync-mode">
            Sync mode
            <select
              value={syncMode}
              onChange={(event) => {
                const mode = event.target.value as 'manual' | 'automatic';
                setSyncMode(mode);
                window.localStorage.setItem('aipt-fee-sync-mode', mode);
              }}
              aria-label="Fee synchronization mode"
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic check</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || loading}
            className="fees-sync-button"
          >
            {syncing ? 'Syncing...' : 'Sync data'}
          </button>
        </div>

        {syncMessage && (
          <p className="fees-sync-message" role="status" aria-live="polite">
            {syncMessage}
          </p>
        )}

        {syncing && (
          <div className="fees-sync-progress" role="status" aria-live="polite">
            <div className="fees-sync-progress-header">
              <b>Synchronizing fee data</b>
              <span>{Math.round(syncProgress?.progress?.overall_percent ?? 0)}%</span>
            </div>
            <div className="fees-sync-progress-track" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(0, syncProgress?.progress?.overall_percent ?? 0))}%` }} />
            </div>
            <small>{syncProgress?.progress?.current_sheet ? `Sheet: ${syncProgress.progress.current_sheet}. ` : ''}{syncProgress?.current_operation || 'Preparing sync...'}</small>
          </div>
        )}

        {error && (
          <div className="fees-message" role="alert">
            <b>Fee data could not be loaded.</b>
            <span>{error}</span>
            <button type="button" onClick={() => void loadFees(activeTab)}>
              Try again
            </button>
          </div>
        )}

        {noData && !error && (
          <div className="fees-message" role="status">
            <b>No fee data available yet.</b>
            <span>Ask an administrator to run a sync first.</span>
            <button type="button" onClick={() => void loadFees(activeTab)}>
              Check again
            </button>
          </div>
        )}

        {/* Category Tabs */}
        <div className="fees-tabs">
          {CATEGORIES.map(category => (
            <button
              key={category}
              className={`fees-tab ${activeTab === category ? 'active' : ''}`}
              onClick={() => setActiveTab(category)}
              type="button"
            >
              {category.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Filters */}
        <section className="fees-toolbar">
          {!isClassMatrixTab && <label>
            Country search
            <input
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              placeholder="Search country or region"
            />
          </label>}
          {!isClassMatrixTab && <label>
            Procedure filter
            <input
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              placeholder="Search service"
            />
          </label>}
          <label>
            General search
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search all fields"
            />
          </label>
        </section>

        {/* Table */}
        <section className="fees-table-card">
          <div className="fees-table-scroll">
            <table>
              <thead>
                {isClassMatrixTab ? <>
                  <tr>
                    <th className="fees-country-heading" rowSpan={2}>Country</th>
                    {visibleClassNumbers.map((classNumber) => <th key={classNumber} colSpan={3}>Class {classNumber}</th>)}
                    {isDedicatedClassesTab && <th colSpan={3}>Claiming Priority</th>}
                  </tr>
                  <tr>
                    {visibleClassNumbers.map((classNumber) => <Fragment key={classNumber}><th>Official Fees</th><th>Attorney Fees</th><th>Total</th></Fragment>)}
                    {isDedicatedClassesTab && <Fragment><th>Official Fees</th><th>Attorney Fees</th><th>Total</th></Fragment>}
                  </tr>
                </> : <tr><th className="fees-country-heading">Country <span>⌄</span></th><th>Services</th><th>Procedure</th><th className="fees-official">Official Fees (US$)</th><th className="fees-attorney">Attorney Fees (US$)</th><th className="fees-total">TOTAL (US$)</th><th>Related Tab</th></tr>}
              </thead>
              <tbody>
                {loading && filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan={isClassMatrixTab ? 1 + visibleClassNumbers.length * 3 + (isDedicatedClassesTab ? 3 : 0) : 7} className="fees-state">
                      Loading {activeTab} fees...
                    </td>
                  </tr>
                ) : filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan={isClassMatrixTab ? 1 + visibleClassNumbers.length * 3 + (isDedicatedClassesTab ? 3 : 0) : 7} className="fees-state">
                      No fee records available for this category.
                    </td>
                  </tr>
                ) : (
                  filteredFees.map(row => (
                    <tr key={row.id}>
                      {isClassMatrixTab ? <><td className="fees-country-cell">{row.flag_url ? <img className="fees-flag" src={row.flag_url} alt={`${row.country} flag`} loading="lazy" decoding="async" /> : <span className="fees-flag-fallback" aria-hidden="true">{(row.country || '').slice(0, 2).toUpperCase()}</span>}<b>{row.country || '-'}</b></td>{visibleClassNumbers.map((classNumber) => { const fee = row[`class_${classNumber}`]; return <Fragment key={classNumber}><td className="fees-class-cell">{classFeeValue(fee, 'official_fee')}</td><td className="fees-class-cell">{classFeeValue(fee, 'attorney_fee')}</td><td className="fees-class-cell">{classFeeValue(fee, 'total_fee')}</td></Fragment>; })}{isDedicatedClassesTab && <Fragment><td className="fees-class-cell">{classFeeValue(row.claiming_priority, 'official_fee')}</td><td className="fees-class-cell">{classFeeValue(row.claiming_priority, 'attorney_fee')}</td><td className="fees-class-cell">{classFeeValue(row.claiming_priority, 'total_fee')}</td></Fragment>}</> : <td className="fees-country-cell">
                        {row.flag_url ? (
                          <img className="fees-flag" src={row.flag_url} alt={`${row.country} flag`} loading="lazy" decoding="async" />
                        ) : (
                          <span className="fees-flag-fallback" aria-hidden="true">
                            {(row.country ?? '').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <b title={row.country}>{row.country}</b>
                      </td>}
                      {!isClassMatrixTab && <><td className="fees-service">{row.category || '-'}</td><td className="fees-service">{row.service || '-'}</td><td className="fees-official">${formatMoney(row.official_fee)}</td><td className="fees-attorney">${formatMoney(row.attorney_fee)}</td><td className="fees-total"><strong>${formatMoney(row.total_fee)}</strong></td><td>{row.category}</td></>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="fees-pagination"><label>Rows per page <select aria-label="Rows per page" value={PAGE_SIZE} disabled={loading} onChange={e=>setPageSize(Number(e.target.value))}>{[10,20,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
            <button
              onClick={handlePrevPage}
              disabled={loading || !pageInfo?.has_prev}
              type="button"
            >
              Prev
            </button>
            <span>
              {pageInfo ? `Page ${Math.floor((pageInfo?.current_position ?? 0) / PAGE_SIZE) + 1}` : 'Page 1'} 
              {pageInfo?.has_next && '...'} • {pageInfo?.page_size || PAGE_SIZE} per page
            </span>
            <button
              onClick={handleNextPage}
              disabled={loading || !pageInfo?.has_next}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
