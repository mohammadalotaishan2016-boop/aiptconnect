create or replace function public.save_shared_spreadsheet(p_workbook jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_workbook jsonb;
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

  select revision, workbook into current_revision, current_workbook
  from public.spreadsheet_workbooks
  where id = true
  for update;

  if not found then
    raise exception 'Shared spreadsheet has not been initialized' using errcode = 'P0002';
  end if;

  if p_workbook = current_workbook then
    return current_revision;
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

  insert into public.spreadsheet_workbook_versions (revision, workbook, saved_by)
  values (next_revision, p_workbook, actor_id);

  return next_revision;
end;
$$;

revoke all on function public.save_shared_spreadsheet(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to authenticated;
grant execute on function public.save_shared_spreadsheet(jsonb, bigint) to service_role;
