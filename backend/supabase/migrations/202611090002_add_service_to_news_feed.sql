alter table public.news_feed
  add column if not exists service_id uuid references public.services(id);

create index if not exists news_feed_service_active_index
  on public.news_feed(service_id)
  where deleted_at is null;
