-- Add the three tables required by T0 that have no existing equivalent.

-- ============================================================================
-- devices
-- Tracks authenticated devices per user. Used for multi-device management,
-- forced logout, and login request flows.
-- ============================================================================
create table if not exists public.devices (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  tenant_id       uuid        references public.clients(id) on delete cascade,
  device_id       text        not null check (char_length(trim(device_id)) between 1 and 500),
  user_agent      text,
  ip              inet,
  last_seen_at    timestamptz not null default now(),
  status          text        not null default 'active'
    check (status in ('active', 'revoked')),
  revoked_at      timestamptz,
  revoked_reason  text        check (revoked_reason is null or char_length(trim(revoked_reason)) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

create index if not exists devices_user_status_index
  on public.devices (user_id, status);

create index if not exists devices_device_id_index
  on public.devices (device_id);

create index if not exists devices_tenant_index
  on public.devices (tenant_id) where tenant_id is not null;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
  before update on public.devices
  for each row execute procedure public.set_updated_at();

alter table public.devices enable row level security;

-- Users can read their own devices
create policy devices_own_read on public.devices for select to authenticated
  using (user_id = (select auth.uid()));

-- Administrators and sub_administrators can read all devices
create policy devices_admin_read on public.devices for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- unblock_requests
-- Submitted by locked/suspended users to request manual review by an administrator.
-- ============================================================================
create table if not exists public.unblock_requests (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        references public.clients(id) on delete cascade,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  message      text        check (message is null or char_length(trim(message)) between 1 and 2000),
  status       text        not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid        references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid
);

create index if not exists unblock_requests_pending_index
  on public.unblock_requests (status, created_at desc) where status = 'pending';

create index if not exists unblock_requests_tenant_status_index
  on public.unblock_requests (tenant_id, status, created_at desc) where tenant_id is not null;

create index if not exists unblock_requests_user_index
  on public.unblock_requests (user_id, created_at desc);

drop trigger if exists unblock_requests_set_updated_at on public.unblock_requests;
create trigger unblock_requests_set_updated_at
  before update on public.unblock_requests
  for each row execute procedure public.set_updated_at();

alter table public.unblock_requests enable row level security;

-- Users can read their own requests
create policy unblock_requests_own_read on public.unblock_requests for select to authenticated
  using (user_id = (select auth.uid()));

-- Administrators and sub_administrators can read all requests
create policy unblock_requests_admin_read on public.unblock_requests for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- idempotency_keys
-- Prevents duplicate processing of API requests that share the same key.
-- Only accessed by server code via service_role; no direct client access.
-- ============================================================================
create table if not exists public.idempotency_keys (
  key              text        primary key
    check (char_length(trim(key)) between 1 and 500),
  user_id          uuid        references public.profiles(id) on delete cascade,
  route            text        not null,
  result_snapshot  jsonb,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idempotency_keys_expires_index
  on public.idempotency_keys (expires_at);

create index if not exists idempotency_keys_user_index
  on public.idempotency_keys (user_id) where user_id is not null;

drop trigger if exists idempotency_keys_set_updated_at on public.idempotency_keys;
create trigger idempotency_keys_set_updated_at
  before update on public.idempotency_keys
  for each row execute procedure public.set_updated_at();

alter table public.idempotency_keys enable row level security;

-- No authenticated client access; service_role handles all reads and writes
revoke all on public.idempotency_keys from public, anon, authenticated;
grant all on public.idempotency_keys to service_role;
