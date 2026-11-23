# T8a. Scale readiness, load balancer, caching, CDN, rate limiting

Read CLAUDE.md first. Prerequisite: T7 done. Target: 100,000 users.
Apply these concepts to THIS stack (Next.js, Supabase, Amplify). If a managed service already
provides a concept, use it and explain how. Do not add tools I do not need.

Step 1: audit and write a short "Scale Readiness Report" (current bottlenecks, plan). WAIT for approval.

## Load balancer
- Run multiple stateless app instances behind the hosting platform's load balancer.
- Keep servers stateless: sessions in Supabase Auth tokens, never in server memory.
- Add health endpoints `/api/health` and `/api/ready` (the latter checks the database).
- Device approval (T2b) uses Supabase Realtime, so alerts reach the right device on any server.

## Caching
- Client: React Query (staleTime, prefetching, background refresh).
- Server: Next.js data cache first. Use a shared cache (Redis/Upstash) ONLY if the report shows it
  is needed (it costs extra). Cache hot read-only data: Users summary counts, country lists,
  permission map, dashboard cards. Short TTLs and explicit invalidation.
- Never cache per-user private data without tenant id and user id in the key.

## CDN
- Static assets, images, fonts, country/flag data through the CDN with long cache headers and
  hashed filenames. Supabase Storage with CDN caching for uploads. Compress and lazy-load images.
- Do not cache authenticated API responses at the CDN.

## Rate limiting
- Sliding-window limiter per IP and per user, shared across instances.
- Strict on login, password reset, invitation, unblock request. Looser on normal reads.
- Return 429 with a Retry-After header and a friendly message. Review Supabase Auth rate limits too.
