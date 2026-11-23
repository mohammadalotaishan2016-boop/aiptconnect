/**
 * k6 load test — Admin dashboard operations
 *
 * Run:  k6 run tests/load/k6-dashboard.js --env APP_URL=https://staging.example.com --env ADMIN_TOKEN=<jwt>
 *
 * WARNING: Run against STAGING only. Never against production.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('dashboard_errors');
const readDuration = new Trend('read_duration', true);

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    read_duration: ['p(95)<1000'],
    dashboard_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.02'],
  },
};

const APP_URL = __ENV.APP_URL || 'http://localhost:3000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Cookie: `sb-access-token=${ADMIN_TOKEN}`,
  };
}

export default function () {
  group('Health check', () => {
    const res = http.get(`${APP_URL}/api/health`, { tags: { name: 'health' } });
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  group('Readiness check', () => {
    const res = http.get(`${APP_URL}/api/ready`, { tags: { name: 'ready' } });
    check(res, { 'ready 200': (r) => r.status === 200 });
  });

  group('System status', () => {
    const res = http.get(`${APP_URL}/api/admin/system-status`, {
      headers: authHeaders(),
      tags: { name: 'system-status' },
    });
    readDuration.add(res.timings.duration);
    const ok = check(res, { 'system-status 200': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  group('User list (paginated)', () => {
    const res = http.get(`${APP_URL}/api/admin/users?page=1&limit=20`, {
      headers: authHeaders(),
      tags: { name: 'user-list' },
    });
    readDuration.add(res.timings.duration);
    const ok = check(res, {
      'user-list 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  group('Client list', () => {
    const res = http.get(`${APP_URL}/api/admin/clients?page=1&limit=20`, {
      headers: authHeaders(),
      tags: { name: 'client-list' },
    });
    readDuration.add(res.timings.duration);
    const ok = check(res, {
      'client-list 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const p95 = data.metrics.read_duration?.values?.['p(95)'] || 'N/A';
  const errors = data.metrics.dashboard_errors?.values?.rate || 0;
  console.log(`\n=== Dashboard Load Test Summary ===`);
  console.log(`  p95 read duration: ${typeof p95 === 'number' ? p95.toFixed(0) : p95} ms`);
  console.log(`  Error rate: ${(errors * 100).toFixed(2)}%`);
  console.log(`  Target: p95 < 1000ms, errors < 1%\n`);
  return {};
}
