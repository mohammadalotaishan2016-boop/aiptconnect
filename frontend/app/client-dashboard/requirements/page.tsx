'use client';
import ClientManagement from '../../../src/components/ClientManagement';
import dynamic from 'next/dynamic';
const RequirementsPage = dynamic(() => import('../../requirements/page'), { loading: () => <p>Loading management form...</p> });
import { useMemo, useState } from 'react';
import { toPlainText } from '../../../src/lib/plain-text';
import ActionIcon from '../../../src/components/ActionIcon';
import { ReferenceCountry, useClientReferenceData } from '../../../src/components/ClientReference';
import '../../client-reference.css';
import './client-requirements.css';

type Requirement = { id: string; country_id: string; service_id: string | null; procedure_id: string | null; description: string; country?: ReferenceCountry; service?: { id: string; service: string } | null; procedure?: { id: string; description: string; service_id: string } };
type Group = { id: string; service: string; procedure: string; description: string; countries: ReferenceCountry[] };
function ClientRequirementsPage() {
  const { data, loading, error, retry } = useClientReferenceData<{ data: Requirement[] }>('requirements?catalog=true');
  const [service, setService] = useState(''), [countries, setCountries] = useState<string[]>([]), [procedure, setProcedure] = useState(''), [search, setSearch] = useState('');
  const [page, setPage] = useState(1), [expanded, setExpanded] = useState<string[]>([]), [exportError, setExportError] = useState('');
  const rows = data?.data || [];
  const options = useMemo(() => ({
    services: [...new Map(rows.filter(r => r.service).map(r => [r.service!.id, r.service!])).values()].sort((a,b) => a.service.localeCompare(b.service)),
    countries: [...new Map(rows.filter(r => r.country).map(r => [r.country_id, r.country!])).entries()].sort((a,b) => a[1].name.localeCompare(b[1].name)),
    procedures: [...new Map(rows.filter(r => r.procedure && (!service || r.service_id === service)).map(r => [r.procedure!.id, r.procedure!])).values()].sort((a,b) => a.description.localeCompare(b.description)),
  }), [rows, service]);
  const groups = useMemo(() => {
    const result = new Map<string, Group>();
    rows.filter(r => (!service || r.service_id === service) && (!countries.length || countries.includes(r.country_id)) && (!procedure || r.procedure_id === procedure))
      .filter(r => !search.trim() || [r.country?.name, r.service?.service, r.procedure?.description, r.description].some(value => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
      .forEach(r => {
        const description = toPlainText(r.description), key = JSON.stringify([r.service_id, r.procedure_id, r.country_id, description]);
        const group = result.get(key) || { id: r.id, service: r.service?.service || 'Unspecified service', procedure: r.procedure?.description || 'Unspecified procedure', description, countries: [] };
        if (r.country && !group.countries.some(c => (c.id || c.name) === (r.country!.id || r.country!.name))) group.countries.push(r.country);
        result.set(key, group);
      });
    return [...result.values()];
  }, [rows, service, countries, procedure, search]);
  const exportPdf = async (items: Group[]) => {
    try { setExportError(''); const { exportTable } = await import('../../../src/lib/table-files'); await exportTable('Requirements', [{ key: 'service', label: 'Service' }, { key: 'country', label: 'Country' }, { key: 'procedure', label: 'Procedure' }, { key: 'description', label: 'Requirements' }], items.map(r => ({ ...r, country: r.countries.map(c => c.name).join(', ') })), 'pdf'); }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Unable to export requirements.'); }
  };
  const clearFilters = () => { setService(''); setCountries([]); setProcedure(''); setSearch(''); setPage(1); };
  const toggleExpanded = (id: string) => setExpanded(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const pageSize = 6, pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const activeChips = [service && { label: `Service: ${options.services.find(s => s.id === service)?.service}`, clear: () => { setService(''); setPage(1); } }, ...countries.map(id => ({ label: `Country: ${options.countries.find(c => c[0] === id)?.[1].name}`, clear: () => { setCountries(value => value.filter(country => country !== id)); setPage(1); } })), procedure && { label: `Procedure: ${options.procedures.find(p => p.id === procedure)?.description}`, clear: () => { setProcedure(''); setPage(1); } }, search && { label: `Search: ${search}`, clear: () => { setSearch(''); setPage(1); } }].filter(Boolean) as Array<{label: string; clear: () => void}>;
  return <section className="client-reference-page reference-requirements">
    <header className="requirements-header"><h1>Requirements</h1><p>Find what you need to file a trademark in each country.</p></header>
    <div className="requirements-filters" aria-label="Filter requirements">
      <label>Service<select value={service} disabled={loading} onChange={e => { setService(e.target.value); setPage(1); }}><option value="">All services</option>{options.services.map(s => <option key={s.id} value={s.id}>{s.service}</option>)}</select></label>
      <div className="requirements-country-filter"><label htmlFor="requirements-country-menu">Country</label><details><summary id="requirements-country-menu">{countries.length ? `${countries.length} selected` : 'All countries'}</summary><div className="requirements-country-options">{options.countries.map(([id, country]) => <label key={id}><input type="checkbox" checked={countries.includes(id)} disabled={loading} onChange={e => { setCountries(current => e.target.checked ? [...current, id] : current.filter(c => c !== id)); setPage(1); }} />{country.name}</label>)}</div></details></div>
      <label>Procedure<select value={procedure} disabled={loading} onChange={e => { setProcedure(e.target.value); setPage(1); }}><option value="">All procedures</option>{options.procedures.map(p => <option key={p.id} value={p.id}>{p.description}</option>)}</select></label>
      <label>Search<input type="search" value={search} disabled={loading} placeholder="Type a word, e.g. passport" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
    </div>
    {activeChips.length > 0 && <div className="requirements-chips" aria-label="Active filters">{activeChips.map(chip => <button key={chip.label} type="button" onClick={chip.clear}>{chip.label} <span aria-hidden="true">&times;</span></button>)}</div>}
    {(error || exportError) && <p className="requirements-error" role="alert">{error || exportError}{error && <button onClick={retry}>Retry</button>}</p>}
    <div className="requirements-toolbar"><p aria-live="polite" aria-atomic="true">{loading ? 'Loading requirements...' : `${groups.length} ${groups.length === 1 ? 'result' : 'results'} found`}</p><button className="requirements-primary" disabled={loading || !groups.length} onClick={() => void exportPdf(groups)}><ActionIcon name="download" />Download all as PDF</button></div>
    {loading ? <div className="requirements-empty">Loading requirements...</div> : groups.length ? <div className="requirements-list">{groups.slice((page-1)*pageSize,page*pageSize).map((r, index) => {
      const id = `${r.id}-${index}`, items = r.description.split(/\n+/).map(item => item.replace(/^\s*[-\u2022*]\s*/, '').trim()).filter(Boolean), isExpanded = expanded.includes(id), visibleItems = isExpanded ? items : items.slice(0, 4);
      return <article className="requirements-card" key={id}><div className="requirements-card-country">{r.countries.map(c => <div className="requirements-country" key={c.id || c.name}>{c.flag_url && /^https?:\/\//i.test(c.flag_url) && <img src={c.flag_url} alt="" />}<strong>{c.name}</strong></div>)}<span className="requirements-service">{r.service}</span><span className="requirements-procedure">{r.procedure}</span></div><div className="requirements-card-content"><h2>{r.service} {r.procedure} Requirements</h2><ul className="requirements-items">{visibleItems.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>{items.length > 4 && <button className="requirements-expand" aria-expanded={isExpanded} onClick={() => toggleExpanded(id)}>{isExpanded ? 'Show less' : `Show all ${items.length} items`}</button>}</div><div className="requirements-card-actions"><button className="requirements-secondary" aria-label={`Download requirements for ${r.countries.map(c => c.name).join(', ')}`} onClick={() => void exportPdf([r])}><ActionIcon name="download" />Download PDF</button></div></article>;
    })}</div> : <div className="requirements-empty"><p>No requirements match your filters.</p><button className="requirements-secondary" onClick={clearFilters}>Clear filters</button></div>}
    {!loading && groups.length > 0 && <nav className="requirements-pagination" aria-label="Pagination"><button className="requirements-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button className="requirements-secondary" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</button></nav>}
  </section>;
}

export default function ManagedPage() { return <ClientManagement manager={<RequirementsPage />}><ClientRequirementsPage /></ClientManagement>; }
