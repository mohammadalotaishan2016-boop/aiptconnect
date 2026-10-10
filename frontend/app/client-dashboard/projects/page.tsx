'use client';
import ClientManagement from '../../../src/components/ClientManagement';
import dynamic from 'next/dynamic';
const ProjectsPage = dynamic(() => import('../../projects/page'), { loading: () => <p>Loading management form...</p> });
import TablePagination from '../../../src/components/TablePagination';
import ActionIcon from '../../../src/components/ActionIcon';


import { Fragment, useCallback, useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

type Project = {
  id: string; aipt_ref_no: string; client_ref_no: string; project_name: string; matter_type: string; matter_date: string | null;
  status: string; filing_number: string | null; register_number: string | null; class_number: number | null; applicant: string | null;
  filing_date: string | null; registered_date: string | null; renewal_date: string | null; image_path: string | null;
  country?: { name: string; abbreviation?: string }; service?: { service: string; color?: string };
  procedure?: { description: string } | null;
};
type TimelineDocument = { id: string; document_name: string; document_size: number; document_type: string; created_at: string };
type TimelineEntry = { id: string; timeline_date: string; description: string; procedure?: { description: string; color_indication?: string } | null; documents: TimelineDocument[] };
type ProjectResponse = { data: Project[]; total: number; page: number; page_size: number };

const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Not set';
const statusClass = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const colorClass = (value?: string) => ['purple','blue','green','orange','red','teal','yellow','gray','pink','indigo'].includes(value ?? '') ? value : 'purple';

async function authenticatedRequest<T>(path: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('Supabase is not configured.');
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw Error('Please sign in.');
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to load project data.');
  return body as T;
}

function ProjectImage({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    if (!path) return;
    void authenticatedRequest<{ url?: string }>(`projects/image-url?path=${encodeURIComponent(path)}`).then((body) => { if (active && body.url) setUrl(body.url); }).catch(() => undefined);
    return () => { active = false; };
  }, [path]);
  return url ? <img className='client-project-image' src={url} alt={`${name} project`}/> : <span className='client-project-image-placeholder'>{name.slice(0, 2).toUpperCase()}</span>;
}

