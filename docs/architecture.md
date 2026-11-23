# AIP&T / IPT Connect — Architecture Decisions

## Stack

Next.js 15 (App Router) on AWS Amplify, Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions), TypeScript.

---

## Consistent Hashing

No custom consistent hashing implementation is needed. Managed services handle routing:

- **Database**: Supabase uses Supavisor (connection pooler) to route client connections. Adding/removing compute does not require key redistribution.
- **CDN**: AWS Amplify provides CloudFront, which handles edge caching and request routing automatically.
- **Realtime**: Supabase Realtime uses channel-based routing. Device approval broadcasts are delivered to the correct channel regardless of which server instance handles the request.
- **Rate limiting**: In-memory per-instance (see T8a). No shared cache cluster requiring consistent hashing.

---

## CAP Theorem Decisions

### CP (Consistency Priority) — Primary Database, Strong Consistency

These operations MUST read/write the primary to prevent split-brain:

| Domain | Why |
|---|---|
| **Authentication** (login, password verify) | A locked user must stay locked immediately |
| **Profile status changes** (active/locked/suspended/deactivated) | Status gate is the primary access control |
| **Device approval** (`approve_device_login` RPC uses `SELECT FOR UPDATE SKIP LOCKED`) | Prevents concurrent double-approval |
| **Login requests** (pending/approved/denied state) | Approver and waiting device must see consistent state |
| **User invitations** (token consumption) | Token must be consumed exactly once |
| **Idempotency keys** (write deduplication) | Must prevent duplicate writes across retries |

All CP operations use `createAdminClient()` (service_role) targeting the primary via Supabase REST API.

### AP (Availability Priority) — Stale Data Acceptable

These operations tolerate briefly stale data for better responsiveness:

| Domain | Staleness Budget | Mechanism |
|---|---|---|
| Dashboard summary counts | 60 seconds | React Query `staleTime: 60_000` |
| Client/user lists (admin pages) | 60 seconds | React Query with background refetch |
| Country lists, permission maps | 60 seconds | React Query (rarely changes) |
| Fee schedule display | 60 seconds | React Query |
| Audit log display | 60 seconds | React Query |

If read replicas are enabled in Supabase, these AP queries can be routed there.

---

## Security Review

### CSRF

Not vulnerable. All API routes use JSON request bodies (not HTML form submissions). Auth is via:
- Supabase Auth cookies (httpOnly, secure, SameSite=lax) set by `@supabase/ssr`
- `Authorization: Bearer` headers for Edge Function proxying

SameSite=lax cookies prevent cross-origin form submissions from carrying credentials. JSON Content-Type prevents simple CORS requests. No CSRF tokens needed.

### XSS

- No `dangerouslySetInnerHTML` usage found in the codebase
- HTML escaping via `escapeHtml()` in Edge Functions (invite-user, users)
- All database queries use Supabase JS SDK (parameterized, no raw SQL)
- User input is validated via Zod schemas before processing

### SQL Injection

Not vulnerable. The Supabase JS SDK uses parameterized queries via PostgREST. No raw SQL is executed from frontend or API routes. Edge Functions use the same SDK.

### Row-Level Security

RLS is enabled on every public table. Policies enforce:
- Users can only read/write their own profile data
- Client users can only access data within their `tenant_id`
- Admin operations use service_role (bypasses RLS) only in server-side code
- The `idempotency_keys` table has all public grants revoked — accessible only via service_role

### Secret Protection

- `SUPABASE_SERVICE_ROLE_KEY` is used only in `createAdminClient()` (server.ts) and Edge Functions
- Never exposed via `NEXT_PUBLIC_` environment variables
- Never returned in API responses
- Password hashes are never returned from any query (Supabase Auth stores them separately)

### Cookies

| Cookie | httpOnly | secure | SameSite | Purpose |
|---|---|---|---|---|
| Supabase auth cookies | Yes | Yes (prod) | lax | Auth session |
| `aipt-device-fp` | Yes | Yes (prod) | lax | Device fingerprint for session validation |
| `aipt-ds-valid` | Yes | Yes (prod) | lax | 60s device session validation cache |

### Rate Limiting

| Endpoint | Limit | Type |
|---|---|---|
| `/api/auth/login` | 10 req / 10 min | Per IP (strict) |
| `/api/auth/unblock-request` | 10 req / 10 min | Per IP (strict) |
| `/api/invitation/accept` | 20 req / 10 min | Per IP (moderate) |
| `/api/invitation/verify` | 20 req / 10 min | Per IP (moderate) |
| `/api/poa/translate` | 30 req / 1 min | Per user |
| Login Edge Function | 5 wrong passwords | Per account (lockout) |

---

## Connection Pooling

The Supabase JS SDK (`@supabase/supabase-js`) uses HTTP/REST for all CRUD operations (not persistent TCP connections). Supabase provides Supavisor as a connection pooler at the infrastructure level. No app-level connection pooling configuration is needed.

Edge Functions similarly use the HTTP REST API via the SDK. Each function invocation creates a fresh client, but the underlying HTTP connection is pooled by the Deno runtime.
