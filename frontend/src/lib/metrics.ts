/**
 * Lightweight in-memory metrics collector.
 * Resets per Lambda cold start — suitable for per-instance snapshots,
 * not durable aggregation. Exposed via /api/admin/system-status.
 */

const LATENCY_BUFFER_SIZE = 200;

interface RouteMetrics {
  requests: number;
  errors: number;
  rateLimitHits: number;
}

const routeCounters = new Map<string, RouteMetrics>();
const latencyBuffer: number[] = [];
let loginSuccesses = 0;
let loginFailures = 0;
let instanceStartedAt = new Date().toISOString();

function getRoute(route: string): RouteMetrics {
  let m = routeCounters.get(route);
  if (!m) {
    m = { requests: 0, errors: 0, rateLimitHits: 0 };
    routeCounters.set(route, m);
  }
  return m;
}

export function recordRequest(route: string) {
  getRoute(route).requests += 1;
}

export function recordError(route: string) {
  getRoute(route).errors += 1;
}

export function recordRateLimitHit(route: string) {
  getRoute(route).rateLimitHits += 1;
}

export function recordLatency(durationMs: number) {
  if (latencyBuffer.length >= LATENCY_BUFFER_SIZE) {
    latencyBuffer.shift();
  }
  latencyBuffer.push(durationMs);
}

export function recordLoginSuccess() {
  loginSuccesses += 1;
}

export function recordLoginFailure() {
  loginFailures += 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getSnapshot() {
  const sorted = [...latencyBuffer].sort((a, b) => a - b);
  const totalRequests = Array.from(routeCounters.values()).reduce((s, m) => s + m.requests, 0);
  const totalErrors = Array.from(routeCounters.values()).reduce((s, m) => s + m.errors, 0);
  const totalRateLimitHits = Array.from(routeCounters.values()).reduce((s, m) => s + m.rateLimitHits, 0);

  return {
    instanceStartedAt,
    totalRequests,
    totalErrors,
    totalRateLimitHits,
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      samples: sorted.length,
    },
    loginSuccesses,
    loginFailures,
    routes: Object.fromEntries(routeCounters),
  };
}
