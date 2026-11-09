'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../../src/components/ActionIcon';
import TablePagination from '../../../src/components/TablePagination';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';
import '../../countries.css';
import './newsfeed.css';

type Country = { id: string; name: string; abbreviation: string; flag_url: string };
type Service = { id: string; service: string; color?: string };
type Item = { id: string; title: string; description: string; service_id: string | null; service: Service | null; created_at: string; updated_at: string; countries: Array<{ country: Country }> };
type Modal = 'add' | 'edit' | 'delete' | null;

export default function NewsFeedAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingServices, setLoadingServices] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [countryLoadError, setCountryLoadError] = useState('');
  const [serviceLoadError, setServiceLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryPickerRef = useRef<HTMLDivElement>(null);

  const request = useCallback(async (path = '', init: RequestInit = {}, endpoint = 'news-feed') => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Error('Please sign in.');
    const response = await fetchSupabaseFunction(`${endpoint}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error ?? 'Request failed.');
    }
    return response.status === 204 ? null : response.json();
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setLoadingCountries(true); setLoadingServices(true); setError(''); setCountryLoadError(''); setServiceLoadError('');
    const [feedResult, countriesResult, servicesResult] = await Promise.allSettled([
      request() as Promise<{ items: Item[] }>,
      request('', {}, 'countries') as Promise<Country[]>,
      (async () => {
        const result: Service[] = [];
        let page = 1;
        let total = Number.POSITIVE_INFINITY;
        while (result.length < total) {
          const batch = await request(`?page=${page}&page_size=100`, {}, 'services') as { data?: Service[]; total?: number };
          result.push(...(batch.data ?? []));
          total = batch.total ?? result.length;
          if (!(batch.data?.length)) break;
          page += 1;
        }
        return result;
      })(),
    ]);
    if (feedResult.status === 'fulfilled') setItems(feedResult.value.items);
    else setError(feedResult.reason instanceof Error ? feedResult.reason.message : 'Unable to load news feed.');
    if (countriesResult.status === 'fulfilled') setCountries(countriesResult.value);
    else setCountryLoadError(countriesResult.reason instanceof Error ? countriesResult.reason.message : 'Unable to load countries.');
    if (servicesResult.status === 'fulfilled') setServices(servicesResult.value);
    else setServiceLoadError(servicesResult.reason instanceof Error ? servicesResult.reason.message : 'Unable to load services.');
    setLoading(false); setLoadingCountries(false); setLoadingServices(false);
  }, [request]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!countryDropdownOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!countryPickerRef.current?.contains(event.target as Node)) setCountryDropdownOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCountryDropdownOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [countryDropdownOpen]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? items.filter(item => `${item.title} ${item.service?.service ?? ''} ${item.description} ${item.countries.map(entry => entry.country.name).join(' ')}`.toLowerCase().includes(term)) : items;
  }, [items, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const open = (kind: Exclude<Modal, null>, item?: Item) => { setSelected(item ?? null); setTitle(item?.title ?? ''); setDescription(item?.description ?? ''); setServiceId(item?.service_id ?? item?.service?.id ?? ''); setCountryIds(item?.countries.map(entry => entry.country.id) ?? []); setCountryQuery(''); setCountryDropdownOpen(false); setError(''); setModal(kind); };
  const close = () => { if (!saving) { setModal(null); setError(''); setCountryDropdownOpen(false); } };
  const selectedCountries = countries.filter(country => countryIds.includes(country.id));
  const matchingCountries = countries.filter(country => !countryIds.includes(country.id) && `${country.name} ${country.abbreviation}`.toLowerCase().includes(countryQuery.trim().toLowerCase()));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError('Enter a title.');
    if (!description.trim()) return setError('Enter a description.');
    if (!serviceId) return setError('Select a service.');
    if (!countryIds.length) return setError('Select at least one country.');
    setSaving(true); setError('');
    try {
      await request(modal === 'edit' ? `/${selected?.id}` : '', { method: modal === 'edit' ? 'PUT' : 'POST', body: JSON.stringify({ title: title.trim(), description: description.trim(), service_id: serviceId, country_ids: countryIds }) });
      await load();
      setPage(1);
      setTitle(''); setDescription(''); setServiceId(''); setCountryIds([]); setCountryQuery(''); setSelected(null);
      setNotice(modal === 'edit' ? 'News feed item updated.' : 'News feed item created.'); setModal(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save news feed item.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try { await request(`/${selected.id}`, { method: 'DELETE' }); setItems(current => current.filter(item => item.id !== selected.id)); setNotice('News feed item deleted.'); setModal(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete news feed item.'); }
    finally { setSaving(false); }
  };

  return <main className="countries-page newsfeed-admin-page"><section className="countries-content">
    <header className="countries-topbar">
      <p>Home <i>/</i> <b>News Feed</b></p>
      <div className="country-user"><span>MS</span><p><b>Mohammad Saleh</b><small>Administrator</small></p></div></header>
    {/* <div className="countries-heading"><div><h1>News Feed</h1><p>Create and manage country specific news.</p>
    </div>
      <button className="country-add" type="button" onClick={() => open('add')} data-action="add" title="Add News Feed">
      <ActionIcon name="add"/>
      <span className="aipt-action-label">Add News Feed</span>
      </button>
    </div> */}
    {notice && <div className="country-toast" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
    <section className="country-table-card"><header><h2>News Feed Table</h2><label className="country-search">⌕<input aria-label="Search news feed" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search title, service, description, country..."/></label>   
        <button className="country-add" type="button" onClick={() => open('add')} data-action="add" title="Add News Feed">
      <ActionIcon name="add"/>
      <span className="aipt-action-label">Add News Feed</span>
      </button>
    </header>
      {error && !modal && <p className="country-page-error" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></p>}
      <div className="country-table-wrap"><table><thead><tr><th>Title</th><th>Services</th><th>Description</th><th>Countries</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="country-state">Loading news feed...</td></tr> : visible.length ? visible.map(item => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{item.service?.service ?? '—'}</td><td className="newsfeed-description">{item.description}</td><td>{item.countries.map(entry => entry.country.name).join(', ')}</td><td>{new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(item.created_at))}</td><td><button className="country-icon" type="button" onClick={() => open('edit', item)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit"/><span className="aipt-action-label">Edit</span></button><button className="country-icon delete" type="button" onClick={() => open('delete', item)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete"/><span className="aipt-action-label">Delete</span></button></td></tr>) : <tr><td colSpan={6} className="country-state">{items.length ? 'No news feed items match your search.' : 'No news feed items yet.'}</td></tr>}
      </tbody></table></div><TablePagination page={currentPage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading}/>
    </section>
    {modal && <div className="country-modal-backdrop newsfeed-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="country-modal newsfeed-modal" role="dialog" aria-modal="true" aria-labelledby="newsfeed-modal-title" onMouseDown={event => event.stopPropagation()}><header className="country-panel-heading"><h2 id="newsfeed-modal-title">{modal === 'add' ? 'Add News Feed' : modal === 'edit' ? 'Edit News Feed' : 'Delete News Feed'}</h2><button type="button" onClick={close} aria-label="Close">×</button></header>
      {modal === 'delete' && selected ? <><p className="delete-copy"><b>Delete this news feed item?</b><small>This action hides it from the feed.</small></p><div className="country-delete-summary"><b>{selected.title}</b><br/>{selected.service?.service ?? 'No service'}<br/>{selected.countries.map(entry => entry.country.name).join(', ')}</div>{error && <p className="country-form-error">{error}</p>}<footer className="country-panel-footer"><button type="button" onClick={close}>Cancel</button><button className="delete-primary" type="button" disabled={saving} onClick={() => void remove()}><ActionIcon name="delete"/><span className="aipt-action-label">{saving ? 'Deleting...' : 'Delete'}</span></button></footer></> : <form onSubmit={save} noValidate><label className="country-label">Title <em>*</em><input autoFocus={!countryDropdownOpen} maxLength={160} placeholder="Enter a clear news title" value={title} onChange={event => setTitle(event.target.value)} required/></label><label className="country-label">Services <em>*</em><select value={serviceId} onChange={event => setServiceId(event.target.value)} disabled={loadingServices || !!serviceLoadError || !services.length} required><option value="">{loadingServices ? 'Loading services...' : serviceLoadError ? 'Services could not be loaded' : services.length ? 'Select a service' : 'No active services available'}</option>{services.map(service => <option key={service.id} value={service.id}>{service.service}</option>)}</select>{serviceLoadError && <small className="newsfeed-country-load-error">{serviceLoadError}<button type="button" onClick={() => void load()}>Retry</button></small>}</label><label className="country-label">Description <em>*</em><textarea maxLength={5000} rows={6} placeholder="Write the news details here..." value={description} onChange={event => setDescription(event.target.value)} required/></label><div className="country-label"><span>Countries <em>*</em></span><div className="newsfeed-country-control" ref={countryPickerRef}><div className="newsfeed-country-tags">{selectedCountries.map(country => <span className="newsfeed-country-tag" key={country.id}>{country.name}<button type="button" aria-label={`Remove ${country.name}`} onClick={() => setCountryIds(current => current.filter(id => id !== country.id))}>×</button></span>)}<input aria-label="Search countries" placeholder={selectedCountries.length ? 'Add another country...' : 'Search and select countries...'} value={countryQuery} disabled={loadingCountries || !!countryLoadError && !countries.length} onFocus={() => setCountryDropdownOpen(true)} onChange={event => { setCountryQuery(event.target.value); setCountryDropdownOpen(true); }} onKeyDown={event => { if (event.key === 'Enter' && countryDropdownOpen && matchingCountries[0]) { event.preventDefault(); setCountryIds(current => [...current, matchingCountries[0].id]); setCountryQuery(''); } if (event.key === 'Escape') setCountryDropdownOpen(false); }}/><button type="button" className="newsfeed-country-chevron" aria-label={countryDropdownOpen ? 'Close country list' : 'Open country list'} aria-expanded={countryDropdownOpen} onClick={() => setCountryDropdownOpen(open => !open)}>⌄</button></div>{countryDropdownOpen && <div className="newsfeed-country-options" role="listbox" aria-label="Available countries" aria-multiselectable="true">{loadingCountries ? <p>Loading countries...</p> : countryLoadError ? <p>Countries could not be loaded. <button type="button" onClick={() => void load()}>Retry</button></p> : !countries.length ? <p>No active countries are available.</p> : matchingCountries.length ? matchingCountries.map(country => <button type="button" role="option" aria-selected="false" key={country.id} onClick={() => { setCountryIds(current => [...current, country.id]); setCountryQuery(''); }}><span>{country.name}</span><small>{country.abbreviation}</small></button>) : <p>{countryQuery ? 'No matching countries.' : 'All matching countries are selected.'}</p>}</div>}</div>{countryLoadError && <small className="newsfeed-country-load-error">{countryLoadError}<button type="button" onClick={() => void load()}>Retry</button></small>}<small>{countryIds.length} selected from {countries.length} available</small></div>{error && <p className="country-form-error" role="alert">{error}</p>}<footer className="country-panel-footer"><button type="button" onClick={close}>Cancel</button><button className="newsfeed-save-button" type="submit" disabled={saving || loadingCountries || loadingServices || !countries.length || !services.length}><span className="aipt-action-label">{saving ? 'Saving...' : modal === 'add' ? 'Save News Feed' : 'Update News Feed'}</span></button></footer></form>}
    </section></div>}
  </section></main>;
}
