import { createServerClient } from './supabase/server';

export type AppRole = 'administrator' | 'client' | 'sub_administrator';

function authError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** Returns the authenticated Supabase user or throws a 401. */
export async function requireAuth() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw authError('Authentication required.', 401);
  return user;
}

/**
 * Returns `{ user, profile }` after verifying the caller has one of the
 * allowed roles and an `active` status. Throws 401 or 403 otherwise.
 */
export async function requireRole(allowedRoles: AppRole[]) {
  const user = await requireAuth();
  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || !allowedRoles.includes(profile.role as AppRole)) {
    throw authError('You do not have permission to access this resource.', 403);
  }
  if (profile.status !== 'active') {
    throw authError('Your account is not active.', 403);
  }
  return { user, profile };
}

/**
 * Verifies the caller is active (any role).
 * Use for pages that any logged-in, active user may access.
 */
export async function requireActiveStatus() {
  return requireRole(['administrator', 'client', 'sub_administrator']);
}

/**
 * Verifies the caller belongs to `tenantId`.
 * Administrators and sub_administrators pass through without a membership check.
 */
export async function requireTenant(tenantId: string) {
  const { user, profile } = await requireRole(['administrator', 'client', 'sub_administrator']);

  if (profile.role === 'administrator' || profile.role === 'sub_administrator') {
    return { user, profile, tenantId };
  }

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from('client_memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_id', tenantId)
    .single();

  if (!membership) throw authError('You do not have access to this tenant.', 403);
  return { user, profile, tenantId };
}
