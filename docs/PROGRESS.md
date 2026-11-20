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

---

## Open questions / decisions needed
- None currently

## Next tasks
- **T3**: Register page (self-registration, starts as `pending`)
- **T4**: Reset/forgot password
- **T5**: Invitation flow (administrator invites user, starts as `active`)
- **T6**: Admin pages, permissions, audit logs
- **Future**: Drop legacy `approval_status`, `account_status` columns from profiles once confirmed unused
- **Future**: Run Supabase security and performance advisors
