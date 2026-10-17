'use client';
import TablePagination from '../../src/components/TablePagination';
import { exportProjects, readProjects } from '../../src/lib/project-files';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

type Lookup = {
  id: string;
  name?: string;
  service?: string;
  description?: string;
  company_name?: string;
  service_id?: string;
};

type Project = {
  id: string;
  client_id: string;
  service_id: string;
  procedure_id: string;
  country_id: string;
  matter_type: string;
  matter_date: string;
  aipt_ref_no: string;
  client_ref_no: string;
  project_name: string;
  class_number: number | null;
  filing_number: string | null;
  filing_date: string | null;
  acceptance_number: string | null;
  acceptance_date: string | null;
  opposition_date: string | null;
  register_number: string | null;
  registered_date: string | null;
  deadline_date: string | null;
  renewal_date: string | null;
  annuity_years: number | null;
  annuity_date: string | null;
  applicant: string;
  status: string;
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  approved_by: string | null;
  image_path: string | null;
  client?: Lookup;
  service?: Lookup;
  procedure?: Lookup;
  procedures?: Array<{ sort_order: number; procedure: Lookup | null }>;
  country?: Lookup;
  custom_fields?: Array<{ field_definition_id: string; value: string | number | boolean | null }>;
};

type Draft = Omit<Project, 'id' | 'client' | 'procedure' | 'procedures' | 'country' | 'custom_fields'> & { procedure_ids: string[]; custom_fields: Record<string, string | number | boolean> };
type TimelineDocument = { id: string; document_name: string; document_size: number; document_type: string; created_at: string };
type TimelineEntry = { id: string; project_id: string; procedure_id: string; timeline_date: string; description: string; created_at: string; procedure?: Lookup; documents: TimelineDocument[] };
type TimelineDraft = { procedure_id: string; timeline_date: string; description: string };
type ProjectListResponse = { data: Project[]; total: number; page: number; page_size: number };
type LookupListResponse = { data: Lookup[]; total?: number };
type CustomField = { id: string; name: string; label: string; field_type: 'text' | 'number' | 'date' | 'boolean'; required: boolean; display_order: number };

const kinds = ['all', 'trademark', 'patent', 'design', 'copyright', 'other'];
const approvalStatuses = ['all', 'draft', 'pending', 'approved', 'rejected'] as const;
const timelineFileExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx']);
const timelineMaxFileSize = 10 * 1024 * 1024;
const timelineMaxFileCount = 10;
const timelineMaxTotalSize = 50 * 1024 * 1024;

const blank = (): Draft => ({
  client_id: '',
  service_id: '',
  procedure_id: '',
  procedure_ids: [],
  country_id: '',
  matter_type: 'trademark',
  matter_date: new Date().toISOString().slice(0, 10),
  aipt_ref_no: '',
  client_ref_no: '',
  project_name: '',
  class_number: null,
  filing_number: null,
  filing_date: null,
  acceptance_number: null,
  acceptance_date: null,
  opposition_date: null,
  register_number: null,
  registered_date: null,
  deadline_date: null,
  renewal_date: null,
  annuity_years: null,
  annuity_date: null,
  applicant: '',
  status: 'Filed',
  approval_status: 'pending',
  approved_at: null,
  approved_by: null,
  image_path: null,
  custom_fields: {},
});

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : '-';
const matterTypeForService = (serviceName: string) => {
  const value = serviceName.toLowerCase();
  if (value.includes('trademark')) return 'trademark';
  if (value.includes('patent')) return 'patent';
  if (value.includes('design')) return 'design';
  if (value.includes('copyright')) return 'copyright';
  return 'other';
};

