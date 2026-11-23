# T10a — Client Device Management & Login Approval System

**Page:** `http://localhost:3002/clients` (admin dashboard)

## Goal
Implement a device management and login approval system for client accounts. When a client
logs in on a new device, the system checks their `max_devices` limit against currently
registered devices and either allows automatic login or triggers an approval flow.

## Existing infrastructure (already built)

| Component | Status | Location |
|---|---|---|
| `devices` table | Exists | Migration `202611190006` — user_id, device_id, status (active/revoked), user_agent, ip, etc. |
| Device metadata columns | Exists | Migration `202611210001` — device_name, device_type, browser, operating_system |
| `device_sessions` table | Exists | Migration `202611210001` — maps auth sessions to devices |
| `login_requests` table | Exists | Migration `202611200001` — pending/approved/denied/expired, 5-min TTL, pg_cron cleanup |
| `approve_device_login` RPC | Exists | Migration `202611210002` — atomic: revokes approver device, registers new device, creates session, audit log |
| Login Edge Function | Exists | `backend/supabase/functions/login/index.ts` — device fingerprint, limit check, approval flow, Realtime broadcast |
| `get_tenants_page` RPC | Exists | Migration `202611200008` — paginated clients with max_devices, registered_devices, invitation_eligibility |
| `max_devices` on profiles | Exists | Migration `202611190003` |
| Unique constraint on devices | Exists | Migration `202611200002` — (user_id, device_id) |
| Audit log actions | Exists | device_register, device_approve, device_deny, device_revoke |

## Login flow (already implemented in Edge Function)

### 1. Check registered devices before login
- Retrieve `max_devices` from `profiles`
- Count active devices for the user
- Exclude the current fingerprint if already registered (re-login on same device)

### 2. Automatic login — no approval required
If `active_devices < max_devices`:
- Register/upsert the new device
- Create a `device_sessions` entry
- Return `{ ok: true }` — client logs in immediately

### 3. Approval required — device limit reached
If `active_devices >= max_devices`:
- **max_devices = 2**: hard deny (no approval flow) — `{ denied: true, code: "device_limit_hard" }`
- **max_devices = 1 or 3+**: approval flow
  - Recovery: if no other active device can approve → allow direct login
  - Otherwise: create `login_requests` row with stored session tokens
  - Broadcast to `user-{userId}` Realtime channel
  - Return `{ waiting: true, request_id }` — new device polls for approval

### 4. Client accepts the approval
Via `approve_device_login` RPC (atomic transaction):
1. Lock the login_request (skip locked — prevents race conditions)
2. Validate ownership, status, expiry
3. Revoke the approving device + its device_sessions
4. Register new device (upsert)
5. Create device_session for new device
6. Mark request approved, audit log
7. Return stored session tokens for the new device

### 5. Client rejects the approval
- Update `login_requests.status` → `'denied'`
- No devices changed, no sessions revoked

### 6. Expected behaviour table

| Max Devices | Registered | New Device | Expected Result |
|---:|---:|---:|---|
| 1 | 0 | 1 | Automatic login |
| 1 | 1 | 1 | Approval required |
| 2 | 1 | 1 | Automatic login |
| 2 | 2 | 1 | Hard deny (no approval) |
| 3 | 2 | 1 | Automatic login |
| 3 | 3 | 1 | Approval required |

## Validation results (audit 2026-11-21)

### Frontend (`/clients` page) — ALL IMPLEMENTED
- [x] Clients table shows `max_devices` and `registered_devices` columns — `page.tsx:1076-1090`
- [x] Device usage filter works (available / fully_utilized / exceeded) — `TenantFilters` + `get_tenants_page` RPC `p_device_usage`
- [x] Admin can view a client's registered devices (modal) — `DeviceManagementPanel.tsx` with tabs: Registered Devices / Approval History
- [x] Admin can force-revoke a device — `DeviceManagementPanel.tsx:107-125` → `POST /api/admin/devices`
- [x] Admin can change a client's `max_devices` value — `MaxDevicesCell` inline edit in clients table

### Client-side login UI — ALL IMPLEMENTED
- [x] Login page sends `device_fingerprint` with credentials — `login/page.tsx:61-69` (UUID stored in localStorage)
- [x] "Waiting for approval" screen shown when `{ waiting: true }` returned — `login/page.tsx:106-108` → redirects to `/login/waiting`
- [x] Polls (5s) + Realtime to detect approval/denial/expiry — `login/waiting/page.tsx:9-81`
- [x] On approval: sets session via `supabase.auth.setSession()` + cookie — `login/waiting/page.tsx:42-62`
- [x] On denial: shows "Login request denied" with back-to-login button — `login/waiting/page.tsx:115-128`
- [x] On expiry: shows "Request expired" with retry option — `login/waiting/page.tsx:130-144`
- [x] Hard deny (max_devices=2): shows "Device limit reached" modal — `login/page.tsx:139-141`

