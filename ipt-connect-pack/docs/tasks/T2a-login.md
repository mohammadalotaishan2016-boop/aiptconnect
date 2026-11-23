# T2a. Login (status check and 5-attempt lockout)

Read CLAUDE.md first. Prerequisites: T0 and T1 done. Device rules are in T2b, not here.

- Remove email OTP verification from login completely (UI, API, unused code).
- Login with registered credentials only. Only status "active" can log in.
  After login, route by role: administrator -> admin dashboard, client -> client dashboard.
- Pending: "Your account is waiting for administrator approval."
  Suspended and deactivated: a safe message to contact the administrator.
- **Wrong password limit:** login goes through a server route that counts failures.
  After 5 failed attempts set status = 'locked'. Show a clear message and a "Request unblock"
  button that creates an `unblock_requests` row for the administrator.
  Reset the counter on success.
- Use generic error text so attackers cannot tell if an email exists.
- Add rate limiting by IP on the login route.
- Test: wrong password x5 locks; locked user cannot log in; each status shows the right message.
- Once a new registered account has been approved by the administrator (status changed from "pending" to "active"), the client user is authorized to log in with their own credentials.
- **Bug fix (2026-11-20):** Admin approval was setting the legacy `account_status = 'active'` but
  not the unified `status` column. The login function checks `profiles.status`, so approved clients
  (e.g. bahrain@aiptlaw.com) were still rejected as "pending". Fix: the users Edge Function now
  sets `status` alongside `account_status` for all approval, rejection, suspension, unlock, and
  direct account_status changes.
