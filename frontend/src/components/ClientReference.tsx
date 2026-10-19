'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import ClientDashboardIcon from './ClientDashboardIcon';
import TablePagination from './TablePagination';

export type ReferenceCountry = { id?: string; name: string; abbreviation?: string; flag_url?: string };
const referenceCache = new Map<string, { value: unknown; expires: number }>();
export function invalidateClientReferenceCache(pathPrefix: string) {
  for (const key of referenceCache.keys()) if (key.startsWith(pathPrefix)) referenceCache.delete(key);
}
export async function clientReferenceRequest<T>(path: string): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) throw Error('Please sign in.');
  const cacheKey = `${session.user.id}:${path}`;
  const cached = referenceCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'Unable to load client data.');
  referenceCache.set(cacheKey, { value: body, expires: Date.now() + 60_000 });
  return body as T;
}

async function listClientNotifications() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('Supabase is not configured.');
  const rows: Array<Record<string, any>> = [];
  const pageSize = 1000;
  const fields = 'id,notification_date,description,document_name,document_size,document_type,created_at,updated_at,countries:notification_countries(country:countries(id,name,abbreviation,flag_url))';
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('notifications')
      .select(fields)
      .is('deleted_at', null)
      .order('notification_date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<Record<string, any>>;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(item => ({ ...item, aws_metadata: null }));
}

export function useClientReferenceData<T>(path: string) {
  const pending = useRef<{ path: string; promise: Promise<T> } | null>(null);
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (!pending.current || pending.current.path !== path) pending.current = {
      path,
      promise: (path === 'notifications' ? listClientNotifications() : clientReferenceRequest<T>(path)) as Promise<T>,
    };
    pending.current.promise.then(value => { if (active) setData(value); }).catch(cause => {
      pending.current = null;
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load client data.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, attempt]);
  return { data, error, loading, retry: () => { pending.current = null; setAttempt(value => value + 1); } };
}
export function ReferenceTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon: 'requirements' | 'notifications' }) {
  return <div className="reference-title"><h1><ClientDashboardIcon name={icon} />{title}</h1>{subtitle && <p>{subtitle}</p>}</div>;
}
export function ReferenceCountryBadge({ country }: { country: ReferenceCountry }) {
  const [failed, setFailed] = useState(false);
  const flag = /^https?:\/\//i.test(country.flag_url || '') ? country.flag_url : '';
  return <span className="reference-country">{flag && !failed ? <img src={flag} alt="" onError={() => setFailed(true)} /> : country.abbreviation && <span className="reference-country-code" aria-hidden="true">{country.abbreviation}</span>}<span>{country.name}</span></span>;
}
export function ReferenceSearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg>; }
export function ReferencePagination({ page, total, onChange, pageSize = 10, onPageSizeChange = () => {}, allowAll = false, loading = false }: { page: number; total: number; onChange: (page: number) => void; pageSize?: number; onPageSizeChange?: (size: number) => void; allowAll?: boolean; loading?: boolean }) {
  return <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={onChange} onPageSizeChange={onPageSizeChange} allowAll={allowAll} loading={loading} />;
}
