# Load Tests

Performance/load tests for AIP&T / IPT Connect using [k6](https://k6.io/).

> **WARNING: Run against STAGING only. Never against production.**

## Prerequisites

1. Install k6: https://k6.io/docs/get-started/installation/
2. Seed staging with test users (see below)
3. Set environment variables

## Seed test users

Create 5 test users in your staging Supabase project:

```
loadtest-01@test.local  through  loadtest-05@test.local
Password: LoadTest!2026
Role: client, status: active, approval_status: approved
```

For the dashboard test, you also need an admin JWT token.

## Running

### Login flow (ramps to 200 VUs)

```bash
k6 run tests/load/k6-login.js --env APP_URL=https://staging.example.com
```

### Dashboard operations (ramps to 100 VUs)

```bash
k6 run tests/load/k6-dashboard.js \
  --env APP_URL=https://staging.example.com \
  --env ADMIN_TOKEN=<admin-jwt-token>
```

## Thresholds

| Metric | Target |
|---|---|
| Login p95 latency | < 500 ms |
| Dashboard read p95 latency | < 1000 ms |
| Login error rate | < 1% |
| Dashboard error rate | < 1% |

## Interpreting results

k6 prints a summary at the end of each run. Key metrics:
- `http_req_duration` — overall request latency percentiles
- `login_duration` / `read_duration` — custom latency metrics
- `login_errors` / `dashboard_errors` — custom error rates
- `http_req_failed` — built-in failure rate
