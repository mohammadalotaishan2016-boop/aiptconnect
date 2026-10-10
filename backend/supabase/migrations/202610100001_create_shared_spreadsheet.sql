create table public.spreadsheet_workbooks (
  id boolean primary key default true check (id),
  workbook jsonb not null check (
    jsonb_typeof(workbook) = 'object'
    and case
      when jsonb_typeof(workbook->'sheets') = 'array'
      then jsonb_array_length(workbook->'sheets') > 0
      else false
    end
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.spreadsheet_workbooks (id, workbook, updated_by)
values (
  true,
  '{"sheets":[{"id":"sheet-1","name":"Sheet1","cells":{},"types":{},"styles":{},"widths":{}},{"id":"sheet-2","name":"Sheet2","cells":{},"types":{},"styles":{},"widths":{}},{"id":"sheet-3","name":"Sheet3","cells":{},"types":{},"styles":{},"widths":{}}]}'::jsonb,
  null
);

alter table public.spreadsheet_workbooks enable row level security;
revoke all on public.spreadsheet_workbooks from public, anon, authenticated;
grant select on public.spreadsheet_workbooks to authenticated;
grant all on public.spreadsheet_workbooks to service_role;

create policy spreadsheet_workbooks_read_admin
on public.spreadsheet_workbooks for select to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'administrator'
      and account_status = 'active'
  )
);

create or replace function public.save_shared_spreadsheet(p_workbook jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_revision bigint;
  next_revision bigint;
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not exists (
    select 1
    from public.profiles
    where id = actor_id
      and role = 'administrator'
      and account_status = 'active'
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
  set workbook = p_workbook,
      revision = next_revision,
      updated_by = actor_id,
      updated_at = now()
  where id = true;

  return next_revision;
end;
$$;

revoke all on function public.save_shared_spreadsheet(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to service_role;
