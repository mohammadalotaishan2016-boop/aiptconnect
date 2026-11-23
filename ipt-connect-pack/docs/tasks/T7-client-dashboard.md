# T7. Client dashboard (must never hang or fail)

Read CLAUDE.md first. Prerequisite: T0 to T6 done.
If there are many modules, do ONE module per sub-session and update docs/PROGRESS.md each time.

- Restructure the design and data layer so the dashboard always loads.
- Audit each module. Fix broken icons, errors, failed API calls, layout bugs.
- No blocking loading screens. Skeletons and cached data first, then background refresh
  (React Query with staleTime, prefetching, lazy loading per module).
- Modules open instantly. Paginate lists, debounce search, memoize heavy components.
- Move repeated logic into reusable functions and hooks. Remove duplicate queries and components.
- Optimize database access: select only needed columns, correct indexes, no N+1 (use joins or batches).
- Client users only ever see their own tenant's data (RLS and server both enforce it).
- Error states with a friendly message and a retry button, never a frozen or blank page.
- Verification: dashboard loads with cached data instantly; each module tested with two tenants;
  report p95 latency for the main queries.
