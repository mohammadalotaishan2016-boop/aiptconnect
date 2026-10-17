# AIP&T performance audit — 17 October 2026

## Architecture reviewed

- Next.js 14 / React frontend under `frontend/`, built by the existing AWS Amplify configuration in `amplify.yml`.
- Supabase Postgres and Edge Functions under `backend/supabase/`.
- Private document storage in AWS S3. Document URLs remain signed and short-lived.
- No self-managed web servers, containers, or Lambda targets were found for a separate application load balancer.

## Changes already in place

- Replaced two large PNG assets with WebP versions (about 90% smaller) and added lazy loading to non-critical images.
- Self-hosted WOFF2 fonts and set long-lived browser cache headers for static images and fonts in `frontend/next.config.mjs`.
- Split client-only shell and translation code with dynamic imports; added loading states.
- Paginated and debounced the client picker on Roles; its database search uses the deployed `list_client_permission_targets` function and index.
- Removed five sequential category upserts from each public Fees API GET. Default fee categories are seeded by the existing migration and maintained by fee sync.
- Added query/version-specific ETags and short public cache headers to all fee response modes. The response contains shared fee catalog data only; authenticated or client-specific API responses are not made publicly cacheable.

## Measurements

### Fee API before and after the GET optimization

Endpoint: `fees-api?category=Trademark&limit=10`. Each sample used a distinct cache-busting query value, so this compares function/database work rather than a warm browser cache. The payload stayed 2,751 bytes.

| Run | Samples (ms) | Median |
| --- | --- | ---: |
| Before removing the sequential writes | 6,014; 5,374; 4,952; 3,772 | 5,163 ms |
| After removing the writes and adding cache metadata | 4,051; 2,039; 1,977; 2,086 | 2,063 ms |

The sequential sample median decreased by about 60%. Latency remains variable: a concurrent smoke run of the Standard, Classes, and matrix modes took about 7.1 seconds per request. All three modes returned HTTP 200 and the expected cache headers, so additional endpoint-level profiling is still warranted.

### Live database checks

- Active row counts: Requirements 174, Notifications 7, Projects 0, Clients 2.
- A representative active Requirements join-and-sort query took 5.9 ms and read 174 rows. No extra index was added based on this small dataset and plan.
- Existing list indexes cover common client, project, notification, requirement, and profile lookup paths. The Roles feature has its own active-client profile index.
- Aggregate `pg_stat_statements` includes several historical fee and timezone queries with high maximum durations. They are not yet reliably attributed to a current page or request, so this audit does not recommend speculative indexes for them.

### Lighthouse snapshot

Lighthouse 13.5, mobile emulation with simulated throttling, local optimized production build. The local security product injected a 184 KB script into pages, so the audits blocked that injection URL. Pages were unauthenticated; these scores cover route shells and access gates, not authenticated records or client workflows. INP was not measured because no real interaction session was run.

| Route | Performance | Accessibility | FCP | LCP | TBT | CLS | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Login | 94 | 96 | 1.48 s | 2.70 s | 152 ms | 0.000 | 305 KiB |
| Dashboard | 79 | 96 | 1.45 s | 4.27 s | 280 ms | 0.000 | 319 KiB |
| Projects | 96 | 96 | 1.64 s | 2.61 s | 65 ms | 0.043 | 324 KiB |
| Requirements | 94 | 96 | 1.64 s | 2.74 s | 89 ms | 0.082 | 314 KiB |
| Users | 95 | 96 | 1.54 s | 2.75 s | 82 ms | 0.040 | 313 KiB |
| Fees | 95 | 96 | 1.51 s | 2.87 s | 0 ms | 0.000 | 333 KiB |
| Client POA | 86 | 96 | 1.39 s | 4.19 s | 42 ms | 0.000 | 325 KiB |
| Client Notifications | 87 | 96 | 1.37 s | 3.97 s | 31 ms | 0.000 | 328 KiB |

Largest remaining audited frontend opportunity: route-level CSS chunks account for roughly 42 KiB of unused CSS on the Fees route and block rendering in mobile simulation. Moving global styles to route-specific layouts may reduce this, but it needs visual checks across the admin and client routes because the current styles share global cascade rules.

## Validation

- `npm run typecheck -- --incremental false` passed.
- Optimized Next.js production build passed and generated all 49 routes.
- Existing regression scripts passed for client permissions, management utilities and 1,205-row pagination, admin document lifecycles, user import authorization, and user deletion safeguards.
- Live Fees API smoke checks passed for standard, Classes, and “Up to 5 classes” matrix responses; all returned public cache headers and ETags.
- Lighthouse audited the eight routes listed above. The authenticated role/client workflow and live client data were not part of those browser audits.

## Infrastructure and remaining work

- No load balancer was provisioned: there are no registered application-server targets, and the measured app hosting is managed Amplify plus Supabase Edge Functions. A standalone ALB would not route these existing services.
- No database pool or speculative indexes were added. Edge Functions use Supabase's HTTP client, and the measured Requirements query is small and fast.
- The unauthenticated Lighthouse snapshot identifies slow shell LCP on Dashboard, POA, and Notifications. Authenticated browser measurements are needed before changing those data flows.
- Fees API latency remains variable under concurrent requests. Attribute the cumulative database outliers to a current endpoint, then capture query plans under representative authenticated traffic before further schema changes.
- No frontend deployment was triggered by this audit; the frontend optimization commit is already on `main`. The Fees Edge Function change was deployed directly to the configured Supabase project.

## Rollback

- Revert the Fees API function to the prior deployed version from Supabase Dashboard or redeploy the previous source revision. No schema or fee data was changed by this optimization.
- Static asset caching is versioned by Next.js build paths; rollback is the normal Amplify deployment rollback.
