'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AccountMenu from './AccountMenu';

type IconName =
  | 'projects'
  | 'overview'
  | 'clients'
  | 'countries'
  | 'procedures'
  | 'services'
  | 'classification'
  | 'fees'
  | 'vat'
  | 'quotations'
  | 'notifications'
  | 'documents'
  | 'spreadsheet';

type NavigationItem = {
  href: string;
  label: string;
  icon: IconName;
};

const STORAGE_KEY = 'aipt-admin-sidebar-collapsed';

// Each entry targets an implemented admin route. Do not add placeholder (#) links here.
const navigation: NavigationItem[] = [
  { href: '/overview', label: 'Overview', icon: 'overview' },
  { href: '/projects', label: 'Projects', icon: 'projects' },
  { href: '/clients', label: 'Client', icon: 'clients' },
  { href: '/countries', label: 'Countries', icon: 'countries' },
  { href: '/requirements', label: 'Requirements', icon: 'procedures' },
  { href: '/procedure', label: 'Procedure', icon: 'procedures' },
  { href: '/services', label: 'Services', icon: 'services' },
  {
    href: '/classification-of-fees',
    label: 'Classification of Fees',
    icon: 'classification',
  },
  { href: '/fees', label: 'Fees', icon: 'fees' },
  { href: '/spreadsheet', label: 'Spreadsheet', icon: 'spreadsheet' },
  { href: '/vat', label: 'VAT', icon: 'vat' },
  { href: '/quotations', label: 'Quotations', icon: 'fees' },
  { href: '/notifications', label: 'Notification', icon: 'notifications' },
  {
    href: '/customer-service',
    label: 'Customer Service',
    icon: 'notifications',
  },
  { href: '/statements', label: 'Statements', icon: 'notifications' },
  { href: '/poa', label: 'POA', icon: 'documents' },
  { href: '/schedule-of-fees', label: 'Schedule of Fees', icon: 'documents' },
  { href: '/video-tutorials', label: 'Video Tutorials', icon: 'documents' },
  { href: '/users', label: 'Users', icon: 'clients' },
  { href: '/roles', label: 'Roles & Permissions', icon: 'clients' },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'overview')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === 'projects')
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 0 0 0-6M18 20a5.5 5.5 0 0 0-3-4.9" />
      </svg>
    );
  if (name === 'clients')
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 0 0 0-6M18 20a5.5 5.5 0 0 0-3-4.9" />
      </svg>
    );
  if (name === 'countries')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  if (name === 'procedures')
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5M10 12h5M10 16h5" />
      </svg>
    );
  if (name === 'services')
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </svg>
    );
  if (name === 'classification')
    return (
      <svg {...common}>
        <path d="M20 13l-7 7-10-10V3h7z" />
        <circle cx="7.5" cy="7.5" r="1" />
      </svg>
    );
  if (name === 'fees')
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <path d="M8 4v16M16 4v16" />
      </svg>
    );
  if (name === 'vat')
    return (
      <svg {...common}>
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8M8 12h5M8 15h3" />
      </svg>
    );
  if (name === 'documents')
    return (
      <svg {...common}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h6M9 16h6" />
      </svg>
    );
  if (name === 'spreadsheet')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 3v18M15 9v12M3 15h18" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M18 8A6 6 0 1 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      <path d="M12 3V1" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [query, setQuery] = useState('');
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncBreakpoint = () => setIsDesktop(media.matches);
    syncBreakpoint();
    media.addEventListener('change', syncBreakpoint);
    return () => media.removeEventListener('change', syncBreakpoint);
  }, []);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    setHasLoadedPreference(true);
  }, []);

  useEffect(() => {
    if (hasLoadedPreference) {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    }
  }, [collapsed, hasLoadedPreference]);

  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const items = useMemo(
    () =>
      navigation.filter((item) =>
        item.label.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );
  const isOverlay = !isDesktop;
  const closeDrawer = () => setDrawerOpen(false);
  const toggleSidebar = () => {
    if (isOverlay) {
      setDrawerOpen((value) => !value);
      return;
    }
    setCollapsed((value) => !value);
  };
  const asideClassName = [
    'admin-sidebar',
    isDesktop && collapsed ? 'is-collapsed' : '',
    isOverlay && drawerOpen ? 'is-drawer-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        className={`admin-mobile-sidebar-toggle${drawerOpen ? ' is-drawer-open' : ''}`}
        type="button"
        aria-controls="admin-sidebar"
        aria-expanded={drawerOpen}
        aria-label="Open navigation"
        onClick={toggleSidebar}
      >
        <MenuIcon />
      </button>
      {isOverlay && drawerOpen && (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      )}
      <aside
        id="admin-sidebar"
        className={asideClassName}
        aria-label="Admin navigation"
      >
        <Link
          className="admin-sidebar-brand"
          href="/overview"
          prefetch={false}
          onClick={closeDrawer}
          aria-label="AIP&T overview"
        >
          <span>AIP&amp;T</span>
          <small>INTELLECTUAL PROPERTY</small>
        </Link>
        <button
          className="admin-sidebar-toggle"
          type="button"
          aria-controls="admin-sidebar"
          aria-expanded={isOverlay ? drawerOpen : !collapsed}
          aria-label={
            isOverlay
              ? drawerOpen
                ? 'Close navigation'
                : 'Open navigation'
              : collapsed
                ? 'Expand sidebar'
                : 'Collapse sidebar'
          }
          onClick={toggleSidebar}
        >
          <MenuIcon />
        </button>
        <label
          className="admin-sidebar-search"
          onClick={() => {
            if (isDesktop && collapsed) setCollapsed(false);
          }}
        >
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages..."
            aria-label="Search admin pages"
          />
        </label>
        <nav className="admin-sidebar-nav">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={active ? 'is-active' : ''}
                title={isDesktop && collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={closeDrawer}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {!items.length && (
            <p className="admin-sidebar-empty">No pages found</p>
          )}
        </nav>
        <div className="admin-sidebar-footer">
          <AccountMenu
            name="Mohammad Saleh"
            email="Administrator"
            initials="MS"
            updateHref="/admin-account"
            showChangePassword={false}
            className="admin-account-menu"
          />
        </div>
      </aside>
    </>
  );
}
