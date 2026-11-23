-- RPC function: paginated, filterable, enriched tenant listing
-- Returns clients joined with profiles, devices, and client_invitations data.

-- Supporting indexes
create index if not exists idx_clients_email_lower_active
  on public.clients (lower(email)) where deleted_at is null;

create index if not exists idx_client_invitations_client_latest
  on public.client_invitations (client_id, created_at desc) where consumed_at is null;

create index if not exists idx_devices_user_active
  on public.devices (user_id) where status = 'active' and revoked_at is null;

create index if not exists idx_profiles_client_id
  on public.profiles (client_id) where client_id is not null;

-- Main function
create or replace function public.get_tenants_page(
  p_search       text    default null,
  p_status       text    default null,
  p_invitation   text    default null,
  p_device_usage text    default null,
  p_date_preset  text    default null,
  p_date_from    date    default null,
  p_date_to      date    default null,
  p_sort         text    default 'assigned_id',
  p_direction    text    default 'asc',
  p_page         integer default 1,
  p_page_size    integer default 10
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_offset     integer;
  v_date_from  timestamptz;
  v_date_to    timestamptz;
  v_result     jsonb;
begin
  -- Sanitize pagination
  p_page      := greatest(p_page, 1);
  p_page_size := least(greatest(p_page_size, 1), 100);
  v_offset    := (p_page - 1) * p_page_size;

  -- Resolve date preset
  if p_date_preset = 'today' then
    v_date_from := date_trunc('day', now());
    v_date_to   := now();
  elsif p_date_preset = 'last_7_days' then
    v_date_from := now() - interval '7 days';
    v_date_to   := now();
  elsif p_date_preset = 'last_30_days' then
    v_date_from := now() - interval '30 days';
    v_date_to   := now();
  else
    v_date_from := p_date_from;
    v_date_to   := p_date_to + interval '1 day' - interval '1 second';
  end if;

  with enriched as (
    select
      c.id,
      c.assigned_id,
      c.company_name,
      c.email,
      c.status,
      c.created_at,
      c.phone,
      c.client_type,
      c.address,
      c.country_id,
      c.fee_classification_id,
      c.notes,
      -- Linked profile data
      p.id as profile_id,
      p.max_devices,
      -- Count active devices for all users linked to this client
      coalesce(dev_count.cnt, 0)::integer as registered_devices,
      -- Compute invitation eligibility
      case
        when c.status <> 'Active' then 'inactive'
        when c.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'invalid_email'
        when auth_uid.uid is not null and (p.client_id is null or p.client_id <> c.id)
          then 'mismatch'
        when auth_uid.uid is not null and p.client_id = c.id
          then 'account_exists'
        when latest_inv.id is not null and latest_inv.revoked_at is not null
          then 'invitation_revoked'
        when latest_inv.id is not null and latest_inv.expires_at <= now()
          then 'invitation_expired'
        when latest_inv.id is not null
          then 'invitation_pending'
        else 'eligible'
      end as invitation_eligibility
    from public.clients c
    -- Latest linked profile (via client_id)
    left join lateral (
      select pr.id, pr.client_id, pr.max_devices
      from public.profiles pr
      where pr.client_id = c.id
      order by pr.created_at asc
      limit 1
    ) p on true
    -- Auth user lookup by email
    left join lateral (
      select public.find_auth_user_id_by_email(c.email) as uid
    ) auth_uid on true
    -- Active device count for all users linked to this client
    left join lateral (
      select count(*)::integer as cnt
      from public.devices d
      inner join public.profiles dp on dp.id = d.user_id
      where dp.client_id = c.id
        and d.status = 'active'
        and d.revoked_at is null
    ) dev_count on true
    -- Latest non-consumed invitation for this client
    left join lateral (
      select ci.id, ci.revoked_at, ci.expires_at
      from public.client_invitations ci
      where ci.client_id = c.id
        and ci.consumed_at is null
      order by ci.created_at desc
      limit 1
    ) latest_inv on true
    where c.deleted_at is null
  ),
  filtered as (
    select *
    from enriched e
    where
      -- Text search
      (p_search is null or p_search = '' or
        e.company_name ilike '%' || p_search || '%' or
        e.email ilike '%' || p_search || '%' or
        e.assigned_id::text = p_search or
        e.id::text = p_search
      )
      -- Status filter
      and (p_status is null or p_status = '' or e.status = p_status)
      -- Invitation eligibility filter
      and (p_invitation is null or p_invitation = '' or e.invitation_eligibility = p_invitation)
      -- Device usage filter
      and (p_device_usage is null or p_device_usage = '' or
        case p_device_usage
          when 'available' then e.registered_devices < coalesce(e.max_devices, 1)
          when 'fully_utilized' then e.registered_devices = coalesce(e.max_devices, 1)
          when 'exceeded' then e.registered_devices > coalesce(e.max_devices, 1)
          else true
        end
      )
      -- Date range filter
      and (v_date_from is null or e.created_at >= v_date_from)
      and (v_date_to is null or e.created_at <= v_date_to)
  ),
  summary as (
    select
      count(*) as total,
      count(*) filter (where status = 'Active') as active,
      count(*) filter (where invitation_eligibility = 'eligible') as eligible,
      count(*) filter (where invitation_eligibility = 'invitation_pending') as pending
    from filtered
  ),
  sorted as (
    select *
    from filtered
    order by
      case when p_direction = 'asc' then
        case p_sort
          when 'assigned_id'         then lpad(assigned_id::text, 10, '0')
          when 'company_name'        then lower(company_name)
          when 'email'               then lower(email)
          when 'created_at'          then to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
          when 'max_devices'         then lpad(coalesce(max_devices, 0)::text, 5, '0')
          when 'registered_devices'  then lpad(registered_devices::text, 5, '0')
          when 'status'              then lower(status)
          else lpad(assigned_id::text, 10, '0')
        end
      end asc nulls last,
      case when p_direction = 'desc' then
        case p_sort
          when 'assigned_id'         then lpad(assigned_id::text, 10, '0')
          when 'company_name'        then lower(company_name)
          when 'email'               then lower(email)
          when 'created_at'          then to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
          when 'max_devices'         then lpad(coalesce(max_devices, 0)::text, 5, '0')
          when 'registered_devices'  then lpad(registered_devices::text, 5, '0')
          when 'status'              then lower(status)
          else lpad(assigned_id::text, 10, '0')
        end
      end desc nulls last
    limit p_page_size offset v_offset
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'assigned_id', s.assigned_id,
      'company_name', s.company_name,
      'email', s.email,
      'status', s.status,
      'created_at', s.created_at,
      'phone', s.phone,
      'client_type', s.client_type,
      'address', s.address,
      'country_id', s.country_id,
      'fee_classification_id', s.fee_classification_id,
      'notes', s.notes,
      'profile_id', s.profile_id,
      'max_devices', s.max_devices,
      'registered_devices', s.registered_devices,
      'invitation_eligibility', s.invitation_eligibility
    )) from sorted s), '[]'::jsonb),
    'total', (select total from summary),
    'page', p_page,
    'page_size', p_page_size,
    'summary', (select jsonb_build_object(
      'total', total,
      'active', active,
      'eligible', eligible,
      'pending', pending
    ) from summary)
  ) into v_result;

  return v_result;
end;
$$;

-- Only service_role can call this function
revoke all on function public.get_tenants_page(text, text, text, text, text, date, date, text, text, integer, integer) from public;
grant execute on function public.get_tenants_page(text, text, text, text, text, date, date, text, text, integer, integer) to service_role;
