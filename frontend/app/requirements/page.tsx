'use client';
import { useClientPermissions } from '../../src/components/ClientPermissions';
import { toPlainText } from '../../src/lib/plain-text';
import DataTransfer from '../../src/components/DataTransfer';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';

type Country = { id: string; name: string; abbreviation: string };
type Service = { id: string; service: string };
type Procedure = { id: string; description: string; detail_text: string; color_indication: string; service_id: string; service?: { id: string; service: string } };
type Requirement = {
  id: string;
  country_id: string;
  service_id?: string | null;
  procedure_id: string | null;
  description: string;
  client_visible: boolean;
  created_at: string;
  country?: Country;
  procedure?: Procedure;
  service?: { id: string; service: string } | null;
};
type Response = { data: Requirement[]; total: number };


function normalizeService(value: { id?: string; service?: string; name?: string }): Service {
  return { id: value.id ?? '', service: (value.service ?? value.name ?? '').trim() };
}

function enrichRequirement(item: Requirement, serviceRows: Service[], procedureRows: Procedure[]): Requirement {
  const procedure = item.procedure ?? procedureRows.find((value) => value.id === item.procedure_id);
  const serviceId = item.service_id ?? procedure?.service_id ?? null;
  const service = item.service ?? serviceRows.find((value) => value.id === serviceId);
  return {
    ...item,
    service_id: serviceId,
    service: service ?? null,
    procedure: procedure ? { ...procedure, service: procedure.service ?? service ?? undefined } : undefined,
  };
}

