alter table public.procedures
  add column if not exists client_visible boolean not null default true;

comment on column public.procedures.client_visible is
  'When false, the procedure is excluded from client-facing procedure, requirement, and quotation views.';
