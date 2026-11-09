create table if not exists public.news_feed (
  id uuid primary key default gen_random_uuid(),
  title varchar(160) not null check (char_length(trim(title)) between 1 and 160),
  description varchar(5000) not null check (char_length(trim(description)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.news_feed_countries (
  news_feed_id uuid not null references public.news_feed(id) on delete cascade,
  country_id uuid not null references public.countries(id),
  primary key (news_feed_id, country_id)
);

create index if not exists news_feed_active_created_index on public.news_feed(created_at desc) where deleted_at is null;
drop trigger if exists news_feed_set_updated_at on public.news_feed;
create trigger news_feed_set_updated_at before update on public.news_feed for each row execute procedure public.set_updated_at();

alter table public.news_feed enable row level security;
alter table public.news_feed_countries enable row level security;
create policy "authenticated users can read active news feed" on public.news_feed for select to authenticated using (deleted_at is null);
create policy "authenticated users can read news feed countries" on public.news_feed_countries for select to authenticated using (true);