export default function RequirementsPage() {
  const pathname = usePathname();
  const { canManage } = useClientPermissions('requirements');
  const readOnly = pathname.startsWith('/client-dashboard/') && !canManage;
  const poaOnly = pathname === '/client-dashboard/poa';
  const [PAGE_SIZE, setPageSize] = useState(10);
  const [allRows, setAllRows] = useState<Requirement[]>([]),
    [countries, setCountries] = useState<Country[]>([]),
    [services, setServices] = useState<Service[]>([]),
    [procedures, setProcedures] = useState<Procedure[]>([]);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [procedureFilter, setProcedureFilter] = useState('');
  const [sort, setSort] = useState('created'),
    [direction, setDirection] = useState('desc');
  const [modal, setModal] = useState<'add' | 'edit' | 'view' | 'delete' | null>(
      null,
    ),
    [selected, setSelected] = useState<Requirement | null>(null);
  const [countryId, setCountryId] = useState(''),
    [serviceId, setServiceId] = useState(''),
    [procedureId, setProcedureId] = useState(''),
    [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured.');
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error('Please sign in.');
    const response = await fetchSupabaseFunction(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body?.error || 'Request failed.');
    return body;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const readAll = async (path: string, sizeKey = 'page_size') => {
        const result: any[] = [];
        for (let next = 1; ; next++) {
          const response = await request(path + '?' + new URLSearchParams({ page: String(next), [sizeKey]: '100' }));
          const batch = Array.isArray(response) ? response : response.data ?? [];
          result.push(...batch);
          if (Array.isArray(response) || !batch.length || result.length >= (response.total ?? Infinity) || batch.length < 100) break;
        }
        return result;
      };
      const [requirements, countryRows, serviceRows, procedureRows] = await Promise.all([
        readAll('requirements'),
        readOnly ? Promise.resolve([]) : request('countries'),
        readOnly ? Promise.resolve([]) : readAll('services'),
        readOnly ? Promise.resolve([]) : readAll('procedures', 'perPage'),
      ]);
      const liveServices = serviceRows.map(normalizeService).filter((item: Service) => item.id && item.service);
      const liveProcedures = procedureRows.filter((item: Procedure) => item.id && item.description && item.service_id);
      const enriched = requirements.map((item: Requirement) => enrichRequirement(item, liveServices, liveProcedures));
      setAllRows(enriched);
      setCountries(readOnly ? [...new Map(enriched.filter((item: Requirement) => item.country).map((item: Requirement) => [item.country!.id, item.country!])).values()] as Country[] : countryRows);
      setServices(readOnly ? [...new Map(enriched.filter((item: Requirement) => item.service).map((item: Requirement) => [item.service!.id, item.service!])).values()] as Service[] : liveServices);
      setProcedures(readOnly ? [...new Map(enriched.filter((item: Requirement) => item.procedure).map((item: Requirement) => [item.procedure!.id, item.procedure!])).values()] as Procedure[] : liveProcedures);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load requirements.'); }
    finally { setLoading(false); }
  }, [request, readOnly]);
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const field = (row: Requirement) => sort === 'country' ? row.country?.name ?? '' : sort === 'service' ? row.service?.service ?? '' : sort === 'procedure' ? row.procedure?.description ?? '' : sort === 'description' ? toPlainText(row.description) : row.created_at;
    return allRows.filter((item) => (!poaOnly || /\bpoa\b|power\s+of\s+attorney/i.test(toPlainText(item.description))) && (!countryFilter || item.country_id === countryFilter) && (!serviceFilter || item.service_id === serviceFilter) && (!procedureFilter || item.procedure_id === procedureFilter) && (!term || [item.country?.name, item.service?.service, item.procedure?.description, toPlainText(item.description)].join(' ').toLowerCase().includes(term))).sort((a, b) => field(a).localeCompare(field(b)) * (direction === 'asc' ? 1 : -1));
  }, [allRows, countryFilter, serviceFilter, procedureFilter, search, sort, direction, poaOnly]);
  const total = filteredRows.length;
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / PAGE_SIZE)))); }, [total, PAGE_SIZE]);

  useEffect(() => {
    void load();
  }, [load]);
  const open = (mode: typeof modal, item: Requirement | null = null) => {
    setSelected(item);
    setCountryId(item?.country_id ?? '');
    setServiceId(item?.service_id ?? item?.procedure?.service_id ?? '');
    setProcedureId(item?.procedure_id ?? '');
    setDescription(toPlainText(item?.description));
    setError('');
    setModal(mode);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!serviceId || !procedureId || !countryId) {
      setError('Service, country, and procedure are required.');
      return;
    }
    if (toPlainText(description).trim().length < 3) {
      setError('Description must be at least 3 characters.');
      return;
    }
    const procedure = procedures.find((item) => item.id === procedureId);
    if (!procedure || procedure.service_id !== serviceId) {
      setError('The selected procedure does not belong to the selected service.');
      return;
    }
    setSaving(true);
    try {
      const saved = await request(selected ? `requirements/${selected.id}` : 'requirements', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({ country_id: countryId, service_id: serviceId, procedure_id: procedureId, description: toPlainText(description) }),
      }) as Requirement;
      const enrichedSaved = enrichRequirement(saved, services, procedures);
      setNotice(selected ? 'Requirement updated.' : 'Requirement added.');
      setModal(null);
      if (selected) {
        setAllRows((current) => current.map((item) => item.id === enrichedSaved.id ? enrichedSaved : item));
      } else if (page === 1 && !search && sort === 'created' && direction === 'desc') {
        setAllRows((current) => [enrichedSaved, ...current]);
      }
      void load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save requirement.',
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`requirements/${selected.id}`, { method: 'DELETE' });
      setNotice('Requirement deleted.');
      setModal(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to delete requirement.',
      );
    } finally {
      setSaving(false);
    }
  };
  const toggleClientVisibility = async (item: Requirement) => {
    setSaving(true);
    try {
      const updated = await request(`requirements/${item.id}`, { method: 'PATCH', body: JSON.stringify({ client_visible: !item.client_visible }) }) as Requirement;
      setAllRows((current) => current.map((row) => row.id === item.id ? { ...row, client_visible: updated.client_visible } : row));
      setNotice(updated.client_visible ? 'Requirement shown to clients.' : 'Requirement hidden from clients.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update client visibility.');
    } finally { setSaving(false); }
  };
  const sortBy = (value: string) => {
    if (sort === value) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSort(value);
      setDirection('asc');
    }
    setPage(1);
  };
  const transferColumns = [
    { key: 'id', label: 'ID' }, { key: 'service_id', label: 'Service ID' }, { key: 'country_id', label: 'Country ID' }, { key: 'procedure_id', label: 'Procedure ID' },
    { key: 'service', label: 'Service' }, { key: 'country', label: 'Country' }, { key: 'procedure', label: 'Procedure' }, { key: 'description', label: 'Description' },
  ];
  const exportRows = async () => filteredRows.map((item) => ({ id: item.id, service_id: item.service_id, country_id: item.country_id, procedure_id: item.procedure_id, service: item.service?.service ?? '', country: item.country?.name ?? '', procedure: item.procedure?.description ?? '', description: toPlainText(item.description) }));
  const validateImport = async (items: Record<string, string>[]) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const row = 'Row ' + (index + 2) + ': ';
      if (item.id && (!allRows.some((entry) => entry.id === item.id) || seen.has(item.id))) throw Error(row + 'requirement ID is missing or duplicated.');
      if (item.id) seen.add(item.id);
      if (!countries.some((entry) => entry.id === item.country_id)) throw Error(row + 'use a valid country_id.');
      if (!services.some((entry) => entry.id === item.service_id) || !procedures.some((entry) => entry.id === item.procedure_id && entry.service_id === item.service_id)) throw Error(row + 'procedure_id must belong to service_id.');
      const description = toPlainText(item.description);
      if (description.length < 3 || description.length > 5000) throw Error(row + 'description must contain 3 to 5000 characters.');
      const key = [item.country_id, item.procedure_id, description].join('|');
      if (seen.has(key) || (!item.id && allRows.some((entry) => entry.country_id === item.country_id && entry.procedure_id === item.procedure_id && toPlainText(entry.description) === description))) throw Error(row + 'duplicate requirement; use its existing ID to update it.');
      seen.add(key);
    });
  };
  const importRows = async (items: Record<string, string>[]) => {
    let completed = 0;
    try {
      for (const item of items) {
        await request(item.id ? 'requirements/' + item.id : 'requirements', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify({ service_id: item.service_id, country_id: item.country_id, procedure_id: item.procedure_id, description: toPlainText(item.description) }) });
        completed++;
      }
    } catch (cause) { throw Error(completed + ' rows saved. Import stopped at row ' + (completed + 2) + '. ' + (cause instanceof Error ? cause.message : 'Request failed.') + ' Export the current list before retrying to avoid duplicates.'); }
    finally { await load(); }
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const firstResult = total ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <main className="procedure-page requirement-page" style={readOnly ? { display: 'block', gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 'auto' } : undefined}>
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Requirements</b>
          </p>
        </header>
        <div className="countries-heading">
          <div>
            <h1>{poaOnly ? 'Power of Attorney (POA)' : 'Requirements'}</h1>
          </div>
          {!readOnly && <button className="country-add" onClick={() => open('add')} data-action="add" title="Add Requirement"><ActionIcon name="add" /><span className="aipt-action-label">Add Requirement</span></button>}
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {error && !modal && <p className="country-page-error">{error}</p>}
        <section className="country-table-card">
          <div className="requirement-toolbar">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search countries or procedures..."
            />
            <select aria-label="Filter by service" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setProcedureFilter(''); setPage(1); }}><option value="">All services</option>{services.map((item) => <option key={item.id} value={item.id}>{item.service}</option>)}</select>
            <select aria-label="Filter by country" value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}><option value="">All countries</option>{countries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select aria-label="Filter by procedure" value={procedureFilter} onChange={(e) => { setProcedureFilter(e.target.value); setPage(1); }}><option value="">All procedures</option>{procedures.filter((item) => !serviceFilter || item.service_id === serviceFilter).map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}</select>
            <button type="button" onClick={() => { setSearch(''); setCountryFilter(''); setServiceFilter(''); setProcedureFilter(''); setPage(1); }}>Reset</button>
            <span>{total} requirements</span>
          </div>
          <div className="data-toolbar"><DataTransfer title="Requirements" columns={transferColumns} getRows={exportRows} disabled={loading || saving} onImport={readOnly ? undefined : importRows} validateImport={readOnly ? undefined : validateImport} /></div>
          <div className="country-table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button type="button" className="statement-sort" onClick={() => sortBy('service')}>Service {sort === 'service' ? direction === 'asc' ? '↑' : '↓' : '↕'}</button></th>
                  <th>
                    <button
                      className="statement-sort"
                      onClick={() => sortBy('country')}
                    >
                      Country {sort === 'country' ? direction === 'asc' ? '↑' : '↓' : '↕'}
                    </button>
                  </th>
                  <th>
                    <button
                      className="statement-sort"
                      onClick={() => sortBy('procedure')}
                    >
                      Procedure {sort === 'procedure' ? direction === 'asc' ? '↑' : '↓' : '↕'}
                    </button>
                  </th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="country-state">
                      Loading requirements...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.service?.service ?? item.procedure?.service?.service ?? services.find((service) => service.id === (item.service_id ?? item.procedure?.service_id))?.service ?? 'Not linked'}</td>
                      <td>
                        <b>{item.country?.name ?? '-'}</b>
                        <small>{item.country?.abbreviation}</small>
                      </td>
                      <td className="requirement-description">
                        <b style={{ display: 'block' }}>{item.procedure?.description ?? 'Not linked'}</b>
                        {item.procedure?.detail_text && <small style={{ display: 'block' }}>{item.procedure.detail_text}</small>}
                      </td>
                      <td className="requirement-description"><div className="requirement-preview">{toPlainText(item.description)}</div></td>
                      <td>
                        <div className="user-actions">
                          <button onClick={() => open('view', item)} data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button>
                          {!readOnly && <>
                          <button onClick={() => open('edit', item)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>
                          <button onClick={() => void toggleClientVisibility(item)} disabled={saving} data-action={item.client_visible ? 'hide-from-clients' : 'show-to-clients'} data-icon-only="true" title={item.client_visible ? 'Hide from clients' : 'Show to clients'}><ActionIcon name={item.client_visible ? 'hide' : 'show'} /><span className="aipt-action-label">{item.client_visible ? 'Hide from clients' : 'Show to clients'}</span></button>
                          <button onClick={() => open('delete', item)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="country-state">
                      No requirements found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={currentPage} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
        </section>
      </section>
      {modal && (
        <div
          className="country-modal-backdrop"
          onMouseDown={() => !saving && setModal(null)}
        >
          <section
            className="country-modal requirement-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="country-panel-heading">
              <h2>
                {modal === 'add'
                  ? 'Add Requirement'
                  : modal === 'edit'
                    ? 'Edit Requirement'
                    : modal === 'view'
                      ? 'Requirement Details'
                      : 'Delete Requirement'}
              </h2>
              <button onClick={() => setModal(null)}>×</button>
            </header>
            {readOnly && selected ? <dl className="requirement-view-details"><dt>Service</dt><dd>{selected.service?.service ?? selected.procedure?.service?.service ?? 'Not linked'}</dd><dt>Country</dt><dd>{selected.country?.name ?? '—'}</dd><dt>Procedure</dt><dd>{selected.procedure?.description ?? 'Not linked'}</dd><dt>Description</dt><dd>{toPlainText(selected.description)}</dd></dl> : modal === 'delete' ? (
              <>
                <p>Delete this requirement permanently?</p>
                {error && <p className="country-form-error">{error}</p>}
                <footer className="country-panel-footer">
                  <button onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                  <button
                    className="delete-primary"
                    onClick={remove}
                    disabled={saving}
                   data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                </footer>
              </>
            ) : (
              <form onSubmit={save}>
                <label className="country-label">
                  Service <em>*</em>
                  <select
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      setProcedureId('');
                    }}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.service}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="country-label">
                  Country <em>*</em>
                  <select
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value)}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select country</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="country-label">
                  Procedure <em>*</em>
                  <select
                    value={procedureId}
                    onChange={(e) => setProcedureId(e.target.value)}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select procedure</option>
                    {procedures
                      .filter((procedure) => !serviceId || procedure.service_id === serviceId)
                      .map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedure.description}
                      </option>
                      ))}
                  </select>
                </label>
                <label className="country-label">
                  Description <em>*</em>
                  <textarea className="requirement-editor" value={description} onChange={(event) => setDescription(event.target.value)} readOnly={modal === 'view'} rows={10} maxLength={5000} placeholder="Enter filing requirements as plain text…" />
                </label>
                {error && <p className="country-form-error">{error}</p>}
                {modal !== 'view' && (
                  <footer className="country-panel-footer">
                    <button type="button" onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                    <button disabled={saving} data-action={selected ? "update" : "add"} title="Save Requirement"><ActionIcon name="update" /><span className="aipt-action-label">
                      {saving ? 'Saving...' : 'Save Requirement'}
                    </span></button>
                  </footer>
                )}
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
