'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

type ColorName = 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'teal' | 'yellow' | 'gray' | 'pink' | 'indigo';
type Service = { id: string; service: string; color: string };
type Procedure = {
  id: string;
  description: string;
  detail_text: string;
  color_indication: ColorName;
  service_id: string;
  client_visible: boolean;
  service: { id: string; service: string } | null;
};
type Modal = 'add' | 'edit' | 'delete' | null;

const colors: Array<{ name: ColorName; hex: string }> = [
  { name: 'purple', hex: '#633edb' },
  { name: 'blue', hex: '#147be5' },
  { name: 'green', hex: '#21b443' },
  { name: 'orange', hex: '#ef6506' },
  { name: 'red', hex: '#ed2028' },
  { name: 'teal', hex: '#25b8bd' },
  { name: 'yellow', hex: '#ffb516' },
  { name: 'gray', hex: '#969aaa' },
  { name: 'pink', hex: '#f46e9d' },
  { name: 'indigo', hex: '#6246df' },
];

const colorHex = (name: ColorName) => colors.find((color) => color.name === name)?.hex ?? colors[0].hex;

export default function ProcedurePage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ColorName>('purple');
  const [serviceId, setServiceId] = useState('');
  const [query, setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState(10);
  const [total,setTotal] = useState(0);
  const [sort,setSort] = useState('description');
  const [ascending,setAscending] = useState(true);
  const [search,setSearch] = useState('');
  const generation = useRef(0);
  useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(query);setPage(1)},300);return ()=>window.clearTimeout(timer)},[query]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  const request = useCallback(async (endpoint: string, path = '', options: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured for this environment.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Error('Please sign in to manage procedures.');
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${endpoint}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error ?? 'Unable to complete the request.');
    }
    return response.status === 204 ? null : response.json();
  }, []);

  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const [procedureBody, serviceBody] = await Promise.all([
        request('procedures', '?' + new URLSearchParams({page:String(page),perPage:String(pageSize),search,sort,direction:ascending?'asc':'desc'})),
        request('services', '?page=1&page_size=100&sort=name'),
      ]);
      if(version !== generation.current) return;
      setTotal(procedureBody.total ?? 0);
      if(page > Math.max(1,Math.ceil(procedureBody.total/pageSize))) setPage(Math.max(1,Math.ceil(procedureBody.total/pageSize)));
      setProcedures(procedureBody.data ?? []);
      setServices((serviceBody.data ?? serviceBody ?? []).map((item: Service) => ({
        id: item.id,
        service: item.service,
        color: item.color,
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load procedures.');
    } finally {
      setLoading(false);
    }
  }, [request,page,pageSize,search,sort,ascending]);

  useEffect(() => { void load(); }, [load]);

  const visible = procedures;

  const open = (kind: Exclude<Modal, null>, item?: Procedure) => {
    setSelected(item ?? null);
    setDescription(item?.description ?? '');
    setColor(item?.color_indication ?? 'purple');
    setServiceId(item?.service_id ?? services[0]?.id ?? '');
    setError('');
    setModal(kind);
  };

  const close = () => {
    if (!saving) {
      setModal(null);
      setError('');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = description.trim();
    if (value.length < 3) return setError('Description must be at least 3 characters.');
    if (!serviceId) return setError('Select a service.');
    setSaving(true);
    setError('');
    try {
      const saved = await request(
        'procedures',
        modal === 'edit' ? `/${selected?.id}` : '',
        {
          method: modal === 'edit' ? 'PUT' : 'POST',
          body: JSON.stringify({
            description: value,
            detail_text: selected?.detail_text && selected.detail_text !== selected.description
              ? selected.detail_text
              : value,
            color_indication: color,
            service_id: serviceId,
          }),
        },
      ) as Procedure;
      setProcedures((current) => modal === 'edit'
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      setNotice(modal === 'edit' ? 'Procedure updated successfully.' : 'Procedure added successfully.');
      setModal(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save procedure.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await request('procedures', `/${selected.id}`, { method: 'DELETE' });
      setProcedures((current) => current.filter((item) => item.id !== selected.id));
      setNotice('Procedure deleted successfully.');
      setModal(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete procedure.');
    } finally {
      setSaving(false);
    }
  };

  const toggleClientVisibility = async (procedure: Procedure) => {
    setSaving(true);
    setError('');
    try {
      const updated = await request('procedures', `/${procedure.id}`, { method: 'PATCH', body: JSON.stringify({ client_visible: !procedure.client_visible }) }) as Procedure;
      setProcedures((current) => current.map((item) => item.id === procedure.id ? { ...item, client_visible: updated.client_visible } : item));
      setNotice(updated.client_visible ? 'Procedure shown to clients.' : 'Procedure hidden from clients.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update client visibility.');
    } finally {
      setSaving(false);
    }
  };

  const download = (content: string, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `procedures-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const exportExcel = () => {
    const escape = (value: string) => `"${value.split('"').join('""')}"`;
    const rows = visible.map((item) => [item.description, item.detail_text, item.color_indication, item.service?.service ?? ''].map(escape).join(','));
    download(`\uFEFFDescription,Details,Color Indicator,Service\r\n${rows.join('\r\n')}`, 'text/csv;charset=utf-8', 'csv');
  };

  const exportWord = () => {
    const rows = visible.map((item) => `<tr><td>${item.description}</td><td>${item.detail_text}</td><td>${item.color_indication}</td><td>${item.service?.service ?? ''}</td></tr>`).join('');
    download(`<html><head><meta charset="utf-8"><style>body{font-family:Arial}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f1efff}</style></head><body><h1>Procedures</h1><table><tr><th>Description</th><th>Details</th><th>Color Indicator</th><th>Service</th></tr>${rows}</table></body></html>`, 'application/msword', 'doc');
  };

  const exportPdf = () => {
    const popup = window.open('', '_blank', 'width=1000,height=700');
    if (!popup) return setError('Allow pop-ups to export the PDF.');
    const rows = visible.map((item) => `<tr><td>${item.description}</td><td>${item.detail_text}</td><td>${item.color_indication}</td><td>${item.service?.service ?? ''}</td></tr>`).join('');
    popup.document.write(`<html><head><title>Procedures</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe2ed;padding:9px;text-align:left}th{background:#f1efff}</style></head><body><h1>Procedures</h1><table><tr><th>Description</th><th>Details</th><th>Color Indicator</th><th>Service</th></tr>${rows}</table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
    setExportOpen(false);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw Error('The import file has no procedure rows.');
      const parse = (line: string) => (line.match(/("(?:[^"]|"")*"|[^,]+)(?=,|$)/g) ?? []).map((value) => value.replace(/^"|"$/g, '').split('""').join('"').trim());
      const headers = parse(lines[0]).map((value) => value.toLowerCase());
      const descriptionIndex = headers.indexOf('description');
      const detailsIndex = headers.indexOf('details');
      const colorIndex = headers.indexOf('color indicator');
      const serviceIndex = headers.indexOf('service');
      if ([descriptionIndex, colorIndex, serviceIndex].some((index) => index < 0)) throw Error('CSV columns must include Description, Color Indicator, and Service.');
      let imported = 0;
      const rejected: number[] = [];
      for (let index = 1; index < lines.length; index += 1) {
        const cells = parse(lines[index]);
        const descriptionValue = cells[descriptionIndex]?.trim();
        const colorValue = cells[colorIndex]?.toLowerCase() as ColorName;
        const service = services.find((item) => item.service.toLowerCase() === cells[serviceIndex]?.toLowerCase());
        if (!descriptionValue || descriptionValue.length < 3 || !colors.some((item) => item.name === colorValue) || !service) {
          rejected.push(index + 1);
          continue;
        }
        await request('procedures', '', { method: 'POST', body: JSON.stringify({ description: descriptionValue, detail_text: cells[detailsIndex] || descriptionValue, color_indication: colorValue, service_id: service.id }) });
        imported += 1;
      }
      await load();
      setNotice(`${imported} procedure${imported === 1 ? '' : 's'} imported.${rejected.length ? ` Rejected rows: ${rejected.join(', ')}.` : ''}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to import procedures.');
    } finally {
      setImporting(false);
    }
  };

  return <main className="procedure-page">
    <section>
      <header className="countries-topbar"><p>Home <i>/</i> <b>Procedure</b></p><div className="top-profile"><button aria-label="Notifications">♧</button><span>MS</span><b>Mohammad Saleh<small>Administrator</small></b></div></header>
      <div className="countries-heading"><div><h1>Procedure</h1></div><div className="procedure-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="⌕  Search..."/><button className="filter-button">▽ &nbsp; Filter</button><input ref={importInput} className="procedure-file-input" type="file" accept=".csv,text/csv" onChange={importCsv}/><button className="procedure-import" disabled={importing} onClick={() => importInput.current?.click()} data-action="import" title="Import"><ActionIcon name="import" /><span className="aipt-action-label">⇧ &nbsp; {importing ? 'Importing…' : 'Import'}</span></button><div className="procedure-export"><button onClick={() => setExportOpen((value) => !value)}>⇩ &nbsp; Export</button>{exportOpen && <div><button onClick={exportExcel} data-action="export" title="Excel"><ActionIcon name="export" /><span className="aipt-action-label">Excel</span></button><button onClick={exportWord} data-action="export" title="Word"><ActionIcon name="export" /><span className="aipt-action-label">Word</span></button><button onClick={exportPdf} data-action="pdf" title="PDF"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF</span></button></div>}</div><button className="country-add" onClick={() => open('add')}>＋ &nbsp; Add Procedure</button></div></div>
      {notice && <div className="country-toast">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      <section className="country-table-card">
        {error && !modal && <p className="country-page-error">{error}</p>}
        <div className="country-table-wrap"><table><thead><tr><th><button className="aipt-sort" onClick={()=>{setSort("description");setAscending(!ascending);setPage(1)}}>Description {sort==="description"?(ascending?"?":"?"):"?"}</button></th><th><button className="aipt-sort" onClick={()=>{setSort("color_indication");setAscending(!ascending);setPage(1)}}>Color indicator {sort==="color_indication"?(ascending?"?":"?"):"?"}</button></th><th>Service action <span>⌃</span></th></tr></thead><tbody>
          {loading ? <tr><td colSpan={3} className="country-state">Loading procedures…</td></tr> : visible.length ? visible.map((procedure) => {
            const hex = colorHex(procedure.color_indication);
            return <tr key={procedure.id}><td><i className="procedure-dot" style={{ background: hex }}/><b>{procedure.description}</b>{procedure.detail_text !== procedure.description && <small className="procedure-detail">{procedure.detail_text}</small>}</td><td><span className="procedure-pill" style={{ color: hex, background: `${hex}16` }}><i style={{ background: hex }}/>{procedure.color_indication}</span></td><td><button className="country-icon" aria-label={`View ${procedure.description}`}>⊙</button><button className="country-icon" aria-label={`Edit ${procedure.description}`} onClick={() => open('edit', procedure)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button className="country-icon" onClick={() => void toggleClientVisibility(procedure)} disabled={saving} data-action={procedure.client_visible ? 'hide-from-clients' : 'show-to-clients'} data-icon-only="true" title={procedure.client_visible ? 'Hide from clients' : 'Show to clients'} aria-label={procedure.client_visible ? `Hide ${procedure.description} from clients` : `Show ${procedure.description} to clients`}><ActionIcon name={procedure.client_visible ? 'hide' : 'show'} /><span className="aipt-action-label">{procedure.client_visible ? 'Hide from clients' : 'Show to clients'}</span></button><button className="country-icon delete" aria-label={`Delete ${procedure.description}`} onClick={() => open('delete', procedure)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></td></tr>;
          }) : <tr><td colSpan={3} className="country-state">No procedures found.</td></tr>}
        </tbody></table></div>
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
      </section>
    </section>
    {modal && <div className="country-modal-backdrop" onMouseDown={close}><section className="country-modal" onMouseDown={(event) => event.stopPropagation()}>
      {modal === 'delete' && selected ? <>
        <header className="country-panel-heading delete-title"><i>♲</i><div><h2>Delete Procedure</h2><small>Are you sure you want to delete this procedure?<br/>This action cannot be undone.</small></div><button onClick={close}>×</button></header>
        <div className="country-delete-summary"><span>Description</span><b>: {selected.description}</b><span>Color indication</span><b>: <i className="summary-dot" style={{ background: colorHex(selected.color_indication) }}/> {selected.color_indication}</b><span>Service</span><b>: {selected.service?.service ?? '—'}</b></div>
        {error && <p className="country-form-error">{error}</p>}
        <footer className="country-panel-footer"><button onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="delete-primary" disabled={saving} onClick={remove} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">{saving ? 'Deleting…' : 'Delete'}</span></button></footer>
      </> : <>
        <header className="country-panel-heading"><h2>{modal === 'add' ? 'Add New Procedure' : 'Edit Procedure'}</h2><button onClick={close}>×</button></header>
        <form onSubmit={save}><label className="country-label">Description <em>*</em><textarea autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter description" maxLength={255}/><small>Provide a clear and concise description of the procedure.</small></label>
          <label className="country-label">Color indication <em>*</em><small>Select a color to represent this procedure.</small><span className="procedure-colors">{colors.map((option) => <button type="button" key={option.name} className={color === option.name ? 'chosen' : ''} style={{ background: option.hex }} aria-label={`Choose ${option.name}`} onClick={() => setColor(option.name)}>{color === option.name ? '✓' : ''}</button>)}</span></label>
          <label className="country-label">Service <em>*</em><small>Select the service category this procedure belongs to.</small><select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required><option value="">Select service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.service}</option>)}</select></label>
          {error && <p className="country-form-error">{error}</p>}
          <footer className="country-panel-footer"><button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button disabled={saving} data-action="update" title="Save"><ActionIcon name="update" /><span className="aipt-action-label">{saving ? 'Saving…' : modal === 'add' ? 'Save' : 'Update'}</span></button></footer>
        </form>
      </>}
    </section></div>}
  </main>;
}