### Client-side device approval UI — ALL IMPLEMENTED
- [x] Receives Realtime broadcast of `login_request` event — `DeviceApprovalBanner.tsx:31-36`
- [x] Shows notification with new device info (name, type, browser, OS, IP, time) — `DeviceApprovalBanner.tsx:82-167`
- [x] Accept button → calls `POST /api/auth/device-approve` with RPC — `DeviceApprovalBanner.tsx:53-66`
- [x] Deny button → calls `POST /api/auth/device-deny` — `DeviceApprovalBanner.tsx:53-66`
- [x] After accepting: existing device logged out via `device_revoked` broadcast — `DeviceApprovalBanner.tsx:37-45`
- [x] Banner rendered in both AdminAppShell and ClientShell — always visible for logged-in users

### Security requirements — ALL MET
- [x] Device limit enforced server-side (login Edge Function `index.ts:124-182`)
- [x] `login_requests` table is service_role only (migration `202611200001:30-33`)
- [x] `approve_device_login` RPC is service_role only (migration `202611210002:155-156`)
- [x] Revoked devices tracked via `device_sessions.status` (checked server-side)
- [x] Concurrent approval requests handled (`FOR UPDATE SKIP LOCKED` in RPC)
- [x] Device count updated atomically (upsert + revoke in single RPC transaction)
- [x] Audit log for: approve, deny, revoke (Edge Function + API routes)

### Audit log coverage
- [x] `device_approve` — `approve_device_login` RPC inserts audit log
- [x] `device_deny` — `device-deny/route.ts:48-56`
- [x] `device_revoke` — `admin/devices/route.ts` (admin force-revoke)

## Registered Devices inline dropdown (added 2026-11-21)

### What was added
The "Registered Devices" cell in the `/clients` table now shows an inline dropdown when clicked, displaying device details and admin revoke actions without opening the full modal.

### Behaviour
1. Admin clicks the device count in the Registered Devices column
2. A fixed-position dropdown appears below the cell showing:
   - Each active device: icon, name, browser/OS, last seen, status badge, **Revoke** button
   - Revoked devices shown below (dimmed) with revoke reason
3. Clicking "Revoke" removes the device, updates the count in the table row
4. "View All Details" link at the bottom opens the existing `DeviceManagementPanel` modal
5. Click-outside, Escape key, or table scroll closes the dropdown

### Files changed
| File | Change |
|---|---|
| `frontend/src/lib/device-utils.ts` | New — shared `Device` interface, `DEVICE_TYPE_ICONS`, `deviceStatusBadge()`, `formatDeviceDate()` |
| `frontend/src/components/DeviceManagementPanel.tsx` | Imports shared utils from `device-utils.ts` (no behavior change) |
| `frontend/app/clients/page.tsx` | New `RegisteredDevicesCell` component with inline dropdown; replaces inline button |
| `frontend/app/clients.css` | New `.reg-devices-*` dropdown styles |

---

## Files involved (all existing)

| File | Purpose |
|---|---|
| `backend/supabase/functions/login/index.ts` | Login Edge Function — fingerprint, limit check, approval flow |
| `backend/supabase/migrations/202611190006` | `devices` table |
| `backend/supabase/migrations/202611200001` | `login_requests` table + pg_cron cleanup |
| `backend/supabase/migrations/202611200002` | `devices` unique constraint (user_id, device_id) |
| `backend/supabase/migrations/202611200008` | `get_tenants_page` RPC (clients + devices + invitations) |
| `backend/supabase/migrations/202611210001` | `device_sessions`, device metadata columns |
| `backend/supabase/migrations/202611210002` | `approve_device_login` atomic RPC |
| `frontend/app/clients/page.tsx` | Admin clients table with max_devices, registered_devices, DeviceManagementPanel |
| `frontend/app/login/page.tsx` | Login page — fingerprint, waiting redirect, hard deny modal |
| `frontend/app/login/waiting/page.tsx` | Waiting-for-approval screen — poll + Realtime |
| `frontend/app/api/auth/login/route.ts` | Login API route (proxies to Edge Function) |
| `frontend/app/api/auth/device-approve/route.ts` | Approve API — calls `approve_device_login` RPC |
| `frontend/app/api/auth/device-deny/route.ts` | Deny API — updates login_request, audit log |
| `frontend/app/api/auth/login-request/[id]/route.ts` | Poll endpoint for waiting page |
| `frontend/app/api/auth/set-device-cookie/route.ts` | Sets device fingerprint httpOnly cookie |
| `frontend/app/api/admin/devices/route.ts` | Admin device list + revoke endpoint |
| `frontend/app/api/admin/devices/history/route.ts` | Admin login request history |
| `frontend/src/components/DeviceApprovalBanner.tsx` | Realtime banner — approve/deny from existing device |
| `frontend/src/components/DeviceManagementPanel.tsx` | Admin modal — registered devices + approval history |
| `frontend/src/components/AdminAppShell.tsx` | Mounts DeviceApprovalBanner for admin users |
| `frontend/src/components/ClientShell.tsx` | Mounts DeviceApprovalBanner for client users |
