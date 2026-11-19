-- Document tables that exist in the live database but have no migration file.
-- Every CREATE TABLE is IF NOT EXISTS: a no-op on the live database.
-- Running this on a fresh staging database will reproduce the full schema.

-- ============================================================================
-- fee_classifications
-- Referenced by clients.fee_classification_id. Created directly in live DB.
-- ============================================================================
create table if not exists public.fee_classifications (
  id              uuid          primary key default gen_random_uuid(),
  description     varchar       not null,
  color_indication text         not null,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists fee_classifications_description_active_unique
  on public.fee_classifications (lower(description)) where deleted_at is null;

drop trigger if exists fee_classifications_set_updated_at on public.fee_classifications;
create trigger fee_classifications_set_updated_at
  before update on public.fee_classifications
  for each row execute procedure public.set_updated_at();

alter table public.fee_classifications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fee_classifications'
      and policyname = 'authenticated users can read fee classifications'
  ) then
    execute $$
      create policy "authenticated users can read fee classifications"
        on public.fee_classifications for select to authenticated
        using (deleted_at is null)
    $$;
  end if;
end $$;

-- ============================================================================
-- customer_service_attachments
-- File attachments linked to customer service messages.
-- ============================================================================
create table if not exists public.customer_service_attachments (
  id          uuid    primary key default gen_random_uuid(),
  message_id  uuid    not null references public.customer_service_messages(id) on delete cascade,
  object_key  text    not null unique,
  file_name   varchar not null,
  file_size   integer not null,
  file_type   varchar not null,
  is_image    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists customer_service_attachments_message_index
  on public.customer_service_attachments (message_id);

alter table public.customer_service_attachments enable row level security;

-- ============================================================================
-- customer_service_read_state
-- Tracks per-user, per-ticket read position and typing indicator.
-- ============================================================================
create table if not exists public.customer_service_read_state (
  ticket_id    uuid        not null references public.customer_service_tickets(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  typing_until timestamptz,
  primary key (ticket_id, user_id)
);

alter table public.customer_service_read_state enable row level security;

-- ============================================================================
-- fee_claiming_priority_values
-- Priority / claiming fees per dataset version and country.
-- ============================================================================
create table if not exists public.fee_claiming_priority_values (
  id                 uuid      primary key default gen_random_uuid(),
  dataset_version_id uuid      not null references public.fee_dataset_versions(id) on delete cascade,
  country_id         uuid      not null references public.countries(id) on delete cascade,
  official_fee       numeric,
  attorney_fee       numeric,
  total_fee          numeric,
  currency           text      not null default 'USD',
  source_sheet       text      not null default 'Classes',
  source_row         integer,
  source_values      jsonb     not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (dataset_version_id, country_id)
);

create index if not exists fee_claiming_priority_values_dataset_idx
  on public.fee_claiming_priority_values (dataset_version_id);
create index if not exists fee_claiming_priority_values_country_idx
  on public.fee_claiming_priority_values (country_id);

alter table public.fee_claiming_priority_values enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fee_claiming_priority_values' and policyname='fee_claiming_priority_authenticated_read') then
    execute $p$
      create policy fee_claiming_priority_authenticated_read
        on public.fee_claiming_priority_values for select to authenticated
        using (exists (
          select 1 from public.fee_dataset_versions v
          where v.id = fee_claiming_priority_values.dataset_version_id and v.status = 'published'
        ))
    $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fee_claiming_priority_values' and policyname='fee_claiming_priority_admin_all') then
    execute $p$
      create policy fee_claiming_priority_admin_all
        on public.fee_claiming_priority_values for all to authenticated
        using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator'))
    $p$;
  end if;
end $$;

-- ============================================================================
-- fee_class_values
-- Per-class fee values for a given dataset version and country.
-- ============================================================================
create table if not exists public.fee_class_values (
  id                 uuid      primary key default gen_random_uuid(),
  dataset_version_id uuid      not null references public.fee_dataset_versions(id) on delete cascade,
  country_id         uuid      not null references public.countries(id) on delete cascade,
  class_number       smallint  not null,
  total_fee          numeric,
  currency           text      not null default 'USD',
  source_sheet       text      not null default 'Classes',
  source_row         integer,
  source_values      jsonb     not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  official_fee       numeric,
  attorney_fee       numeric,
  unique (dataset_version_id, country_id, class_number)
);

create index if not exists fee_class_values_dataset_idx on public.fee_class_values (dataset_version_id);
create index if not exists fee_class_values_country_idx on public.fee_class_values (country_id);

alter table public.fee_class_values enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fee_class_values' and policyname='fee_class_values_authenticated_read') then
    execute $p$
      create policy fee_class_values_authenticated_read
        on public.fee_class_values for select to authenticated
        using (exists (
          select 1 from public.fee_dataset_versions v
          where v.id = fee_class_values.dataset_version_id and v.status = 'published'
        ))
    $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fee_class_values' and policyname='fee_class_values_admin_all') then
    execute $p$
      create policy fee_class_values_admin_all
        on public.fee_class_values for all to authenticated
        using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'administrator'))
    $p$;
  end if;
end $$;

-- ============================================================================
-- spreadsheet_workbook_versions
-- Version history for the shared fee spreadsheet.
-- ============================================================================
create table if not exists public.spreadsheet_workbook_versions (
  revision bigint      primary key,
  workbook jsonb       not null,
  saved_by uuid        references public.profiles(id),
  saved_at timestamptz not null default now()
);

alter table public.spreadsheet_workbook_versions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='spreadsheet_workbook_versions' and policyname='spreadsheet_workbook_versions_read_admin') then
    execute $p$
      create policy spreadsheet_workbook_versions_read_admin
        on public.spreadsheet_workbook_versions for select to authenticated
        using (exists (
          select 1 from public.profiles
          where id = (select auth.uid())
            and role = 'administrator'
            and account_status = 'active'
        ))
    $p$;
  end if;
end $$;
-- Note: account_status check above will be migrated to status='active' in 202611190005.
