'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import AccountMenu from './AccountMenu';
import ClientDashboardLanguageSelector from './ClientDashboardLanguageSelector';
import type { DashboardLanguage } from './ClientDashboardLanguageSelector';

const ClientAutoTranslator = dynamic(() => import('./ClientAutoTranslator'), { ssr: false });

const ClientIdentity = createContext({ name: 'Client', email: '' });
export const useClientIdentity = () => useContext(ClientIdentity);
type ClientShellText = { welcome: string; back: string; controls: string; checking: string; denied: string; rights: string; service: string; logout: string; update: string; password: string };
const shellTranslations: Record<DashboardLanguage, ClientShellText> = {
  en: { welcome: 'Welcome,', back: 'Back to dashboard', controls: 'Dashboard controls', checking: 'Checking client access...', denied: 'Client access is required.', rights: 'Â© AIP&T. All rights reserved.', service: 'Intellectual Property Services', logout: 'Logout', update: 'Update client information', password: 'Update password' },
  ar: { welcome: 'Ù…Ø±Ø­Ø¨Ø§Ù‹ØŒ', back: 'Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…', controls: 'Ø¹Ù†Ø§ØµØ± Ø§Ù„ØªØ­ÙƒÙ… ÙÙŠ Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø¹Ù„ÙˆÙ…Ø§Øª', checking: 'Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØµÙˆÙ„ Ø§Ù„Ø¹Ù…ÙŠÙ„...', denied: 'ÙŠÙ„Ø²Ù… Ø§Ù„ÙˆØµÙˆÙ„ ÙƒØ¹Ù…ÙŠÙ„.', rights: 'Â© AIP&T. Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ‚ Ù…Ø­ÙÙˆØ¸Ø©.', service: 'Ø®Ø¯Ù…Ø§Øª Ø§Ù„Ù…Ù„ÙƒÙŠØ© Ø§Ù„ÙÙƒØ±ÙŠØ©', logout: 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬', update: 'ØªØ­Ø¯ÙŠØ« Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø¹Ù…ÙŠÙ„', password: 'ØªØ­Ø¯ÙŠØ« ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±' },
  fil: { welcome: 'Maligayang pagdating,', back: 'Bumalik sa dashboard', controls: 'Mga kontrol ng dashboard', checking: 'Sinusuri ang access ng kliyente...', denied: 'Kinakailangan ang access ng kliyente.', rights: 'Â© AIP&T. Nakalaan ang lahat ng karapatan.', service: 'Mga Serbisyo sa Intelektuwal na Ari-arian', logout: 'Mag-log out', update: 'I-update ang impormasyon ng kliyente', password: 'I-update ang password' },
  zh: { welcome: 'æ¬¢è¿Žï¼Œ', back: 'è¿”å›žä»ªè¡¨æ¿', controls: 'ä»ªè¡¨æ¿æŽ§åˆ¶', checking: 'æ­£åœ¨æ£€æŸ¥å®¢æˆ·è®¿é—®æƒé™...', denied: 'éœ€è¦å®¢æˆ·è®¿é—®æƒé™ã€‚', rights: 'Â© AIP&T. ä¿ç•™æ‰€æœ‰æƒåˆ©ã€‚', service: 'çŸ¥è¯†äº§æƒæœåŠ¡', logout: 'é€€å‡ºç™»å½•', update: 'æ›´æ–°å®¢æˆ·ä¿¡æ¯', password: 'æ›´æ–°å¯†ç ' },
};
const readableDashboardRoutes: Record<string, string> = {
  '/client-dashboard/schedule-of-fees': 'schedule-of-fees',
  '/client-dashboard/quotations': 'quotations',
  '/client-dashboard/requirements': 'requirements',
  '/client-dashboard/statements': 'statements',
  '/client-dashboard/poa': 'poa',
  '/client-dashboard/projects': 'projects',
  '/client-dashboard/notifications': 'notifications',
  '/client-dashboard/customer-service': 'customer-service',
};
type CardRouteGate = { pathname: string; state: 'checking' | 'allowed' | 'blocked' };

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('Client');
  const [email, setEmail] = useState('');
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [language, setLanguage] = useState<DashboardLanguage>('en');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [cardRouteGate, setCardRouteGate] = useState<CardRouteGate>({ pathname: '', state: 'checking' });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setName(data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Client');
      setEmail(data.user.email || '');
      const { data: profile } = await supabase.from('profiles').select('role,client_id,approval_status,account_status').eq('id', data.user.id).maybeSingle();
      const { data: client } = profile?.client_id ? await supabase.from('clients').select('email').eq('id', profile.client_id).is('deleted_at', null).maybeSingle() : { data: null };
      const authenticatedEmail = (data.user.email || '').trim().toLowerCase();
      const linkedEmail = (client?.email || '').trim().toLowerCase();
      const role = String(profile?.role || '').toLowerCase();
      const approvalStatus = String(profile?.approval_status || '').toLowerCase();
      const accountStatus = String(profile?.account_status || '').toLowerCase();
      if (role !== 'client' || approvalStatus !== 'approved' || accountStatus !== 'active' || !profile?.client_id || !authenticatedEmail || linkedEmail !== authenticatedEmail) {
        setAccessState('denied');
        await supabase.auth.signOut();
        window.sessionStorage.setItem('aipt-auth-message', 'This account is not approved or its registered client email is not correctly linked.');
        router.replace('/login');
        return;
      }
      setAccessState('allowed');
    });
  }, [router]);

  useEffect(() => {
    const saved = window.localStorage.getItem('aipt-client-dashboard-language') as DashboardLanguage | null;
    if (saved && ['ar', 'en', 'fil', 'zh'].includes(saved)) setLanguage(saved);
    const handleLanguageChange = (event: Event) => {
      const code = (event as CustomEvent<DashboardLanguage>).detail;
      if (['ar', 'en', 'fil', 'zh'].includes(code)) setLanguage(code);
    };
    window.addEventListener('aipt-client-dashboard-language-change', handleLanguageChange);
    return () => window.removeEventListener('aipt-client-dashboard-language-change', handleLanguageChange);
  }, []);

  useEffect(() => {
    const category = readableDashboardRoutes[pathname];
    if (accessState !== 'allowed' || !category) return;
    const warnedKey = 'aipt-client-updates-warning';
    const markRead = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) throw new Error('Please sign in to update read status.');
        const response = await fetchSupabaseFunction('client-updates', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ category }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to update read status.');
        window.dispatchEvent(new CustomEvent('aipt-client-dashboard-update-read', { detail: category }));
      } catch (cause) {
        if (!window.sessionStorage.getItem(warnedKey)) {
          window.sessionStorage.setItem(warnedKey, '1');
          console.warn('Could not save the client dashboard read status:', cause);
        }
      }
    };
    void markRead();
  }, [pathname, accessState]);

  useEffect(() => {
    const cardKey = readableDashboardRoutes[pathname];
    if (accessState !== 'allowed' || !cardKey) return;
    const controller = new AbortController();
    setCardRouteGate({ pathname, state: 'checking' });
    const checkRoute = async () => {
      try {
        const response = await fetchSupabaseFunction('video-tutorials?availability=true', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not verify dashboard card availability.');
        const body = await response.json();
        const settings = Array.isArray(body.data) ? body.data.find((item: { card_key?: string }) => item.card_key === cardKey) : null;
        const blocked = !settings || settings.is_available === false || settings.coming_soon === true;
        if (controller.signal.aborted) return;
        setCardRouteGate({ pathname, state: blocked ? 'blocked' : 'allowed' });
        if (blocked) router.replace('/client-dashboard');
      } catch {
        if (!controller.signal.aborted) {
          setCardRouteGate({ pathname, state: 'blocked' });
          router.replace('/client-dashboard');
        }
      }
    };
    void checkRoute();
    return () => controller.abort();
  }, [pathname, accessState, router]);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL';
  const goBack = () => router.push('/client-dashboard');
  const shellText = shellTranslations[language];
  return <ClientIdentity.Provider value={{ name, email }}>
    <div className="client-app-shell client-home-shell" ref={shellRef}>
      {accessState === 'allowed' && <ClientAutoTranslator rootRef={shellRef} language={language} />}
      <header className="client-home-header" dir="ltr">
        <Link className="client-home-brand" href="/client-dashboard" aria-label="AIP&T home">
          <img className="client-home-brand-logo" src="/images/aipt-client-logo.svg" alt="AIP&T" />
        </Link>
        <h1 className="client-home-welcome" dir={language === 'ar' ? 'rtl' : 'ltr'}><span>{shellText.welcome}</span><strong>{name}</strong></h1>
        <div className="client-home-account">
          <ClientDashboardLanguageSelector />
          <span className="client-home-header-divider" aria-hidden="true" />
          <AccountMenu
            name={name}
            email={email}
            initials={initials}
            updateHref="/client-dashboard/settings"
            className="client-home-account-menu"
            passwordFirst
            updateLabel={shellText.update}
            passwordLabel={shellText.password}
            signOutLabel={shellText.logout}
          />
        </div>
      </header>
      <div className="client-home-layout">
        <aside className={`client-home-rail${railCollapsed ? ' is-collapsed' : ''}`} aria-label="Client navigation">
          <button className="client-home-rail-button client-home-dashboard-back" type="button" aria-label={pathname !== '/client-dashboard' ? shellText.back : (railCollapsed ? 'Expand dashboard navigation' : 'Collapse dashboard navigation')} title={pathname !== '/client-dashboard' ? shellText.back : (railCollapsed ? 'Expand dashboard navigation' : 'Collapse dashboard navigation')} onClick={() => { if (pathname !== '/client-dashboard') { setRailCollapsed(true); router.push('/client-dashboard'); } else setRailCollapsed(value => !value); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
          </button>
        </aside>
        <main className="client-main client-home-content">
          {accessState === 'checking' && <section className="client-access-state">{shellText.checking}</section>}
          {accessState === 'denied' && <section className="client-access-state client-error">{shellText.denied}</section>}
          {accessState === 'allowed' && (!readableDashboardRoutes[pathname] || (cardRouteGate.pathname === pathname && cardRouteGate.state === 'allowed')) && children}
          {accessState === 'allowed' && readableDashboardRoutes[pathname] && (cardRouteGate.pathname !== pathname || cardRouteGate.state === 'checking') && <section className="client-access-state">Checking dashboard card availability...</section>}
          <footer className="client-home-footer">
            <span>{shellText.rights}</span>
            <span>{shellText.service}</span>
          </footer>
        </main>
      </div>
    </div>
  </ClientIdentity.Provider>;
}

