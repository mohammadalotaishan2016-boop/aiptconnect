'use client';
import { type ReactNode } from 'react';
import { can, type AppRole, type PermissionAction } from '../lib/permissions';

type Props = {
  role: AppRole | string;
  action: PermissionAction;
  children: ReactNode;
  /** Rendered when permission is denied. Defaults to null (hidden). */
  fallback?: ReactNode;
};

/**
 * Shows `children` only when the given `role` is allowed to perform `action`.
 * Uses the same shared permission map as API route guards.
 */
export default function PermissionGuard({ role, action, children, fallback = null }: Props) {
  if (!can(role, action)) return <>{fallback}</>;
  return <>{children}</>;
}
