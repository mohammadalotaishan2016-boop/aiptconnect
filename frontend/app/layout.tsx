import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import './overview.css';
import './collapse.css';
import './clients.css';
import './countries.css';
import './procedure.css';
import './fees.css';
import './statements.css';
import './notification.css';
import './customer-service.css';
import './client-customer-service.css';
import './admin-sidebar.css';
import './client-dashboard.css';
import './client-sidebar.css';
import './client-overview.css';
import './client-projects.css';
import './account-menu.css';
import './account.css';
import './auth-preview.css';
import './register-security.css';
import './dashboard-action-theme.css';
import './system-theme.css';
import './table-controls.css';
import './management-workspace.css';
import './client-home.css';
import './client-card-headers.css';
import './client-reference.css';
import './admin-reference.css';
import './spreadsheet.css';
import AdminAppShell from '../src/components/AdminAppShell';

export const metadata: Metadata = {
  title: 'AIP&T | Intellectual Property',
  description: 'AIP&T IP Management System',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body><AdminAppShell>{children}</AdminAppShell></body></html>;
}