export default function ProjectsPage() {
  const [rows, setRows] = useState<Project[]>([]);
  const [clients, setClients] = useState<Lookup[]>([]);
  const [countries, setCountries] = useState<Lookup[]>([]);
  const [services, setServices] = useState<Lookup[]>([]);
  const [procedures, setProcedures] = useState<Lookup[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [chosen, setChosen] = useState<Project | null>(null);
  const [modal, setModal] = useState<'form' | 'delete' | 'timeline' | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [clientFilter, setClientFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[] | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<(typeof approvalStatuses)[number]>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('matter_date');
  const [direction, setDirection] = useState('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const loadVersion = useRef(0);
  const lookupPromise = useRef<Promise<[LookupListResponse | null, Lookup[] | null, LookupListResponse | null, LookupListResponse | null, CustomField[] | null]> | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  const sortBy = (field: string) => { setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc'); setSort(field); setPage(1); };
  const [image, setImage] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const importFile=useRef<HTMLInputElement>(null);
  const [transferBusy,setTransferBusy]=useState(false);
  const [transferMessage,setTransferMessage]=useState('');
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft | null>(null);
  const [editingTimeline, setEditingTimeline] = useState<TimelineEntry | null>(null);
  const [timelineError, setTimelineError] = useState('');
  const [timelineFormError, setTimelineFormError] = useState('');
  const [timelineFiles, setTimelineFiles] = useState<File[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [deletingTimeline, setDeletingTimeline] = useState<TimelineEntry | null>(null);
  const [timelineDocumentId, setTimelineDocumentId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<Draft | null>(null);
  const [inlineImage, setInlineImage] = useState<File | null>(null);

  const api = useCallback(async <T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> => {
    const s = getSupabaseBrowserClient();
    if (!s) throw Error('Supabase is not configured.');

    const {
      data: { session },
    } = await s.auth.getSession();
    if (!session) throw Error('Sign in as an administrator.');

    const headers: Record<string, string> = {
      Authorization: 'Bearer ' + session.access_token,
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const r = await fetchSupabaseFunction(path, {
      ...init,
      headers,
    });
    if (r.status === 204) return null;
    const body = await r.text();
    let parsed: { error?: string } | unknown = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = null;
    }
    if (!r.ok) {
      const message = parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
        ? parsed.error
        : body.trim() || `Request failed for ${path} (${r.status}).`;
      throw Error(message);
    }
    return (parsed as T | null) ?? null;
  }, []);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort, direction });
      if (kind !== 'all') params.set('matter_type', kind);
      if (clientFilter) params.set('client_id', clientFilter);
      if (serviceFilter) params.set('service_id', serviceFilter);
      if (approvalFilter !== 'all') params.set('approval_status', approvalFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (!lookupPromise.current) {
        const collect = async (endpoint: string, sizeKey = 'page_size'): Promise<LookupListResponse> => {
          const data: Lookup[] = [];
          let next = 1;
          for (;;) {
            const result = await api<LookupListResponse>(endpoint + '?page=' + next + '&' + sizeKey + '=100');
            const batch = result?.data ?? [];
            data.push(...batch);
            if (!batch.length || data.length >= (result?.total ?? data.length)) break;
            next++;
          }
          return { data, total: data.length };
        };
        lookupPromise.current = Promise.all([collect('clients'), api<Lookup[]>('countries'), collect('services'), collect('procedures', 'perPage'), api<CustomField[]>('projects/fields')]);
        lookupPromise.current.catch(() => { lookupPromise.current = null; });
      }
      const [p, [c, co, s, pr, fields]] = await Promise.all([api<ProjectListResponse>('projects?' + params + (typeof window !== 'undefined' && window.location.pathname.startsWith('/client-dashboard/') ? '&manage=true' : '')), lookupPromise.current]);
      if (version !== loadVersion.current) return;
      if (!p || !c || !co || !s || !pr) throw Error('The Projects data response was empty.');
      if (page > Math.max(1, Math.ceil(p.total / pageSize))) { setPage(Math.max(1, Math.ceil(p.total / pageSize))); return; }
      setRows(p.data ?? []);
      setTotal(p.total ?? 0);
      setClients(c.data ?? []);
      setCountries(co);
      setServices(s.data ?? s ?? []);
      setProcedures(pr.data ?? []);
      setCustomFields(fields ?? []);
      setError('');
    } catch (e) {
      if (version === loadVersion.current) setError(e instanceof Error ? e.message : 'Unable to load projects.');
    }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [api, page, pageSize, kind, approvalFilter, debouncedSearch, sort, direction, clientFilter, serviceFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total ? (page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(page * pageSize, total);

  const open = (p?: Project) => {
    setChosen(p ?? null);
    setImage(null);
    setDraft(
      p
        ? {
            client_id: p.client_id,
            service_id: p.service_id,
            procedure_id: p.procedure_id,
            procedure_ids: p.procedures?.sort((first, second) => first.sort_order - second.sort_order).map((item) => item.procedure?.id).filter((id): id is string => Boolean(id)) ?? [p.procedure_id],
            country_id: p.country_id,
            matter_type: p.matter_type,
            matter_date: p.matter_date,
            aipt_ref_no: p.aipt_ref_no,
            client_ref_no: p.client_ref_no,
            project_name: p.project_name,
            class_number: p.class_number,
            filing_number: p.filing_number,
            filing_date: p.filing_date,
            acceptance_number: p.acceptance_number,
            acceptance_date: p.acceptance_date,
            opposition_date: p.opposition_date,
            register_number: p.register_number,
            registered_date: p.registered_date,
            deadline_date: p.deadline_date,
            renewal_date: p.renewal_date,
            annuity_years: p.annuity_years,
            annuity_date: p.annuity_date,
            applicant: p.applicant,
            status: p.status,
            approval_status: p.approval_status,
            approved_at: p.approved_at,
            approved_by: p.approved_by,
            image_path: p.image_path,
            custom_fields: Object.fromEntries((p.custom_fields ?? []).map((field) => [field.field_definition_id, field.value]).filter(([, value]) => value !== null)),
          }
        : blank()
    );
    setError('');
    setModal('form');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.service_id || !draft.procedure_ids.length || !draft.country_id || !draft.client_id) {
      setError('Select a service, at least one procedure, country, and client before saving the project.');
      return;
    }
    setSaving(true);
    try {
      const selectedService = services.find((service) => service.id === draft.service_id);
      if (!selectedService) throw Error('The selected service is no longer available.');
      const matter_type = matterTypeForService(selectedService.service ?? selectedService.name ?? '');
      let image_path = draft.image_path;

      if (image) {
        const form = new FormData();
        form.append('file', image);
        const uploaded = await api('projects/upload-image?permission_action=' + (chosen ? 'update' : 'add'), { method: 'POST', body: form }) as { image_path: string };
        image_path = uploaded.image_path;
      }

      const saved = (await api(chosen ? 'projects/' + chosen.id : 'projects', {
        method: chosen ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...draft,
          matter_type,
          procedure_id: draft.procedure_ids[0],
          procedure_ids: draft.procedure_ids,
          image_path,
          class_number: matter_type === 'trademark' ? draft.class_number : null,
          annuity_years: matter_type === 'patent' ? draft.annuity_years : null,
          annuity_date: matter_type === 'patent' ? draft.annuity_date : null,
        }),
      })) as Project;

      await load();
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save project.');
    } finally {
      setSaving(false);
    }
  };

  const addTimeline = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setSaving(true);
    try {
      const f = new FormData();
      f.append('project_id', chosen.id);
      f.append('procedure_id', timelineDraft?.procedure_id ?? chosen.procedure_id);
      f.append('timeline_date', timelineDraft?.timeline_date ?? new Date().toISOString().slice(0, 10));
      f.append('description', (timelineDraft?.description ?? description).trim());
      timelineFiles.forEach((x) => f.append('files', x));
      await api('timelines' + (editingTimeline ? '/' + editingTimeline.id : ''), { method: editingTimeline ? 'PUT' : 'POST', body: f });
      await loadTimelineEntries(chosen.id);
      setTimelineFiles([]);
      setEditingTimeline(null);
      setTimelineDraft({ procedure_id: chosen.procedure_id, timeline_date: new Date().toISOString().slice(0, 10), description: '' });
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save timeline.');
    } finally {
      setSaving(false);
    }
  };

  const loadTimelineEntries = async (projectId: string) => {
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const result = await api<TimelineEntry[]>('timelines?project_id=' + encodeURIComponent(projectId));
      setTimelineEntries(result ?? []);
    } catch (e) {
      setTimelineError(e instanceof Error ? e.message : 'Unable to load timeline history.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const openTimeline = (project: Project) => {
    setChosen(project);
    setTimelineEntries([]);
    setTimelineDraft({ procedure_id: project.procedure_id, timeline_date: new Date().toISOString().slice(0, 10), description: '' });
    setTimelineFiles([]);
    setEditingTimeline(null);
    setTimelineError('');
    setTimelineFormError('');
    setModal('timeline');
    void loadTimelineEntries(project.id);
  };

  const addTimelineFiles = (selected: FileList | File[]) => {
    const incoming = Array.from(selected);
    const invalid = incoming.find((file) => !timelineFileExtensions.has(file.name.split('.').pop()?.toLowerCase() ?? '') || file.size < 1 || file.size > timelineMaxFileSize);
    if (invalid) { setTimelineFormError('Each document must be PDF, PNG, JPG, DOC, DOCX, XLS, or XLSX and no larger than 10MB.'); return; }
    const next = [...timelineFiles, ...incoming];
    if (next.length > timelineMaxFileCount) { setTimelineFormError('Upload up to 10 documents at a time.'); return; }
    if (next.reduce((total, file) => total + file.size, 0) > timelineMaxTotalSize) { setTimelineFormError('The combined document size must not exceed 50MB.'); return; }
    setTimelineFiles(next);
    setTimelineFormError('');
  };

  const editTimeline = (entry: TimelineEntry) => {
    setEditingTimeline(entry);
    setTimelineDraft({ procedure_id: entry.procedure_id, timeline_date: entry.timeline_date, description: entry.description });
    setTimelineFiles([]);
    setTimelineFormError('');
  };

  const removeTimeline = async () => {
    if (!deletingTimeline || !chosen) return;
    setSaving(true);
    try { await api('timelines/' + deletingTimeline.id, { method: 'DELETE' }); setDeletingTimeline(null); await loadTimelineEntries(chosen.id); }
    catch (e) { setTimelineError(e instanceof Error ? e.message : 'Unable to delete timeline entry.'); }
    finally { setSaving(false); }
  };

  const openTimelineDocument = async (entry: TimelineEntry, document: TimelineDocument, disposition: 'inline' | 'attachment') => {
    setTimelineDocumentId(document.id);
    try {
      const result = await api<{ url: string }>(`timelines/${entry.id}/documents/${document.id}/download-url?disposition=${disposition}`);
      if (!result?.url) throw Error('The document URL was not returned.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setTimelineError(e instanceof Error ? e.message : 'Unable to open document.'); }
    finally { setTimelineDocumentId(null); }
  };

  const remove = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      await api('projects/' + chosen.id, { method: 'DELETE' });
      await load();
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete project.');
    } finally {
      setSaving(false);
    }
  };

  const approve = async (project: Project) => {
    setSaving(true);
    setError('');
    try {
      await api('projects/' + project.id + '/approve', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to approve project.');
    } finally {
      setSaving(false);
      setOpenActions(null);
    }
  };

  const exportFile = async (format: 'csv'|'xlsx'|'docx'|'pdf') => {
    setTransferBusy(true);setError('');
    try {
      const all: Project[]=[];
      for(let next=1;;next++){
        const params=new URLSearchParams({page:String(next),page_size:'100',sort,direction});
        if(kind!=='all')params.set('matter_type',kind);
        if(clientFilter)params.set('client_id',clientFilter);
        if(serviceFilter)params.set('service_id',serviceFilter);
        if(approvalFilter!=='all')params.set('approval_status',approvalFilter);
        if(search.trim())params.set('search',search.trim());
        const result=await api<ProjectListResponse>('projects?'+params);
        const batch=result?.data ?? [];all.push(...batch);
        if(!batch.length||all.length >= (result?.total ?? all.length))break;
      }
      await exportProjects(all as unknown as Record<string,unknown>[],format,[{name:'Clients',columns:['id','company_name'],rows:clients},{name:'Countries',columns:['id','name'],rows:countries},{name:'Services',columns:['id','service'],rows:services},{name:'Procedures',columns:['id','description','service_id'],rows:procedures}]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Export failed.');}finally{setTransferBusy(false);}
  };
  const importWorkbook = async (file: File) => {
    setTransferBusy(true); setError(''); setTransferMessage('');
    try {
      const incoming = await readProjects(file);
      const references = new Set<string>();
      incoming.forEach((row, index) => {
        const label = 'Row ' + (index + 2) + ': ';
        if (!clients.some((item) => item.id === row.client_id) || !countries.some((item) => item.id === row.country_id)) throw Error(label + 'client_id and country_id must match existing records.');
        if (!services.some((item) => item.id === row.service_id) || !(row.procedure_ids as string[]).every((id) => procedures.some((item) => item.id === id && item.service_id === row.service_id))) throw Error(label + 'every procedure must belong to the selected service.');
        const reference = String(row.aipt_ref_no).toLowerCase();
        if (references.has(reference)) throw Error(label + 'duplicate AIP&T reference in this workbook.');
        references.add(reference);
      });
      for (let next = 1; ; next++) {
        const existing = await api<ProjectListResponse>('projects?page=' + next + '&page_size=100');
        if (existing?.data.some((item) => references.has(item.aipt_ref_no.toLowerCase()))) throw Error('This workbook includes existing AIP&T references. Import creates new projects; remove existing rows before importing.');
        if (!existing?.data.length || next * 100 >= existing.total) break;
      }
      setImportPreview(incoming);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed.'); }
    finally { setTransferBusy(false); if (importFile.current) importFile.current.value = ''; }
  };
  const confirmImport = async () => {
    if (!importPreview || transferBusy) return;
    setTransferBusy(true); let completed = 0;
    try {
      for (const row of importPreview) { await api('projects', { method: 'POST', body: JSON.stringify(row) }); completed++; }
      setTransferMessage(completed + ' projects imported for administrator approval.');
      setImportPreview(null);
    } catch (cause) {
      setImportPreview(importPreview.slice(completed));
      setError(completed + ' projects imported. Remaining rows are retained in the preview. ' + (cause instanceof Error ? cause.message : 'Import failed.'));
    } finally { setTransferBusy(false); await load(); }
  };

  const serviceProcedures = procedures.filter((x) => x.service_id === draft.service_id);

  const addInlineRow = () => {
    setInlineDraft(blank());
    setInlineImage(null);
    setError('');
  };

  const saveInlineRow = async () => {
    if (!inlineDraft) return;
    if (!inlineDraft.service_id || !inlineDraft.procedure_ids.length || !inlineDraft.country_id || !inlineDraft.client_id) {
      setError('Select a service, procedure, country, and client before saving the row.');
      return;
    }
    setSaving(true);
    try {
      const selectedService = services.find((service) => service.id === inlineDraft.service_id);
      if (!selectedService) throw Error('The selected service is no longer available.');
      let image_path = inlineDraft.image_path;
      if (inlineImage) {
        const form = new FormData();
        form.append('file', inlineImage);
        const uploaded = await api<{ image_path: string }>('projects/upload-image', { method: 'POST', body: form });
        image_path = uploaded?.image_path ?? null;
      }
      await api('projects', {
        method: 'POST',
        body: JSON.stringify({
          ...inlineDraft,
          matter_type: matterTypeForService(selectedService.service ?? selectedService.name ?? ''),
          procedure_id: inlineDraft.procedure_ids[0],
          image_path,
        }),
      });
      setInlineDraft(null);
      setInlineImage(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the project row.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="clients-page projects-page">
      <div className="clients-content">
        <header className="clients-topbar">
          <p>
            Home <i>/</i> <b>Projects</b>
          </p>
        </header>

        <section className="clients-heading">
          <div>
            <h1>Projects</h1>
          </div>
          <div className="project-heading-actions">
            <button className="add-client" type="button" onClick={() => open()} data-action="add" title="Add Project"><ActionIcon name="add" /><span className="aipt-action-label">Add Project</span></button>
            <button className="add-client" type="button" onClick={addInlineRow} data-action="add" title="Add Row"><ActionIcon name="add" /><span className="aipt-action-label">Add Row</span></button>
          </div>
        </section>

        {error && !modal && <p className="client-page-error">{error}</p>}{transferMessage && <p role="status">{transferMessage}</p>}

        <section className="clients-table-card">
          <nav className="project-filters" aria-label="Project service types">
            {kinds.map((x) => (
              <button type="button" className={kind === x ? 'is-active' : ''} key={x} onClick={() => { setKind(x); setPage(1); }}>
                <span aria-hidden="true">{x === 'trademark' ? 'TM' : x === 'patent' ? 'PT' : x === 'design' ? 'DS' : x === 'copyright' ? 'CR' : x === 'other' ? 'LT' : 'ALL'}</span>
                {x === 'all' ? 'All Projects' : x === 'other' ? 'Litigation' : x}
              </button>
            ))}
          </nav>

          <header>
            <label className="table-tools">
              <span aria-hidden="true">Search</span>
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search projects..." />
            </label>
            <select aria-label="Filter projects by client" value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}><option value="">All clients</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select>
            <select aria-label="Filter projects by service" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }}><option value="">All services</option>{services.map((item) => <option key={item.id} value={item.id}>{item.service}</option>)}</select>
            <select value={approvalFilter} onChange={(e) => { setApprovalFilter(e.target.value as (typeof approvalStatuses)[number]); setPage(1); }} aria-label="Approval filter"><option value="all">All approvals</option><option value="draft">Draft</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><div className="project-export-actions" aria-label="Export projects"><input ref={importFile} type="file" accept=".xlsx" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importWorkbook(file)}} />
              <button type="button" disabled={transferBusy} onClick={() => importFile.current?.click()} data-action="import" title="Import"><ActionIcon name="import" /><span className="aipt-action-label">Import</span></button>
              <button type="button" disabled={transferBusy} onClick={() => void exportFile('csv')} data-action="export" title="Export"><ActionIcon name="export" /><span className="aipt-action-label">Export</span></button>
              <button type="button" disabled={transferBusy} onClick={() => void exportFile('xlsx')} data-action="export" title="Excel"><ActionIcon name="export" /><span className="aipt-action-label">Excel</span></button>
              <button type="button" disabled={transferBusy} onClick={() => void exportFile('docx')} data-action="export" title="Word"><ActionIcon name="export" /><span className="aipt-action-label">Word</span></button>
              <button type="button" disabled={transferBusy} onClick={() => void exportFile('pdf')} data-action="pdf" title="PDF report"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF / Print</span></button>

            </div>
          </header>

          <div className="clients-table-scroll">
            <table className="clients-table projects-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th aria-sort={sort === 'matter_date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('matter_date')}>Date {sort === 'matter_date' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'aipt_ref_no' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('aipt_ref_no')}>AIP&amp;T REF {sort === 'aipt_ref_no' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'client_ref_no' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('client_ref_no')}>Client Ref no. {sort === 'client_ref_no' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th>Service</th>
                  <th>Procedure id</th>
                  <th aria-sort={sort === 'project_name' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('project_name')}>Project {sort === 'project_name' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'filing_number' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('filing_number')}>Filing Number {sort === 'filing_number' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'register_number' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('register_number')}>Registered Number {sort === 'register_number' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th>Class</th>
                  <th>Country</th>
                  <th>Client</th>
                  <th aria-sort={sort === 'applicant' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('applicant')}>Applicant {sort === 'applicant' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'status' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('status')}>Status {sort === 'status' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'approval_status' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('approval_status')}>Approval {sort === 'approval_status' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'deadline_date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('deadline_date')}>Deadline {sort === 'deadline_date' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'renewal_date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('renewal_date')}>Renewal Date {sort === 'renewal_date' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'filing_date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('filing_date')}>Filing Date {sort === 'filing_date' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  <th aria-sort={sort === 'registered_date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="aipt-sort" onClick={() => sortBy('registered_date')}>Registration Date {sort === 'registered_date' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
                  {customFields.map((field) => <th key={field.id}>{field.label}</th>)}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!inlineDraft && (loading || !rows.length) && <tr><td colSpan={19} className="country-state">{loading ? 'Loading projects…' : 'No projects match these filters.'}</td></tr>}
                {inlineDraft && <tr className="project-inline-row">
                  <td><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => setInlineImage(event.target.files?.[0] ?? null)} /></td>
                  <td><input type="date" value={inlineDraft.matter_date} onChange={(event) => setInlineDraft({ ...inlineDraft, matter_date: event.target.value })} /></td>
                  <td><input value={inlineDraft.aipt_ref_no} onChange={(event) => setInlineDraft({ ...inlineDraft, aipt_ref_no: event.target.value })} placeholder="Manual ref" /></td>
                  <td><input value={inlineDraft.client_ref_no} onChange={(event) => setInlineDraft({ ...inlineDraft, client_ref_no: event.target.value })} /></td>
                  <td><Select value={inlineDraft.service_id} items={services} keyName="service" change={(value) => setInlineDraft({ ...inlineDraft, service_id: value, procedure_ids: [], procedure_id: '' })} /></td>
                  <td><ProcedureMultiSelect value={inlineDraft.procedure_ids} items={procedures.filter((item) => item.service_id === inlineDraft.service_id)} onChange={(value) => setInlineDraft({ ...inlineDraft, procedure_ids: value, procedure_id: value[0] ?? '' })} /></td>
                  <td><input value={inlineDraft.project_name} onChange={(event) => setInlineDraft({ ...inlineDraft, project_name: event.target.value })} /></td>
                  <td><input value={inlineDraft.filing_number ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, filing_number: event.target.value || null })} /></td>
                  <td><input value={inlineDraft.register_number ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, register_number: event.target.value || null })} /></td>
                  <td><input type="number" min="1" max="50" value={inlineDraft.class_number ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, class_number: event.target.value ? Number(event.target.value) : null })} /></td>
                  <td><Select value={inlineDraft.country_id} items={countries} keyName="name" change={(value) => setInlineDraft({ ...inlineDraft, country_id: value })} /></td>
                  <td><Select value={inlineDraft.client_id} items={clients} keyName="company_name" change={(value) => setInlineDraft({ ...inlineDraft, client_id: value })} /></td>
                  <td><input value={inlineDraft.applicant} onChange={(event) => setInlineDraft({ ...inlineDraft, applicant: event.target.value })} /></td>
                  <td><input value={inlineDraft.status} readOnly /></td>
                  <td><span className="client-status pending">pending</span></td>
                  <td><input type="date" value={inlineDraft.deadline_date ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, deadline_date: event.target.value || null })} /></td>
                  <td><input type="date" value={inlineDraft.renewal_date ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, renewal_date: event.target.value || null })} /></td>
                  <td><input type="date" value={inlineDraft.filing_date ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, filing_date: event.target.value || null })} /></td>
                  <td><input type="date" value={inlineDraft.registered_date ?? ''} onChange={(event) => setInlineDraft({ ...inlineDraft, registered_date: event.target.value || null })} /></td>
                  {customFields.map((field) => <td key={field.id}><input value={String(inlineDraft.custom_fields[field.id] ?? '')} onChange={(event) => setInlineDraft({ ...inlineDraft, custom_fields: { ...inlineDraft.custom_fields, [field.id]: event.target.value } })} /></td>)}
                  <td><button type="button" onClick={() => void saveInlineRow()} disabled={saving} data-action="update" data-icon-only="true" title="Save"><ActionIcon name="update" /><span className="aipt-action-label">Save</span></button><button type="button" onClick={() => setInlineDraft(null)} disabled={saving} data-action="cancel" data-icon-only="true" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button></td>
                </tr>}
                {visible.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Image path={x.image_path} />
                    </td>
                    <td>{formatDate(x.matter_date)}</td>
                    <td>{x.aipt_ref_no}</td>
                    <td>{x.client_ref_no}</td>
                    <td>{x.service?.service ?? '-'}</td>
                    <td>{x.procedure?.description ?? '-'}</td>
                    <td>
                      <b>{x.project_name}</b>
                    </td>
                    <td>{x.filing_number ?? '-'}</td>
                    <td>{x.register_number ?? '-'}</td>
                    <td>{x.matter_type === 'trademark' ? x.class_number ?? '-' : '-'}</td>
                    <td>{x.country?.name ?? '-'}</td>
                    <td>{x.client?.company_name ?? '-'}</td>
                    <td>{x.applicant || '-'}</td>
                    <td><span className={`client-status ${x.status.toLowerCase().replace(/\s+/g, '-')}`}>{x.status}</span></td>
                    <td><span className={`client-status ${x.approval_status}`}>{x.approval_status}</span></td>
                    <td>{formatDate(x.deadline_date)}</td>
                    <td>{formatDate(x.renewal_date)}</td>
                    <td>{formatDate(x.filing_date)}</td>
                    <td>{formatDate(x.registered_date)}</td>
                    {customFields.map((field) => <td key={field.id}>{x.custom_fields?.find((value) => value.field_definition_id === field.id)?.value ?? '-'}</td>)}
                    <td>
                      <div className="project-action-menu">
                        <button type="button" className="project-action-trigger" aria-label={`Actions for ${x.project_name}`} aria-expanded={openActions === x.id} onClick={() => setOpenActions(openActions === x.id ? null : x.id)}>...</button>
                        {openActions === x.id && <div className="project-action-list">
                          <button type="button" onClick={() => {
                            openTimeline(x);
                            setOpenActions(null);
                          }} data-action="view" data-icon-only="true" title="View Timeline"><ActionIcon name="view" /><span className="aipt-action-label">View Timeline</span></button>
                          {x.approval_status !== 'approved' && <button type="button" onClick={() => void approve(x)} disabled={saving} data-action="approve" data-icon-only="true" title="Approve Project"><ActionIcon name="approve" /><span className="aipt-action-label">Approve Project</span></button>}<button type="button" onClick={() => { open(x); setOpenActions(null); }} data-action="edit" data-icon-only="true" title="Edit Project"><ActionIcon name="edit" /><span className="aipt-action-label">Edit Project</span></button>
                          <button type="button" className="danger" onClick={() => {
                            setChosen(x);
                            setError('');
                            setModal('delete');
                            setOpenActions(null);
                          }} data-action="delete" data-icon-only="true" title="Delete Project"><ActionIcon name="delete" /><span className="aipt-action-label">Delete Project</span></button>
                        </div>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
        </section>
      </div>

      {modal === 'form' && (
        <Modal title={chosen ? 'Update Project' : 'Add New Project'} close={() => setModal(null)}>
          <form onSubmit={save} className="matter-form project-form">
            <p className="project-form-intro">{chosen ? 'Update the project record and keep its filing information current.' : 'Create a project record for an IP application.'}</p>
            <div className="matter-form-grid">
              <Field t="Image (optional)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                />
              </Field>

              <Field t="Date">
                <input
                  type="date"
                  value={draft.matter_date}
                  onChange={(e) => setDraft({ ...draft, matter_date: e.target.value })}
                  required
                />
              </Field>

              <Field t="Service">
                <Select
                  value={draft.service_id}
                  items={services}
                  keyName="service"
                  change={(v) => setDraft({ ...draft, service_id: v, procedure_id: '', procedure_ids: [] })}
                />
              </Field>

              <Field t="Client Ref no.">
                <input
                  value={draft.client_ref_no}
                  onChange={(e) => setDraft({ ...draft, client_ref_no: e.target.value })}
                  required
                />
              </Field>

              <Field t="AIP&T Ref">
                <input
                  value={draft.aipt_ref_no}
                  onChange={(e) => setDraft({ ...draft, aipt_ref_no: e.target.value })}
                  required
                />
              </Field>

              <Field t="Procedure">
                <ProcedureMultiSelect
                  value={draft.procedure_ids}
                  items={serviceProcedures}
                  onChange={(procedureIds) => setDraft({ ...draft, procedure_ids: procedureIds, procedure_id: procedureIds[0] ?? '' })}
                />
              </Field>

              <Field t="Project">
                <input
                  value={draft.project_name}
                  onChange={(e) => setDraft({ ...draft, project_name: e.target.value })}
                  required
                />
              </Field>

              <Field t="Country">
                <Select
                  value={draft.country_id}
                  items={countries}
                  keyName="name"
                  change={(v) => setDraft({ ...draft, country_id: v })}
                />
              </Field>

              <Field t="Client">
                <Select
                  value={draft.client_id}
                  items={clients}
                  keyName="company_name"
                  change={(v) => setDraft({ ...draft, client_id: v })}
                />
              </Field>

              <Field t="Applicant">
                <input value={draft.applicant} onChange={(e) => setDraft({ ...draft, applicant: e.target.value })} required />
              </Field>

              {draft.matter_type === 'trademark' && (
                <Field t="Class (1-50)">
                  <select
                    value={draft.class_number ?? ''}
                    onChange={(e) => setDraft({ ...draft, class_number: Number(e.target.value) || null })}
                    required
                  >
                    <option value="">Select class</option>
                    {Array.from({ length: 50 }, (_, i) => (
                      <option key={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </Field>
              )}

              {draft.matter_type === 'patent' && (
                <>
                  <Field t="Annuity years">
                    <select
                      value={draft.annuity_years ?? ''}
                      onChange={(e) => setDraft({ ...draft, annuity_years: Number(e.target.value) || null })}
                    >
                      <option value="">Select years</option>
                      {Array.from({ length: 50 }, (_, i) => (
                        <option key={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </Field>

                  <Field t="Annuity date">
                    <input
                      type="date"
                      value={draft.annuity_date ?? ''}
                      onChange={(e) => setDraft({ ...draft, annuity_date: e.target.value || null })}
                    />
                  </Field>
                </>
              )}

              <Field t="Filing Number">
                <input
                  value={draft.filing_number ?? ''}
                  onChange={(e) => setDraft({ ...draft, filing_number: e.target.value || null })}
                />
              </Field>

              <Field t="Filing Date">
                <input type="date" value={draft.filing_date ?? ''} onChange={(e) => setDraft({ ...draft, filing_date: e.target.value || null })} />
              </Field>

              <Field t="Acceptance Number">
                <input value={draft.acceptance_number ?? ''} onChange={(e) => setDraft({ ...draft, acceptance_number: e.target.value || null })} />
              </Field>

              <Field t="Acceptance Date">
                <input type="date" value={draft.acceptance_date ?? ''} onChange={(e) => setDraft({ ...draft, acceptance_date: e.target.value || null })} />
              </Field>

              <Field t="Registered Number">
                <input
                  value={draft.register_number ?? ''}
                  onChange={(e) => setDraft({ ...draft, register_number: e.target.value || null })}
                />
              </Field>

              <Field t="Registration Date">
                <input type="date" value={draft.registered_date ?? ''} onChange={(e) => setDraft({ ...draft, registered_date: e.target.value || null })} />
              </Field>

              <Field t="Deadline">
                <input type="date" value={draft.deadline_date ?? ''} onChange={(e) => setDraft({ ...draft, deadline_date: e.target.value || null })} required />
              </Field>

              <Field t="Renewal Date">
                <input type="date" value={draft.renewal_date ?? ''} onChange={(e) => setDraft({ ...draft, renewal_date: e.target.value || null })} />
              </Field>

              <Field t="Opposition Date">
                <input type="date" value={draft.opposition_date ?? ''} onChange={(e) => setDraft({ ...draft, opposition_date: e.target.value || null })} />
              </Field>

              {customFields.map((field) => <Field key={field.id} t={field.label}>
                {field.field_type === 'boolean' ? <input type="checkbox" checked={draft.custom_fields[field.id] === true} onChange={(event) => setDraft({ ...draft, custom_fields: { ...draft.custom_fields, [field.id]: event.target.checked } })} /> : <input type={field.field_type === 'number' ? 'number' : field.field_type} value={String(draft.custom_fields[field.id] ?? '')} onChange={(event) => setDraft({ ...draft, custom_fields: { ...draft.custom_fields, [field.id]: field.field_type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value } })} required={field.required} />}
              </Field>)}
            </div>

            {error && <p className="modal-error">{error}</p>}

            <footer className="client-modal-footer"><button type="button" className="secondary" onClick={() => setModal(null)} disabled={saving} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={saving} data-action={chosen ? "update" : "add"} title="Update Project"><ActionIcon name="update" /><span className="aipt-action-label">{saving ? 'Saving...' : chosen ? 'Update Project' : 'Save Project'}</span></button></footer>
          </form>
        </Modal>
      )}

      {modal === 'timeline' && chosen && timelineDraft && <TimelineModal
        project={chosen}
        procedures={procedures}
        entries={timelineEntries}
        loading={timelineLoading}
        error={timelineError}
        formError={timelineFormError}
        draft={timelineDraft}
        files={timelineFiles}
        editing={editingTimeline}
        pending={saving}
        documentId={timelineDocumentId}
        onDraftChange={setTimelineDraft}
        onFilesAdd={addTimelineFiles}
        onFileRemove={(index) => setTimelineFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
        onClose={() => { if (!saving) setModal(null); }}
        onSave={addTimeline}
        onEdit={editTimeline}
        onCancelEdit={() => { setEditingTimeline(null); setTimelineDraft({ procedure_id: chosen.procedure_id, timeline_date: new Date().toISOString().slice(0, 10), description: '' }); }}
        onDelete={(entry) => setDeletingTimeline(entry)}
        onViewDocument={(entry, document) => void openTimelineDocument(entry, document, 'inline')}
        onDownloadDocument={(entry, document) => void openTimelineDocument(entry, document, 'attachment')}
      />}

      {deletingTimeline && <Modal title="Delete Timeline Entry" close={() => { if (!saving) setDeletingTimeline(null); }}><section className="delete-client"><span className="warning-icon">!</span><h2>Delete Timeline Entry</h2><p>This entry and its attached documents will be removed from the project timeline.</p><div className="delete-client-summary"><span>TL</span><div><b>{deletingTimeline.procedure?.description ?? 'Timeline entry'}</b><small>{formatDate(deletingTimeline.timeline_date)}</small></div></div><footer className="client-modal-footer"><button type="button" className="secondary" onClick={() => setDeletingTimeline(null)} disabled={saving} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button type="button" className="danger-primary" onClick={() => void removeTimeline()} disabled={saving} data-action="delete" title="Delete Timeline Entry"><ActionIcon name="delete" /><span className="aipt-action-label">{saving ? 'Deleting...' : 'Delete Timeline Entry'}</span></button></footer></section></Modal>}

      {modal === 'delete' && chosen && (
        <Modal title="Delete Project" close={() => setModal(null)}>
          <p>
            Move <b>{chosen.project_name}</b> to Restore Point?
          </p>
          {error && <p className="modal-error">{error}</p>}
          <button className="danger-primary" onClick={remove} disabled={saving} data-action="delete" title="Delete Project"><ActionIcon name="delete" /><span className="aipt-action-label">Delete Project</span></button>
        </Modal>
      )}

      {importPreview && <Modal title="Review project import" close={() => { if (!transferBusy) setImportPreview(null); }}><p>{importPreview.length} new projects will be created for administrator approval. First 8 rows shown.</p>{error && <p role="alert">{error}</p>}<div className="country-table-wrap"><table><thead><tr><th>Reference</th><th>Project</th><th>Applicant</th></tr></thead><tbody>{importPreview.slice(0,8).map((item,index) => <tr key={index}><td>{String(item.aipt_ref_no)}</td><td>{String(item.project_name)}</td><td>{String(item.applicant)}</td></tr>)}</tbody></table></div><div className="data-actions"><button type="button" disabled={transferBusy} onClick={() => setImportPreview(null)}>Cancel</button><button type="button" disabled={transferBusy} onClick={() => void confirmImport()}>{transferBusy ? 'Importing…' : 'Confirm import'}</button></div></Modal>}
    </main>
  );
}

function TimelineModal({ project, procedures, entries, loading, error, formError, draft, files, editing, pending, documentId, onDraftChange, onFilesAdd, onFileRemove, onClose, onSave, onEdit, onCancelEdit, onDelete, onViewDocument, onDownloadDocument }: {
  project: Project;
  procedures: Lookup[];
  entries: TimelineEntry[];
  loading: boolean;
  error: string;
  formError: string;
  draft: TimelineDraft;
  files: File[];
  editing: TimelineEntry | null;
  pending: boolean;
  documentId: string | null;
  onDraftChange: (draft: TimelineDraft) => void;
  onFilesAdd: (files: FileList | File[]) => void;
  onFileRemove: (index: number) => void;
  onClose: () => void;
  onSave: (event: FormEvent) => void;
  onEdit: (entry: TimelineEntry) => void;
  onCancelEdit: () => void;
  onDelete: (entry: TimelineEntry) => void;
  onViewDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const projectProcedures = procedures.filter((procedure) => procedure.service_id === project.service_id);
  return <div className="client-modal-backdrop modal-layer-top"><section className="client-modal timeline-modal"><div className="timeline-content">
    <header className="client-modal-heading timeline-heading"><div><span className="modal-kicker">PROJECT APPLICATION</span><h2>{editing ? 'Edit Timeline Entry' : 'Add Timeline'}</h2><p>Track procedure milestones and retain supporting documents for this project.</p></div><button type="button" className="modal-close" onClick={onClose} disabled={pending} aria-label="Close">x</button></header>
    <section className="timeline-project-information"><h3>Project Information</h3><div className="timeline-project-grid"><TimelineInfo label="Project" value={project.project_name} /><TimelineInfo label="Service" value={project.service?.service ?? project.matter_type} /><TimelineInfo label="Client" value={project.client?.company_name ?? '-'} /><TimelineInfo label="Country" value={project.country?.name ?? '-'} /><TimelineInfo label="Procedure ID" value={project.procedure?.description ?? '-'} /><TimelineInfo label="Filing Number" value={project.filing_number ?? '-'} /><TimelineInfo label="Registered Number" value={project.register_number ?? '-'} /><TimelineInfo label="Status" value={<span className={`client-status ${project.status.toLowerCase().replace(/\s+/g, '-')}`}>{project.status}</span>} /><TimelineInfo label="Filing Date" value={formatDate(project.filing_date)} /><TimelineInfo label="Deadline" value={formatDate(project.renewal_date)} /></div></section>
    <form className="timeline-entry-form" onSubmit={onSave}><div className="timeline-section-heading"><h3>{editing ? 'Update Timeline Entry' : 'Add Timeline Entry'}</h3>{editing && <button type="button" className="text-action" onClick={onCancelEdit} data-action="cancel" title="Cancel edit"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel edit</span></button>}</div><div className="timeline-form-grid"><Field t="Procedure"><select value={draft.procedure_id} onChange={(event) => onDraftChange({ ...draft, procedure_id: event.target.value })} required><option value="">Select procedure</option>{projectProcedures.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.description}</option>)}</select></Field><Field t="Timeline Date"><input type="date" value={draft.timeline_date} onChange={(event) => onDraftChange({ ...draft, timeline_date: event.target.value })} required /></Field><label className="timeline-description"><span>Description <em>*</em></span><textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} maxLength={5000} placeholder="Enter procedure update, outcome, or next action..." required /></label></div>
      <TimelineUpload files={files} input={input} pending={pending} onFilesAdd={onFilesAdd} onFileRemove={onFileRemove} />{formError && <p className="modal-error" role="alert">{formError}</p>}<footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={pending} data-action={editing ? "update" : "add"} title="Update Timeline"><ActionIcon name="update" /><span className="aipt-action-label">{pending ? 'Saving...' : editing ? 'Update Timeline' : 'Save Timeline'}</span></button></footer>
    </form>
    <section className="timeline-history"><div className="timeline-section-heading"><h3>Timeline History</h3><span>{entries.length} record{entries.length === 1 ? '' : 's'}</span></div>{error && <p className="modal-error" role="alert">{error}</p>}{loading ? <p className="timeline-history-state">Loading timeline history...</p> : entries.length ? entries.map((entry) => <article className="timeline-history-item" key={entry.id}><span className="timeline-dot" /><header><div><h4>{entry.procedure?.description ?? 'Procedure'}</h4><p>{formatDate(entry.timeline_date)} <i>Â·</i> Recorded by Administrator</p></div><div className="timeline-entry-actions"><button type="button" onClick={() => onEdit(entry)} disabled={pending} data-action="edit" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button type="button" className="danger" onClick={() => onDelete(entry)} disabled={pending} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></header><p className="timeline-entry-description">{entry.description}</p>{entry.documents.length > 0 && <div className="timeline-document-list">{entry.documents.map((document) => <div className="timeline-document-row" key={document.id}><span className="timeline-document-icon">{document.document_name.split('.').pop()?.toUpperCase().slice(0, 4) || 'DOC'}</span><span><b>{document.document_name}</b><small>{formatFileSize(document.document_size)} Â· {formatDate(document.created_at.slice(0, 10))}</small></span><div className="timeline-document-actions"><button type="button" onClick={() => onViewDocument(entry, document)} disabled={documentId === document.id} data-action="view" title="View"><ActionIcon name="view" /><span className="aipt-action-label">{documentId === document.id ? 'Opening...' : 'View'}</span></button><button type="button" onClick={() => onDownloadDocument(entry, document)} disabled={documentId === document.id} data-action="download" title="Download"><ActionIcon name="download" /><span className="aipt-action-label">Download</span></button></div></div>)}</div>}</article>) : <p className="timeline-history-state">No timeline entries yet. Add the first procedure update above.</p>}</section>
  </div></section></div>;
}

function TimelineUpload({ files, input, pending, onFilesAdd, onFileRemove }: { files: File[]; input: React.RefObject<HTMLInputElement>; pending: boolean; onFilesAdd: (files: FileList | File[]) => void; onFileRemove: (index: number) => void }) {
  return <section className="timeline-documents"><span>Documents <small>Multiple files Â· uploaded to Amazon S3 when saved</small></span><input ref={input} className="timeline-file-input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onChange={(event) => { if (event.target.files) onFilesAdd(event.target.files); event.target.value = ''; }} /><div className="timeline-dropzone" role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter') input.current?.click(); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFilesAdd(event.dataTransfer.files); }}><span className="timeline-upload-symbol">â†‘</span><span><b>Click to upload</b> or drag and drop<small>PDF, PNG, JPG, DOC, DOCX, XLS, XLSX Â· max 10MB each</small></span><button type="button" onClick={(event) => { event.stopPropagation(); input.current?.click(); }}>Browse</button></div>{files.length > 0 && <div className="timeline-file-list">{files.map((file, index) => <div className="timeline-file-item" key={`${file.name}-${file.lastModified}-${index}`}><span><b>{file.name}</b><small>{formatFileSize(file.size)}</small></span><button type="button" onClick={() => onFileRemove(index)} disabled={pending} data-action="delete" title="Remove"><ActionIcon name="delete" /><span className="aipt-action-label">Remove</span></button></div>)}</div>}</section>;
}

function TimelineInfo({ label, value }: { label: string; value: ReactNode }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function Image({ path }: { path: string | null }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const s = getSupabaseBrowserClient();
    if (path && s) {
      void s.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        try {
          const response = await fetchSupabaseFunction(`projects/image-url?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (!response.ok) return;
          const body = await response.json().catch(() => ({})) as { url?: string };
          if (body.url) setUrl(body.url);
        } catch {
          // A failed thumbnail must not interrupt the Projects page.
        }
      });
    }
  }, [path]);

  return url ? <img className="project-image" src={url} alt="" loading="lazy" decoding="async" /> : <span className="project-image-placeholder">Upload</span>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="client-modal-backdrop">
      <section className="client-modal matter-editor-modal">
        <header className="client-modal-heading">
          <h2>{title}</h2>
          <button className="modal-close" onClick={close}>
            Ã—
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label className="matter-field">
      <span>{t}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  items,
  keyName,
  change,
}: {
  value: string;
  items: Lookup[];
  keyName: keyof Lookup;
  change: (x: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.find((item) => item.id === value) ?? null;
  const label = selected ? String(selected[keyName] ?? '') : '';
  const matches = items.filter((item) => String(item[keyName] ?? '').toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <div className="project-search-select" ref={ref}>
    <button type="button" className={`project-search-trigger${open ? ' is-open' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <span className={label ? '' : 'is-placeholder'}>{label || 'Select and search'}</span><b>v</b>
    </button>
    {open && <div className="project-search-menu">
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options..." />
      <div className="project-search-results">
        {matches.length ? matches.map((item) => <button type="button" key={item.id} className={item.id === value ? 'is-selected' : ''} onClick={() => { change(item.id); setOpen(false); setQuery(''); }}><span>{String(item[keyName] ?? '')}</span>{item.id === value && <b>âœ“</b>}</button>) : <p>No matching options</p>}
      </div>
    </div>}
  </div>;
}

function ProcedureMultiSelect({ value, items, onChange }: { value: string[]; items: Lookup[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.filter((item) => value.includes(item.id));
  const matches = items.filter((item) => String(item.description ?? '').toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return <div className="project-search-select project-multi-select" ref={ref}>
    <button type="button" className={`project-search-trigger${open ? ' is-open' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <span className={selected.length ? 'project-selection-tags' : 'is-placeholder'}>{selected.length ? selected.map((item) => <span className="project-selection-tag" key={item.id}>{item.description}<b onClick={(event) => { event.stopPropagation(); toggle(item.id); }}>x</b></span>) : 'Select procedures'}</span><b>v</b>
    </button>
    {open && <div className="project-search-menu"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search procedures..." /><div className="project-search-results">{matches.length ? matches.map((item) => <button type="button" key={item.id} className={value.includes(item.id) ? 'is-selected' : ''} onClick={() => toggle(item.id)}><span>{item.description}</span><b>{value.includes(item.id) ? 'âœ“' : 'ï¼‹'}</b></button>) : <p>No matching procedures</p>}</div></div>}
  </div>;
}



