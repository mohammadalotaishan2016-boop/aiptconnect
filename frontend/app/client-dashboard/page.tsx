'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ClientDashboardSupportChat from '../../src/components/ClientDashboardSupportChat';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';
const destinations: { key: string; label: string; href: string }[] = [
  { key: 'schedule-of-fees', label: 'Schedule of Fees', href: '/client-dashboard/schedule-of-fees' },
  { key: 'quotations', label: 'Quotations', href: '/client-dashboard/quotations' },
  { key: 'requirements', label: 'Requirements', href: '/client-dashboard/requirements' },
  { key: 'statements', label: 'Statements', href: '/client-dashboard/statements' },
  { key: 'poa', label: 'POA', href: '/client-dashboard/poa' },
  { key: 'projects', label: 'Project', href: '/client-dashboard/projects' },
  { key: 'notifications', label: 'Notification', href: '/client-dashboard/notifications' },
  { key: 'customer-service', label: 'Customer Service', href: '/client-dashboard/customer-service' },
];
const displayLabels: Record<string, string> = {
  quotations: 'Quotations',
  'schedule-of-fees': 'Schedule of Fees',
  requirements: 'Requirements',
  statements: 'Statements',
  poa: 'Power of Attorney',
  projects: 'Your Projects',
  notifications: 'Notifications',
  'customer-service': 'Customer Service',
};
type TutorialLink = { card_key: string; title: string; url: string };
type UpdateItem = Record<string, unknown>;
type CardUpdate = { count: number; failed: boolean };
const cardUpdateSources: Array<{ key: string; path: string; pagePath?: (page: number) => string; getItems: (body: unknown) => UpdateItem[]; dateFields: string[] }> = [
  { key: 'schedule-of-fees', path: 'schedule-of-fees', getItems: body => readDataArray(body), dateFields: ['last_modified'] },
  { key: 'quotations', path: 'quotations?page=1&page_size=100&sort=created_at', pagePath: page => `quotations?page=${page}&page_size=100&sort=created_at`, getItems: body => readDataArray(body), dateFields: ['created_at', 'updated_at'] },
  { key: 'requirements', path: 'requirements?page=1&page_size=100', pagePath: page => `requirements?page=${page}&page_size=100`, getItems: body => readDataArray(body), dateFields: ['created_at', 'updated_at'] },
  { key: 'statements', path: 'statements', getItems: body => readArray(body), dateFields: ['created_at', 'updated_at'] },
  { key: 'poa', path: 'poa', getItems: body => readDataArray(body), dateFields: ['last_modified', 'updated_at', 'created_at'] },
  { key: 'projects', path: 'projects?page=1&page_size=100', pagePath: page => `projects?page=${page}&page_size=100`, getItems: body => readDataArray(body), dateFields: ['created_at', 'updated_at'] },
  { key: 'notifications', path: 'notifications', getItems: body => readArray(body), dateFields: ['created_at', 'updated_at'] },
  { key: 'customer-service', path: 'customer-service', getItems: body => readNamedArray(body, 'tickets'), dateFields: ['created_at', 'updated_at'] },
];

