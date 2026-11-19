-- Fix RLS policies after:
--   202611190002 — added sub_administrator role
--   202611190003 — added profiles.status column
--
-- This migration:
--   A. Migrates all profile status checks from approval_status/account_status → status
--   B. Extends SELECT policies to sub_administrator where appropriate
--   C. Adds policies to tables that have RLS enabled but zero policies (silent deny)
--   D. Enables RLS on quotation_reference_counters
--   E. Updates affected functions to use profiles.status

-- ============================================================================
-- A. Enable RLS on quotation_reference_counters (was missing entirely)
--    Only service_role needs access (via the SECURITY DEFINER function).
-- ============================================================================
alter table public.quotation_reference_counters enable row level security;
-- No authenticated policies needed; service_role bypasses RLS.

-- ============================================================================
-- B. profiles — add admin/sub_admin full-read policy
--    (the existing policy only lets users read their own row)
-- ============================================================================
drop policy if exists "administrators can read all profiles" on public.profiles;
create policy "administrators can read all profiles"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.profiles p2
      where p2.id = (select auth.uid())
        and p2.role in ('administrator', 'sub_administrator')
        and p2.status = 'active'
    )
  );

-- ============================================================================
-- C. clients — extend read policy to sub_administrator; migrate status check
-- ============================================================================
drop policy if exists "administrators can read active clients" on public.clients;
create policy "administrators can read active clients"
  on public.clients for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

drop policy if exists "clients can read their own client" on public.clients;
create policy "clients can read their own client"
  on public.clients for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'client'
        and status = 'active'
        and client_id = clients.id
    )
  );

-- ============================================================================
-- D. projects — migrate status check in client policy
-- ============================================================================
drop policy if exists "clients can read approved active projects" on public.projects;
create policy "clients can read approved active projects"
  on public.projects for select to authenticated
  using (
    deleted_at is null
    and approval_status = 'approved'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'client'
        and status = 'active'
        and client_id = projects.client_id
    )
  );

drop policy if exists "admins can read all active projects" on public.projects;
create policy "admins can read all active projects"
  on public.projects for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- E. project_lifecycle_events — was silent-deny; all authenticated can read
-- ============================================================================
drop policy if exists "authenticated users can read project lifecycle events" on public.project_lifecycle_events;
create policy "authenticated users can read project lifecycle events"
  on public.project_lifecycle_events for select to authenticated
  using (deleted_at is null);

-- ============================================================================
-- F. audit_logs — add SELECT for administrators and sub_administrators
-- ============================================================================
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read
  on public.audit_logs for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- G. customer_service — add all missing policies (tables were silent-deny)
-- ============================================================================

-- customer_service_tickets
drop policy if exists customer_service_tickets_client_read on public.customer_service_tickets;
create policy customer_service_tickets_client_read
  on public.customer_service_tickets for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'client'
        and status = 'active'
        and client_id = customer_service_tickets.client_id
    )
  );

