# AIP&T / IPT Connect — Progress

## Target confirmed
- **Production Supabase**: `davupzevvsngppcrynoj` (aiptmonitoringdb, ap-southeast-2, Australia)
- **Staging/dev Supabase**: `ebaduymzezrmqlzmobkq` (aipt-passkey-dev) — do NOT write to this
- All migrations, Edge Functions, and type generation target `davupzevvsngppcrynoj`

---

## T0 — Database structure ✅ (committed `9852bec`, fixed `c3c663b`)
- 8 versioned migrations applied to production
- Roles, status model, RLS helpers, required tables (profiles, devices, clients, etc.)
- pg_cron extension self-enabled in migration 8
- Dollar-quote conflict fix in migration 1

## T1 — App foundations ✅ (committed `a2844dc`)
- MUI theme (#17a2b8, Times New Roman), Providers wrapper
- TanStack Query, React Hook Form, Zod schemas
- `src/lib/supabase/browser.ts`, `server.ts` (typed with Database)
- `src/lib/guards.ts`, `src/lib/api.ts`, `src/lib/pagination.ts`
- Path alias `@/*` → `./src/*`
- Global error boundaries (`app/error.tsx`, `app/global-error.tsx`)
- `src/lib/auth/role-routing.ts` — 3 roles only, reads `profiles.status`
- `database.types.ts` generated from live schema

## T2a — Login page (OTP removed, 5-attempt lockout, unblock request) ✅ (committed `4d2b021`)
- OTP verification removed from login entirely (`app/login/verify-otp/` deleted)
- Login calls `/api/auth/login` (IP rate limit: 10 req / 10 min per IP)
- `/api/auth/login` proxies to Supabase Edge Function `login`
- Edge Function: `MAX_FAILED_ATTEMPTS = 5`, status checks (pending/suspended/deactivated/locked)
- Locked modal with "Request unblock" button → `/api/auth/unblock-request`
- `app/page.tsx` fixed: server component routing by role after login

## T2b — One account, one device (device limit enforcement + Realtime approval) ✅
**Branch**: `task/t0b-database` (all T2 work on this branch)

### What changed
**Migration**
- `backend/supabase/migrations/202611200001_add_login_requests.sql` — `login_requests` table (service_role only, pg_cron expires pending rows every minute)

**Edge Function** (`backend/supabase/functions/login/index.ts`) — redeployed
- Accepts `device_fingerprint` in request body
- After password validation: count active devices vs `profiles.max_devices`
- Under limit: upsert device, sign out verifier session, return `{ok: true}`
- Over limit: create/reuse `login_requests` row with stored tokens, broadcast Realtime to `user-{userId}`, return `{waiting: true, request_id}`

**API routes (new)**
- `frontend/app/api/auth/login-request/[id]/route.ts` — polls status, returns tokens once on approval
- `frontend/app/api/auth/device-approve/route.ts` — existing device approves, revokes others, registers new device
- `frontend/app/api/auth/device-deny/route.ts` — existing device denies, revokes stored token

**Frontend (new)**
- `frontend/app/login/waiting/page.tsx` — 5-min countdown, Realtime subscription, polls fallback
- `frontend/src/components/DeviceApprovalBanner.tsx` — notification banner for existing device; handles `device_revoked` broadcast (immediate sign-out)
- `frontend/middleware.ts` — `@supabase/ssr` session guard on all protected routes

**Frontend (modified)**
- `frontend/app/login/page.tsx` — sends `device_fingerprint`, handles `{waiting}` response
- `frontend/app/page.tsx` — server component, routes by role to correct dashboard
- `frontend/src/components/ClientShell.tsx` — fixed `profiles.status` column, added `DeviceApprovalBanner`
- `frontend/src/components/AdminAppShell.tsx` — added `DeviceApprovalBanner`
- `frontend/src/lib/supabase/database.types.ts` — regenerated (includes `login_requests`)

### TypeScript check
`npx tsc --noEmit` — 0 errors after type regeneration

### Edge Function deploy
`npx supabase functions deploy login --project-ref davupzevvsngppcrynoj` — deployed successfully (775 kB)

## T3 — Register page (self-registration + existing-company invite) ✅ (committed `7a06f33`)
**Branch**: `task/t3-register`

### What changed
**Migration**
- `backend/supabase/migrations/202611200003_register_profile_trigger_phone_address.sql` — updates `handle_new_user_profile()` trigger to persist `phone` and `address` from `raw_user_meta_data` into `profiles`; applied to production via `--db-url`

**Frontend**
- `frontend/src/lib/countries.ts` — 195-country dataset (iso2, name, dialCode) + `countryFlag()` emoji utility
- `frontend/app/register/page.tsx` — full rewrite:
  - Custom `DialCodePicker`: searchable dropdown, flag + dial code + country name, 195 countries
  - Custom `CountrySelect`: searchable dropdown, 195 countries
  - Selecting a country auto-syncs dial code (unless user manually picked a dial code)
  - Zod field-level validation; E.164 phone check (`+[1-9]\d{6,14}`)
  - Field-level errors shown below each input
  - Existing invitation flow, password strength, and `supabase.auth.signUp()` preserved
- `frontend/app/register-security.css` — added picker dropdown, phone-field, and field-error styles

### TypeScript check
`npx tsc --noEmit` — 0 errors

---

## T4 — Reset/Forgot Password ✅ (committed `542b5d1`)
**Branch**: `task/t4-reset-password`

### What changed
- `app/forgot-password/page.tsx` — cleaned up, added autoFocus
- `app/forgot-password/verify-otp/page.tsx` — cleaned up, autoFocus first digit, clears sessionStorage on success
- `app/change-password/page.tsx` — fixed 4 bugs: replaced `DashboardPreview` → `AuthArtwork`; fixed garbled eye-button chars → Show/Hide; added 2-rule strength list; added session guard (redirects to `/forgot-password` if no active recovery session)
- `functions/reset-password/index.ts` — after resetting failure counters, also sets `status='active'` for locked accounts (password reset proves identity) — deployed to production

### Role assignments (done outside T4 scope)
- `mohammad.alotaishan2016@gmail.com` → role: **administrator** (was updated via admin API)
- `info@aiptlaw.com` → role: **client** (was updated via admin API)

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Edge Function deploy
`reset-password` redeployed (770 kB)

---

## T5 — Invitation flow ✅ (branch: task/t0b-database)

### What changed
**Migration**
- `backend/supabase/migrations/202611200005_user_invitations.sql` — `user_invitations` table (email, role, client_id, max_devices, token_hash, expires_at, invited_by, consumed_at, revoked_at); RLS: service_role only; partial unique index enforces one active invitation per email

**Edge Function** (`backend/supabase/functions/invite-user/index.ts`) — deployed (1.2 MB)
- `create` — admin: generate token, SHA-256 hash, insert row, send SES email
- `resend` — admin: revoke old token, create new, re-send email (idempotent)
- `revoke` — admin: set `revoked_at` (idempotent)
- `verify` — public GET: hash token, return email/role/client_name or error (expired/revoked/consumed)
- `accept` — public POST: validate token, `admin.createUser`, set profile `status='active'`, link `client_id`, mark `consumed_at`
- `list` — admin POST: return all invitations with status derived from consumed/revoked/expires

**API Routes (new)**
- `frontend/app/api/invitation/create/route.ts`
- `frontend/app/api/invitation/resend/route.ts`
- `frontend/app/api/invitation/revoke/route.ts`
- `frontend/app/api/invitation/verify/route.ts` (public GET)
- `frontend/app/api/invitation/accept/route.ts` (public POST)
- `frontend/app/api/invitation/list/route.ts`

**Frontend (new)**
- `frontend/app/invite/page.tsx` — public token verification page; shows pre-filled email (read-only) + role, full name input, password + confirm with strength checks; on success → "Account activated" with link to login; expired/revoked/consumed show clear messages
- `frontend/src/components/InviteUserModal.tsx` — modal: email, role (administrator/client), client selector (shown when role=client), max_devices (1–10)

**Frontend (modified)**
- `frontend/app/users/page.tsx` — added "Invitations" tab showing pending invitations table with Resend/Revoke actions; added "Invite User" button in header; imported `InviteUserModal`

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Edge Function deploy
`npx supabase functions deploy invite-user --project-ref davupzevvsngppcrynoj` — deployed (1.2 MB)

---

## T5 — Invite Client User modal improvements (branch: task/t0b-database)

### What changed
**Migration**
- `backend/supabase/migrations/202611200006_client_invitation_max_devices.sql` — adds `max_devices` (1–10, default 1) to `client_invitations`; updates `handle_new_user_profile()` trigger to persist `max_devices` from invitation into new profile; also carries `phone` and `address` from both registration paths

**Backend (redeployed)**
- `company-registration` — `list_clients`: now includes `created_at` from clients table and `max_devices` from linked profile; `create_invitation`: accepts and stores `max_devices`
- `clients` — POST handler now accepts optional `assigned_id`; uses it in INSERT if > 0 (auto-assigned otherwise)

**Frontend (modified)**
- `frontend/src/components/InviteClientUserModal.tsx` — full rewrite:
  - **Search**: live filter as you type (no submit required), Search/Add/List buttons
  - **Add Client sub-modal**: new optional "Client ID" (`assigned_id`) field; labels cleaned up
  - **CLIENT DIRECTORY sub-modal**: full-width (`calc(100vw - 32px)`), search input, paginated (10 per page), new columns: "Date registered" and "Max devices"
  - **Main form**: added "Max devices assigned" (1–10) field; passed to `create_invitation`
- `frontend/app/clients.css` — added `.invite-list-dialog--wide`, `.invite-list-toolbar`, `.invite-list-search`, `.invite-list-pagination`, `.invite-search-row`, `.invite-field-hint` styles

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Deployments
- Migration `202611200006` applied to production ✅
- `company-registration` redeployed (1.2 MB) ✅
- `clients` redeployed (777 kB) ✅

---

---

## T6 — Admin permissions, audit logs (branch: task/t0b-database)

### What changed
**Shared permission map (new)**
- `frontend/src/lib/permissions.ts` — `PERMISSIONS` matrix for all 3 roles × 13 actions; `can(role, action)` utility used by both API guards and UI visibility

**PermissionGuard component (new)**
- `frontend/src/components/PermissionGuard.tsx` — renders children only when `can(role, action)` is true

**users Edge Function** — redeployed (1.7 MB)
- GET: now returns `max_devices` in every user record
- PUT: accepts `role` and `max_devices` fields; validates values; blocks self-edit of own role/max_devices; records before_data in `audit_logs`

**Audit logs API route (new)**
- `frontend/app/api/admin/audit-logs/route.ts` — GET, administrator-only; paginated (50/page); filterable by entity_type, action, actor_id, date range; enriches actor names from `profiles`

**Audit logs page (new)**
- `frontend/app/audit-logs/page.tsx` — admin-only table; filters; Before/After data detail modal; uses existing design system classes

**Edit user modal (users page)**
- `frontend/app/users/page.tsx` — added `max_devices` to User type; "Edit" button in action menu opens modal for role + max_devices; self-edit is blocked (button hidden for current user)

**Navigation & routing**
- `frontend/src/components/AdminSidebar.tsx` — "Audit Logs" entry with custom clipboard-list icon
- `frontend/src/components/AdminAppShell.tsx` — `/audit-logs` added to `adminRoutes`
- `frontend/middleware.ts` — `/audit-logs` added to `PROTECTED_PREFIXES`

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Edge Function deploy
`npx supabase functions deploy users --project-ref davupzevvsngppcrynoj` — deployed (1.7 MB) ✅

---

## T6 — Part 2: UI font, audit completeness, API guards (branch: task/t0b-database)

### What changed
**UI design system font**
- `frontend/app/globals.css` — body font changed from `Inter, Arial` → `"Times New Roman", Times, serif`
- `frontend/app/system-theme.css` — added `.admin-app-shell *` rule enforcing Times New Roman across all admin pages; `code`/`pre` exception keeps monospace

**Audit logs completeness**
- `backend/supabase/functions/invite-user/index.ts` — `create`, `resend`, and `revoke` actions now write to `audit_logs` (entity_type: `user_invitation`); redeployed (1.2 MB)

**API route role guards (defense-in-depth)**
- `frontend/app/api/invitation/create/route.ts` — added administrator role check
- `frontend/app/api/invitation/resend/route.ts` — added administrator role check
- `frontend/app/api/invitation/revoke/route.ts` — added administrator role check
- `frontend/app/api/invitation/list/route.ts` — added administrator role check
- All four routes now reject clients and sub-administrators with 403 before proxying to Edge Function

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Edge Function deploy
`npx supabase functions deploy invite-user --project-ref davupzevvsngppcrynoj` — deployed (1.2 MB) ✅

---

## Users Page UI Fix (branch: task/t0b-database)

### What changed
- `frontend/app/system-theme.css` — corrected `--primary-color` from `rgb(38,169,197)` → `#17a2b8` (exact brand color)
- `frontend/app/management-workspace.css`:
  - Replaced all hardcoded teal colors (`#12a8c0`, `#139eb5`, `#438297`, `#079db4`, `#168da3`, `#328ca3`, `#16879d`) with `var(--primary-color)`
  - Fixed garbled `content:"â™§"` → `content:"▾"` on Manage button
  - Rebalanced 10-column widths: #(4%), Full name(17%), Client ID(9%), Company(12%), Role(10%), Max Devices(7%), Status(10%), Account(9%), Registered(14%), Actions(8%)
  - Added `.invitations-panel` CSS block with scoped column widths and status badge colors
- `frontend/app/users/page.tsx`:
  - Removed "Department" column (was always showing `—`)
  - Renamed "Assigned No." → "Client ID", "Role/Position" → "Role", "Account Status" → "Account"
  - Added "Max Devices" column (shows `user.max_devices ?? 1`)
  - Replaced "Last Login" column with "Registered" (shows `registration_date`, sortable)

### TypeScript check
`npx tsc --noEmit` — 0 errors

---

## Users Page — CORS fix (branch: task/t0b-database)

### Root cause
Supabase's Edge Function gateway returns **503** for browser `OPTIONS` preflight requests (`x-served-by: base/server`), blocking all cross-origin browser → Edge Function calls on the users page. This caused "Unable to reach the project service (Failed to fetch)".

### What changed
**New API routes (server-side proxy — no CORS)**
- `frontend/app/api/admin/users/route.ts` — GET: administrator-only, proxies to `users` Edge Function
- `frontend/app/api/admin/users/[id]/route.ts` — PUT + DELETE: administrator-only, proxies to `users/:id` Edge Function

**Frontend (modified)**
- `frontend/app/users/page.tsx` — all 5 Edge Function calls replaced with same-origin API routes:
  - `load()`: `/api/admin/users` (GET)
  - `action()`: `/api/admin/users/:id` (PUT)
  - `saveEdit()`: `/api/admin/users/:id` (PUT)
  - `removeUser()`: `/api/admin/users/:id` (DELETE)
  - `importUsers()`: `/api/admin/users/:id` (PUT)
- Removed unused `fetchSupabaseFunction` import

### TypeScript check
`npx tsc --noEmit` — 0 errors

---

## Bug fix — Approved clients cannot log in (2026-11-20, branch: task/t4-reset-password)

### Root cause
Admin approval (users Edge Function PUT) set `account_status = 'active'` but did NOT set the
unified `status` column. The login Edge Function checks `profiles.status`, which stayed `'pending'`
after approval — so approved client users (e.g. bahrain@aiptlaw.com) were rejected with
"Your account is still awaiting administrator approval."

### What changed
**`backend/supabase/functions/users/index.ts`** — 4 code paths now mirror changes to the unified `status` column:
1. **Approval** (`approval_status = 'approved'`): sets `status = 'active'`
2. **Rejection/Suspension**: sets `status = 'deactivated'` or `status = 'suspended'`
3. **Unlock** (`unlock = true`): sets `status = 'active'`
4. **Direct account_status change**: maps `active` → `'active'`, `inactive` → `'deactivated'`

### Action required
Redeploy the `users` Edge Function:
```
npx supabase functions deploy users --project-ref davupzevvsngppcrynoj
```
Then manually fix bahrain@aiptlaw.com (and any other already-approved users whose `status` is still `'pending'`):
```sql
UPDATE public.profiles SET status = 'active' WHERE account_status = 'active' AND status = 'pending';
```

---

## T5 — Invitation improvements (2026-11-20, branch: task/t4-reset-password)

### What changed

**Migration**
- `backend/supabase/migrations/202611200007_add_invitation_message.sql` — adds `invitation_message text` column to both `user_invitations` and `client_invitations`; applied to production

**Edge Function — invite-user** (`backend/supabase/functions/invite-user/index.ts`) — redeployed
- `create` action: accepts optional `invitation_message`, stores it in DB
- `resend` action: carries forward `invitation_message` from original invitation
- **Email template**: rewritten to match T5 spec §5 — includes: company name, recipient email, max devices, admin's personal message, styled CTA button, specific expiration date, usage/security notes
- **APP_URL guard**: removed localhost fallback; throws error if `APP_URL` env is not set

**Edge Function — company-registration** (`backend/supabase/functions/company-registration/index.ts`) — redeployed
- `create_invitation` action: accepts optional `invitation_message`, stores it in `client_invitations`
- **Email template**: rewritten to match T5 spec §5 (same professional format as invite-user)
- **APP_URL guard**: removed localhost fallback; throws error if `APP_URL` env is not set

**Frontend**
- `frontend/src/components/InviteUserModal.tsx` — added "Invitation message" textarea (optional, max 1000 chars)
- `frontend/src/components/InviteClientUserModal.tsx` — added "Invitation message" textarea (optional, max 1000 chars)
- `frontend/app/invite/page.tsx` — added read-only "Maximum allowed devices" field on registration form

### Deployments
- Migration applied (both tables) ✅
- `invite-user` Edge Function redeployed ✅
- `company-registration` Edge Function redeployed ✅

---

## T5 §17 — Tenant search, filtering, sorting & pagination (2026-11-20, branch: task/t4-reset-password)

### What changed

**Migration**
- `backend/supabase/migrations/202611200008_get_tenants_page.sql` — NEW: PostgreSQL RPC `get_tenants_page()` with 11 params (search, status, invitation, device_usage, date_preset, date_from, date_to, sort, direction, page, page_size); returns JSONB with data array + summary (total, active, eligible, pending); 4 supporting indexes; applied to production

**Backend**
- `backend/supabase/functions/clients/index.ts` — GET list handler rewritten to call `db.rpc('get_tenants_page', {...})`; new query params: invitation, device_usage, date_preset, date_from, date_to; default page_size 10; redeployed
- `backend/supabase/functions/company-registration/index.ts` — email subject changed to "AIAPAIT – Verify Your Company Invitation"; email body simplified to match spec; redeployed

**Frontend (new)**
- `frontend/src/components/TenantFilters.tsx` — filter bar with 4 dropdowns + custom date range + reset button

**Frontend (modified)**
- `frontend/app/clients/page.tsx` — summary cards (Total, Active, Eligible, Pending); TenantFilters bar; debounced search (300ms); 9 columns: Client ID, Company, Registered Email, Date Registered, Max Devices (inline-editable), Registered Devices, Status, Invitation Eligibility, Actions; `InvitationBadge` and `MaxDevicesCell` components; page sizes [10, 25, 50, 100]
- `frontend/src/components/InviteClientUserModal.tsx` — full rewrite: simplified form with autocomplete client input, editable company/email inputs, max devices (1–10), invitation message textarea; removed search bar, Add Client, Client Directory, Invitation status
- `frontend/src/components/AdminSidebar.tsx` — added "Tenants" link in sidebar navigation
- `frontend/app/clients.css` — styles for summary cards, tenant filters, invitation badges, max-devices inline edit, autocomplete suggestions dropdown, textarea

### TypeScript check
`npx tsc --noEmit` — 0 errors

### Deployments
- Migration `202611200008` applied to production ✅
- `clients` Edge Function redeployed ✅
- `company-registration` Edge Function redeployed ✅

---

## T7 — Client Device Management and Login Approval System (2026-11-20, branch: task/t7-device-management)

### What changed

**Migrations (2 new)**
- `202611210001_t7_device_sessions_and_metadata.sql` — adds device metadata columns to `devices` (device_name, device_type, browser, operating_system); creates `device_sessions` table (device ↔ auth session mapping); widens `audit_logs.action` CHECK to include device_approve/deny/revoke/register; adds `approved_by_device_id` to `login_requests`
- `202611210002_t7_approve_device_rpc.sql` — `approve_device_login()` SECURITY DEFINER function: atomic device approval with SELECT FOR UPDATE (race condition prevention), selective device revocation (only the approver, not all devices), new device registration, device_session creation, audit logging; service_role only

**Edge Function modified** (`backend/supabase/functions/login/index.ts`)
- Per-limit policy differentiation:
  - Max 1: approval flow (existing behavior, now with selective revocation)
  - Max 2: **hard deny** at limit — no approval flow, returns `{denied: true, code: 'device_limit_hard'}`
  - Max 3+: approval flow, only approving device gets revoked (others remain active)
- Recovery path: when no active device can approve, allows direct login
- Creates `device_sessions` rows on successful login
- Parses user-agent into device_name/device_type/browser/operating_system
- Enriched Realtime broadcast payload with parsed device info

**New shared utility** (`backend/supabase/functions/_shared/parse-user-agent.ts`)
- Lightweight regex UA parser: device_type (Desktop/Mobile/Tablet), browser, OS, device_name

**API routes modified**
- `frontend/app/api/auth/device-approve/route.ts` — rewritten to use `approve_device_login()` RPC (atomic); requires `approver_fingerprint` in body
- `frontend/app/api/auth/device-deny/route.ts` — added audit_log insert on denial

**New API routes**
- `frontend/app/api/auth/set-device-cookie/route.ts` — sets httpOnly device fingerprint cookie for middleware validation
- `frontend/app/api/admin/devices/route.ts` — GET: list devices + sessions for a user; POST: revoke individual device (with Realtime broadcast + audit log)
- `frontend/app/api/admin/devices/history/route.ts` — GET: paginated login_requests history for a user

**Frontend modified**
- `frontend/app/login/page.tsx` — handles `device_limit_hard` response (shows friendly modal); calls `set-device-cookie` after successful login
- `frontend/app/login/waiting/page.tsx` — calls `set-device-cookie` after approval
- `frontend/src/components/DeviceApprovalBanner.tsx` — sends `approver_fingerprint` on approve; displays parsed device info (name, type, browser, OS) instead of raw user_agent
- `frontend/middleware.ts` — added server-side device session validation for `/client-dashboard` routes (checks active device in DB via service_role, 60s cache)
- `frontend/app/clients/page.tsx` — clickable "Registered Devices" count opens DeviceManagementPanel
- `frontend/app/users/page.tsx` — "View Devices" action in user manage menu opens DeviceManagementPanel

**New component**
- `frontend/src/components/DeviceManagementPanel.tsx` — shared modal for admin device management; tabs: Registered Devices (with revoke), Approval History (paginated); used by both clients and users pages

### Security considerations
- `approve_device_login()` uses `SELECT FOR UPDATE SKIP LOCKED` to prevent concurrent approval race conditions
- Device session validation in middleware only applies to client routes (admins bypass device limits)
- 60-second cache cookie prevents excessive DB hits in middleware
- All device events (approve, deny, revoke, register) are audit-logged
- Service-role key used only server-side (middleware, API routes, Edge Functions)

### Deployment status
- ✅ Both migrations applied to production (SQL Editor)
- ✅ Login Edge Function redeployed
- ✅ `database.types.ts` regenerated from live schema; all `any` casts removed
- ✅ TypeScript compiles cleanly (zero errors)
- Frontend changes deploy automatically via Amplify on push

---

## T8a — Scale Readiness, Caching, Rate Limiting (2026-11-20, branch: task/t4-reset-password)

### What changed

**New files**
- `frontend/src/lib/rate-limit.ts` — reusable sliding-window rate limiter with auto-cleanup, `strictLimiter` (10/10min), `moderateLimiter` (20/10min), `getClientIp()`, `rateLimitResponse()` (429 + Retry-After)
- `frontend/app/api/health/route.ts` — liveness probe, always 200 `{status:"ok"}`
- `frontend/app/api/ready/route.ts` — readiness probe, pings DB, 200 or 503

**Rate limiting applied**
- `app/api/auth/login/route.ts` — replaced inline Map with shared `strictLimiter`, added Retry-After header
- `app/api/auth/unblock-request/route.ts` — added `strictLimiter` (was completely unprotected)
- `app/api/invitation/accept/route.ts` — added `moderateLimiter`
- `app/api/invitation/verify/route.ts` — added `moderateLimiter`

**Caching & CDN**
- `next.config.mjs` — added `/_next/static/*` immutable cache header, global `X-Content-Type-Options: nosniff`
- `src/components/Providers.tsx` — added `refetchOnWindowFocus: false` to React Query defaults

**Security headers**
- `middleware.ts` — added `withSecurityHeaders()` helper: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` on all middleware responses

### Decisions
- No Redis/Upstash: in-memory rate limiting sufficient at 100K scale on Amplify (CloudFront provides DDoS layer)
- No ISR/server-side cache: data is tenant-scoped and dynamic; React Query staleTime: 60s is the caching layer
- No next/image migration: only ~6 img tags, small flag PNGs, not a bottleneck

### Verification
- `npx tsc --noEmit` — zero errors
- `npx next build` — clean build, all pages compile

---

## T8c — Observability and Database Optimizations (2026-11-20, branch: task/t4-reset-password)

### What changed

**Observability — new files**
- `frontend/src/lib/logger.ts` — structured JSON logger (stdout, CloudWatch-compatible). Fields: timestamp, level, requestId, route, userId, durationMs. Never logs credentials.
- `frontend/src/lib/metrics.ts` — in-memory metrics collector: request/error/rate-limit counters per route, latency ring buffer (p50/p95/p99), login success/failure counts.
- `frontend/src/components/SystemStatusCard.tsx` — admin-only system status card: DB health, active users/devices, login failures, latency, error rate. Polls every 30s.
- `frontend/app/api/admin/system-status/route.ts` — admin-only endpoint returning health, counts, and metrics snapshot.

**Observability — modified files**
- `frontend/middleware.ts` — generates `x-request-id` (UUID) on every request, sets as response header and forwards in request headers for correlated logging.
- `frontend/app/api/auth/login/route.ts` — structured logging (login attempts, success/failure, duration), metrics recording.
- `frontend/app/api/auth/unblock-request/route.ts` — structured logging, metrics recording.
- `frontend/app/api/admin/devices/route.ts` — structured logging for device revocation.
- `frontend/app/api/ready/route.ts` — structured logging with DB check duration.
- `frontend/app/overview/page.tsx` — added SystemStatusCard at top (admin-only, auto-hides for non-admins).
- `backend/supabase/functions/login/index.ts` — structured JSON logging at all key decision points (blocked statuses, password failures, success, recovery, errors).

**Database — new migration**
- `backend/supabase/migrations/202611210003_t8c_database_optimizations.sql`:
  - 4 new composite indexes: devices(user_id, status), device_sessions(user_id, status), login_requests(user_id, status, created_at), unblock_requests(user_id, status)
  - `audit_logs_archive` table for cold storage
  - pg_cron monthly job: archives audit_logs older than 12 months

### Decisions
- No OpenTelemetry: adds ~500KB deps, complex for serverless. Structured logging + request IDs provide 80% of tracing value.
- No Prometheus/Grafana: requires running server. Admin metrics endpoint serves same purpose at this scale.
- No external logging library (pino/winston): custom logger is ~40 lines, same structured JSON output.
- Supabase JS SDK uses HTTP/REST — connection pooling is handled at Supabase infra level (Supavisor). No app-level changes needed.
- Audit log archival via pg_cron (not table partitioning) — simpler and sufficient.

### Not yet deployed
- Migration needs to be applied to production (SQL Editor)
- Login Edge Function needs redeployment

### Verification
- `npx tsc --noEmit` — zero errors
- `npx next build` — clean build, all pages compile

---

## T8b — Idempotency, Circuit Breaker, CAP Documentation (2026-11-20, branch: task/t4-reset-password)

### What changed

**Architecture documentation (new)**
- `docs/architecture.md` — CAP theorem decisions (CP: auth/sessions/devices/status; AP: dashboard/lists), consistent hashing (Supabase+CloudFront handle routing), security review (CSRF not needed for JSON APIs, RLS on all tables, cookies properly configured)

**Idempotency utility (new)**
- `frontend/src/lib/idempotency.ts` — `extractIdempotencyKey(req)`, `checkIdempotencyKey()`, `saveIdempotencyResult()`, `idempotentResponse()`. Uses existing `idempotency_keys` table with 24h expiry, upsert on conflict.

**Idempotency applied to 5 API routes:**
- `app/api/auth/device-approve/route.ts` — before RPC call
- `app/api/auth/device-deny/route.ts` — before deny logic
- `app/api/invitation/create/route.ts` — after admin auth
- `app/api/invitation/accept/route.ts` — public route (user_id=null)
- `app/api/admin/users/[id]/route.ts` — PUT handler only

**Circuit breaker (new)**
- `backend/supabase/functions/_shared/circuit-breaker.ts` — CLOSED→OPEN→HALF_OPEN states, AbortController timeout, structured JSON logging on state transitions. `CircuitOpenError` for fast-fail.

**Circuit breaker applied to 4 Edge Functions:**
- `invite-user/index.ts` — SES email (3 failures, 60s cooldown)
- `users/index.ts` — SES email (3 failures, 60s cooldown)
- `google-translate/index.ts` — Google Translate API (5 failures, 60s cooldown)
- `sync-fees/index.ts` — Google Sheets API (3 failures, 120s cooldown)

### Decisions
- Circuit breaker state resets on Lambda/Deno cold start — acceptable (defaults to CLOSED, which is safe)
- No distributed circuit breaker (Redis): per-instance tracking is sufficient; Supabase Edge Functions are single-process

### Not yet deployed
- Edge Functions (users, invite-user, google-translate, sync-fees) need redeployment

---

## T8d — Security Tests, Load Tests, CI Pipeline (2026-11-20, branch: task/t4-reset-password)

### What changed

**Security test script (new)**
- `tests/security/security-checks.ts` — runnable with `npx tsx`. Tests:
  - RLS tenant isolation (cross-tenant read returns 0 rows)
  - Role escalation prevention (client → admin endpoint returns 403, cannot self-escalate role)
  - Status blocking (locked/suspended/deactivated/pending cannot log in)
  - Brute force lockout (6 wrong passwords → account locked)
  - Security headers (nosniff, X-Frame-Options, Referrer-Policy)

**k6 load test scripts (new)**
- `tests/load/k6-login.js` — login flow ramp 0→50→100→200 VUs; thresholds: p95 < 500ms, errors < 1%
- `tests/load/k6-dashboard.js` — admin dashboard reads ramp 0→20→50→100 VUs; thresholds: p95 < 1000ms, errors < 1%
- `tests/load/README.md` — prerequisites, seed instructions, how to run, staging-only warning

**GitHub Actions CI (new)**
- `.github/workflows/ci.yml` — triggers on push to main/task/*, PRs to main; jobs: npm ci, typecheck (`tsc --noEmit`), build (`next build` with placeholder env vars)

### Verification
- `npx tsc --noEmit` — zero errors
- `npx next build` — clean build, all pages compile

---

## T9a — Spreadsheet pricing grouped by client type (branch: task/t9a-spreadsheet-pricing)

### What changed

**Migration** (`202611210004_t9a_pricing_sheet.sql`)
- `clients.client_type` CHECK replaced: old 4 values (Corporate/Law Firm/Consultant/Individual) → 3 new values (chinese/non_chinese/direct)
- Existing client rows with old values set to NULL (admin reassigns via UI)
- New `pricing_sheet` table: 21 rows (3 groups × 7 item keys), with official_fee, attorney_fee, total_fee, currency
- RLS: admin full CRUD, authenticated SELECT
- `quotations` table: added `pricing_client_type` and `pricing_snapshot` columns

**Backend**
- New edge function: `pricing-sheet/index.ts` — GET (all/filtered), PUT single, PUT batch
- New shared helper: `_shared/get-pricing-for-client.ts` — loads pricing by client type, never crosses groups
- `clients/index.ts` — clientTypes updated to chinese/non_chinese/direct
- `quotations/index.ts` — loadLookups returns pricing_sheet data, save stores pricing_client_type + pricing_snapshot

**Frontend**
- `/spreadsheet` page: `PricingSheet` component added above freeform workbook with 3 tabs (Chinese/Non Chinese/Direct), 7 editable rows each, inline editing with auto-calculated totals, batch save to Supabase
- `/spreadsheet` page: freeform workbook group bar (Client Type selector + filtered WorksheetTabs) — CSS fix: changed `.spreadsheet-grid-scroll` from `flex:1 1 auto` to `flex:1 1 0%` and reduced `min-height` to 200px so group bar is never clipped by `overflow:hidden`
- `/clients` page: client_type dropdown updated to 3 new values, null client_type shows "Not assigned" in reports
- `/quotations` page: Lookup type includes pricing_sheet, client details show pricing tier info/warning, Client type now included in lookups

### Decisions
- User confirmed: REPLACE existing client_type values (not add a new column)
- User confirmed: NEW structured pricing_sheet table alongside existing freeform spreadsheet
- Existing clients with old values → NULL after migration, admin must reassign manually

### Known issues
- All existing clients will have client_type = NULL after migration — admin must update each one
- The pricing_sheet edge function needs deployment to Supabase
- The migration needs to be applied to production
- PricingSheet component is self-contained (fetches its own data); no export/import .xlsx for structured pricing yet

---

## T10a — Client Device Management & Login Approval System ✅ (validated, branch: task/t9a-spreadsheet-pricing)

### Status: Already fully implemented — audit only

Full audit (2026-11-21) confirmed that the entire device management and login approval system was already built across T2b, T5, T6, and T7. No new code changes required.

### What exists (all verified)

**Backend infrastructure**
- `devices` table with metadata (migration `202611190006`, `202611210001`)
- `device_sessions` table (migration `202611210001`)
- `login_requests` table with pg_cron TTL cleanup (migration `202611200001`)
- `approve_device_login` atomic RPC with `FOR UPDATE SKIP LOCKED` (migration `202611210002`)
- Login Edge Function with device fingerprint, limit check, approval flow (`login/index.ts`)
- `get_tenants_page` RPC with device usage filter (migration `202611200008`)

**Frontend — Admin (`/clients` page)**
- `max_devices` and `registered_devices` columns in clients table
- Device usage filter (available / fully_utilized / exceeded)
- `DeviceManagementPanel` modal — Registered Devices + Approval History tabs
- Admin force-revoke device via `POST /api/admin/devices`
- `MaxDevicesCell` inline edit for max_devices

**Frontend — Client login flow**
- Login page sends `device_fingerprint` with credentials
- "Waiting for approval" screen with 5s polling + Realtime (`/login/waiting`)
- Approval → `setSession()` + cookie; Denial → "Login denied" message; Expiry → retry option
- Hard deny modal for `max_devices=2` at limit

**Frontend — Device approval from existing device**
- `DeviceApprovalBanner` — Realtime broadcast listener, approve/deny buttons
- Shows new device info (name, type, browser, OS, IP, time)
- After accepting: existing device logged out via `device_revoked` broadcast
- Banner rendered in both `AdminAppShell` and `ClientShell`

**Security** — All enforced server-side: device limits, service_role-only tables/RPCs, `FOR UPDATE SKIP LOCKED`, atomic device count updates, audit log coverage (approve/deny/revoke)

### Task file
`docs/tasks/T10a-tenants-device-management.md` — full audit with file:line references

---

## T11a — Client Quotations: Validate, Initiate & UI Polish (branch: task/t9a-spreadsheet-pricing)

### What changed

**Phase 1: Client type validation & pricing tier**
- `frontend/app/quotations/page.tsx` — Added `.client-pricing-tier` label showing Chinese / Non-Chinese / Direct; warning banner when `client_type` is null; blocks submission when missing
- `frontend/app/quotations/client-quotation.css` — Pricing tier styles (`.client-pricing-tier`, `.is-warning`)

**Phase 2: Client-type-specific spreadsheet fees**
- `backend/supabase/functions/_shared/spreadsheet-fees.ts` — Added `parseSheetClientType()` to extract suffix from tab names like "Trademark(Chinese)"; `parseSpreadsheetPricing()` now accepts optional `clientType` param; sheet iteration filters by client type
- `backend/supabase/functions/quotations/index.ts` — `loadLookups()` passes client type for client role; `resolveItems()` looks up client type from `clients` table for server-side validation
- `backend/supabase/functions/clients/index.ts` — Updated client type values to `chinese`/`non_chinese`/`direct`

**Phase 3: UI polish & consistency**
- `frontend/app/quotations/client-quotation.css` — Added client-scoped overrides for View modal, Delete modal, and Success dialog (`.client-quotation-page .quotation-dialog > header` etc.) — all now use cyan theme instead of admin purple/indigo; animated loading spinner (`.quotation-loading`)
- `frontend/app/quotations/quotation.css` — Admin-themed loading spinner
- `frontend/app/quotations/page.tsx` — Loading text wrapped in `.quotation-loading` span for spinner animation

### Deployments needed
- `clients` Edge Function — already deployed (fixed "Choose a valid client type" error)
- `quotations` Edge Function — needs deployment for client-type-specific fee resolution

### Task file
`docs/tasks/T11a-client-quotations-validate-initiate.md`

---

## T11a — Materialized Fees & On-Demand Quotation Lookup (in progress)
**Branch**: `task/t9a-spreadsheet-pricing`

### Problem
Client dashboard quotations page failed with 546 / ERR_QUIC_PROTOCOL_ERROR — the
`quotations?lookup=true` endpoint returned ~100MB of fee data (500K records) parsed
from the spreadsheet workbook on every request.

### Solution: Materialized Fees + On-Demand Lookup
1. **Migration** (`202611210005_materialize_fees.sql`) — 3 new tables:
   `materialized_fees`, `materialized_class_rates`, `materialized_addon_fees`
2. **Backend** — New endpoints: `POST ?action=materialize` (admin), `GET ?fee_lookup=true`,
   `GET ?class_rates=true`, `GET ?addon_fees=true`. `resolveItems()` rewritten to query
   materialized tables. `loadLookupsLite()` now includes requirements.
3. **Frontend** — Both admin and client use `lookup=lite` (fast, no fees). Fees loaded
   on-demand per country+category selection. Fee/class-rate caches in component state.
4. **Spreadsheet page** — Triggers materialization after workbook save.

### Deployment needed
1. Run migration SQL in Supabase Dashboard SQL Editor
2. Deploy `quotations` Edge Function
3. Run initial materialization (POST `quotations?action=materialize` as admin)

### Files changed
- `backend/supabase/migrations/202611210005_materialize_fees.sql` (new)
- `backend/supabase/functions/quotations/index.ts`
- `frontend/app/quotations/page.tsx`
- `frontend/app/spreadsheet/page.tsx`
- `ipt-connect-pack/docs/tasks/T11a-client-quotatations.md`

---

## T12a — Client Dashboard: Fix Errors, Update Boxes, Header Customer Service (2026-11-24)
**Branch**: `task/t9a-spreadsheet-pricing`

### Root cause of "Unable to reach the project service (Failed to fetch)"
Client dashboard `page.tsx` fired 12+ simultaneous HTTP requests to Supabase edge functions
on load (auth checks + 8 card-update fetches + tutorials + card settings). Browser connection
limit (~6 for HTTP/2) caused requests to queue/timeout/fail at `browser.ts:119`.

### What changed
**`frontend/app/client-dashboard/page.tsx`**
- Deferred `loadCardUpdates` by 3 seconds (no longer competes with essential calls)
- All `response.json()` calls wrapped with `.catch(() => ({}))` for safe parsing
- Removed `customer-service` from destinations/displayLabels/translatedLabels/cardUpdateSources
- Added `doa` (Deed of Assignment) box after News Feed
- Removed `doa` from cardUpdateSources (no backend edge function yet)

**`frontend/src/components/ClientShell.tsx`**
- Cached `accessState` in sessionStorage — returning clients skip "Checking..." screen
- Added Customer Service button (icon + text) in header between language selector and divider
- Added `customerService` translation to all 4 languages
- Updated `readableDashboardRoutes`: removed `customer-service`, added `doa`

**`frontend/app/client-home.css`**
- Added `.client-home-service-btn` styles (pill button, icon-only on mobile)

**`frontend/app/client-dashboard/doa/page.tsx`** (NEW)
- Placeholder page: "Deed of Assignment — Coming soon"

### Final 8 dashboard boxes
1. Schedule of Fees, 2. Quotation, 3. Requirements, 4. Statements,
5. POA, 6. Your Work, 7. News Feed, 8. DOA

### TypeScript check
`npx tsc --noEmit` — 0 errors

---

## Open questions / decisions needed
- T10a: `max_devices=2` uses hard deny (no approval flow) — confirm this is intended or should also use approval
- T11a: Migration SQL needs to be applied via Supabase Dashboard SQL Editor before deploying
- T12a: `doa` edge function needed when DOA feature is built out
- T12a: `client-updates` edge function checks legacy `approval_status`/`account_status` columns (line 45) — may need updating to use unified `status` column

## Next tasks
- **T11a deploy**: Apply migration, deploy quotations Edge Function, run initial materialization
- **T9a deploy**: Apply T9a migration, deploy pricing-sheet edge function, redeploy clients + quotations edge functions
- **T8b+T8c deploy**: Apply T8c migration, redeploy 4 Edge Functions (users, invite-user, google-translate, sync-fees)
- **T5 remaining** (per T5-invitation.md spec): Client ID editing, Excel bulk import, automated tests
- **Future**: Drop legacy `approval_status`, `account_status` columns from profiles once confirmed unused
- **Future**: Run Supabase security and performance advisors
- **Future**: Upgrade to distributed rate limiting (Upstash Redis) if abuse patterns emerge
