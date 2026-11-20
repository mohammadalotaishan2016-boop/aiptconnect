-- Update handle_new_user_profile to persist phone and address from metadata.
-- Previously these were stored only in auth.users.raw_user_meta_data.
-- After this migration they are also written to profiles.phone and profiles.address.

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
      (id, full_name, company_name, logo_url, role, client_id, phone, address,
       status, approval_status, account_status)
    values
      (new.id,
       coalesce(new.raw_user_meta_data ->> 'full_name', ''),
       coalesce(new.raw_user_meta_data ->> 'company_name', ''),
       null, 'client', claim.client_id,
       nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
       coalesce(new.raw_user_meta_data ->> 'address', ''),
       'pending', 'pending', 'active')
    on conflict (id) do update set
      full_name       = excluded.full_name,
      company_name    = excluded.company_name,
      client_id       = excluded.client_id,
      phone           = excluded.phone,
      address         = excluded.address,
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
    -- Self-registration: always role = 'client', status = 'pending'
    insert into public.profiles
      (id, full_name, company_name, logo_url, role, phone, address,
       status, approval_status, account_status)
    values
      (new.id,
       coalesce(new.raw_user_meta_data ->> 'full_name', ''),
       coalesce(new.raw_user_meta_data ->> 'company_name', ''),
       null, 'client',
       nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
       coalesce(new.raw_user_meta_data ->> 'address', ''),
       'pending', 'pending', 'active')
    on conflict (id) do update set
      full_name       = excluded.full_name,
      company_name    = excluded.company_name,
      logo_url        = excluded.logo_url,
      phone           = excluded.phone,
      address         = excluded.address,
      status          = excluded.status,
      approval_status = excluded.approval_status;
  end if;

  return new;
end;
$$;
