# AIPT API Integration

Last Updated: 2026-10-31 16:18:39

## Project Progress

1. Existing System Audit
   Status: COMPLETED

2. Authentication and Authorization Architecture
   Status: COMPLETED

3. Laravel-Supabase Client ID Mapping
   Status: PENDING

4. Edge Function Security Improvements
   Status: NOT STARTED

5. Local Testing and Laravel Verification
   Status: NOT STARTED

6. Production Deployment
   Status: NOT STARTED

## Important Security Decisions

- Administrator: Can access all clients and departments.
- Client: Can access records belonging to their own company only.
- Associate/User: No access.
- Both Admin Dashboard and Client Dashboard use the same Edge Function.
- Authorization must be validated server-side.
- Never trust a client ID supplied directly by the browser.
- Preserve all existing Git changes.
- Do not deploy without successful testing and approval.

## Current Blockers

- Confirm stable Laravel client identifier.
- Map Laravel client identifier to Supabase clients.id.
- Confirm the Patent deleted_at query issue.
- Locate the original RSA private key matching the registered public key.

