-- Keep existing S3 tutorials playable while new uploads use private Supabase Storage.
alter table public.video_tutorials
  add column if not exists storage_provider text not null default 's3'
    check (storage_provider in ('s3', 'supabase')),
  add column if not exists storage_path text;

alter table public.video_tutorials
  drop constraint if exists video_tutorials_s3_key_check;

alter table public.video_tutorials
  add constraint video_tutorials_storage_location_check
  check (
    (storage_provider = 's3' and s3_key like 'aiptvideotutorial/%' and storage_path is null)
    or
    (storage_provider = 'supabase' and storage_path is not null and storage_path <> '')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aipt-video-tutorials',
  'aipt-video-tutorials',
  false,
  1073741824,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
