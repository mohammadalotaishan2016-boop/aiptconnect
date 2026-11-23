'use client';
import ActionIcon from '../../src/components/ActionIcon';
import { useCallback, useEffect, useState } from 'react';

type AuditLog = {
  id: string;
  actor_id: string;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

type LogDetail = { log: AuditLog; show: 'before' | 'after' };

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
};

const ENTITY_LABELS: Record<string, string> = {
  user_account: 'User Account',
  client: 'Client',
  country: 'Country',
  project: 'Project',
  fee: 'Fee',
  quotation: 'Quotation',
  device: 'Device',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [detail, setDetail] = useState<LogDetail | null>(null);

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(pg), page_size: String(pageSize) });
      if (filterEntity) params.set('entity_type', filterEntity);
      if (filterAction) params.set('action', filterAction);
      if (filterDateFrom) params.set('date_from', filterDateFrom);
      if (filterDateTo) params.set('date_to', filterDateTo);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Unable to load audit logs.');
      setLogs(body.data ?? []);
      setTotal(body.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, filterEntity, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    void load(page);
  }, [page]);

  const applyFilters = () => {
    setPage(1);
    void load(1);
  };

  const resetFilters = () => {
    setFilterEntity('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
    void load(1);
  };

  return (
    <main className="procedure-page users-page">
      <section>
        <header className="countries-topbar">
          <p>Home <i>/</i> <b>Audit Logs</b></p>
          <div className="top-profile"><span>MS</span><b>Administrator</b></div>
        </header>
        <div className="countries-heading">
          <div>
            <h1>
              <span className="users-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="22" height="22">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
              </span>
              Audit Logs
            </h1>
            <p>All administrator actions recorded in chronological order.</p>
          </div>
          <div className="users-heading-actions">
            <button type="button" className="client-refresh" onClick={() => void load(page)} disabled={loading} title="Refresh">
              <ActionIcon name="refresh" /><span className="aipt-action-label">{loading ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {error && <p className="country-page-error">{error}</p>}

        <section className="country-table-card">
          {/* Filters */}
          <div className="users-toolbar" style={{ flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              aria-label="Filter by entity type"
            >
              <option value="">All entities</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              <option value="create">Created</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted</option>
            </select>

            <label className="audit-date-label">
              From
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                aria-label="Date from"
              />
            </label>

            <label className="audit-date-label">
              To
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                aria-label="Date to"
              />
            </label>

            <button type="button" className="users-primary-link" onClick={applyFilters} disabled={loading}>
              Apply
            </button>
            <button type="button" onClick={resetFilters} disabled={loading}>
              <ActionIcon name="refresh" /> Reset
            </button>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{total} records</span>
          </div>

          <div className="country-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="country-state">Loading audit logs…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} className="country-state">No audit log entries found.</td></tr>
                ) : logs.map((log, idx) => (
                  <tr key={log.id}>
                    <td>{(page - 1) * pageSize + idx + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                    <td>
                      <span title={log.actor_id}>{log.actor_name}</span>
                    </td>
                    <td>{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</td>
                    <td>
                      <code style={{ fontSize: '11px', opacity: 0.7 }}>{log.entity_id.slice(0, 8)}…</code>
                    </td>
                    <td>
                      <span className={`statement-status ${log.action === 'delete' ? 'suspended' : log.action === 'create' ? 'approved' : 'pending'}`}>
                        {ACTION_LABEL[log.action] ?? log.action}
                      </span>
                    </td>
                    <td>
                      <div className="user-actions">
                        {log.after_data && (
                          <button
                            type="button"
                            onClick={() => setDetail({ log, show: 'after' })}
                            title="View changes"
                          >
                            After
                          </button>
                        )}
                        {log.before_data && (
                          <button
                            type="button"
                            onClick={() => setDetail({ log, show: 'before' })}
                            title="View previous state"
                          >
                            Before
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="country-pagination">
            <p>Showing {logs.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} records</p>
            <div>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <span>Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}>›</button>
            </div>
          </footer>
        </section>
      </section>

      {detail && (
        <div className="company-verify-backdrop" onMouseDown={() => setDetail(null)}>
          <section
            className="company-verify-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Audit log detail"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: '560px', width: '100%' }}
          >
            <button type="button" className="company-verify-close" onClick={() => setDetail(null)} aria-label="Close">×</button>
            <span>AUDIT DETAIL</span>
            <h2 style={{ marginBottom: '8px' }}>
              {ACTION_LABEL[detail.log.action]} {ENTITY_LABELS[detail.log.entity_type] ?? detail.log.entity_type}
            </h2>
            <p style={{ fontSize: '12px', opacity: 0.6, marginBottom: '12px' }}>
              {formatDate(detail.log.created_at)} · by {detail.log.actor_name}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {detail.log.before_data && (
                <button
                  type="button"
                  className={detail.show === 'before' ? 'users-primary-link' : ''}
                  onClick={() => setDetail((d) => d ? { ...d, show: 'before' } : d)}
                >
                  Before
                </button>
              )}
              {detail.log.after_data && (
                <button
                  type="button"
                  className={detail.show === 'after' ? 'users-primary-link' : ''}
                  onClick={() => setDetail((d) => d ? { ...d, show: 'after' } : d)}
                >
                  After
                </button>
              )}
            </div>
            <pre style={{ background: '#f4f7f9', borderRadius: '6px', padding: '12px', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(detail.show === 'before' ? detail.log.before_data : detail.log.after_data, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