function readArray(body: unknown): UpdateItem[] {
  if (!Array.isArray(body)) throw new Error('The service returned an unexpected update format.');
  if (body.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('The service returned an invalid update record.');
  return body as UpdateItem[];
}

function readNamedArray(body: unknown, name: string): UpdateItem[] {
  if (!body || typeof body !== 'object' || !(name in body)) throw new Error('The service returned an unexpected update format.');
  return readArray((body as Record<string, unknown>)[name]);
}

function readDataArray(body: unknown): UpdateItem[] {
  return readNamedArray(body, 'data');
}

export default function ClientDashboardPage() {
  const [language, setLanguage] = useState<'en' | 'ar' | 'fil' | 'zh'>('en');
  const [tutorials, setTutorials] = useState<Record<string, TutorialLink>>({});
  const [tutorialsLoaded, setTutorialsLoaded] = useState(false);
  const [tutorialsFailed, setTutorialsFailed] = useState(false);
  const [cardUpdates, setCardUpdates] = useState<Record<string, CardUpdate>>({});
  const [supportContext, setSupportContext] = useState<string | null>(null);
  const [activeTutorial, setActiveTutorial] = useState<TutorialLink | null>(null);
  useEffect(() => {
    const saved = window.localStorage.getItem('aipt-client-dashboard-language');
    if (saved && ['en', 'ar', 'fil', 'zh'].includes(saved)) setLanguage(saved as 'en' | 'ar' | 'fil' | 'zh');
    const handleLanguageChange = (event: Event) => {
      const code = (event as CustomEvent<'en' | 'ar' | 'fil' | 'zh'>).detail;
      if (['en', 'ar', 'fil', 'zh'].includes(code)) setLanguage(code);
    };
    window.addEventListener('aipt-client-dashboard-language-change', handleLanguageChange);
    return () => window.removeEventListener('aipt-client-dashboard-language-change', handleLanguageChange);
  }, []);
  useEffect(() => {
    if (!activeTutorial) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveTutorial(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeTutorial]);
  useEffect(() => {
    let active = true;
    let loading = false;
    const loadCardUpdates = async () => {
      if (loading) return;
      loading = true;
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) throw new Error('Supabase is not configured.');
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) throw new Error('Please sign in to view client updates.');
        const readResponse = await fetchSupabaseFunction('client-updates', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const readBody: unknown = await readResponse.json();
        if (!readResponse.ok) {
          const message = readBody && typeof readBody === 'object' && 'error' in readBody ? String(readBody.error) : 'Unable to load update status.';
          throw new Error(message);
        }
        if (!readBody || typeof readBody !== 'object' || !('data' in readBody) || !readBody.data || typeof readBody.data !== 'object' || Array.isArray(readBody.data)) {
          throw new Error('The update status service returned an invalid response.');
        }
        const readAt = readBody.data as Record<string, string | null>;
        const results = await Promise.all(cardUpdateSources.map(async source => {
          try {
            const items: UpdateItem[] = [];
            let page = 1;
            let total = 0;
            do {
              const response = await fetchSupabaseFunction(source.pagePath ? source.pagePath(page) : source.path, { headers: { Authorization: `Bearer ${session.access_token}` } });
              const body: unknown = await response.json();
              if (!response.ok) {
                const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Unable to check for updates.';
                throw new Error(message);
              }
              const pageItems = source.getItems(body);
              items.push(...pageItems);
              if (source.pagePath) {
                if (!body || typeof body !== 'object' || !('total' in body) || typeof body.total !== 'number' || !Number.isFinite(body.total)) {
                  throw new Error('The service returned invalid pagination data.');
                }
                total = body.total;
                if (pageItems.length === 0 && items.length < total) throw new Error('The service returned incomplete update data.');
              } else total = items.length;
              page += 1;
            } while (source.pagePath && items.length < total);
            const lastSeenValue = readAt[source.key];
            const parsedLastSeen = lastSeenValue ? new Date(lastSeenValue).getTime() : Number.NaN;
            if (!Number.isFinite(parsedLastSeen)) throw new Error('The update read time is invalid.');
            const lastSeen = parsedLastSeen;
            const count = items.filter(item => {
              const changedAt = Math.max(...source.dateFields.map(field => {
                const value = item[field];
                if (typeof value !== 'string') return 0;
                const timestamp = new Date(value).getTime();
                return Number.isFinite(timestamp) ? timestamp : 0;
              }));
              return changedAt > lastSeen;
            }).length;
            return [source.key, { count, failed: false }] as const;
          } catch (cause) {
            console.error(`Could not load unread updates for ${source.key}:`, cause);
            return [source.key, { count: 0, failed: true }] as const;
          }
        }));
        if (active) setCardUpdates(Object.fromEntries(results));
      } catch (cause) {
        console.error('Could not load client dashboard unread update counts:', cause);
        if (active) setCardUpdates(Object.fromEntries(cardUpdateSources.map(({ key }) => [key, { count: 0, failed: true }])));
      } finally {
        loading = false;
      }
    };
    void loadCardUpdates();
    const timer = window.setInterval(() => void loadCardUpdates(), 60_000);
    window.addEventListener('focus', loadCardUpdates);
    window.addEventListener('aipt-client-dashboard-update-read', loadCardUpdates);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', loadCardUpdates);
      window.removeEventListener('aipt-client-dashboard-update-read', loadCardUpdates);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetchSupabaseFunction('video-tutorials?client=true', { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load tutorials.');
        const body = await response.json();
        if (!controller.signal.aborted && Array.isArray(body.data)) {
          setTutorials(Object.fromEntries(body.data.map((item: TutorialLink) => [item.card_key, item])));
        }
      } catch {
        if (!controller.signal.aborted) {
          setTutorials({});
          setTutorialsFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setTutorialsLoaded(true);
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  const translatedLabels: Record<string, Record<'en' | 'ar' | 'fil' | 'zh', string>> = {
    'schedule-of-fees': { en: 'Schedule of Fees', ar: 'جدول الرسوم', fil: 'Talaan ng mga Bayarin', zh: '费用表' },
    quotations: { en: 'Quotation', ar: 'عرض سعر', fil: 'Sipi ng Presyo', zh: '报价' },
    requirements: { en: 'Requirements', ar: 'المتطلبات', fil: 'Mga Kinakailangan', zh: '所需材料' },
    statements: { en: 'Statements', ar: 'الكشوفات', fil: 'Mga Pahayag', zh: '账单' },
    poa: { en: 'POA', ar: 'التوكيل', fil: 'POA', zh: '授权书' },
    projects: { en: 'Your Work', ar: 'أعمالك', fil: 'Iyong Trabaho', zh: '您的项目' },
    notifications: { en: 'Notifications', ar: 'الإشعارات', fil: 'Mga Abiso', zh: '通知' },
    'customer-service': { en: 'Customer Service', ar: 'خدمة العملاء', fil: 'Serbisyo sa Customer', zh: '客户服务' },
  };
  const uiLabels = {
    en: { tutorial: 'Tutorial', chat: 'Chat Us', dashboard: 'Client dashboard', services: 'Dashboard services', watch: 'Watch', unavailable: 'unavailable', notAssigned: 'not assigned', loading: 'loading', newUpdates: 'new updates', updatesUnavailable: 'Updates unavailable' },
    ar: { tutorial: 'شرح', chat: 'تواصل معنا', dashboard: 'لوحة العميل', services: 'خدمات لوحة التحكم', watch: 'شاهد', unavailable: 'غير متاح', notAssigned: 'غير مخصص', loading: 'جارٍ التحميل', newUpdates: 'تحديثات جديدة', updatesUnavailable: 'التحديثات غير متاحة' },
    fil: { tutorial: 'Tutorial', chat: 'Makipag-chat', dashboard: 'Dashboard ng kliyente', services: 'Mga serbisyo ng dashboard', watch: 'Panoorin', unavailable: 'hindi available', notAssigned: 'hindi nakatalaga', loading: 'naglo-load', newUpdates: 'mga bagong update', updatesUnavailable: 'Hindi available ang mga update' },
    zh: { tutorial: '教程', chat: '联系客服', dashboard: '客户仪表板', services: '仪表板服务', watch: '观看', unavailable: '不可用', notAssigned: '未分配', loading: '加载中', newUpdates: '条新更新', updatesUnavailable: '更新不可用' },
  }[language];
  const tutorialStatus = !tutorialsLoaded ? uiLabels.loading : tutorialsFailed ? uiLabels.unavailable : uiLabels.notAssigned;
  return <section className="client-home" aria-label={uiLabels.dashboard}>
    <nav className="client-home-grid" aria-label={uiLabels.services}>
      {destinations.map(({ key, label, href }) => <div className="client-home-card-wrap" key={key}>
        <div className="client-home-tile-header">
          {tutorials[key]?.url ? <button type="button" className="client-home-tutorial-link" onClick={() => setActiveTutorial(tutorials[key])} title={tutorials[key].title} aria-label={`${uiLabels.watch} ${tutorials[key].title} ${uiLabels.tutorial} ${translatedLabels[key]?.[language] || displayLabels[key] || label}`}>
            <span>{uiLabels.tutorial}</span>
          </button> : <span className="client-home-tutorial-link is-unavailable" aria-label={`${translatedLabels[key]?.[language] || displayLabels[key] || label} ${uiLabels.tutorial}: ${tutorialStatus}`}>
            <span>{uiLabels.tutorial}</span>
          </span>}
          {cardUpdates[key]?.count > 0 && <span className="client-home-update-bell" role="status" title={`${cardUpdates[key].count} ${uiLabels.newUpdates}`} aria-label={`${cardUpdates[key].count} ${uiLabels.newUpdates}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
            <b aria-hidden="true">{cardUpdates[key].count > 99 ? '99+' : cardUpdates[key].count}</b>
          </span>}
        </div>
        <Link href={href} className="client-home-card" aria-label={translatedLabels[key]?.[language] || displayLabels[key] || label}>
          <span className="client-home-card-label" lang={language}>{translatedLabels[key]?.[language] || displayLabels[key] || label}</span>
        </Link>
        <button type="button" className="client-home-chat" aria-label={`${uiLabels.chat}: ${translatedLabels[key]?.[language] || label}`} onClick={() => setSupportContext(translatedLabels[key]?.[language] || displayLabels[key] || label)}>
          <span className="client-home-chat-bubble" aria-hidden="true" />
          <span>{uiLabels.chat}</span>
        </button>
      </div>)}
    </nav>
    {activeTutorial && <div className="client-home-tutorial-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveTutorial(null); }}>
      <section className="client-home-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="client-home-tutorial-title">
        <header>
          <img className="client-home-tutorial-logo" src="/images/aipt-client-logo.svg" alt="AIP&T" />
          <div className="client-home-tutorial-heading"><span>{uiLabels.tutorial}</span><h2 id="client-home-tutorial-title">{activeTutorial.title}</h2></div>
          <button type="button" onClick={() => setActiveTutorial(null)} aria-label="Close tutorial video">×</button>
        </header>
        <div className="client-home-tutorial-player">
          <video src={activeTutorial.url} controls autoPlay playsInline preload="metadata">
            Your browser does not support video playback.
          </video>
        </div>
      </section>
    </div>}
    {supportContext && <ClientDashboardSupportChat context={supportContext} language={language} onClose={() => setSupportContext(null)} />}
  </section>;
}
