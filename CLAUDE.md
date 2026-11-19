# AIP&T / IPT Connect: Project Rules (read at the start of every session)

Live app: https://main.d3b61jf52kyhu2.amplifyapp.com (AIP&T | Intellectual Property)
Task files live in `docs/tasks/`. Progress notes live in `docs/PROGRESS.md`.

## HOW WE WORK
1. Do ONLY the task I name. Never start the next task by yourself.
2. For each task: (a) audit the current code, (b) show a short plan, (c) WAIT for my approval,
   (d) implement, (e) give a short Verification Report.
3. Use plan mode for audits and plans. Do not edit files before I approve the plan.
4. One git branch per task (example: `task/t2a-login`). Commit when the task is done.
   Never push to `main`.
5. Do not delete or rename existing data or features. Do not invent tables, columns, or roles.
   If something is unclear, ask me.
6. Reuse existing code. No duplicated functions, components, queries, or styles.
7. All errors show friendly messages. No blank screens, no crashes.
8. Speed first: show cached data and skeletons instantly, never a blocking spinner.
9. Read only the files you need. Do not re-read the whole repo. Keep replies short.
10. At the end of every session, update `docs/PROGRESS.md`: what is done, what is next,
    open questions, decisions I made.

## TARGET SUPABASE PROJECT (must be confirmed before ANY change)
- Project ID (reference used in APIs and URLs): `davupzevvsngppcrynoj`
- Dashboard link I also gave: https://supabase.com/dashboard/project/zvfxbgfttujgpjhaenpv
  (its reference `zvfxbgfttujgpjhaenpv` is DIFFERENT from the Project ID above).
- Before any change: connect read-only, report which project each reference points to,
  and ASK me which one is the target (or whether one is staging and one is production).
- Do not write to, migrate, or delete anything until I confirm. After I confirm, write the
  answer in `docs/PROGRESS.md` under "Target confirmed" and do not ask again.
- Test every migration on staging or a Supabase branch first. Never edit production by hand.

## SECRETS
- Never print, log, commit, or paste secret keys. Keys live only in environment variables.
- The service_role key is server-only. Never in browser code or NEXT_PUBLIC_ variables.

## ROLES (fixed)
Exactly three roles in `users.role`: **"administrator"**, **"client"**, and **"sub_administrator"**.
- Do not add roles, role-like flags, or permission fields. If the code needs more, stop and ask.
- administrator: platform-level. Full access. Manages users, invitations, approvals, max_devices,
  suspend/deactivate/unlock, unblock requests, device force-logout, audit logs, fee data writes.
- sub_administrator: limited administrative access based on explicitly assigned permissions.
  Has read access to admin tables. Does NOT have the same permissions as administrator.
  Write operations (user management, fee sync, spreadsheet save) remain administrator-only.
- client: a user of a client business (tenant). Uses the client dashboard for their own tenant
  only, manages own profile, password, and own devices.
- ONE shared permission map (role -> allowed actions) used by API guards AND UI visibility.
- Enforce role and tenant checks on the server AND with database RLS.
- Read the role from the `users` table, never from user-editable metadata.
- Nobody can change their own role or their own max_devices.

## USER STATUS MODEL (fixed, one status per user)
`users.status` has exactly these values:

| Status | Meaning |
|---|---|
| pending | Registered, waiting for administrator approval. Cannot log in. |
| active | Approved. Can log in. |
| suspended | Blocked by the administrator. Cannot log in. |
| deactivated | Turned off. Cannot log in. |
| locked | Auto-blocked after 5 wrong passwords. Only an administrator can unlock. |
| deleted | Soft delete. Hidden from all lists. |

- Only "active" can log in. Each other status shows a clear, safe message.
- pending -> active (administrator approves). locked -> active (administrator unlocks).
- Administrator-invited users become "active" when they accept (pre-approved).
- Self-registered users start as "pending".

## STACK
Next.js (App Router), TypeScript, MUI, Supabase (PostgreSQL, Auth, Realtime, Storage),
React Hook Form, Zod, TanStack Table, React Query, Node.js, REST API, AWS Amplify, GitHub, Docker.
- This replaces MongoDB/Mongoose. If data still lives in MongoDB, audit it and ask before migrating.
- Prefer Supabase Auth with a `public.users` profile table where id = `auth.users.id`.
  If the code uses NextAuth/Auth.js, show me the options and wait. Never keep two auth systems.

## DESIGN SYSTEM (every page, admin and client)
- Primary color #17a2b8 (the existing dashboard color) as the ONE color across all pages.
- Font: Times New Roman everywhere. Font colors: black and white only.
- One MUI theme file used everywhere. No inline colors or hard-coded fonts.
- Consistent spacing, buttons, inputs, cards, tables, one icon set. Responsive on phone, tablet, desktop.

## DATABASE RULES (short version; full detail in docs/tasks/T0-database.md)
- Every table: id (uuid), created_at, updated_at (trigger), created_by, updated_by, status, soft delete.
- Every client-owned row has `tenant_id` (indexed). RLS enabled on every public table.
- RLS helper functions are SECURITY DEFINER, STABLE, `set search_path = ''`. Use `(select auth.uid())`.
- Compound indexes start with tenant_id. Select only needed columns. Paginate everywhere. No N+1.
- Schema changes only through versioned, idempotent SQL in `supabase/migrations`.
- Never return password hashes or token hashes from any API.

## CAPACITY TARGETS (proposed; tell me if you want different numbers)
100,000 registered users. API p95 under 300 ms. First visible rows or cards under 1 second.
Error rate under 0.1%. No blocking spinners.

## VERIFICATION REPORT (end of every task, keep it short)
1. What changed (files, tables, endpoints, migrations).
2. Tests run and results.
3. Database changes and RLS test results (only if the task touched the database).
4. Known issues or items needing my decision.
(Load-test numbers are required only in T7 and T8.)
