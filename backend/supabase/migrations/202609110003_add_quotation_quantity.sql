alter table public.quotation_items
  add column if not exists quantity integer not null default 1 check (quantity >= 1);

alter table public.quotation_items
  drop constraint if exists quotation_items_class_type_check;

alter table public.quotation_items
  add constraint quotation_items_class_type_check
  check (class_type is null or class_type in ('Per Mark', 'Per Class', 'Single', 'Multi', 'Multi-class', 'Per mark per class'));