alter table public.quotation_items
  alter column fee_value_id drop not null;

alter table public.quotation_items
  drop constraint if exists quotation_items_class_type_check;

alter table public.quotation_items
  add constraint quotation_items_class_type_check
  check (class_type is null or class_type in (
    'Single', 'Multi', 'Per Mark', 'Per Class', 'Per mark per class',
    'Multi-class', 'Up to 3 classes', 'Up to 5 classes'
  ));

update public.quotation_items
set class_type = 'Per mark per class'
where category = 'Trademark'
  and (class_type is null or class_type in ('Single', 'Multi'));

alter table public.quotations
  add column if not exists spreadsheet_revision bigint
    check (spreadsheet_revision is null or spreadsheet_revision > 0);

comment on column public.quotations.spreadsheet_revision is
  'Saved fee workbook revision used to calculate this quotation.';
