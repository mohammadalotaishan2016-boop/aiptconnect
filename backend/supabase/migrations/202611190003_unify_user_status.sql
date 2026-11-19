-- Replace the two-column status model (approval_status + account_status + locked_at)
-- with a single unified status column on profiles.
--
-- Approved mapping (2026-11-19):
--   locked_at IS NOT NULL                            → locked   (checked first)
--   approval_status = 'pending'                      → pending
--   approval_status = 'suspended'                    → suspended
--   approval_status = 'rejected'                     → deactivated
--   approval_status = 'approved', account_status = 'active'   → active
--   approval_status = 'approved', account_status = 'inactive' → deactivated
--   anything else                                    → pending  (safe fallback)
--
-- OLD COLUMNS ARE KEPT for backward compatibility until all app code is migrated.
-- They will be dropped in a future migration after the app is updated.

-- ============================================================================
-- 1. Add status column (nullable first so we can backfill safely)
-- ============================================================================
alter table public.profiles
  add column if not exists status text;

-- ============================================================================
-- 2. Backfill status from existing columns
-- ============================================================================
update public.profiles
set status = case
  when locked_at is not null                                                  then 'locked'
  when approval_status = 'pending'                                            then 'pending'
  when approval_status = 'suspended'                                          then 'suspended'
  when approval_status = 'rejected'                                           then 'deactivated'
  when approval_status = 'approved' and account_status = 'active'            then 'active'
  when approval_status = 'approved' and account_status = 'inactive'          then 'deactivated'
  else 'pending'
end
where status is null;

-- ============================================================================
-- 3. Apply NOT NULL + CHECK + default
-- ============================================================================
alter table public.profiles
  alter column status set not null,
  alter column status set default 'pending';

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'deactivated', 'locked', 'deleted'));

-- ============================================================================
-- 4. Add updated_at + trigger (profiles was missing both)
-- ============================================================================
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- 5. Add max_devices
-- ============================================================================
alter table public.profiles
  add column if not exists max_devices integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_max_devices_check;

alter table public.profiles
  add constraint profiles_max_devices_check
  check (max_devices between 1 and 10);

-- ============================================================================
-- 6. Useful indexes for login and listing
-- ============================================================================
create index if not exists profiles_status_created_index
  on public.profiles (status, created_at desc);

create index if not exists profiles_role_status_index
  on public.profiles (role, status);

-- ============================================================================
-- 7. Update handle_new_user_profile trigger to also set status
-- ============================================================================
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_type text := coalesce(new.raw_user_meta_data ->> 'registration_type', 'new_company');
  claim_id  uuid;
  claim     public.client_registration_claims;
  invitation public.client_invitations;
  now_at    timestamptz := now();
begin
  if registration_type = 'existing_company' then
    claim_id := nullif(new.raw_user_meta_data ->> 'registration_claim_id', '')::uuid;

    select * into claim from public.client_registration_claims
    where id = claim_id and email = lower(trim(new.email)) for update;

    if claim.id is null or claim.consumed_at is not null or claim.expires_at <= now_at then
      raise exception 'The verified invitation claim is invalid or expired.';
    end if;

    select * into invitation from public.client_invitations
    where id = claim.invitation_id and client_id = claim.client_id and email = claim.email
    for update;

    if invitation.id is null or invitation.consumed_at is not null
       or invitation.revoked_at is not null or invitation.expires_at <= now_at then
      raise exception 'The client invitation is invalid or expired.';
    end if;

    if not exists (
      select 1 from public.clients
      where id = claim.client_id and status = 'Active' and deleted_at is null
    ) then
      raise exception 'The invited client is not active.';
    end if;

    insert into public.profiles
      (id, full_name, company_name, logo_url, role, client_id,
       status, approval_status, account_status)
    values
      (new.id,
       coalesce(new.raw_user_meta_data ->> 'full_name', ''),
       coalesce(new.raw_user_meta_data ->> 'company_name', ''),
       null, 'client', claim.client_id,
       'pending', 'pending', 'active')
    on conflict (id) do update set
      full_name       = excluded.full_name,
      company_name    = excluded.company_name,
      client_id       = excluded.client_id,
      status          = excluded.status,
      approval_status = excluded.approval_status;

    insert into public.client_memberships (client_id, user_id, membership_role, status)
    values (claim.client_id, new.id, 'company_admin', 'pending')
    on conflict (client_id, user_id) do update set status = 'pending';

    update public.client_registration_claims
    set consumed_at = now_at, claimed_by = new.id
    where id = claim.id;

    update public.client_invitations
    set consumed_at = now_at, claimed_by = new.id
    where id = invitation.id;

  else
    insert into public.profiles
      (id, full_name, company_name, logo_url, role,
       status, approval_status, account_status)
    values
      (new.id,
       coalesce(new.raw_user_meta_data ->> 'full_name', ''),
       coalesce(new.raw_user_meta_data ->> 'company_name', ''),
       null, 'client',
       'pending', 'pending', 'active')
    on conflict (id) do update set
      full_name       = excluded.full_name,
      company_name    = excluded.company_name,
      logo_url        = excluded.logo_url,
      status          = excluded.status,
      approval_status = excluded.approval_status;
  end if;

  return new;
end;
$$;
