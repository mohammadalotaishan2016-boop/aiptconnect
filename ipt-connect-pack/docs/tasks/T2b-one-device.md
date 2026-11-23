# T2b. One account, one device (default max_devices = 1)

Read CLAUDE.md first. Prerequisite: T2a done.

- The administrator can raise the limit for a specific user (UI comes in T6).
- If the limit is reached and a new device tries to log in, create a `login_requests` row.
  The new device shows "Waiting for approval".
- The already-logged-in device gets a real-time alert through Supabase Realtime (scoped by user)
  with device name, IP, and time, plus Approve and Deny buttons. Add a polling fallback.
- Approve: the existing device is logged out automatically and the new device is logged in.
  Deny or expiry: the new device is rejected.
- **A logged-out device must lose access immediately**, not only when its token expires.
  Revoke the refresh token AND check `devices.status = 'active'` on every protected request
  (or use a short access-token expiry). Show me the approach in the plan.
- Enforce everything on the server. Use idempotent handling (Idempotency-Key and
  `idempotency_keys`) so a double click or retry cannot create duplicate sessions.
- Test: second device waits; approve logs out the first device immediately; deny rejects;
  expiry rejects; double click creates one session only.
