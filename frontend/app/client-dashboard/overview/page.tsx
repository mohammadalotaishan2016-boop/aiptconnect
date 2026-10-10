'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

type Project = { id: string; aipt_ref_no: string; project_name: string; matter_type: string; status: string; filing_date: string | null; renewal_date: string | null; service?: { service: string } };
type Notification = { id: string; description: string; notification_date: string; document_name: string | null };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '-';
const statusClass = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

async function request<T>(path: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('Supabase is not configured.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw Error('Please sign in to view your dashboard.');
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to load your client data.');
  return body as T;
}

async function loadAllProjects() {
  const projects: Project[] = [];
  let page = 1;
  let total = 0;
  do {
    const response = await request<{ data: Project[]; total: number }>('projects?page=' + page + '&page_size=100');
    projects.push(...response.data);
    total = response.total;
    page += 1;
  } while (projects.length < total);
  return projects;
}

export default function ClientDashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  const refresh = () => { void Promise.allSettled([loadAllProjects(), request<Notification[]>('notifications')]).then(([projectResult, notificationResult]) => { const errors: string[] = []; if (projectResult.status === 'fulfilled') setProjects(projectResult.value); else errors.push(projectResult.reason instanceof Error ? projectResult.reason.message : 'Unable to load your projects.'); if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value); else errors.push(notificationResult.reason instanceof Error ? notificationResult.reason.message : 'Unable to load notifications.'); setError(errors.join(' ')); }); };
  useEffect(() => {
    refresh();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel('client-dashboard-project-refresh').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, refresh).subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('focus', onFocus); void supabase.removeChannel(channel); };
  }, []);
  const inProgress = projects.filter((project) => ['filed', 'accepted', 'opposition'].includes(project.status.toLowerCase())).length;
  const completed = projects.filter((project) => ['registered', 'completed'].includes(project.status.toLowerCase())).length;
  const pending = projects.filter((project) => ['pending', 'renewal due', 'opposition'].includes(project.status.toLowerCase())).length;
  return <section className="client-page"><div className="client-heading"><div><p className="client-kicker">PORTFOLIO INTELLIGENCE</p><h1>Overview</h1><p>Live client-application activity for your portfolio.</p></div><div className="client-heading-actions"><span><small>Reporting day</small><b>{new Intl.DateTimeFormat('en-US').format(new Date())}</b></span><button className="client-secondary" type="button" onClick={() => window.location.reload()} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button><Link className="client-primary" href="/client-dashboard/projects">View Projects</Link></div></div>
    {error && <p className="client-error">{error}</p>}
    <div className="client-metrics">
      <article><span className="metric-icon violet">▣</span>
       <div><small>Total Projects</small><strong>{projects.length}</strong><p>Active projects</p></div>
        </article><article>
          <span className="metric-icon blue">◷</span>
            <div><small>In Progress</small><strong>{inProgress}</strong><p>Projects in progress</p></div>
              </article><article><span className="metric-icon green">✓</span><div><small>Completed</small><strong>{completed}</strong><p>Projects completed</p></div></article><article><span className="metric-icon orange">!</span><div><small>Pending Action</small><strong>{pending}</strong><p>Requires your attention</p></div></article></div>
    <div className="client-panel"><div className="panel-title"><h2>My Projects</h2><Link href="/client-dashboard/projects">View All</Link></div><div className="client-table-wrap"><table className="client-table"><thead><tr><th>Project ID</th><th>Project Name</th><th>Type</th><th>Status</th><th>Filing Date</th><th>Next Action</th></tr></thead><tbody>{projects.slice(0, 5).map((project) => <tr key={project.id}><td>{project.aipt_ref_no}</td><td><strong>{project.project_name}</strong><small>{project.service?.service || project.matter_type}</small></td><td><span className="type-tag">{project.matter_type}</span></td><td><span className={`status-tag ${statusClass(project.status)}`}>{project.status}</span></td><td>{date(project.filing_date)}</td><td>{project.renewal_date ? `Renewal due ${date(project.renewal_date)}` : 'Review project'}</td></tr>)}</tbody></table>{!projects.length && <p className="client-empty">No projects are linked to this account yet.</p>}</div></div>
    <div className="client-lower"><div className="client-panel"><div className="panel-title"><h2>Recent Notifications</h2><Link href="/client-dashboard/notifications">View All</Link></div>{notifications.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span>▧</span><div><strong>{item.description}</strong><small>{date(item.notification_date)}{item.document_name ? ` · ${item.document_name}` : ''}</small></div><Link href="/client-dashboard/notifications">View</Link></div>)}</div><div className="client-panel quick-actions"><div className="panel-title"><h2>Quick Actions</h2></div><Link href="/client-dashboard/projects"><b>▣</b><span><strong>View my projects</strong><small>Track your application portfolio</small></span><i>›</i></Link><Link href="/client-dashboard/notifications"><b>♧</b><span><strong>View notifications</strong><small>Review updates and documents</small></span><i>›</i></Link></div></div>
  </section>;
}
