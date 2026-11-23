# T0. Database structure (run FIRST)

Read CLAUDE.md first. This task has two parts. Do ONLY the part I name.

## PART A: Audit (read-only, no changes)
- Confirm the target Supabase project with me first (see CLAUDE.md).
- Connect read-only. List every schema, table, column, type, constraint, index, foreign key,
  view, function, trigger, RLS policy, storage bucket, and row counts.
- Find: duplicated data, missing columns, wrong types, missing tenant scoping, tables without
  RLS, missing indexes, unused tables.
- Check how login works today (Supabase Auth / NextAuth / other) and whether data still lives
  in MongoDB. Show options. Wait for my decision. Never keep two auth systems.
- Output a "Database Audit Report" and a migration plan. STOP and wait for my approval.

## PART B: Migration (only after I approve Part A)

### Rules for EVERY table
- Columns: `id` (uuid pk, default gen_random_uuid()), `created_at`, `updated_at` (timestamptz,
  default now(), trigger keeps updated_at current), `created_by`, `updated_by` (uuid),
  `status` (text with CHECK or enum). Soft delete instead of hard delete.
- Tenant isolation: every client-owned row has `tenant_id uuid not null references tenants(id)`,
  indexed. RLS enabled on every table in the public schema with tenant-based policies.
  Server code also filters by tenant from the session, never from client input.
- RLS helper functions (`current_tenant_id()`, `is_administrator()`): SECURITY DEFINER, STABLE,
  `set search_path = ''`. Index every column used in a policy. Use `(select auth.uid())`.
- Proper types, NOT NULL, CHECK, defaults, foreign keys with explicit ON DELETE.
  Use foreign keys instead of copying data.
- Compound indexes start with tenant_id, e.g. (tenant_id, status, created_at desc).
  Unique indexes where needed, e.g. unique (tenant_id, lower(email)), with proper error handling.
- Never store plaintext secrets. Never return password hashes or token hashes from any API.
- Views exposed to clients use `security_invoker = true`.
- Use the Supabase pooler (Supavisor, transaction mode) for the serverless app.
  Set sensible statement and idle timeouts.

### Tables required by phase one (create or fix; keep existing columns, align, do not rename)
**users** (profile table, id = auth.users.id when Supabase Auth is used)
- tenant_id (required for role 'client'; administrators are platform-level and may have none;
  confirm with me if existing data differs), name, email (citext, lowercase), phone (E.164),
  country (ISO code),
  role (check: 'administrator' | 'client', default 'client', not null),
  status (check: pending | active | suspended | deactivated | locked | deleted, default 'pending'),
  max_devices (int, default 1, check between 1 and 10), failed_login_count, last_login_at,
  plus standard columns. Keep existing profile columns (Assigned No., company, department,
  role/position).
- If Supabase Auth manages passwords, do not store password hashes here.
- Indexes: unique (tenant_id, lower(email)), (tenant_id, role, status), (status, created_at desc).
- Migration: map every existing role to 'administrator' or 'client' and every old state to the
  status model. SHOW ME THE MAPPING and any user that cannot be mapped BEFORE running.

**devices**: user_id, tenant_id, device_id, user_agent, ip, last_seen_at,
status (active | revoked), revoked_at, revoked_reason, standard columns.
Indexes: (user_id, status), (device_id).

**login_requests**: user_id, tenant_id, requested_device_id, user_agent, ip,
status (pending | approved | denied | expired), responded_by_device_id, expires_at, standard columns.
Indexes: (user_id, status), expires_at.

**invitations**: tenant_id, email, role (administrator | client), max_devices, token_hash,
invited_by, expires_at, accepted_at, status (pending | accepted | revoked | expired), standard columns.
Indexes: (tenant_id, email, status), expires_at.

**password reset**: use Supabase Auth link-based recovery (no OTP). If a custom table is needed:
`password_reset_tokens` (user_id, token_hash SHA-256, expires_at, used_at, requested_ip,
standard columns), indexed on token_hash and expires_at.

**audit_logs** (append-only): tenant_id, actor_id, action, entity_type, entity_id,
before (jsonb), after (jsonb), ip, user_agent, created_at. Revoke UPDATE/DELETE and add a trigger
that blocks them. Indexes: (tenant_id, created_at desc), (entity_type, entity_id).

**unblock_requests**: tenant_id, user_id, message, status (pending | approved | rejected),
reviewed_by, reviewed_at, standard columns. Index (tenant_id, status, created_at desc).

**idempotency_keys**: key (unique), user_id, route, result_snapshot (jsonb), expires_at, standard columns.

**tenants and existing business tables**: audit only. Add missing standard columns, tenant_id,
RLS policies, indexes. Do not invent new columns.

**Expiry cleanup**: replace TTL indexes with a scheduled pg_cron job that expires or removes rows
past expires_at. Document the schedule.

### Migration steps
- Idempotent SQL in `supabase/migrations` (safe to run twice, with rollback notes).
  Seed test data only on staging.
- Backfill: max_devices = 1 for existing users, standard columns where missing, tenant_id where it
  can be derived. Ask me if it cannot be derived.
- Provide a dry-run mode that only reports what would change.
- Confirm a backup (and point-in-time recovery if available) BEFORE running on real data.
- Document every change in `docs/database.md`.

### Verification
- `EXPLAIN (ANALYZE, BUFFERS)` on the main queries. Confirm index use (no sequential scan on large tables).
- Test RLS with two tenants and both roles: no cross-tenant read or write; a client never reads
  administrator-only data.
- Every user has a valid role and valid status.
- Run the Supabase security and performance advisors and fix every warning.
