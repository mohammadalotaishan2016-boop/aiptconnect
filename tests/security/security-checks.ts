/**
 * Security smoke tests for AIP&T / IPT Connect
 *
 * Run:  npx tsx tests/security/security-checks.ts
 *
 * Required environment variables:
 *   TEST_SUPABASE_URL        – Supabase project URL (staging)
 *   TEST_ANON_KEY            – Supabase anon/public key
 *   TEST_SERVICE_ROLE_KEY    – Supabase service_role key (never commit)
 *   TEST_APP_URL             – Deployed app URL (e.g. http://localhost:3000)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = env('TEST_SUPABASE_URL');
const ANON_KEY = env('TEST_ANON_KEY');
const SERVICE_ROLE_KEY = env('TEST_SERVICE_ROLE_KEY');
const APP_URL = env('TEST_APP_URL');

function env(name: string): string {
  const value = process.env[name];
  if (!value) { console.error(`Missing env var: ${name}`); process.exit(1); }
  return value;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.error(`  FAIL  ${label}`); }
}

// ---------------------------------------------------------------------------
// 1. RLS tenant isolation
// ---------------------------------------------------------------------------
async function testRlsTenantIsolation() {
  console.log('\n--- RLS Tenant Isolation ---');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Pick two distinct tenants (clients) that have fee records
  const { data: tenants } = await admin.from('clients').select('id').limit(2);
  if (!tenants || tenants.length < 2) {
    console.log('  SKIP  Need at least 2 tenants to test isolation');
    return;
  }
  const [tenantA, tenantB] = tenants;

  // Create short-lived test users linked to each tenant
  const emailA = `sec-test-a-${Date.now()}@test.local`;
  const emailB = `sec-test-b-${Date.now()}@test.local`;
  const password = `SecTest!${Date.now()}`;

  const { data: authA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const { data: authB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  if (!authA?.user || !authB?.user) { console.log('  SKIP  Could not create test users'); return; }

  // Insert profiles with different tenant_ids
  await admin.from('profiles').upsert({ id: authA.user.id, role: 'client', client_id: tenantA.id, approval_status: 'approved', account_status: 'active' });
  await admin.from('profiles').upsert({ id: authB.user.id, role: 'client', client_id: tenantB.id, approval_status: 'approved', account_status: 'active' });

  // Sign in as user A and try to read tenant B data
  const clientA = createClient(SUPABASE_URL, ANON_KEY);
  await clientA.auth.signInWithPassword({ email: emailA, password });

  const { data: crossRead } = await clientA.from('fee_records').select('id').eq('tenant_id', tenantB.id).limit(5);
  assert(!crossRead || crossRead.length === 0, 'Client A cannot read tenant B fee records');

  // Cleanup
  await admin.auth.admin.deleteUser(authA.user.id);
  await admin.auth.admin.deleteUser(authB.user.id);
  await admin.from('profiles').delete().in('id', [authA.user.id, authB.user.id]);
}

// ---------------------------------------------------------------------------
// 2. Role escalation prevention
// ---------------------------------------------------------------------------
async function testRoleEscalation() {
  console.log('\n--- Role Escalation ---');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const email = `sec-test-client-${Date.now()}@test.local`;
  const password = `SecEsc!${Date.now()}`;
  const { data: auth } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!auth?.user) { console.log('  SKIP  Could not create test user'); return; }

  const { data: anyClient } = await admin.from('clients').select('id').limit(1).single();
  await admin.from('profiles').upsert({ id: auth.user.id, role: 'client', client_id: anyClient?.id, approval_status: 'approved', account_status: 'active' });

  // Sign in as client
  const client = createClient(SUPABASE_URL, ANON_KEY);
  await client.auth.signInWithPassword({ email, password });
  const { data: { session } } = await client.auth.getSession();

  // Attempt admin-only endpoint
  const res = await fetch(`${APP_URL}/api/admin/system-status`, {
    headers: { Cookie: `sb-access-token=${session?.access_token}` },
  });
  assert(res.status === 401 || res.status === 403, `Client hitting admin endpoint returns ${res.status} (expected 401/403)`);

  // Attempt to self-escalate role via direct DB update
  const { error: escalationError } = await client.from('profiles').update({ role: 'administrator' }).eq('id', auth.user.id);
  assert(!!escalationError, 'Client cannot self-escalate role via profiles table');

  // Cleanup
  await admin.auth.admin.deleteUser(auth.user.id);
  await admin.from('profiles').delete().eq('id', auth.user.id);
}

// ---------------------------------------------------------------------------
// 3. Status blocking (non-active users cannot log in)
// ---------------------------------------------------------------------------
async function testStatusBlocking() {
  console.log('\n--- Status Blocking ---');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const blockedStatuses = ['locked', 'suspended', 'deactivated', 'pending'];

  for (const status of blockedStatuses) {
    const email = `sec-test-${status}-${Date.now()}@test.local`;
    const password = `SecStat!${Date.now()}`;
    const { data: auth } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!auth?.user) { console.log(`  SKIP  Could not create ${status} test user`); continue; }

    const { data: anyClient } = await admin.from('clients').select('id').limit(1).single();
    await admin.from('profiles').upsert({ id: auth.user.id, role: 'client', client_id: anyClient?.id, approval_status: 'approved', account_status: status });

    // Try to log in through the app login endpoint
    const res = await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    assert(res.status !== 200 || body.error, `User with status "${status}" is blocked from login (HTTP ${res.status})`);

    // Cleanup
    await admin.auth.admin.deleteUser(auth.user.id);
    await admin.from('profiles').delete().eq('id', auth.user.id);
  }
}

// ---------------------------------------------------------------------------
// 4. Brute force lockout
// ---------------------------------------------------------------------------
async function testBruteForceLockout() {
  console.log('\n--- Brute Force Lockout ---');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const email = `sec-test-brute-${Date.now()}@test.local`;
  const password = `SecBrute!${Date.now()}`;
  const { data: auth } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!auth?.user) { console.log('  SKIP  Could not create test user'); return; }

  const { data: anyClient } = await admin.from('clients').select('id').limit(1).single();
  await admin.from('profiles').upsert({ id: auth.user.id, role: 'client', client_id: anyClient?.id, approval_status: 'approved', account_status: 'active' });

  // 6 wrong password attempts
  for (let i = 0; i < 6; i++) {
    await fetch(`${APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword!' }),
    });
  }

  // Check account is now locked
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', auth.user.id).single();
  assert(profile?.account_status === 'locked', `Account locked after 6 wrong passwords (status: ${profile?.account_status})`);

  // Correct password should still fail when locked
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert(res.status !== 200, 'Locked account cannot log in even with correct password');

  // Cleanup
  await admin.auth.admin.deleteUser(auth.user.id);
  await admin.from('profiles').delete().eq('id', auth.user.id);
}

// ---------------------------------------------------------------------------
// 5. Security headers
// ---------------------------------------------------------------------------
async function testSecurityHeaders() {
  console.log('\n--- Security Headers ---');

  const res = await fetch(`${APP_URL}/api/health`);
  assert(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  assert(res.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
  assert(!!res.headers.get('referrer-policy'), 'Referrer-Policy is set');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function main() {
  console.log('AIP&T Security Smoke Tests');
  console.log(`App: ${APP_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);

  await testRlsTenantIsolation();
  await testRoleEscalation();
  await testStatusBlocking();
  await testBruteForceLockout();
  await testSecurityHeaders();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