drop policy if exists customer_service_tickets_admin_read on public.customer_service_tickets;
create policy customer_service_tickets_admin_read
  on public.customer_service_tickets for select to authenticated
  using (
    deleted_at is null and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- customer_service_messages
drop policy if exists customer_service_messages_client_read on public.customer_service_messages;
create policy customer_service_messages_client_read
  on public.customer_service_messages for select to authenticated
  using (
    exists (
      select 1 from public.customer_service_tickets t
      join public.profiles p on p.client_id = t.client_id
      where t.id = customer_service_messages.ticket_id
        and t.deleted_at is null
        and p.id = (select auth.uid())
        and p.role = 'client'
        and p.status = 'active'
    )
  );

drop policy if exists customer_service_messages_admin_read on public.customer_service_messages;
create policy customer_service_messages_admin_read
  on public.customer_service_messages for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- customer_service_attachments
drop policy if exists customer_service_attachments_client_read on public.customer_service_attachments;
create policy customer_service_attachments_client_read
  on public.customer_service_attachments for select to authenticated
  using (
    exists (
      select 1 from public.customer_service_messages m
      join public.customer_service_tickets t on t.id = m.ticket_id
      join public.profiles p on p.client_id = t.client_id
      where m.id = customer_service_attachments.message_id
        and t.deleted_at is null
        and p.id = (select auth.uid())
        and p.role = 'client'
        and p.status = 'active'
    )
  );

drop policy if exists customer_service_attachments_admin_read on public.customer_service_attachments;
create policy customer_service_attachments_admin_read
  on public.customer_service_attachments for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- customer_service_status_actions
drop policy if exists customer_service_status_actions_client_read on public.customer_service_status_actions;
create policy customer_service_status_actions_client_read
  on public.customer_service_status_actions for select to authenticated
  using (
    exists (
      select 1 from public.customer_service_tickets t
      join public.profiles p on p.client_id = t.client_id
      where t.id = customer_service_status_actions.ticket_id
        and t.deleted_at is null
        and p.id = (select auth.uid())
        and p.role = 'client'
        and p.status = 'active'
    )
  );

drop policy if exists customer_service_status_actions_admin_read on public.customer_service_status_actions;
create policy customer_service_status_actions_admin_read
  on public.customer_service_status_actions for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- customer_service_read_state — users manage their own row; admins can read all
drop policy if exists customer_service_read_state_own on public.customer_service_read_state;
create policy customer_service_read_state_own
  on public.customer_service_read_state for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists customer_service_read_state_admin_read on public.customer_service_read_state;
create policy customer_service_read_state_admin_read
  on public.customer_service_read_state for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- H. fee tables — split 'admin all' into sub_admin read + admin write
-- ============================================================================

-- fee_dataset_versions: extend non-published read to sub_administrator
drop policy if exists fee_dataset_versions_public_read on public.fee_dataset_versions;
create policy fee_dataset_versions_public_read
  on public.fee_dataset_versions for select to authenticated
  using (
    status = 'published'
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- fee_values: extend to sub_administrator read; keep admin-only writes
drop policy if exists fee_values_admin_all on public.fee_values;
create policy fee_values_admin_read
  on public.fee_values for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );
create policy fee_values_admin_write
  on public.fee_values for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator' and status = 'active')
  );

-- fee_claiming_priority_values
drop policy if exists fee_claiming_priority_admin_all on public.fee_claiming_priority_values;
create policy fee_claiming_priority_admin_read
  on public.fee_claiming_priority_values for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );
create policy fee_claiming_priority_admin_write
  on public.fee_claiming_priority_values for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator' and status = 'active')
  );

-- fee_class_values
drop policy if exists fee_class_values_admin_all on public.fee_class_values;
create policy fee_class_values_admin_read
  on public.fee_class_values for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );
create policy fee_class_values_admin_write
  on public.fee_class_values for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator' and status = 'active')
  );

-- fee_classes
drop policy if exists fee_classes_admin_all on public.fee_classes;
create policy fee_classes_admin_read
  on public.fee_classes for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );
create policy fee_classes_admin_write
  on public.fee_classes for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator' and status = 'active')
  );

-- fee_sync_runs: extend SELECT to sub_administrator; keep insert/update admin-only
drop policy if exists fee_sync_runs_admin_select on public.fee_sync_runs;
create policy fee_sync_runs_admin_select
  on public.fee_sync_runs for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- fee_sync_logs, fee_sync_errors, fee_sync_checkpoints, fee_sync_locks, fee_sync_schedules
drop policy if exists fee_sync_logs_admin_select on public.fee_sync_logs;
create policy fee_sync_logs_admin_select on public.fee_sync_logs for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrator','sub_administrator') and status = 'active'));

drop policy if exists fee_sync_errors_admin_select on public.fee_sync_errors;
create policy fee_sync_errors_admin_select on public.fee_sync_errors for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrator','sub_administrator') and status = 'active'));

drop policy if exists fee_sync_checkpoints_admin_select on public.fee_sync_checkpoints;
create policy fee_sync_checkpoints_admin_select on public.fee_sync_checkpoints for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrator','sub_administrator') and status = 'active'));

drop policy if exists fee_sync_locks_admin_select on public.fee_sync_locks;
create policy fee_sync_locks_admin_select on public.fee_sync_locks for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrator','sub_administrator') and status = 'active'));

drop policy if exists fee_sync_schedules_admin_select on public.fee_sync_schedules;
create policy fee_sync_schedules_admin_select on public.fee_sync_schedules for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('administrator','sub_administrator') and status = 'active'));

-- ============================================================================
-- I. spreadsheet — extend read to sub_administrator; migrate status check
-- ============================================================================
drop policy if exists spreadsheet_workbooks_read_admin on public.spreadsheet_workbooks;
create policy spreadsheet_workbooks_read_admin
  on public.spreadsheet_workbooks for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

