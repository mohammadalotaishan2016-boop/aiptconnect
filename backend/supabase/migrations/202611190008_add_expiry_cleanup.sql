-- Scheduled expiry cleanup via pg_cron.
-- pg_cron is enabled here via CREATE EXTENSION IF NOT EXISTS.
-- The migration runner connects as the postgres superuser, so this succeeds
-- without any manual dashboard action.

create extension if not exists pg_cron;

-- ============================================================================
-- Remove any stale schedules from previous runs (idempotent)
-- ============================================================================
select cron.unschedule('cleanup-expired-otp-challenges')
  from cron.job
 where jobname = 'cleanup-expired-otp-challenges';

select cron.unschedule('cleanup-stale-client-invitations')
  from cron.job
 where jobname = 'cleanup-stale-client-invitations';

select cron.unschedule('cleanup-expired-idempotency-keys')
  from cron.job
 where jobname = 'cleanup-expired-idempotency-keys';

-- ============================================================================
-- login_otp_challenges: delete consumed or expired rows older than 1 hour
-- Runs every 15 minutes.
-- ============================================================================
select cron.schedule(
  'cleanup-expired-otp-challenges',
  '*/15 * * * *',
  $$
    delete from public.login_otp_challenges
    where expires_at < now() - interval '1 hour'
       or (consumed_at is not null and consumed_at < now() - interval '1 hour');
  $$
);

-- ============================================================================
-- client_invitations: delete invitations that expired more than 90 days ago
-- Runs daily at 02:00 UTC.
-- ============================================================================
select cron.schedule(
  'cleanup-stale-client-invitations',
  '0 2 * * *',
  $$
    delete from public.client_invitations
    where expires_at < now() - interval '90 days';
  $$
);

-- ============================================================================
-- idempotency_keys: delete keys whose expires_at has passed
-- Runs every hour at :05
-- ============================================================================
select cron.schedule(
  'cleanup-expired-idempotency-keys',
  '5 * * * *',
  $$
    delete from public.idempotency_keys
    where expires_at < now();
  $$
);
