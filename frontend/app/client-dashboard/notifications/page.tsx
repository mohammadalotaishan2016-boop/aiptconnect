'use client';

import ClientNewsFeed from '../../../src/components/ClientNewsFeed';
import { ClientPageAccess } from '../../../src/components/ClientPermissions';
import './newsfeed.css';

export default function ClientNotificationsPage() {
  return <ClientPageAccess><ClientNewsFeed /></ClientPageAccess>;
}
