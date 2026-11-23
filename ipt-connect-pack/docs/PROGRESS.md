# Progress (update at the end of every session)

## Target confirmed
- **Supabase project:** `davupzevvsngppcrynoj` (name: aiptmonitoringdb, ap-southeast-2)
- Second project `ebaduymzezrmqlzmobkq` = aipt-passkey-dev (separate, not the target)
- Reference `zvfxbgfttujgpjhaenpv` in CLAUDE.md dashboard URL does not appear in CLI list — treat as stale

## Done
- T0 Part A: full database audit completed (read-only)
- T0 Part B decisions approved by user (2026-11-19) — see decisions below

## Approved decisions (T0 Part B)
1. **Roles (3):** administrator, client, sub_administrator. `user` → sub_administrator; `associate` → flag for review.
2. **Status model:** single `status` column; rejected → deactivated; locked_at IS NOT NULL → locked.
3. **client_memberships:** keep as separate internal concept (company_admin/manager/member/viewer).
4. **Tenants:** use existing `clients` table; no separate `tenants` table.
5. **fee_classifications:** EXISTS in live DB (created directly, no migration). Columns: id, description (varchar), color_indication (text), created_at, updated_at, deleted_at. RLS enabled with authenticated SELECT policy.

## Done (continued)
- T0 Part B: all 8 migrations written, login Edge Function updated, CLAUDE.md updated

### Migrations written (branch: task/t0b-database)
| File | Description |
|---|---|
| 202611190001_document_live_only_tables.sql | Documents 6 tables that existed in live DB without migration files |
| 202611190002_add_sub_administrator_role.sql | Adds sub_administrator role, fixes save_client_permissions |
| 202611190003_unify_user_status.sql | Single status column, backfill, trigger, max_devices, updated_at |
| 202611190004_add_standard_columns.sql | created_by, updated_by, updated_at on 10 tables |
| 202611190005_fix_rls_policies.sql | Three-role policies, status column, all silent-deny tables fixed |
| 202611190006_add_required_tables.sql | devices, unblock_requests, idempotency_keys |
| 202611190007_harden_audit_logs.sql | tenant_id, ip, user_agent, append-only trigger |
| 202611190008_add_expiry_cleanup.sql | pg_cron jobs for OTP, invitations, idempotency_keys |

### Application files changed
- backend/supabase/functions/login/index.ts — reads profiles.status (not approval_status/account_status/locked_at)
- CLAUDE.md — updated ROLES section to three roles

## Done (continued)
- All 8 T0B migrations applied to live project `davupzevvsngppcrynoj` (2026-11-19)
- pg_cron self-enabled in migration 8 (no manual dashboard step needed)
- `backend/.env` — added missing `SUPABASE_ANON_KEY` for target project

### Status backfill verified (post-migration)
| status | role | count |
|---|---|---|
| active | administrator | 1 |
| active | client | 2 |
| deactivated | administrator | 1 |
| deactivated | client | 4 |
| suspended | client | 1 |

### pg_cron jobs active
- `cleanup-expired-otp-challenges` — */15 * * * *
- `cleanup-stale-client-invitations` — 0 2 * * *
- `cleanup-expired-idempotency-keys` — 5 * * * *

## Done (continued)
- T1: app foundations initialized (2026-11-20)

### T1 changes
- **Login fix:** `.env.development.local` in both frontend and backend pointed to wrong project (`ebaduymzezrmqlzmobkq`); corrected to `davupzevvsngppcrynoj` — this was the source of "Unable to reach the project service" in local dev
- Packages added: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `@supabase/ssr`; `xml-js` removed
- `src/lib/supabase/database.types.ts` — generated from live schema
- `src/lib/supabase/browser.ts` — typed with `Database` generic
- `src/lib/supabase/server.ts` — `createServerClient()` (cookie/anon) + `createAdminClient()` (service role)
- `src/lib/theme.ts` — single MUI theme (#17a2b8, Times New Roman, black/white)
- `src/components/Providers.tsx` — ThemeProvider + QueryClientProvider
- `app/layout.tsx` — wrapped with `<Providers>`
- `src/lib/api.ts` — `ApiResponse<T>`, `ok()`, `fail()`
- `src/lib/guards.ts` — `requireAuth`, `requireRole`, `requireActiveStatus`, `requireTenant`
- `src/lib/pagination.ts` — `paginationParams()`
- `src/lib/schemas/index.ts` — common Zod schemas
- `src/lib/auth/role-routing.ts` — removed old roles; reads `profiles.status` column
- `tsconfig.json` — `@/*` path alias added
- `app/error.tsx` + `app/global-error.tsx` — global error boundaries
- Deleted: `out.txt`, `body.txt`, `artifacts/`

## Done (continued)
- **T9a: Spreadsheet Pricing — Client-Type Group Selector** (branch: `task/t9a-spreadsheet-pricing`)
  - Group selector dropdown (Chinese / Non Chinese / Direct) to left of tab bar
  - 21 sheets total (7 base × 3 groups), each group independent data
  - Old 7-sheet workbooks auto-migrate to Chinese group on load
  - Missing group sheets auto-created (fill-missing pass in normalizeWorkbook)
  - Font color tool with visible swatch indicator
  - Add Sheet (＋) button per group
  - Formula engine expanded: MIN, MAX, COUNT, ABS, ROUND, INT, MOD, POWER, IF
  - Files: `frontend/app/spreadsheet/page.tsx`, `frontend/app/spreadsheet.css`
  - Task file: `docs/tasks/T9a-spreadsheet.md`

### T9a — Client-Type Groups

| Group | Sheets |
|---|---|
| Chinese | Trademark(Chinese), Patent(Chinese), Design(Chinese), Copyright(Chinese), Up to 3 classes(Chinese), Up to 5 classes(Chinese), Multi-classes(Chinese) |
| Non Chinese | Trademark(Non Chinese), Patent(Non Chinese), Design(Non Chinese), Copyright(Non Chinese), Up to 3 classes(Non Chinese), Up to 5 classes(Non Chinese), Multi-classes(Non Chinese) |
| Direct | Trademark(Direct), Patent(Direct), Design(Direct), Copyright(Direct), Up to 3 classes(Direct), Up to 5 classes(Direct), Multi-classes(Direct) |

## T3 update — Client Type auto-fill on registration
- T3 task updated: registration form auto-fills **client_type** based on country selection
- Chinese countries: CN, HK, MO, TW → **Chinese**
- All other countries → **Non Chinese**
- **Direct** only available when administrator creates/edits a user (not self-registration)
- `client_type` stored on user profile, links to fee workbook pricing group (T9a)
- Task file: `docs/tasks/T3-register.md`

## Next
- **T10a: Client Device Management & Login Approval System** — task file: `docs/tasks/T10a-tenants-device-management.md`
  - Backend infrastructure largely exists (devices, device_sessions, login_requests, approve_device_login RPC, login Edge Function)
  - Needs: frontend `/clients` device columns + admin actions, login waiting/approval UI, client-side approve/deny flow
- T2a: Login page (status check, 5-attempt lockout, friendly error messages)
- T3: Registration with client_type auto-fill (Chinese / Non Chinese by country)
- Future: drop legacy `approval_status`, `account_status` columns from profiles once all app code reads `profiles.status`
- Run Supabase security and performance advisors

## Open questions / decisions
- associate role flagged rows: 0 live records; audit_logs entry written if any appear in future
- T3 client_type: needs `client_type` column added to `profiles` table (migration required when T3 starts)
- T10a: max_devices=2 uses hard deny (no approval flow) — confirm this is intended or should also use approval
