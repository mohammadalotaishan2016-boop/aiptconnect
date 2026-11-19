-- Add sub_administrator as a first-class application role.
-- Role mapping (approved 2026-11-19):
--   administrator  → administrator     (unchanged)
--   client         → client            (unchanged)
--   user           → sub_administrator (0 live rows at time of writing)
--   associate      → flagged for manual review; temporarily mapped to 'client'

-- ============================================================================
-- 1. Update the role CHECK constraint on profiles
-- ============================================================================
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('administrator', 'client', 'sub_administrator'));

-- ============================================================================
-- 2. Migrate existing non-standard roles
-- ============================================================================

-- user → sub_administrator
update public.profiles set role = 'sub_administrator' where role = 'user';

-- associate → 'client' (temporary); log for manual review
do $$
begin
  if exists (select 1 from public.profiles where role = 'associate') then
    -- Record each associate profile in audit_logs before changing it
    insert into public.audit_logs
      (actor_id, entity_type, entity_id, action, before_data, after_data)
    select
      id,
      'profile_role_review',
      id,
      'update',
      jsonb_build_object('role', 'associate', 'review_note', 'associate role flagged for manual review during T0 migration'),
      jsonb_build_object('role', 'client', 'review_note', 'temporarily mapped to client; administrator must assign correct role')
    from public.profiles
    where role = 'associate';

    update public.profiles set role = 'client' where role = 'associate';

    raise notice 'ACTION REQUIRED: one or more profiles had role=associate and were mapped to client. Review audit_logs (entity_type=profile_role_review) and assign the correct role manually.';
  end if;
end $$;

-- ============================================================================
-- 3. Fix save_client_permissions: replace invalid 'admin' role with 'sub_administrator'
--    (status columns still use old schema; updated again in 202611190005)
-- ============================================================================
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
  prior       public.client_permission_sets%rowtype;
  next_revision integer;
  page_name   text;
  action_name text;
begin
  -- Allow administrator and sub_administrator (replaces erroneous 'admin' check)
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id
      and role in ('administrator', 'sub_administrator')
      and account_status = 'active'
      and approval_status = 'approved'
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

-- ============================================================================
-- 4. Update customer_service_messages sender_role check to include sub_administrator
-- ============================================================================
alter table public.customer_service_messages
  drop constraint if exists customer_service_messages_sender_role_check;

alter table public.customer_service_messages
  add constraint customer_service_messages_sender_role_check
  check (sender_role in ('client', 'administrator', 'sub_administrator'));
