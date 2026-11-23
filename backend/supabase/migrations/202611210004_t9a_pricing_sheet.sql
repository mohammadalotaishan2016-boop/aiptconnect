-- T9a: Pricing sheet grouped by client type
-- 1. Update clients.client_type to new values (chinese, non_chinese, direct)
-- 2. Create pricing_sheet table with 21 rows (3 groups x 7 items)
-- 3. Add pricing snapshot columns to quotations

-- ============================================================
-- 1a. Null out old client_type values so admin can reassign
-- ============================================================
update public.clients
set client_type = null
where client_type in ('Corporate', 'Law Firm', 'Consultant', 'Individual');

-- 1b. Drop old CHECK, add new one
-- Column is already nullable (migration 202611200009)
alter table public.clients
  drop constraint if exists clients_client_type_check;

alter table public.clients
  add constraint clients_client_type_check
  check (client_type is null or client_type in ('chinese', 'non_chinese', 'direct'));

-- ============================================================
-- 2. Create pricing_sheet table
-- ============================================================
create table if not exists public.pricing_sheet (
  id           uuid primary key default gen_random_uuid(),
  client_type  varchar(20) not null
    check (client_type in ('chinese', 'non_chinese', 'direct')),
  item_key     varchar(30) not null
    check (item_key in (
      'trademark', 'patent', 'design', 'copyright',
      'up_to_3_classes', 'up_to_5_classes', 'multi_classes'
    )),
  official_fee numeric(12, 2) not null default 0 check (official_fee >= 0),
  attorney_fee numeric(12, 2) not null default 0 check (attorney_fee >= 0),
  total_fee    numeric(12, 2) not null default 0 check (total_fee >= 0),
  currency     varchar(10) not null default 'USD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  unique (client_type, item_key)
);

drop trigger if exists pricing_sheet_set_updated_at on public.pricing_sheet;
create trigger pricing_sheet_set_updated_at
  before update on public.pricing_sheet
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================
alter table public.pricing_sheet enable row level security;
revoke all on public.pricing_sheet from public, anon;
grant select on public.pricing_sheet to authenticated;
grant all on public.pricing_sheet to service_role;

-- Admin full CRUD
create policy pricing_sheet_admin_all
on public.pricing_sheet for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'administrator'
      and account_status = 'active'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'administrator'
      and account_status = 'active'
  )
);

-- Authenticated read (for quotation pricing lookups)
create policy pricing_sheet_authenticated_read
on public.pricing_sheet for select to authenticated
using (true);

-- ============================================================
-- 4. Seed 21 rows (3 groups x 7 items) with zero fees
-- ============================================================
insert into public.pricing_sheet (client_type, item_key)
values
  ('chinese', 'trademark'),
  ('chinese', 'patent'),
  ('chinese', 'design'),
  ('chinese', 'copyright'),
  ('chinese', 'up_to_3_classes'),
  ('chinese', 'up_to_5_classes'),
  ('chinese', 'multi_classes'),
  ('non_chinese', 'trademark'),
  ('non_chinese', 'patent'),
  ('non_chinese', 'design'),
  ('non_chinese', 'copyright'),
  ('non_chinese', 'up_to_3_classes'),
  ('non_chinese', 'up_to_5_classes'),
  ('non_chinese', 'multi_classes'),
  ('direct', 'trademark'),
  ('direct', 'patent'),
  ('direct', 'design'),
  ('direct', 'copyright'),
  ('direct', 'up_to_3_classes'),
  ('direct', 'up_to_5_classes'),
  ('direct', 'multi_classes')
on conflict (client_type, item_key) do nothing;

-- ============================================================
-- 5. Add pricing snapshot columns to quotations
-- ============================================================
alter table public.quotations
  add column if not exists pricing_client_type varchar(20)
    check (pricing_client_type is null or pricing_client_type in ('chinese', 'non_chinese', 'direct'));

alter table public.quotations
  add column if not exists pricing_snapshot jsonb;

comment on column public.quotations.pricing_client_type is
  'Client type at the time the quotation was priced.';
comment on column public.quotations.pricing_snapshot is
  'Frozen copy of the 7 pricing_sheet rows used for this quotation.';
