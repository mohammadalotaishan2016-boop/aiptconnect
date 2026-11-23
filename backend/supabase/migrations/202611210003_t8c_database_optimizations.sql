-- T8c: Database optimizations for 100K users
-- Adds missing indexes and audit log archival

-- 1. Missing composite indexes for common query patterns
-- -------------------------------------------------------

-- Device validation in middleware: devices(user_id, device_id, status)
CREATE INDEX IF NOT EXISTS idx_devices_user_status
  ON public.devices (user_id, status);

-- Device sessions lookup: device_sessions(user_id, status)
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_status
  ON public.device_sessions (user_id, status);

-- Login requests for approval banner: login_requests(user_id, status, created_at)
CREATE INDEX IF NOT EXISTS idx_login_requests_user_status_created
  ON public.login_requests (user_id, status, created_at DESC);

-- Unblock request dedup check: unblock_requests(user_id, status)
CREATE INDEX IF NOT EXISTS idx_unblock_requests_user_status
  ON public.unblock_requests (user_id, status);

-- 2. Audit log archive table
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs_archive (
  LIKE public.audit_logs INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

-- No RLS on archive — admin-only access via service_role
-- No triggers — archive is a cold store

COMMENT ON TABLE public.audit_logs_archive
  IS 'Archived audit_logs older than 12 months. Moved by pg_cron monthly.';

-- 3. pg_cron job: archive old audit logs monthly
-- -------------------------------------------------------

SELECT cron.schedule(
  'archive-old-audit-logs',
  '0 3 1 * *',  -- 1st of every month at 03:00 UTC
  $$
    WITH moved AS (
      DELETE FROM public.audit_logs
      WHERE created_at < now() - interval '12 months'
      RETURNING *
    )
    INSERT INTO public.audit_logs_archive
    SELECT * FROM moved;
  $$
);
