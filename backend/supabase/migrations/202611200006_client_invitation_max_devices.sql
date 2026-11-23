-- Add max_devices to client_invitations so the administrator can pre-configure
-- the device limit for newly invited client users.
-- Also updates handle_new_user_profile() to persist max_devices from the invitation.

alter table public.client_invitations
  add column if not exists max_devices integer not null default 1
    check (max_devices between 1 and 10);

-- Update the new-user trigger to pick up max_devices from the invitation.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_type text := coalesce(new.raw_user_meta_data ->> 'registration_type', 'new_company');
  claim_id uuid;
  claim public.client_registration_claims;
  invitation public.client_invitations;
  now_at timestamptz := now();
  phone_val text;
  address_val text;
begin
  phone_val  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  address_val := nullif(trim(coalesce(new.raw_user_meta_data ->> 'address', '')), '');

  if registration_type = 'existing_company' then
    claim_id := nullif(new.raw_user_meta_data ->> 'registration_claim_id', '')::uuid;
    select * into claim from public.client_registration_claims
      where id = claim_id and email = lower(trim(new.email)) for update;
    if claim.id is null or claim.consumed_at is not null or claim.expires_at <= now_at then
      raise exception 'The verified invitation claim is invalid or expired.';
    end if;
    select * into invitation from public.client_invitations
      where id = claim.invitation_id and client_id = claim.client_id and email = claim.email for update;
    if invitation.id is null or invitation.consumed_at is not null
       or invitation.revoked_at is not null or invitation.expires_at <= now_at then
      raise exception 'The client invitation is invalid or expired.';
    end if;
    if not exists (select 1 from public.clients where id = claim.client_id and status = 'Active' and deleted_at is null) then
      raise exception 'The invited client is not active.';
    end if;

    insert into public.profiles (id, full_name, company_name, logo_url, role, client_id, phone, address, max_devices)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'company_name', ''),
      null,
      'client',
      claim.client_id,
      phone_val,
      address_val,
      coalesce(invitation.max_devices, 1)
    )
    on conflict (id) do update set
      full_name   = excluded.full_name,
      company_name = excluded.company_name,
      client_id   = excluded.client_id,
      phone       = coalesce(excluded.phone, profiles.phone),
      address     = coalesce(excluded.address, profiles.address),
      max_devices = excluded.max_devices;

    insert into public.client_memberships (client_id, user_id, membership_role, status)
    values (claim.client_id, new.id, 'company_admin', 'pending')
    on conflict (client_id, user_id) do update set status = 'pending';

    update public.client_registration_claims set consumed_at = now_at, claimed_by = new.id where id = claim.id;
    update public.client_invitations set consumed_at = now_at, claimed_by = new.id where id = invitation.id;
  else
    insert into public.profiles (id, full_name, company_name, logo_url, role, phone, address)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'company_name', ''),
      null,
      'client',
      phone_val,
      address_val
    )
    on conflict (id) do update set
      full_name    = excluded.full_name,
      company_name = excluded.company_name,
      logo_url     = excluded.logo_url,
      phone        = coalesce(excluded.phone, profiles.phone),
      address      = coalesce(excluded.address, profiles.address);
  end if;
  return new;
end;
$$;
