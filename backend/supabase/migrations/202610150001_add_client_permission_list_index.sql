-- Keep the administrator client-login scan ordered by id without scanning
-- unrelated profiles. client_id is required by the roles list endpoint.
create index if not exists profiles_linked_role_id_idx
  on public.profiles (role, id)
  where client_id is not null;

create or replace function public.list_client_permission_targets(
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  full_name text,
  company_name text,
  approval_status text,
  account_status text,
  client jsonb,
  email text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with candidates as (
    select
      p.id,
      p.full_name,
      p.company_name,
      p.approval_status,
      p.account_status,
      jsonb_build_object('company_name', c.company_name, 'email', c.email) as client,
      coalesce(c.email, '') as email
    from public.profiles p
    left join public.clients c on c.id = p.client_id and c.deleted_at is null
    where p.role = 'client'
      and p.client_id is not null
      and (
        nullif(btrim(p_search), '') is null
        or strpos(lower(concat_ws(' ', p.full_name, p.company_name, c.company_name, c.email)), lower(btrim(p_search))) > 0
      )
  ), counted as (
    select candidates.*, count(*) over () as total_count
    from candidates
  )
  select counted.id, counted.full_name, counted.company_name,
         counted.approval_status, counted.account_status, counted.client,
         counted.email, counted.total_count
  from counted
  order by counted.id
  offset ((greatest(p_page, 1) - 1) * least(100, greatest(1, p_page_size)))
  limit least(100, greatest(1, p_page_size));
$$;

revoke all on function public.list_client_permission_targets(text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_client_permission_targets(text, integer, integer) to service_role;
