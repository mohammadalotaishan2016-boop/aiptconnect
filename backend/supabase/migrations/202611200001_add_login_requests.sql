-- login_requests: holds pending device-approval sessions.
-- Service-role only: access tokens are stored here temporarily until
-- the existing device approves or denies the new device.

create table if not exists public.login_requests (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references public.profiles(id) on delete cascade,
  device_fingerprint    text        not null check (char_length(trim(device_fingerprint)) between 1 and 500),
  user_agent            text,
  ip                    inet,
  status                text        not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  -- Stored temporarily; cleared after use or expiry
  session_access_token  text,
  session_refresh_token text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default (now() + interval '5 minutes'),
  resolved_at           timestamptz
);

create index if not exists login_requests_user_pending_idx
  on public.login_requests (user_id, created_at desc)
  where status = 'pending';

create index if not exists login_requests_expires_idx
  on public.login_requests (expires_at)
  where status = 'pending';

alter table public.login_requests enable row level security;

-- Service role only — session tokens must not be client-readable
revoke all on public.login_requests from public, anon, authenticated;
grant all on public.login_requests to service_role;

-- pg_cron: expire pending requests older than their expires_at every minute
select cron.unschedule('cleanup-expired-login-requests')
  from cron.job
 where jobname = 'cleanup-expired-login-requests';

select cron.schedule(
  'cleanup-expired-login-requests',
  '* * * * *',
  $$
    update public.login_requests
       set status = 'expired', resolved_at = now()
     where status = 'pending'
       and expires_at < now();
  $$
);
