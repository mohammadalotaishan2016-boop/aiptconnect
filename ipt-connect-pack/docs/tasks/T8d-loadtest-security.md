# T8d. Load test and security review

Read CLAUDE.md first. Prerequisite: T8c done.

## Load test (required; STAGING only, never production)
- Repeatable load test (for example k6) with at least 100,000 seeded test users and these flows:
  login, device approval, Users page with filters, client dashboard modules, reset password,
  invitation accept, Excel import and export.
- Run at expected peak and at 2x peak. Report p95 latency, error rate, and the first thing that
  breaks. Fix bottlenecks and test again until the targets in CLAUDE.md are met.
- Include a rollback plan for every database change.

## Security review
- OWASP checks, secure cookies, CSRF, input validation, no secrets in responses or browser code.
- RLS enabled on every table. Tenant isolation test across two tenants.
- Role escalation test: a client must never reach administrator endpoints.
- Status test: only "active" can log in. Brute-force test of the 5-attempt lockout.
- Dockerfile and Amplify configuration checked and working.
  GitHub workflow runs lint, tests, and build.

## Verification Report
Include load-test numbers at peak and 2x peak, cache hit rate, p95 latency, error rate, and the
bottlenecks found and fixed.