drop policy if exists spreadsheet_workbook_versions_read_admin on public.spreadsheet_workbook_versions;
create policy spreadsheet_workbook_versions_read_admin
  on public.spreadsheet_workbook_versions for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

-- ============================================================================
-- J. client_dashboard_card_availability — migrate status check
-- ============================================================================
drop policy if exists "administrators can read client dashboard card settings" on public.client_dashboard_card_availability;
create policy "administrators can read client dashboard card settings"
  on public.client_dashboard_card_availability for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role in ('administrator', 'sub_administrator')
        and status = 'active'
    )
  );

drop policy if exists "administrators can update client dashboard card settings" on public.client_dashboard_card_availability;
create policy "administrators can update client dashboard card settings"
  on public.client_dashboard_card_availability for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'administrator'
        and status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'administrator'
        and status = 'active'
    )
  );

-- ============================================================================
-- K. Update functions that reference old status columns
-- ============================================================================

-- client_page_visible: migrate approval_status/account_status → status
create or replace function public.client_page_visible(p_page text, p_client_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when p.role = 'client' then
        p.status = 'active'
        and p.client_id is not null
        and (p_client_id is null or p.client_id = p_client_id)
        and coalesce((s.permissions->p_page->>'view')::boolean, s.user_id is null)
      else true  -- administrator and sub_administrator see all pages
    end
    from public.profiles p
    left join public.client_permission_sets s on s.user_id = p.id
    where p.id = (select auth.uid())
  ), false);
$$;

revoke all on function public.client_page_visible(text, uuid) from public, anon;
grant execute on function public.client_page_visible(text, uuid) to authenticated;

-- save_client_permissions: migrate status check (role fix already done in migration 2)
create or replace function public.save_client_permissions(
  p_actor_id   uuid,
  p_user_id    uuid,
  p_permissions jsonb,
  p_revision   integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  prior         public.client_permission_sets%rowtype;
  next_revision integer;
  page_name     text;
  action_name   text;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id
      and role in ('administrator', 'sub_administrator')
      and status = 'active'
  ) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  perform 1 from public.profiles
  where id = p_user_id and role = 'client' and client_id is not null
  for update;
  if not found then
    raise exception 'Linked client account not found' using errcode = '22023';
  end if;

  if jsonb_typeof(p_permissions) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_permissions)) <> 12 then
    raise exception 'Invalid permissions' using errcode = '22023';
  end if;

  foreach page_name in array array[
    'dashboard','overview','quotations','fees','requirements','statements',
    'poa','projects','notifications','customer-service','invoices','settings'
  ] loop
    if jsonb_typeof(p_permissions->page_name) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(p_permissions->page_name)) <> 5 then
      raise exception 'Invalid page permissions' using errcode = '22023';
    end if;
    foreach action_name in array array['view','add','edit','update','delete'] loop
      if jsonb_typeof(p_permissions->page_name->action_name) is distinct from 'boolean' then
        raise exception 'Invalid action permissions' using errcode = '22023';
      end if;
      if action_name <> 'view'
        and (p_permissions->page_name->>action_name)::boolean
        and not (p_permissions->page_name->>'view')::boolean then
        raise exception 'View permission is required' using errcode = '22023';
      end if;
    end loop;
    if (p_permissions->page_name->>'update')::boolean
      and not (p_permissions->page_name->>'edit')::boolean then
      raise exception 'Edit permission is required to update' using errcode = '22023';
    end if;
    if page_name in ('dashboard','overview','invoices')
      and (
        (p_permissions->page_name->>'add')::boolean or
        (p_permissions->page_name->>'edit')::boolean or
        (p_permissions->page_name->>'update')::boolean or
        (p_permissions->page_name->>'delete')::boolean
      ) then
      raise exception 'This page is read-only' using errcode = '22023';
    end if;
    if page_name = 'settings'
      and (
        (p_permissions->page_name->>'add')::boolean or
        (p_permissions->page_name->>'delete')::boolean
      ) then
      raise exception 'Invalid settings actions' using errcode = '22023';
    end if;
  end loop;

  select * into prior from public.client_permission_sets where user_id = p_user_id;
  if coalesce(prior.revision, 0) <> p_revision then
    raise exception 'Permissions changed. Reload before saving.' using errcode = '40001';
  end if;

  next_revision := coalesce(prior.revision, 0) + 1;

  insert into public.client_permission_sets (user_id, permissions, revision, updated_by)
  values (p_user_id, p_permissions, next_revision, p_actor_id)
  on conflict (user_id) do update set
    permissions = excluded.permissions,
    revision    = excluded.revision,
    updated_by  = excluded.updated_by,
    updated_at  = now();

  insert into public.client_permission_audit
    (user_id, actor_id, before_permissions, after_permissions, revision)
  values
    (p_user_id, p_actor_id, prior.permissions, p_permissions, next_revision);

  return next_revision;
