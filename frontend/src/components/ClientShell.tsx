'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import AccountMenu from './AccountMenu';
import ClientAutoTranslator from './ClientAutoTranslator';
import ClientDashboardLanguageSelector from './ClientDashboardLanguageSelector';
import type { DashboardLanguage } from './ClientDashboardLanguageSelector';

const ClientIdentity = createContext({ name: 'Client', email: '' });
export const useClientIdentity = () => useContext(ClientIdentity);
type ClientShellText = { welcome: string; back: string; controls: string; checking: string; denied: string; rights: string; service: string; logout: string; update: string; password: string };
const shellTranslations: Record<DashboardLanguage, ClientShellText> = {
  en: { welcome: 'Welcome,', back: 'Back to dashboard', controls: 'Dashboard controls', checking: 'Checking client access...', denied: 'Client access is required.', rights: '© AIP&T. All rights reserved.', service: 'Intellectual Property Services', logout: 'Logout', update: 'Update client information', password: 'Update password' },
  ar: { welcome: 'مرحباً،', back: 'العودة إلى لوحة التحكم', controls: 'عناصر التحكم في لوحة المعلومات', checking: 'جارٍ التحقق من وصول العميل...', denied: 'يلزم الوصول كعميل.', rights: '© AIP&T. جميع الحقوق محفوظة.', service: 'خدمات الملكية الفكرية', logout: 'تسجيل الخروج', update: 'تحديث معلومات العميل', password: 'تحديث كلمة المرور' },
  fil: { welcome: 'Maligayang pagdating,', back: 'Bumalik sa dashboard', controls: 'Mga kontrol ng dashboard', checking: 'Sinusuri ang access ng kliyente...', denied: 'Kinakailangan ang access ng kliyente.', rights: '© AIP&T. Nakalaan ang lahat ng karapatan.', service: 'Mga Serbisyo sa Intelektuwal na Ari-arian', logout: 'Mag-log out', update: 'I-update ang impormasyon ng kliyente', password: 'I-update ang password' },
  zh: { welcome: '欢迎，', back: '返回仪表板', controls: '仪表板控制', checking: '正在检查客户访问权限...', denied: '需要客户访问权限。', rights: '© AIP&T. 保留所有权利。', service: '知识产权服务', logout: '退出登录', update: '更新客户信息', password: '更新密码' },
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

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('Client');
  const [email, setEmail] = useState('');
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [language, setLanguage] = useState<DashboardLanguage>('en');

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
        console.error('Could not save the client dashboard read status:', cause);
      }
    };
    void markRead();
  }, [pathname, accessState]);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL';
  const goBack = () => router.push('/client-dashboard');
  const shellText = shellTranslations[language];
  const logout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.replace('/login');
  };

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
        <aside className="client-home-rail" aria-label={shellText.controls}>
          <button className="client-home-rail-button" type="button" aria-label={shellText.back} title={shellText.back} onClick={goBack} disabled={pathname === '/client-dashboard'}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m7 7-7-7 7-7" /></svg>
          </button>
          <button className="client-home-rail-button client-home-rail-logout" type="button" aria-label={shellText.logout} onClick={() => void logout()}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H5v18h9" /><path d="M12 12h9m-4-4 4 4-4 4" /><path d="M10 12h.01" /></svg>
          </button>
        </aside>
        <main className="client-main client-home-content">
          {accessState === 'checking' && <section className="client-access-state">{shellText.checking}</section>}
          {accessState === 'denied' && <section className="client-access-state client-error">{shellText.denied}</section>}
          {accessState === 'allowed' && children}
          <footer className="client-home-footer">
            <span>{shellText.rights}</span>
            <span>{shellText.service}</span>
          </footer>
        </main>
      </div>
    </div>
  </ClientIdentity.Provider>;
}
