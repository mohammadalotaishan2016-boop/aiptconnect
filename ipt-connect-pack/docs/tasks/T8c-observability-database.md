# T8c. Observability and database for 100,000 users

Read CLAUDE.md first. Prerequisite: T8b done.

## Observability
- Structured JSON logs with request id, user id, tenant id, route, duration.
  Never log passwords, tokens, keys, or personal data.
- Metrics: request rate, error rate, p50/p95/p99 latency, cache hit rate, database query time,
  active connections, active devices, login failures, Realtime lag.
- Traces across API and database calls (OpenTelemetry). Use Supabase logs, query performance
  reports, and advisors. Alerts for error rate, latency, failed logins, connection usage.
- Add a simple status dashboard for administrators.

## Database
- Every list and filter uses an index (EXPLAIN ANALYZE, no sequential scan on large tables).
  Select only needed columns, paginate everywhere, no N+1.
- Pooler (Supavisor) for all app connections so serverless instances never exceed the connection limit.
  Tune compute size only if the load test (T8d) shows it is needed.
- Plan read replicas, partitioning or archiving of old audit_logs, and pg_cron cleanup jobs.
