/** Shared device types, icons, and helpers used by DeviceManagementPanel and RegisteredDevicesCell */

export interface Device {
  id: string;
  device_id: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  user_agent: string | null;
  ip: string | null;
  status: 'active' | 'revoked';
  last_seen_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

export const DEVICE_TYPE_ICONS: Record<string, string> = {
  Desktop: '\uD83D\uDDA5',
  Laptop: '\uD83D\uDCBB',
  Mobile: '\uD83D\uDCF1',
  Tablet: '\uD83D\uDCF2',
  Unknown: '\uD83D\uDD33',
};

export function formatDeviceDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function deviceStatusBadge(status: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: '#d4edda', fg: '#155724' },
    revoked: { bg: '#f8d7da', fg: '#721c24' },
    expired: { bg: '#fff3cd', fg: '#856404' },
    pending: { bg: '#cce5ff', fg: '#004085' },
    approved: { bg: '#d4edda', fg: '#155724' },
    denied: { bg: '#f8d7da', fg: '#721c24' },
  };
  const c = colors[status] ?? { bg: '#e2e3e5', fg: '#383d41' };
  return { background: c.bg, color: c.fg };
}
