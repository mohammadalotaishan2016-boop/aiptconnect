/**
 * k6 load test — Login flow
 *
 * Run:  k6 run tests/load/k6-login.js --env APP_URL=https://staging.example.com
 *
 * WARNING: Run against STAGING only. Never against production.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('login_errors');
const loginDuration = new Trend('login_duration', true);

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    login_duration: ['p(95)<500'],
    login_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const APP_URL = __ENV.APP_URL || 'http://localhost:3000';

// Pre-seed these users in your staging environment
const TEST_USERS = [
  { email: 'loadtest-01@test.local', password: 'LoadTest!2026' },
  { email: 'loadtest-02@test.local', password: 'LoadTest!2026' },
  { email: 'loadtest-03@test.local', password: 'LoadTest!2026' },
  { email: 'loadtest-04@test.local', password: 'LoadTest!2026' },
  { email: 'loadtest-05@test.local', password: 'LoadTest!2026' },
];

export default function () {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  const res = http.post(
    `${APP_URL}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );

  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has session data': (r) => {
      try { return !!JSON.parse(r.body).session; } catch { return false; }
    },
  });

  errorRate.add(!ok);

  // Simulate user think time
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  const p95 = data.metrics.login_duration?.values?.['p(95)'] || 'N/A';
  const errors = data.metrics.login_errors?.values?.rate || 0;
  console.log(`\n=== Login Load Test Summary ===`);
  console.log(`  p95 login duration: ${typeof p95 === 'number' ? p95.toFixed(0) : p95} ms`);
  console.log(`  Error rate: ${(errors * 100).toFixed(2)}%`);
  console.log(`  Target: p95 < 500ms, errors < 1%\n`);
  return {};
}