end $$;

revoke all on function public.save_client_permissions(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_client_permissions(uuid, uuid, jsonb, integer) to service_role;

-- save_shared_spreadsheet: migrate status check
create or replace function public.save_shared_spreadsheet(p_workbook jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_revision bigint;
  next_revision    bigint;
  actor_id         uuid := (select auth.uid());
begin
  if actor_id is null or not exists (
    select 1 from public.profiles
    where id = actor_id
      and role = 'administrator'
      and status = 'active'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_workbook) is distinct from 'object'
    or jsonb_typeof(p_workbook->'sheets') is distinct from 'array' then
    raise exception 'Invalid spreadsheet workbook' using errcode = '22023';
  end if;
  if jsonb_array_length(p_workbook->'sheets') = 0 then
    raise exception 'A workbook must contain at least one worksheet' using errcode = '22023';
  end if;

  select revision into current_revision
  from public.spreadsheet_workbooks
  where id = true
  for update;

  if not found then
    raise exception 'Shared spreadsheet has not been initialized' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'The shared workbook changed in another session. Reload before saving.' using errcode = '40001';
  end if;

  next_revision := current_revision + 1;

  update public.spreadsheet_workbooks
  set workbook   = p_workbook,
      revision   = next_revision,
      updated_by = actor_id,
      updated_at = now()
  where id = true;

  return next_revision;
end $$;

revoke all on function public.save_shared_spreadsheet(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to service_role;

-- approve_existing_client_registration: also set profiles.status = 'active'
create or replace function public.approve_existing_client_registration(
  p_user_id          uuid,
  p_administrator_id uuid,
  p_claim_id         uuid,
  p_email            text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim              public.client_registration_claims;
  invitation         public.client_invitations;
  approved_client_id uuid;
  now_at             timestamptz := now();
begin
  select * into claim
  from public.client_registration_claims
  where id = p_claim_id and email = lower(trim(p_email))
  for update;

  if claim.id is null or claim.consumed_at is null or claim.claimed_by <> p_user_id then
    raise exception 'The company invitation claim does not belong to this user.';
  end if;

  select * into invitation
  from public.client_invitations
  where id = claim.invitation_id and client_id = claim.client_id and email = claim.email
  for update;

  if invitation.id is null or invitation.consumed_at is null
     or invitation.claimed_by <> p_user_id or invitation.revoked_at is not null then
    raise exception 'The company invitation does not belong to this user.';
  end if;

  if exists (
    select 1 from public.profiles
    where client_id = claim.client_id and id <> p_user_id and approval_status = 'approved'
  ) then
    raise exception 'This client already has an approved account.';
  end if;

  insert into public.client_memberships
    (client_id, user_id, membership_role, status, approved_by, approved_at)
  values
    (claim.client_id, p_user_id, 'company_admin', 'approved', p_administrator_id, now_at)
  on conflict (client_id, user_id) do update set
    membership_role = excluded.membership_role,
    status          = 'approved',
    approved_by     = excluded.approved_by,
    approved_at     = excluded.approved_at;

  update public.profiles set
    client_id       = claim.client_id,
    approval_status = 'approved',   -- keep for backward compat
    account_status  = 'active',     -- keep for backward compat
    status          = 'active',     -- unified status
    approved_at     = now_at,
    approved_by     = p_administrator_id,
    reviewed_at     = now_at,
    reviewed_by     = p_administrator_id
  where id = p_user_id;

  insert into public.audit_logs
    (actor_id, entity_type, entity_id, action, before_data, after_data)
  values
    (p_administrator_id, 'user_approval', p_user_id, 'update',
     jsonb_build_object('approval_status', 'pending', 'status', 'pending'),
     jsonb_build_object('approval_status', 'approved', 'status', 'active', 'client_id', claim.client_id));

  approved_client_id := claim.client_id;
  return approved_client_id;
end $$;

revoke all on function public.approve_existing_client_registration(uuid, uuid, uuid, text) from public;
grant execute on function public.approve_existing_client_registration(uuid, uuid, uuid, text) to service_role;