function ClientProjectsPage() {
  const [pageSize,setPageSize]=useState(10);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timelineProject, setTimelineProject] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineError, setTimelineError] = useState('');
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const loadProjects = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (type !== 'all') params.set('matter_type', type);
      const body = await authenticatedRequest<ProjectResponse>(`projects?${params}`);
      setProjects(body.data); setTotal(body.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load projects.'); }
    finally { setLoading(false); }
  }, [page, pageSize, debouncedSearch, type]);
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel('client-project-refresh').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void loadProjects()).subscribe();
    window.addEventListener('focus', loadProjects);
    return () => { window.removeEventListener('focus', loadProjects); void supabase.removeChannel(channel); };
  }, [loadProjects]);

  const openTimeline = async (projectId: string) => {
    if (timelineProject === projectId) { setTimelineProject(null); return; }
    setTimelineProject(projectId); setTimelineEntries([]); setTimelineError(''); setLoadingTimeline(true);
    try { setTimelineEntries(await authenticatedRequest<TimelineEntry[]>(`timelines?project_id=${encodeURIComponent(projectId)}`)); }
    catch (cause) { setTimelineError(cause instanceof Error ? cause.message : 'Unable to load timeline.'); }
    finally { setLoadingTimeline(false); }
  };
  const downloadDocument = async (entry: TimelineEntry, document: TimelineDocument) => {
    setDocumentId(document.id);
    try { const body = await authenticatedRequest<{ url: string }>(`timelines/${entry.id}/documents/${document.id}/download-url?disposition=attachment`); window.open(body.url, '_blank', 'noopener,noreferrer'); }
    catch (cause) { setTimelineError(cause instanceof Error ? cause.message : 'Unable to download document.'); }
    finally { setDocumentId(null); }
  };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total ? (page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(page * pageSize, total);

  return <section className='client-page client-projects-page'>
    <style jsx global>{`
      .client-projects-page{--project-teal:#25a9c2;--project-deep:#00a9c5;--project-line:#a6eafa;--project-ink:#00a6c9;background:#fff;border:0;min-height:calc(100vh - 118px);padding:12px 20px 24px;color:#00a6c9;font:12px Arial,Helvetica,sans-serif}
      .client-projects-page .client-projects-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 8px;padding:5px 8px;background:#25a9c2;color:#fff;min-height:30px;border-radius:4px}
      .client-projects-page .client-projects-hero h1{font-size:18px;line-height:1.2;margin:0;font-weight:800;text-transform:uppercase}.client-projects-page .client-projects-hero p{display:none}
      .client-projects-page .client-project-summary{display:flex;gap:8px}.client-projects-page .client-project-summary>span{display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.55);border-radius:6px;padding:5px 9px}.client-projects-page .client-project-summary small{font-size:11px;color:#e8fcff}.client-projects-page .client-project-summary b{font-size:13px;color:#fff}
      .client-projects-page .client-project-toolbar{display:flex;align-items:center;gap:9px;padding:7px 9px;background:#fbfeff;border:1px solid var(--project-line);border-radius:6px;margin-bottom:8px}.client-projects-page .client-project-toolbar label{display:flex;align-items:center;gap:8px;flex:1;min-width:220px;max-width:520px;height:30px;background:#fff;border:1px solid #86def5;border-radius:6px;padding:0 10px}.client-projects-page .client-project-toolbar svg{width:15px;height:15px;fill:none;stroke:#00a9c5;stroke-width:2;flex:none}.client-projects-page .client-project-toolbar input{width:100%;border:0;outline:0;background:transparent;color:#168eb0;font-size:11px}.client-projects-page .client-project-toolbar select{height:30px;min-width:170px;border:1px solid #86def5;border-radius:6px;background:#fff;padding:0 10px;color:#168eb0;font-size:11px}
      .client-projects-page .client-project-card{border:1px solid var(--project-line);border-radius:6px;background:#fff;padding:6px}.client-projects-page .client-project-card>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-6px -6px 6px;padding:5px 8px;background:#25a9c2;border-bottom:1px solid var(--project-line)}.client-projects-page .client-project-card>header h2{font-size:12px;margin:0;color:#fff}.client-projects-page .client-project-card>header p{display:none}.client-projects-page .client-project-card>header>span{font-size:10px;color:#fff}
      .client-projects-page .client-project-table-wrap{overflow:auto;border:1px solid #b0eafa;border-radius:5px;background:#fff}.client-projects-page .client-project-table{width:100%;min-width:1000px;border-collapse:collapse;font-size:8px;color:#00a6c9}.client-projects-page .client-project-table th{padding:5px 8px;text-align:left;background:#25a9c2;border:1px solid #bdeefa;color:#fff;font-size:9px;font-weight:700;white-space:nowrap}.client-projects-page .client-project-table td{padding:3px 6px;border:1px solid #c4eff9;vertical-align:middle}.client-projects-page .client-project-table tbody tr:last-child td{border-bottom:0}.client-projects-page .client-project-table td small,.client-projects-page .client-project-table td .project-date{display:block;margin-top:3px;color:#287f98;font-size:8px}.client-projects-page .project-identity{min-width:155px}.client-projects-page .project-identity strong{color:#008eac}.client-projects-page .client-project-state{height:68px;text-align:center;vertical-align:middle!important;color:#599caf}.client-projects-page .client-project-table .timeline-detail-row>td{background:#f5fdfe;padding:12px}.client-projects-page .professional-timeline{border-color:var(--project-line)}.client-projects-page .timeline-toggle{color:#fff;background:#00a9c5;border-color:#00a9c5;border-radius:5px}.client-projects-page .timeline-toggle:hover{background:#078ca0}.client-projects-page .client-project-table .status-tag{white-space:nowrap}
      @media(max-width:640px){.client-projects-page{padding:8px;min-height:calc(100vh - 90px)}.client-projects-page .client-projects-hero{align-items:flex-start;padding:10px}.client-projects-page .client-project-summary{flex-direction:column;gap:4px}.client-projects-page .client-project-toolbar{align-items:stretch;flex-direction:column;padding:9px}.client-projects-page .client-project-toolbar label{max-width:none;min-width:0}.client-projects-page .client-project-toolbar select{width:100%}.client-projects-page .client-project-card{padding:7px}.client-projects-page .client-project-card>header{margin:-7px -7px 7px;padding:9px}}
    `}</style>
    <div className='client-projects-hero'><div><h1>YOUR WORK · PROJECTS</h1></div><div className='client-project-summary'><span><small>Total projects</small><b>{total}</b></span><span><small>Showing</small><b>{firstResult}–{lastResult}</b></span></div></div>
    {error && <p className='client-error'>{error}</p>}
    <div className='client-project-toolbar'><label><svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search by project, reference, filing number, or applicant...'/></label><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value='all'>All project types</option>{['trademark','patent','design','copyright','other'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div>
    <section className='client-project-card'><header><div><h2>Project portfolio</h2><p>Client-scoped applications and live procedure history</p></div><span>{total} {total === 1 ? 'project' : 'projects'}</span></header>
      <div className='client-project-table-wrap'><table className='client-project-table'><thead><tr><th>Project</th><th>References & numbers</th><th>Type & procedure</th><th>Country</th><th>Status</th><th>Project dates</th><th>Timeline</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className='client-project-state'>Loading your projects...</td></tr> : projects.length ? projects.map((project) => <Fragment key={project.id}><tr className={timelineProject === project.id ? 'is-expanded' : ''}><td><div className='project-identity'><ProjectImage path={project.image_path} name={project.project_name}/><span><strong>{project.project_name}</strong><small>{project.applicant || 'Applicant not set'}</small></span></div></td><td><b>{project.client_ref_no || 'No client reference'}</b><small>AIP&amp;T reference: {project.aipt_ref_no || 'Not set'}</small><small>Filing no.: {project.filing_number || 'Not set'}</small><small>Register no.: {project.register_number || 'Not set'}</small></td><td><span className='project-type-badge'>{project.matter_type || 'Not set'}</span><small>{project.procedure?.description || project.service?.service || 'Procedure not assigned'}</small><small>Class: {project.class_number ?? 'Not set'}</small></td><td><b>{project.country?.name || 'Not set'}</b><small>{project.country?.abbreviation || ''}</small></td><td><span className={`status-tag ${statusClass(project.status)}`}>{project.status || 'Not set'}</span></td><td><span className='project-date'><small>Matter date · {date(project.matter_date)}</small></span><span className='project-date'><small>Filing date · {date(project.filing_date)}</small></span><span className='project-date'><small>Registered · {date(project.registered_date)}</small></span><span className='project-date'><small>Renewal · {date(project.renewal_date)}</small></span></td><td><button type='button' className={`timeline-toggle${timelineProject === project.id ? ' active' : ''}`} onClick={() => void openTimeline(project.id)} data-action="view" data-icon-only="true" title="View timeline"><ActionIcon name="view" /><span className="aipt-action-label"><span>{timelineProject === project.id ? 'Hide timeline' : 'View timeline'}</span><i>⌄</i></span></button></td></tr>
          {timelineProject === project.id && <tr className='timeline-detail-row'><td colSpan={7}><div className='professional-timeline'><header><div><h3>Application timeline</h3><p>{project.project_name} · {project.aipt_ref_no}</p></div><span>{timelineEntries.length} milestones</span></header>{loadingTimeline ? <p className='timeline-state'>Loading timeline...</p> : timelineError ? <p className='timeline-state error'>{timelineError}</p> : timelineEntries.length ? <div className='timeline-track'>{timelineEntries.map((entry, index) => <article className={`timeline-milestone ${colorClass(entry.procedure?.color_indication)}`} key={entry.id}><div className='timeline-marker'><span>{index + 1}</span></div><div className='timeline-content'><header><div><strong>{entry.procedure?.description || 'Procedure update'}</strong><time>{date(entry.timeline_date)}</time></div><span className={`timeline-color-label ${colorClass(entry.procedure?.color_indication)}`}>{entry.procedure?.color_indication || 'Milestone'}</span></header><p>{entry.description}</p>{entry.documents.length > 0 && <div className='timeline-documents'>{entry.documents.map((document) => <button type='button' key={document.id} onClick={() => void downloadDocument(entry, document)} disabled={documentId === document.id}><span>↓</span><b>{documentId === document.id ? 'Opening...' : document.document_name}</b><small>{Math.ceil(document.document_size / 1024)} KB</small></button>)}</div>}</div></article>)}</div> : <p className='timeline-state'>No timeline entries have been published for this project.</p>}</div></td></tr>}
        </Fragment>) : <tr><td colSpan={7} className='client-project-state'>No projects match your search and filters.</td></tr>}
      </tbody></table></div>
      <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </section>
  </section>;
}

export default function ManagedPage() { return <ClientManagement manager={<ProjectsPage />}><ClientProjectsPage /></ClientManagement>; }
