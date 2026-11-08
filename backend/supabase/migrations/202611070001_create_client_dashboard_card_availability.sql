create table if not exists public.client_dashboard_card_availability (
  card_key text primary key check (card_key in (
    'quotations', 'schedule-of-fees', 'requirements', 'statements',
    'poa', 'projects', 'notifications', 'customer-service'
  )),
  is_available boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.client_dashboard_card_availability enable row level security;
revoke all on public.client_dashboard_card_availability from public, anon, authenticated;
grant select, insert, update on public.client_dashboard_card_availability to service_role;

insert into public.client_dashboard_card_availability (card_key, is_available)
values
  ('quotations', true), ('schedule-of-fees', true), ('requirements', true),
  ('statements', true), ('poa', true), ('projects', true),
  ('notifications', true), ('customer-service', true)
on conflict (card_key) do nothing;
