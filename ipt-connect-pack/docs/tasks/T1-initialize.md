# T1. Initialize the whole application

Read CLAUDE.md first. Prerequisite: T0 done.

- Audit project structure, dependencies, env variables, folder layout, dead code.
- Fix build errors, console errors, TypeScript errors. Remove unused files and packages.
- Set up shared foundations:
  - one MUI theme (see CLAUDE.md design system)
  - API client, error handler, Zod schemas folder, reusable hooks
  - reusable server utilities: auth guard, role guard, tenant guard, status guard, pagination helper
  - the shared role-permission map
  - typed Supabase clients: browser client (anon key) and server client (service role, server code only)
  - generate database types from the schema
- Add a global error boundary and a standard API response format `{ success, data, error }`.
- Order the database code correctly: connect, schema, indexes, policies, then queries.
