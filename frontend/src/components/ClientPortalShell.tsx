'use client';

import type { ReactNode } from 'react';
import ClientShell from './ClientShell';
import ClientPermissionProvider, { ClientPageAccess } from './ClientPermissions';

export default function ClientPortalShell({ children }: { children: ReactNode }) {
  return <ClientPermissionProvider><ClientShell><ClientPageAccess>{children}</ClientPageAccess></ClientShell></ClientPermissionProvider>;
}
