do $$
declare
  current_workbook jsonb;
  fees_workbook jsonb;
  next_revision bigint;
begin
  select workbook
  into current_workbook
  from public.spreadsheet_workbooks
  where id = true
  for update;

  if not found then
    raise exception 'Shared spreadsheet has not been initialized';
  end if;

  with source_sheets as (
    select
      sheet,
      ordinal,
      case
        when normalized_name in ('trademark', 'sheet1') then 'Trademark'
        when normalized_name = 'patent' then 'Patent'
        when normalized_name = 'design' then 'Design'
        when normalized_name = 'copyright' then 'Copyright'
        when normalized_name in ('upto3classes', 'upto3class', '3classes') then 'Up to 3 classes'
        when normalized_name in ('upto5classes', 'upto5class', '5classes') then 'Up to 5 classes'
        when normalized_name in ('multiclass', 'multiclasses') then 'Multi-classes'
        else null
      end as fee_name
    from (
      select
        item as sheet,
        ordinality as ordinal,
        regexp_replace(lower(coalesce(item->>'name', '')), '[^a-z0-9]', '', 'g') as normalized_name
      from jsonb_array_elements(current_workbook->'sheets') with ordinality as existing(item, ordinality)
    ) normalized
  ),
  fee_tabs(name, sort_order, slug) as (
    values
      ('Trademark', 1, 'trademark'),
      ('Patent', 2, 'patent'),
      ('Design', 3, 'design'),
      ('Copyright', 4, 'copyright'),
      ('Up to 3 classes', 5, 'up-to-3-classes'),
      ('Up to 5 classes', 6, 'up-to-5-classes'),
      ('Multi-classes', 7, 'multi-classes')
  ),
  chosen_tabs as (
    select distinct on (tabs.sort_order)
      tabs.name,
      tabs.sort_order,
      source.ordinal,
      source.sheet
    from fee_tabs tabs
    left join source_sheets source on source.fee_name = tabs.name
    order by tabs.sort_order, source.ordinal nulls last
  ),
  workbook_tabs as (
    select
      sort_order,
      case
        when sheet is not null then jsonb_set(sheet, '{name}', to_jsonb(name), true)
        else jsonb_build_object(
          'id', 'fee-' || slug,
          'name', name,
          'cells', '{}'::jsonb,
          'types', '{}'::jsonb,
          'styles', '{}'::jsonb,
          'widths', '{}'::jsonb
        )
      end as sheet
    from chosen_tabs
    join fee_tabs using (name, sort_order)

    union all

    select 100 + source.ordinal as sort_order, source.sheet
    from source_sheets source
    where not exists (
      select 1
      from chosen_tabs chosen
      where chosen.ordinal = source.ordinal
    )
  )
  select jsonb_build_object('sheets', jsonb_agg(sheet order by sort_order))
  into fees_workbook
  from workbook_tabs;

  if fees_workbook is distinct from current_workbook then
    update public.spreadsheet_workbooks
    set workbook = fees_workbook,
        revision = revision + 1,
        updated_at = now()
    where id = true
    returning revision into next_revision;

    insert into public.spreadsheet_workbook_versions (revision, workbook, saved_by)
    select next_revision, fees_workbook, updated_by
    from public.spreadsheet_workbooks
    where id = true;
  end if;
end;
$$;
