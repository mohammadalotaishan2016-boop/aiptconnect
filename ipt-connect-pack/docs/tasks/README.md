# How to use these files

## Setup (once)
1. Copy `CLAUDE.md` to the ROOT of the IPT Connect project.
2. Copy the `docs/` folder into the project.
3. Start Claude Code in the project folder. It reads CLAUDE.md automatically.

## Starter prompt for each session (copy, change the task name)
> Read docs/PROGRESS.md and docs/tasks/T0-database.md. Do Part A only (audit, read-only).
> Do not edit files. Report and wait for my approval.

After approval, in the same session:
> Approved. Implement the plan. Then give the Verification Report and update docs/PROGRESS.md.

## Session order (one row = one session, `/clear` between sessions)
| # | File | What |
|---|---|---|
| 1 | T0-database.md | Part A: audit only (read-only) |
| 2 | T0-database.md | Part B: migration and RLS tests (after you approve) |
| 3 | T1-initialize.md | Initialize the whole app |
| 4 | T2a-login.md | Login, status check, 5-attempt lockout |
| 5 | T2b-one-device.md | One account one device, Realtime approval |
| 6 | T3-register.md | Register |
| 7 | T4-reset-password.md | Reset password |
| 8 | T5-invitation.md | Invitation |
| 9 | T6-admin-permissions.md | Admin pages, permissions, audit logs |
| 10 | T6b-1-users-speed-status.md | /users: speed, statuses, summary |
| 11 | T6b-2-users-actions.md | /users: actions, edit, import/export |
| 12 | T7-client-dashboard.md | Client dashboard (one module per sub-session if large) |
| 13 | T8a-readiness-cache-ratelimit.md | Scale report, load balancer, cache, CDN, rate limit |
| 14 | T8b-hashing-cap-idempotency-breaker.md | Consistent hashing, CAP, idempotency, circuit breaker |
| 15 | T8c-observability-database.md | Observability and database for 100,000 users |
| 16 | T8d-loadtest-security.md | Load test and security review |

You can stop after T7 and do T8 later, when you really need 100,000 users.

## Token-saving tips
- Use plan mode (Shift+Tab) for audits and plans.
- Commit and `/clear` at the end of each session. Next session: "T2a is done, continue with T2b."
- Use Sonnet for normal coding. Use Opus only for hard parts (migrations, auth, RLS).
- Give file paths in your prompt so Claude does not search the whole repo.

## What changed from the original master prompt
- Permanent rules moved to CLAUDE.md. Each task is its own file.
- Removed the "act as a full team" roleplay (it adds nothing).
- Removed `locked_until` (locked users need an administrator, so it was confusing).
- T2: a logged-out device now loses access immediately (not only when its token expires).
- Redis/Upstash is optional in T8, not required.
- T2, T6b, and T8 are split into smaller sessions.
- Verification Report is shorter. Load-test numbers only in T7 and T8.
