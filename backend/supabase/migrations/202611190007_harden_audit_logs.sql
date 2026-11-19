-- Harden audit_logs:
--   1. Add tenant_id, ip, user_agent columns
--   2. Add indexes for the standard access patterns
--   3. Install an append-only trigger that blocks UPDATE and DELETE
--   4. The SELECT policy for administrators was already added in 202611190005

-- ============================================================================
-- 1. Add columns
-- ============================================================================
alter table public.audit_logs
  add column if not exists tenant_id  uuid references public.clients(id) on delete set null,
  add column if not exists ip         inet,
  add column if not exists user_agent text;

-- ============================================================================
-- 2. Indexes
-- ============================================================================
create index if not exists audit_logs_tenant_created_index
  on public.audit_logs (tenant_id, created_at desc) where tenant_id is not null;

create index if not exists audit_logs_entity_index
  on public.audit_logs (entity_type, entity_id);

create index if not exists audit_logs_actor_created_index
  on public.audit_logs (actor_id, created_at desc);

-- ============================================================================
-- 3. Append-only trigger
--    Blocks UPDATE and DELETE at the database level.
--    Revoke is intentionally NOT applied to service_role because
--    the trigger fires for service_role writes too.
-- ============================================================================
create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only. UPDATE and DELETE are not permitted.'
    using errcode = '28000';
end;
$$;

drop trigger if exists audit_logs_prevent_modification on public.audit_logs;
create trigger audit_logs_prevent_modification
  before update or delete on public.audit_logs
  for each row execute procedure public.prevent_audit_log_modification();
