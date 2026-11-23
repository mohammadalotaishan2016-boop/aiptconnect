'use client';

export type TenantFilterState = {
  status: string;
  invitation: string;
  device_usage: string;
  date_preset: string;
  date_from: string;
  date_to: string;
};

export const emptyFilters: TenantFilterState = { status: '', invitation: '', device_usage: '', date_preset: '', date_from: '', date_to: '' };

type Props = {
  filters: TenantFilterState;
  onChange: (next: TenantFilterState) => void;
  onReset: () => void;
  loading: boolean;
};

export default function TenantFilters({ filters, onChange, onReset, loading }: Props) {
  const set = (key: keyof TenantFilterState, value: string) => {
    const next = { ...filters, [key]: value };
    if (key === 'date_preset' && value !== 'custom') { next.date_from = ''; next.date_to = ''; }
    onChange(next);
  };

  const hasActive = filters.status || filters.invitation || filters.device_usage || filters.date_preset;

  return (
    <div className="tenant-filters">
      <select value={filters.status} onChange={e => set('status', e.target.value)} disabled={loading} aria-label="Tenant status filter">
        <option value="">All Statuses</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>

      <select value={filters.invitation} onChange={e => set('invitation', e.target.value)} disabled={loading} aria-label="Invitation eligibility filter">
        <option value="">All Eligibility</option>
        <option value="account_exists">User Account Already Exists</option>
        <option value="eligible">Eligible for Invitation</option>
        <option value="invitation_pending">Invitation Pending</option>
        <option value="invitation_expired">Invitation Expired</option>
        <option value="invitation_revoked">Invitation Revoked</option>
        <option value="mismatch">Account / Tenant Mismatch</option>
      </select>

      <select value={filters.device_usage} onChange={e => set('device_usage', e.target.value)} disabled={loading} aria-label="Device usage filter">
        <option value="">All Device Usage</option>
        <option value="available">Available Device Slots</option>
        <option value="fully_utilized">Fully Utilized</option>
        <option value="exceeded">Device Limit Exceeded</option>
      </select>

      <select value={filters.date_preset} onChange={e => set('date_preset', e.target.value)} disabled={loading} aria-label="Registration date filter">
        <option value="">All Dates</option>
        <option value="today">Today</option>
        <option value="last_7_days">Last 7 Days</option>
        <option value="last_30_days">Last 30 Days</option>
        <option value="custom">Custom Date Range</option>
      </select>

      {filters.date_preset === 'custom' && (
        <span className="custom-date-range">
          <input type="date" value={filters.date_from} onChange={e => set('date_from', e.target.value)} disabled={loading} aria-label="From date" />
          <span>to</span>
          <input type="date" value={filters.date_to} onChange={e => set('date_to', e.target.value)} disabled={loading} aria-label="To date" />
        </span>
      )}

      {hasActive && <button type="button" className="reset-filters" onClick={onReset} disabled={loading}>Reset Filters</button>}
    </div>
  );
}
