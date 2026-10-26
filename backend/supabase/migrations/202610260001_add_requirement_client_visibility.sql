alter table public.requirements
  add column if not exists client_visible boolean not null default true;

comment on column public.requirements.client_visible is
  'When false, the requirement is excluded from client-facing requirement lists and quotation lookups.';
