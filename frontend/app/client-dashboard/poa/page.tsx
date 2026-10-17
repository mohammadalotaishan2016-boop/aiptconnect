'use client';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSupabaseFunction } from '../../../src/lib/supabase/browser';
import './poa.css';
import '../client-documents.css';

type Country = { id: string; name: string; abbreviation: string; flag_url: string | null };
type POADocument = {
  id: string;
  key: string;
  countries: Country[];
  document_name: string;
  last_modified: string | null;
  aws_metadata: { size_bytes: number | null; etag: string | null; storage_class: string | null; last_modified: string | null } | null;
};
type POAResponse = { data: POADocument[]; countries: Country[] };

const PAGE_SIZE = 12;

function formatFileSize(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

async function getDownloadUrl(item: POADocument) {
  const parameter = item.id.startsWith('legacy:') ? `key=${encodeURIComponent(item.key)}` : `id=${encodeURIComponent(item.id)}`;
  const response = await fetchSupabaseFunction(`poa?${parameter}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to prepare this download.');
  if (typeof body.url !== 'string') throw Error('The POA download service returned an invalid link.');
  return body.url;
}

function triggerDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ClientPoaPage() {
  const [documents, setDocuments] = useState<POADocument[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [appliedCountry, setAppliedCountry] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [preview, setPreview] = useState<{ item: POADocument; left: number; top: number } | null>(null);
  const previewTimer = useRef<number | null>(null);

  const loadDocuments = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchSupabaseFunction('poa', { signal });
      const body = await response.json().catch(() => ({})) as Partial<POAResponse> & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load POA documents.');
      if (!Array.isArray(body.data) || !Array.isArray(body.countries)) throw Error('The POA document service returned an invalid response.');
      setDocuments(body.data);
      setCountries([...new Map([...body.countries, ...body.data.flatMap(({ countries: linked }) => linked)].map(country => [country.id, country])).values()]);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load POA documents.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(controller.signal);
    return () => controller.abort();
  }, [loadDocuments]);
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
  }, []);
  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [preview]);

  const filteredDocuments = useMemo(() => documents
    .filter(({ countries: linked }) => !appliedCountry || linked.some(country =>
      country.id === 'shared-all' || country.id === appliedCountry || country.name.trim().toLowerCase() === 'all countries'
    ))
    .sort((a, b) => a.document_name.localeCompare(b.document_name)), [documents, appliedCountry]);
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleDocuments = filteredDocuments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const applyFilter = (event: FormEvent) => {
    event.preventDefault();
    setAppliedCountry(countryFilter);
    setPage(1);
  };

  const downloadOne = async (item: POADocument) => {
    if (downloading || downloadingId) return;
    setError('');
    setDownloadStatus('');
    setDownloadingId(item.id);
    try {
      triggerDownload(await getDownloadUrl(item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download this POA document.');
    } finally {
      setDownloadingId('');
    }
  };

  const showPreview = (item: POADocument, row: HTMLTableRowElement) => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    const bounds = row.getBoundingClientRect();
    const width = Math.min(350, window.innerWidth - 24);
    const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min(bounds.top, window.innerHeight - 250));
    setPreview({ item, left, top });
  };

  const schedulePreviewClose = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview(null), 160);
  };

  const keepPreviewOpen = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
  };

  const openDocument = async (item: POADocument) => {
    setPreview(null);
    setError('');
    try {
      const url = await getDownloadUrl(item);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this POA document.');
    }
  };

  const downloadAllDocuments = async () => {
    if (!filteredDocuments.length || downloading || downloadingId) return;
    setError('');
    setDownloadStatus(`Preparing ${filteredDocuments.length} document${filteredDocuments.length === 1 ? '' : 's'}...`);
    setDownloading(true);
    try {
      const urls = await Promise.all(filteredDocuments.map(getDownloadUrl));
      urls.forEach(triggerDownload);
      setDownloadStatus(`Started ${urls.length} document download${urls.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setDownloadStatus('');
      setError(cause instanceof Error ? cause.message : 'Unable to prepare the POA PDF downloads.');
    } finally {
      setDownloading(false);
    }
  };

  return <main className="poa-page client-poa-page">
    <div className="poa-title"><span aria-hidden="true" className="poa-title-icon"><svg viewBox="0 0 24 24"><path d="M5 2h10l5 5v15H5z"/><path d="M14 2v6h6M8 12h8M8 16h8"/></svg></span><h1>POA</h1></div>
    <section className="poa-filter-panel" aria-label="Filter POA documents">
      <form onSubmit={applyFilter}>
        <label htmlFor="poa-country">Country <span aria-hidden="true">*</span></label>
        <div className="poa-filter-controls">
          <select id="poa-country" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} disabled={loading}>
            <option value="">Select Country</option>
            {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
          <button type="submit" disabled={loading} className="poa-search-button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg>Search</button>
        </div>
      </form>
    </section>

    <section className="poa-results-panel" aria-label="POA documents">
      <div className="poa-results-toolbar">
        <span className="poa-results-count">{filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}{downloadStatus && <span className="poa-download-status" role="status">{downloadStatus}</span>}</span>
        <button type="button" className="poa-download-all" onClick={downloadAllDocuments} disabled={loading || downloading || filteredDocuments.length === 0}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>
          {downloading ? 'Preparing downloads...' : 'Download All Documents'}
        </button>
      </div>

      {error && <p className="poa-error" role="alert">{error}</p>}
      <div className="poa-table-wrap">
        <table className="poa-table">
          <caption className="poa-visually-hidden">Power of Attorney documents available to your account</caption>
          <thead><tr><th scope="col">Country</th><th scope="col">Doc Name</th><th scope="col">Download</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="poa-empty"><span className="poa-loading-mark" aria-hidden="true" />Loading POA documents...</td></tr>}
            {!loading && !error && visibleDocuments.map((item) => <tr key={item.id} tabIndex={0} onMouseEnter={event => showPreview(item, event.currentTarget)} onMouseLeave={schedulePreviewClose} onFocusCapture={event => showPreview(item, event.currentTarget)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) schedulePreviewClose(); }}>
              <td><span className="poa-country-list">{item.countries.map(country => <span className="poa-country-cell" key={country.id}>{country.flag_url ? <img src={country.flag_url} alt="" loading="lazy" decoding="async" /> : <span className="poa-country-initials">{country.abbreviation}</span>}<span>{country.name}</span></span>)}</span></td>
              <td><span className="poa-document-cell"><strong className="poa-document-name">{item.document_name}</strong><span className="poa-document-meta">{[
                item.key.split('.').pop()?.toUpperCase(),
                formatFileSize(item.aws_metadata?.size_bytes),
                (item.aws_metadata?.last_modified || item.last_modified) ? `Updated ${formatUpdatedDate(item.aws_metadata?.last_modified || item.last_modified)}` : '',
              ].filter(Boolean).join(' | ')}</span></span></td>
              <td><button type="button" className="poa-download-button" onClick={() => void downloadOne(item)} disabled={downloading || Boolean(downloadingId)} aria-label={`Download ${item.document_name}`} title={downloadingId === item.id ? 'Preparing download' : 'Download'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg></button></td>
            </tr>)}
            {!loading && !error && !visibleDocuments.length && <tr><td colSpan={3} className="poa-empty"><strong>{appliedCountry ? 'No documents for this country yet' : 'No POA documents available'}</strong><span>{appliedCountry ? 'Try selecting another country or clear the filter.' : 'Your available Power of Attorney documents will appear here.'}</span>{appliedCountry && <button type="button" onClick={() => { setCountryFilter(''); setAppliedCountry(''); setPage(1); }}>Clear country filter</button>}</td></tr>}
          </tbody>
        </table>
      </div>

      <footer className="poa-pagination">
        <span>Showing {filteredDocuments.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-{Math.min(currentPage * PAGE_SIZE, filteredDocuments.length)} of {filteredDocuments.length} documents</span>
        <nav aria-label="POA document pages">
          <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1}>First</button>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button>
          <span aria-live="polite">{currentPage} / {pageCount}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button>
          <button type="button" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount}>Last</button>
        </nav>
      </footer>
    </section>
    {preview && <aside className="poa-document-preview" style={{ left: preview.left, top: preview.top }} onMouseEnter={keepPreviewOpen} onMouseLeave={schedulePreviewClose} aria-label="POA document preview">
      <strong>{preview.item.document_name}</strong>
      <span><b>Countries</b>{preview.item.countries.map(country => country.name).join(', ') || 'Not specified'}</span>
      <span><b>File details</b>{[
        preview.item.key.split('.').pop()?.toUpperCase(),
        formatFileSize(preview.item.aws_metadata?.size_bytes),
        (preview.item.aws_metadata?.last_modified || preview.item.last_modified) ? `Updated ${formatUpdatedDate(preview.item.aws_metadata?.last_modified || preview.item.last_modified)}` : '',
      ].filter(Boolean).join(' · ') || 'File details unavailable'}</span>
      <button type="button" onClick={() => void openDocument(preview.item)}>View document</button>
    </aside>}
  </main>;
}

export default function ClientPoaRoute() { return <ClientPoaPage />; }
