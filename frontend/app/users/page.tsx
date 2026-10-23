'use client';
import DataTransfer from '../../src/components/DataTransfer';
import ActionIcon from '../../src/components/ActionIcon';


import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';

type User = {
  id: string;
  deletion_supported?: boolean;
  deletion_policy?: 'non_admin_only';
  profile_import_supported?: boolean;
  client_id?: string | null;
  email: string;
  full_name: string;
  company_name: string;
  logo_url: string | null;
  ip: string;
  role: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended';
  account_status: 'active' | 'inactive';
  failed_login_attempts: number;
  locked: boolean;
  last_login_at: string | null;
  registration_date: string | null;
};
type Tab =
  | 'all'
  | 'clients'
  | 'admins'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'active'
  | 'inactive'
  | 'locked';
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Never';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]),
    [tab, setTab] = useState<Tab>('all'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState<'name' | 'email' | 'status' | 'last' | 'company' | 'registered'>('name'),
    [ascending, setAscending] = useState(true),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [securityFilter, setSecurityFilter] = useState('');
  const [reviewUser, setReviewUser] = useState<User | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error('Supabase is not configured.');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error('Please sign in.');
      setCurrentUserId(session.user.id);
      const response = await fetchSupabaseFunction('users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to load users.');
      setUsers(body as User[]);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load users.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users
      .filter(
        (user) =>
          (!roleFilter || user.role === roleFilter) &&
          (!accountFilter || user.account_status === accountFilter) &&
          (!securityFilter || (securityFilter === 'locked' ? user.locked : !user.locked)) &&
          (tab === 'all' ||
            (tab === 'clients' && user.role === 'client') ||
            (tab === 'admins' && user.role === 'administrator') ||
            (tab === 'pending' && user.approval_status === 'pending') ||
            (tab === 'approved' && user.approval_status === 'approved') ||
            (tab === 'rejected' && user.approval_status === 'rejected') ||
            (tab === 'suspended' && user.approval_status === 'suspended') ||
            (tab === 'active' && user.account_status === 'active') ||
            (tab === 'inactive' && user.account_status === 'inactive') ||
            (tab === 'locked' && user.locked)) &&
          (!term ||
            `${user.email} ${user.full_name} ${user.company_name} ${user.ip}`
              .toLowerCase()
              .includes(term)),
      )
      .sort((left, right) => {
        const a =
          sort === 'name'
            ? left.full_name
            : sort === 'email'
              ? left.email
              : sort === 'company' ? left.company_name : sort === 'registered' ? left.registration_date ?? '' : sort === 'status'
                ? left.approval_status
                : (left.last_login_at ?? '');
        const b =
          sort === 'name'
            ? right.full_name
            : sort === 'email'
              ? right.email
              : sort === 'company' ? right.company_name : sort === 'registered' ? right.registration_date ?? '' : sort === 'status'
                ? right.approval_status
                : (right.last_login_at ?? '');
        return (a > b ? 1 : a < b ? -1 : 0) * (ascending ? 1 : -1);
      });
  }, [users, tab, query, sort, ascending, roleFilter, accountFilter, securityFilter]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    setPage((current) => Math.min(current, pages));
  }, [pages]);
  const sortBy = (key: typeof sort) => {
    if (key === sort) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
    setPage(1);
  };
  const action = async (
    user: User,
    payload: Record<string, unknown>,
    message: string,
  ) => {
    setBusy(user.id);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error('Supabase is not configured.');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction(`users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to update user.');
      setNotice(payload.approval_status === 'approved' && body.email_delivered === false ? `${message} Approval email could not be delivered; check SES configuration.` : message);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to update user.',
      );
    } finally {
      setBusy(null);
    }
  };
  const removeUser = async () => {
    if (!deleteUser || deleteUser.role === 'administrator' || !deleteUser.deletion_supported || deleteUser.deletion_policy !== 'non_admin_only' || busy || confirmEmail !== deleteUser.email) return;
    setBusy(deleteUser.id);
    setDeleteError('');
    try {
      const response = await fetchSupabaseFunction(`users/${deleteUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: forceDelete, confirm_email: confirmEmail }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to delete user.');
      setUsers((current) => current.filter((entry) => entry.id !== deleteUser.id));
      setNotice(body.warning || 'User deleted successfully.');
      setDeleteUser(null);
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Unable to delete user.');
    } finally { setBusy(null); }
  };
  const transferColumns = [
    { key: 'id', label: 'User ID' }, { key: 'email', label: 'Email' }, { key: 'full_name', label: 'Full name' }, { key: 'company_name', label: 'Company' }, { key: 'role', label: 'Role' }, { key: 'approval_status', label: 'Approval' }, { key: 'account_status', label: 'Account' }, { key: 'registration_date', label: 'Registered' },
  ];
  const userExport = async () => visible.map((user) => Object.fromEntries(transferColumns.map(({ key }) => [key, user[key as keyof User] ?? ''])));
  const validateUserImport = async (rows: Record<string, string>[]) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const target = users.find((user) => user.id === row.id && user.email.toLowerCase() === row.email?.toLowerCase());
      const prefix = 'Row ' + (index + 2) + ': ';
      if (!target || seen.has(row.id)) throw Error(prefix + 'ID and email must match one existing user, without duplicates.');
      if (!target.profile_import_supported) throw Error('Deploy the updated Users service before importing profile changes.');
      seen.add(row.id);
      for (const field of ['full_name', 'company_name'] as const) {
        if (row[field] === undefined) continue;
        if (row[field].length > 200 || /[\u0000-\u001f]/.test(row[field])) throw Error(prefix + field + ' must contain at most 200 characters without control characters.');
        if (!row[field] && target[field]) throw Error(prefix + field + ' cannot be cleared by import.');
      }
      if (target.client_id && row.company_name !== undefined && row.company_name !== target.company_name) throw Error(prefix + 'change linked company names on the Clients page.');
      for (const field of ['role', 'approval_status', 'account_status', 'registration_date'] as const) if (row[field] !== undefined && row[field] !== String(target[field] ?? '')) throw Error(prefix + field + ' is read-only in Excel import.');
    });
  };
  const importUsers = async (rows: Record<string, string>[]) => {
    let completed = 0;
    try {
      for (const row of rows) {
        const target = users.find((user) => user.id === row.id)!;
        const changes: Record<string, string> = {};
        for (const field of ['full_name', 'company_name'] as const) if (row[field] && row[field] !== target[field]) changes[field] = row[field];
        if (Object.keys(changes).length) {
          const response = await fetchSupabaseFunction('users/' + row.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import_profile', confirm_email: row.email, ...changes }) });
          const body = await response.json();
          if (!response.ok) throw Error(body.error || 'Profile update failed.');
          if (body.warning) throw Error(body.warning + ' Refresh and check this row before retrying.');
        }
        completed++;
      }
    } catch (cause) { throw Error(completed + ' rows processed. Stopped at row ' + (completed + 2) + '. ' + (cause instanceof Error ? cause.message : 'Import failed.')); }
    finally { await load(); }
  };
  const heading = (label: string, key: typeof sort) => (
    <button
      className="statement-sort"
      type="button"
      onClick={() => sortBy(key)}
    >
      {label} {sort === key ? (ascending ? '↑' : '↓') : '↕'}
    </button>
  );
  const tabButton = (value: Tab, label: string, count: number) => (
    <button
      className={tab === value ? 'active' : ''}
      onClick={() => {
        setTab(value);
        setPage(1);
      }}
    >
      {label} ({count})
    </button>
  );
  return (
    <main className="procedure-page users-page">
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Users</b>
          </p>
          <div className="top-profile">
            <span>MS</span>
            <b>Administrator</b>
          </div>
        </header>
        <div className="countries-heading">
          <div>
            <h1>Users</h1>
            <p>Review client access, approvals, and account security.</p>
          </div>
          <div className="users-heading-actions"><button type="button" className="client-refresh" onClick={() => void load()} disabled={loading} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button></div>
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {error && <p className="country-page-error">{error}</p>}
        {users.some((user) => user.role !== 'administrator' && (!user.deletion_supported || user.deletion_policy !== 'non_admin_only')) && <p role="status">Delete actions will be available after the updated Users service is deployed.</p>}
        <section className="country-table-card">
          <nav className="statement-tabs" aria-label="User filters">
            {tabButton('all', 'All users', users.length)}
            {tabButton(
              'clients',
              'Client accounts',
              users.filter((user) => user.role === 'client').length,
            )}
            {tabButton(
              'admins',
              'Admin accounts',
              users.filter((user) => user.role === 'administrator').length,
            )}
            {tabButton(
              'pending',
              'Need approval',
              users.filter((user) => user.approval_status === 'pending').length,
            )}
            {tabButton(
              'approved',
              'Approved',
              users.filter((user) => user.approval_status === 'approved')
                .length,
            )}
            {tabButton('rejected', 'Rejected', users.filter((user) => user.approval_status === 'rejected').length)}
            {tabButton('suspended', 'Suspended', users.filter((user) => user.approval_status === 'suspended').length)}
            {tabButton(
              'active',
              'Active',
              users.filter((user) => user.account_status === 'active').length,
            )}
            {tabButton(
              'inactive',
              'Deactivated',
              users.filter((user) => user.account_status === 'inactive').length,
            )}
            {tabButton(
              'locked',
              'Locked',
              users.filter((user) => user.locked).length,
            )}
          </nav>
          <div className="users-toolbar">
            <label>
              Search{' '}
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search users..."
              />
            </label>
            <select aria-label="Filter by role" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}><option value="">All roles</option>{[...new Set(users.map((user) => user.role))].map((role) => <option key={role} value={role}>{role}</option>)}</select>
            <select aria-label="Filter by account" value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Deactivated</option></select>
            <select aria-label="Filter by security" value={securityFilter} onChange={(e) => { setSecurityFilter(e.target.value); setPage(1); }}><option value="">Any security state</option><option value="locked">Locked</option><option value="unlocked">Unlocked</option></select>
            <button type="button" onClick={() => { setQuery(''); setTab('all'); setRoleFilter(''); setAccountFilter(''); setSecurityFilter(''); setPage(1); }}>Reset</button><span>{visible.length} users</span>
          </div>
          <div className="data-toolbar"><p>Excel import updates names for existing users. IDs, emails, roles and access decisions are read-only.</p><DataTransfer title="Users" columns={transferColumns} getRows={userExport} validateImport={validateUserImport} onImport={importUsers} disabled={loading || Boolean(busy)} /></div>
          <div className="country-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Logo</th>
                  <th>{heading('Full name', 'name')}</th>
                  <th>{heading('Company', 'company')}</th>
                  <th>{heading('Email', 'email')}</th>
                  <th>IP address</th>
                  <th>{heading('Approval', 'status')}</th>
                  <th>{heading('Registered', 'registered')}</th>
                  <th>Account</th>
                  <th>Security</th>
                  <th>{heading('Last login', 'last')}</th>
                  <th aria-label="Actions"><ActionIcon name="more" /></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="country-state">
                      Loading users...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((user) => (
                    <tr key={user.id}>
                      <td>
                        {user.logo_url ? (
                          <img
                            className="user-logo"
                            src={user.logo_url}
                            alt=""
                          />
                        ) : (
                          <span className="user-logo-placeholder">
                            {user.full_name.slice(0, 1).toUpperCase() || '?'}
                          </span>
                        )}
                      </td>
                      <td>
                        <b>{user.full_name || 'Unnamed user'}</b>
                        <small>{user.role}</small>
                      </td>
                      <td>{user.company_name || '-'}</td>
                      <td>{user.email}</td>
                      <td>{user.ip}</td>
                      <td>
                        <span
                          className={`statement-status ${user.approval_status}`}
                        >
                          {user.approval_status === 'pending' ? 'Need approval' : user.approval_status[0].toUpperCase() + user.approval_status.slice(1)}
                        </span>
                      </td>
                      <td>{formatDate(user.registration_date)}</td>
                      <td>
                        <span
                          className={`user-account-status ${user.account_status}`}
                        >
                          {user.account_status === 'active'
                            ? 'Active'
                            : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        {user.locked ? (
                          <span className="user-locked">Locked</span>
                        ) : (
                          `${user.failed_login_attempts}/5 attempts`
                        )}
                      </td>
                      <td>{formatDate(user.last_login_at)}</td>
                      <td>
                        <details className="user-action-menu"><summary>Manage <span aria-hidden="true">⌄</span></summary><fieldset disabled={Boolean(busy)}>
                          <div className="user-actions">
                          <button type="button" onClick={() => setReviewUser(user)}>Review</button>
                          {user.role !== 'administrator' && <button type="button" disabled={Boolean(busy) || !user.deletion_supported || user.deletion_policy !== 'non_admin_only' || !currentUserId || user.id === currentUserId} onClick={() => { setDeleteUser(user); setForceDelete(true); setConfirmEmail(''); setDeleteError(''); }}><ActionIcon name="delete" />Force Delete</button>}
                          {user.approval_status !== 'approved' && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { approval_status: 'approved' },
                                  'User approved.',
                                )
                              }
                             data-action="approve" data-icon-only="true" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>
                          )}
                          {user.approval_status !== 'rejected' && user.role !== 'administrator' && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { approval_status: 'rejected' },
                                  'User rejected.',
                                )
                              }
                            >
                              Reject
                            </button>
                          )}
                          {user.approval_status === 'approved' && user.role !== 'administrator' && <button onClick={() => void action(user, { approval_status: 'suspended' }, 'User suspended.')}>Suspend</button>}
                          <button
                            onClick={() =>
                              void action(
                                user,
                                {
                                  account_status:
                                    user.account_status === 'active'
                                      ? 'inactive'
                                      : 'active',
                                },
                                user.account_status === 'active'
                                  ? 'User deactivated.'
                                  : 'User activated.',
                              )
                            }
                          >
                            {user.account_status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                          {user.locked && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { unlock: true },
                                  'Account unlocked.',
                                )
                              }
                            >
                              Unlock
                            </button>
                          )}
                        </div></fieldset></details>
                        {user.role === 'administrator' ? <small className="admin-delete-protected">Administrator protected</small> :
                         <button type="button" className="user-delete-button" disabled={Boolean(busy) || !user.deletion_supported || user.deletion_policy !== 'non_admin_only' || !currentUserId || user.id === currentUserId} title={user.deletion_policy !== 'non_admin_only' ? 'Deploy the updated Users service to enable protected deletion' : 'Delete ' + user.email} onClick={() => { setDeleteUser(user); setForceDelete(false); setConfirmEmail(''); setDeleteError(''); }}><ActionIcon name="delete" /><span>Delete</span></button>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="country-state">
                      No users match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="country-pagination">
            <p>
              Showing {visible.length ? (page - 1) * pageSize + 1 : 0}-
              {Math.min(page * pageSize, visible.length)} of {visible.length}{' '}
              users
            </p>
            <label>
              Rows per page{' '}
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
            </label>
            <div>
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1}
              >
                ‹
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
                disabled={page === pages}
              >
                ›
              </button>
            </div>
          </footer>
        </section>
      </section>
      {deleteUser && <div className="company-verify-backdrop"><section className="company-verify-modal" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
        <h2 id="delete-user-title">{forceDelete ? 'Force Delete' : 'Delete'} user</h2>
        <p>Permanently delete the login account for <b>{deleteUser.email}</b>?</p>
        <p>{forceDelete ? 'Their profile and client memberships will be removed. Client companies and business records will be retained. Historical references may prevent deletion.' : 'Users linked to a client require Force Delete.'} This cannot be undone.</p>
        <label>Type the user’s email to confirm<input autoFocus value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} disabled={Boolean(busy)} autoComplete="off" /></label>
        {deleteError && <p role="alert" className="country-page-error">{deleteError}</p>}
        <div className="user-actions"><button type="button" disabled={Boolean(busy)} onClick={() => setDeleteUser(null)}>Cancel</button><button type="button" disabled={Boolean(busy) || confirmEmail !== deleteUser.email} onClick={() => void removeUser()}>{busy ? 'Deleting…' : forceDelete ? 'Force Delete' : 'Delete'}</button></div>
      </section></div>}
      {reviewUser && <div className="company-verify-backdrop" onMouseDown={() => setReviewUser(null)}><section className="company-verify-modal" role="dialog" aria-modal="true" aria-labelledby="review-user-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="company-verify-close" onClick={() => setReviewUser(null)} aria-label="Close">×</button><span>ACCOUNT REVIEW</span><h2 id="review-user-title">{reviewUser.full_name || 'Unnamed user'}</h2><p><b>Email:</b> {reviewUser.email}</p><p><b>Company:</b> {reviewUser.company_name || '-'}</p><p><b>Registration:</b> {formatDate(reviewUser.registration_date)}</p><p><b>Status:</b> {reviewUser.approval_status}</p><div className="user-actions">{reviewUser.approval_status !== 'approved' && <button onClick={() => { setReviewUser(null); void action(reviewUser, { approval_status: 'approved' }, 'User approved.'); }} data-action="approve" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>}{reviewUser.approval_status !== 'rejected' && <button onClick={() => { setReviewUser(null); void action(reviewUser, { approval_status: 'rejected' }, 'User rejected.'); }}>Reject</button>}<button type="button" onClick={() => setReviewUser(null)} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button></div></section></div>}
    </main>
  );
}


