'use client';

import dynamic from 'next/dynamic';
import { useClientPermissions } from '../../../src/components/ClientPermissions';
import { useState } from 'react';

// The notifications module already owns the live feed, search, filters, details,
// pagination, attachment downloads, and administrator record management.
const NotificationsPage = dynamic(() => import('../../notifications/page'), {
  loading: () => <p>Loading news...</p>,
});

export default function ClientNotificationsPage() {
  const { canManage } = useClientPermissions();
  const [manage, setManage] = useState(false);
  return <div className="client-notifications-route">
    {canManage && <div className="client-notifications-manage"><button type="button" onClick={() => setManage(value => !value)}>{manage ? 'Back to notifications' : 'Manage records'}</button></div>}
    <NotificationsPage key={manage ? 'manage' : 'feed'} />
  </div>;
}
