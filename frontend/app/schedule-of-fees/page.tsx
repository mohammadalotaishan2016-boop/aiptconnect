'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAdministratorAccess, requestDocument, formatDocumentDate as formatDate, downloadDocumentUrl as downloadUrl } from '../../src/lib/admin-documents';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';
import '../client-dashboard/poa/poa.css';
import '../poa/admin-poa.css';
import './schedule-of-fees.css';

type ScheduleDocument = { key: string; document_name: string; last_modified: string | null; size: number };
type ScheduleResponse = { data: ScheduleDocument[] };

const PAGE_SIZE = 12;
const scheduleCache = new Map<string, { data: ScheduleDocument[]; expires: number }>();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'xls', 'xlsx', 'doc', 'docx']);

const request = <T,>(path = '', options: RequestInit = {}) => requestDocument<T>('schedule-of-fees', path, options);

function formatSize(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScheduleOfFeesPage() {
  const clientScheduleView = usePathname() === '/client-dashboard/schedule-of-fees';
  const { access, accessError } = useAdministratorAccess('/client-dashboard', 'fees');
  const [documents, setDocuments] = useState<ScheduleDocument[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<ScheduleDocument | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (force = false) => {
    const userId = (await getSupabaseBrowserClient()?.auth.getUser())?.data.user?.id;
    if (!userId) { setError('Please sign in.'); setLoading(false); return; }
    const cacheKey = `${userId}:schedule-of-fees`;
    const cached = scheduleCache.get(cacheKey);
    if (!force && cached && cached.expires > Date.now()) { setDocuments(cached.data); setLoading(false); setError(''); return; }
    setLoading(true);
    setError('');
    try {
      const body = await request<ScheduleResponse>();
      if (!Array.isArray(body.data)) throw Error('The Schedule of Fees service returned invalid data.');
      setDocuments(body.data);
      scheduleCache.set(cacheKey, { data: body.data, expires: Date.now() + 60_000 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Schedule of Fees documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'allowed') void load();
  }, [access, load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter(item => !term || `${item.document_name} ${item.last_modified ?? ''}`.toLowerCase().includes(term))
      .sort((first, second) => (second.last_modified ?? '').localeCompare(first.last_modified ?? ''));
  }, [documents, search]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCreate = () => {
    setSelected(null);
    setDocumentName('');
    setFile(null);
    setError('');
    setNotice('');
    setModal(true);
  };

  const openEdit = (item: ScheduleDocument) => {
    setSelected(item);
    setDocumentName(item.document_name);
    setFile(null);
    setError('');
    setNotice('');
    setModal(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!documentName.trim()) return setError('Enter a document name.');
    if (!selected && !file) return setError('Choose a file to upload.');
    if (file && (file.size < 1 || file.size > MAX_FILE_SIZE)) return setError('Upload a file up to 25 MB.');
    const form = new FormData();
    form.set('document_name', documentName.trim());
    if (file) form.set('file', file);
    setSaving(true);
    setError('');
    try {
      await request(selected ? `?key=${encodeURIComponent(selected.key)}` : '', { method: selected ? 'PUT' : 'POST', body: form });
      setModal(false);
      setNotice(selected ? 'Schedule of Fees document updated.' : 'Schedule of Fees document uploaded.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this document.');
    } finally {
      setSaving(false);
    }
  };

  const download = async (item: ScheduleDocument) => {
    setBusyKey(item.key);
    setError('');
    try {
      const result = await request<{ url: string }>(`?key=${encodeURIComponent(item.key)}`);
      if (!result?.url) throw Error('The Schedule of Fees service returned an invalid download link.');
      downloadUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download this document.');
    } finally {
      setBusyKey('');
    }
  };

  const remove = async (item: ScheduleDocument) => {
    if (!window.confirm(`Delete "${item.document_name}"? This permanently removes it from S3.`)) return;
    setBusyKey(item.key);
    setError('');
    setNotice('');
    try {
      await request(`?key=${encodeURIComponent(item.key)}`, { method: 'DELETE' });
      const userId = (await getSupabaseBrowserClient()?.auth.getUser())?.data.user?.id;
      if (userId) scheduleCache.delete(`${userId}:schedule-of-fees`);
      setDocuments(current => current.filter(document => document.key !== item.key));
      setNotice('Schedule of Fees document deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this document.');
    } finally {
      setBusyKey('');
    }
  };

  if (access !== 'allowed') {
    return accessError
      ? <main className="poa-page admin-poa-page"><p className="poa-error" role="alert">{accessError}</p></main>
      : <main className="poa-page admin-poa-page" aria-busy="true"><p>Verifying administrator access…</p></main>;
  }

  return <main className={`poa-page admin-poa-page schedule-fees-page${clientScheduleView ? ' client-schedule-fees-page' : ''}`}>
    {clientScheduleView ? <h1 className="client-schedule-fees-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h20l-8 9v8l-4 2V12z" /></svg>Schedule of Fees</h1> : <h1 className="admin-poa-accessible-title">Schedule of Fees</h1>}
    <section className="poa-results-panel admin-poa-results" aria-label="Manage Schedule of Fees documents">
      <div className="poa-results-toolbar schedule-fees-toolbar">
        <label className="poa-table-search" htmlFor="schedule-fees-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg>
          <input id="schedule-fees-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search documents..." />
        </label>
        <span>{documents.length} document{documents.length === 1 ? '' : 's'}</span>
        <button type="button" className="poa-download-all admin-poa-add" data-action="add" onClick={openCreate}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Upload document
        </button>
      </div>
      {notice && <p className="admin-poa-notice" role="status">{notice}</p>}
      {error && !modal && <p className="poa-error" role="alert">{error}</p>}
      <div className="poa-table-wrap">
        <table className="poa-table admin-poa-table schedule-fees-table">
          <thead><tr><th scope="col">Document name</th><th scope="col">Date</th><th scope="col">Size</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="poa-empty">Loading documents...</td></tr>}
            {!loading && pageItems.map(item => <tr key={item.key}>
              <td>{item.document_name}</td><td>{formatDate(item.last_modified)}</td><td>{formatSize(item.size)}</td>
              <td className="admin-poa-actions">
                <button type="button" className="poa-download-button" onClick={() => void download(item)} disabled={Boolean(busyKey)} aria-label={`Download ${item.document_name}`} title="Download"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg></button>
                <button type="button" className="poa-download-button admin-poa-edit" data-action="edit" onClick={() => openEdit(item)} disabled={Boolean(busyKey)} aria-label={`Edit ${item.document_name}`} title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11-4-4zM13.5 6.5l4 4"/></svg></button>
                <button type="button" data-action="delete" className="poa-download-button admin-poa-delete" onClick={() => void remove(item)} disabled={Boolean(busyKey)} aria-label={`Delete ${item.document_name}`} title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg></button>
              </td>
            </tr>)}
            {!loading && !error && !pageItems.length && <tr><td colSpan={4} className="poa-empty">{search ? 'No documents match your search.' : 'No Schedule of Fees documents have been uploaded.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="poa-pagination">
        <span>Showing {visible.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}</span>
        <nav aria-label="Schedule of Fees document pages">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>
          <span aria-current="page">{currentPage} / {pageCount}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount}>Next</button>
        </nav>
      </div>
    </section>

    {modal && <div className="admin-poa-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setModal(false); }}>
      <section className="admin-poa-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-fees-dialog-title">
        <header><h2 id="schedule-fees-dialog-title">{selected ? 'Edit Schedule of Fees document' : 'Upload Schedule of Fees document'}</h2><button type="button" onClick={() => setModal(false)} disabled={saving} aria-label="Close">×</button></header>
        <form onSubmit={event => void save(event)}>
          <label htmlFor="schedule-fees-name">Document name <span aria-hidden="true">*</span></label>
          <input id="schedule-fees-name" value={documentName} onChange={event => setDocumentName(event.target.value)} maxLength={200} required />
          <label htmlFor="schedule-fees-file">Document {selected ? '(optional replacement)' : '*'}</label>
          <input id="schedule-fees-file" type="file" accept=".pdf,.xls,.xlsx,.doc,.docx" required={!selected} onChange={event => {
            const next = event.target.files?.[0] ?? null;
            const ext = next?.name.split('.').at(-1)?.toLowerCase() ?? '';
            if (next && (!ACCEPTED_EXTENSIONS.has(ext) || next.size < 1 || next.size > MAX_FILE_SIZE)) {
              setError('Upload PDF, XLS, XLSX, DOC, or DOCX files up to 25 MB.');
              setFile(null);
              event.target.value = '';
              return;
            }
            setFile(next);
            setError('');
            if (next && !documentName) setDocumentName(next.name.replace(/\.[^.]+$/, ''));
          }} />
          <p className="admin-poa-hint">PDF, Excel (.xls, .xlsx), or Word (.doc, .docx) · Maximum 25 MB</p>
          {error && <p className="poa-error" role="alert">{error}</p>}
          <footer><button type="button" className="admin-poa-cancel" onClick={() => setModal(false)} disabled={saving}>Cancel</button><button type="submit" data-action={selected ? "update" : "add"} className="poa-download-all" disabled={saving}>{saving ? 'Saving...' : selected ? 'Save changes' : 'Upload document'}</button></footer>
        </form>
      </section>
    </div>}
  </main>;
}

