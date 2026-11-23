-- T7: Device sessions table, device metadata columns, audit_logs action
--     widening, and login_requests approver tracking.

-- ============================================================================
-- 1. Add parsed device metadata columns to devices
-- ============================================================================
alter table public.devices
  add column if not exists device_name      text,
  add column if not exists device_type      text default 'Unknown'
    check (device_type in ('Desktop', 'Laptop', 'Mobile', 'Tablet', 'Unknown')),
  add column if not exists browser          text,
  add column if not exists operating_system text;

-- ============================================================================
-- 2. Add approver tracking to login_requests
-- ============================================================================
alter table public.login_requests
  add column if not exists approved_by_device_id text;

-- ============================================================================
-- 3. Create device_sessions table
--    Maps Supabase auth sessions to registered devices for server-side
--    validation that a JWT belongs to a still-active device.
-- ============================================================================
create table if not exists public.device_sessions (
  id                uuid        primary key default gen_random_uuid(),
  device_id         uuid        not null references public.devices(id) on delete cascade,
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  auth_session_id   text,
  status            text        not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  last_active_at    timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_reason    text        check (revoked_reason is null or char_length(trim(revoked_reason)) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists device_sessions_device_status_idx
  on public.device_sessions (device_id, status);

create index if not exists device_sessions_user_status_idx
  on public.device_sessions (user_id, status);

create index if not exists device_sessions_auth_session_idx
  on public.device_sessions (auth_session_id)
  where auth_session_id is not null;

drop trigger if exists device_sessions_set_updated_at on public.device_sessions;
create trigger device_sessions_set_updated_at
  before update on public.device_sessions
  for each row execute procedure public.set_updated_at();

alter table public.device_sessions enable row level security;

-- Users can read their own sessions
create policy device_sessions_own_read on public.device_sessions for select to authenticated
  using (user_id = (select auth.uid()));

-- Administrators and sub_administrators can read all sessions
create policy device_sessions_admin_read on public.device_sessions for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- 4. Widen audit_logs.action CHECK constraint
--    The original constraint only allowed ('create', 'update', 'delete').
--    We need device-specific actions.
-- ============================================================================
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
    check (action in (
      'create', 'update', 'delete',
      'device_register', 'device_approve', 'device_deny', 'device_revoke'
    ));
