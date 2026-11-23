# T4. Reset password (no OTP)

Read CLAUDE.md first. Prerequisites: T0, T1, T2a done.

- Secure link-based reset (Supabase Auth recovery link, or hashed single-use tokens).
  Short expiry (for example 30 minutes), single use. No numeric codes.
- Same response whether or not the email exists. Rate limit requests.
- After reset: revoke all active devices, reset failed_login_count, write an audit log.
- Reset does NOT change status (a suspended or deactivated user stays that way;
  a locked user stays locked until the administrator unlocks).
- Test: used link fails; expired link fails; unknown email gives the same message.
