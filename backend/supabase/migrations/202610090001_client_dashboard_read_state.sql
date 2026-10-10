create table public.client_dashboard_read_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in (
    'schedule-of-fees',
    'quotations',
    'requirements',
    'statements',
    'poa',
    'projects',
    'notifications',
    'customer-service'
  )),
  last_read_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.client_dashboard_read_state enable row level security;
revoke all on public.client_dashboard_read_state from public, anon, authenticated;
grant all on public.client_dashboard_read_state to service_role;

create table public.client_dashboard_read_state_config (
  id boolean primary key default true check (id),
  tracking_started_at timestamptz not null default now()
);

insert into public.client_dashboard_read_state_config (id) values (true)
on conflict (id) do nothing;

alter table public.client_dashboard_read_state_config enable row level security;
revoke all on public.client_dashboard_read_state_config from public, anon, authenticated;
grant all on public.client_dashboard_read_state_config to service_role;
