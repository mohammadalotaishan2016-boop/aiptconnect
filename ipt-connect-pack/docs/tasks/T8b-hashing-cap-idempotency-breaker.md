# T8b. Consistent hashing, CAP theorem, idempotency, circuit breaker

Read CLAUDE.md first. Prerequisite: T8a done.

## Consistent hashing
- Use it only where data is spread across nodes (cache cluster keys, routing of real-time
  connections). Adding or removing a node must move only a small share of keys.
- If a managed service already does this, use that and document it. Do not build my own.

## CAP theorem (document in docs/architecture.md)
- Auth, sessions, devices, login_requests, status changes: consistency first (CP). Read and write
  on the primary database. A blocked user must stay blocked.
- Dashboard counts, lists, cached cards: availability first (AP). Slightly stale data is fine and
  refreshes in the background. Read replicas may serve these.

## Idempotency
- Require an Idempotency-Key on critical writes: approve user, device approve/deny, invitation
  create or accept, password reset, import Excel, and any payment or fee action.
- Store the key and result in `idempotency_keys` (unique constraint, expiry) so a retry returns
  the same result and never creates duplicates.

## Circuit breaker
- Wrap every external call (email, storage, third-party APIs, cache) with a timeout, limited retry
  with backoff, and a circuit breaker that opens after repeated failures.
- When open, return a safe fallback (cached data or a friendly message), never a hang.
  Log every state change.
