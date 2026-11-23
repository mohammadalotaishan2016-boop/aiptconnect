/**
 * ONE shared permission map — used by both API route guards and UI visibility.
 * Do not duplicate role checks elsewhere; import `can()` instead.
 */

export type AppRole = 'administrator' | 'client' | 'sub_administrator';

export type PermissionAction =
  | 'view_all_clients'
  | 'invite_user'
  | 'approve_pending_user'
  | 'edit_user_role_devices'
  | 'suspend_deactivate_unlock_user'
  | 'resolve_unblock_requests'
  | 'view_force_logout_devices'
  | 'view_audit_logs'
  | 'use_client_dashboard'
  | 'view_own_devices'
  | 'approve_deny_own_device'
  | 'change_own_password_profile'
  | 'change_own_role_status_devices';

type PermissionMatrix = Record<AppRole, Record<PermissionAction, boolean>>;

export const PERMISSIONS: PermissionMatrix = {
  administrator: {
    view_all_clients:              true,
    invite_user:                   true,
    approve_pending_user:          true,
    edit_user_role_devices:        true,
    suspend_deactivate_unlock_user: true,
    resolve_unblock_requests:      true,
    view_force_logout_devices:     true,
    view_audit_logs:               true,
    use_client_dashboard:          true,
    view_own_devices:              true,
    approve_deny_own_device:       true,
    change_own_password_profile:   true,
    change_own_role_status_devices: false,
  },
  sub_administrator: {
    view_all_clients:              true,
    invite_user:                   false,
    approve_pending_user:          false,
    edit_user_role_devices:        false,
    suspend_deactivate_unlock_user: false,
    resolve_unblock_requests:      false,
    view_force_logout_devices:     true,
    view_audit_logs:               true,
    use_client_dashboard:          true,
    view_own_devices:              true,
    approve_deny_own_device:       true,
    change_own_password_profile:   true,
    change_own_role_status_devices: false,
  },
  client: {
    view_all_clients:              false,
    invite_user:                   false,
    approve_pending_user:          false,
    edit_user_role_devices:        false,
    suspend_deactivate_unlock_user: false,
    resolve_unblock_requests:      false,
    view_force_logout_devices:     false,
    view_audit_logs:               false,
    use_client_dashboard:          true,
    view_own_devices:              true,
    approve_deny_own_device:       true,
    change_own_password_profile:   true,
    change_own_role_status_devices: false,
  },
};

/**
 * Returns true if `role` is allowed to perform `action`.
 * Unknown roles always return false.
 */
export function can(role: AppRole | string, action: PermissionAction): boolean {
  const perms = PERMISSIONS[role as AppRole];
  if (!perms) return false;
  return perms[action] ?? false;
}
