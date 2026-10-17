'use client';
import AdminDashboardHeader from './AdminDashboardHeader';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from './AdminSidebar';
import dynamic from 'next/dynamic';
import { getSupabaseBrowserClient, isFeeSyncActive } from '../lib/supabase/browser';

const ClientPortalShell = dynamic(() => import('./ClientPortalShell'), {
  loading: () => <section className="client-page client-page-loading" aria-busy="true"><span className="client-loading-spinner" aria-hidden="true" />Loading your dashboard…</section>,
});

const adminRoutes = new Set([
  '/overview',
  '/projects',
  '/clients',
  '/countries',
  '/requirements',
  '/procedure',
  '/services',
  '/classification-of-fees',
  '/fees',
  '/admin/fees',
  '/spreadsheet',
  '/vat',
  '/quotations',
  '/notifications',
  '/customer-service',
  '/users',
  '/roles',
  '/statements',
  '/poa',
  '/schedule-of-fees',
  '/video-tutorials',
  '/admin-account',
]);

const clientRoutes = new Set([
  '/client-dashboard',
  '/client-dashboard/overview',
  '/client-dashboard/fees',
  '/client-dashboard/schedule-of-fees',
  '/client-dashboard/poa',
  '/client-dashboard/quotations',
  '/client-dashboard/projects',
  '/client-dashboard/notifications',
  '/client-dashboard/requirements',
  '/client-dashboard/customer-service',
  '/client-dashboard/statements',
  '/client-dashboard/invoices',
  '/client-dashboard/settings',
]);

export default function AdminAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [welcome, setWelcome] = useState('');
  const [idleWarning, setIdleWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300);

  useEffect(() => {
    if (!adminRoutes.has(pathname) && !clientRoutes.has(pathname)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const idleLimit = 30 * 60 * 1000;
    const warningAt = 25 * 60 * 1000;
    let lastActivity = Date.now();
    let syncing = isFeeSyncActive();
    let signedOut = false;
    const markActivity = () => {
      lastActivity = Date.now();
      setIdleWarning(false);
    };
    const syncActivity = (event: Event) => {
      syncing = Boolean((event as CustomEvent<boolean>).detail);
      if (syncing) lastActivity = Date.now();
    };
    const activityEvents = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    window.addEventListener('aipt-fee-sync-activity', syncActivity);
    const timer = window.setInterval(async () => {
      if (syncing || isFeeSyncActive()) {
        syncing = true;
        lastActivity = Date.now();
        setIdleWarning(false);
        return;
      }
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= idleLimit) {
        signedOut = true;
        window.clearInterval(timer);
        await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
        window.sessionStorage.setItem('aipt-auth-message', 'You were logged out after 30 minutes of inactivity for your security.');
        router.replace('/login');
        return;
      }
      if (idleFor >= warningAt) {
        setSecondsRemaining(Math.max(0, Math.ceil((idleLimit - idleFor) / 1000)));
        setIdleWarning(true);
      }
    }, 1000);
    return () => {
      if (!signedOut) window.clearInterval(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, markActivity));
      window.removeEventListener('aipt-fee-sync-activity', syncActivity);
    };
  }, [pathname, router]);

  useEffect(() => {
    const message = window.sessionStorage.getItem('aipt-welcome-message');
    if (!message) return;
    window.sessionStorage.removeItem('aipt-welcome-message');
    setWelcome(message);
    const timer = window.setTimeout(() => setWelcome(''), 5000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const welcomeToast = welcome && <div className="welcome-back-toast" role="status">✓ {welcome}</div>;

  const idleNotice = idleWarning ? <div className="idle-timeout-notice" role="alert"><b>You appear to be away.</b><span>You will be logged out in {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')} for your security.</span><button type="button" onClick={() => window.dispatchEvent(new Event('pointerdown'))}>Stay signed in</button></div> : null;

  if (clientRoutes.has(pathname)) return <><ClientPortalShell>{children}</ClientPortalShell>{welcomeToast}{idleNotice}</>;

  if (!adminRoutes.has(pathname)) return <>{children}{welcomeToast}</>;

  return <><div className="admin-app-shell"><AdminSidebar /><div className="admin-dashboard-content"><AdminDashboardHeader />{children}</div></div>{welcomeToast}{idleNotice}</>;
}
