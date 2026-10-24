const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../backend/supabase/functions/quotations/index.ts');
const source = fs.readFileSync(filename, 'utf8').replace(/^import .*;$/gm, '') + '\nexports.withQuotationValidity = withQuotationValidity;';
let handler;
let record;
let role;
const user = { id: 'admin-test', email: 'test@example.invalid' };
function from(table) {
  const filters = [];
  let update;
  return {
    select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    is() { return this; }, order() { return this; },
    update(value) { update = value; return this; },
    async single() {
      if (table === 'profiles') return { data: { role, client_id: 'client-test', approval_status: 'approved', account_status: 'active' } };
      if (table === 'clients') return { data: { email: user.email } };
      throw Error('Unexpected single query');
    },
    async maybeSingle() {
      if (filters.some(([key, value]) => record[key] !== value)) return { data: null, error: null };
      if (update) record = { ...record, ...update };
      return { data: { ...record }, error: null };
    },
    async range() { return { data: [{ ...record }], error: null }; },
  };
}
const sandbox = { exports: {}, Date, Response, Request, URL, console, clientPermissionResponse: async (_db, _userId, _page, _action) => role === 'administrator' ? null : new Response(JSON.stringify({ error: 'Administrator access is required.' }), { status: 403 }), actionForRequest: request => request.method === 'GET' ? 'view' : 'update', createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, from }), Deno: { serve(fn) { handler = fn; }, env: { get() { return ''; } } } };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const validity = sandbox.exports.withQuotationValidity;
for (const [approved_at, expected] of [
  ['2026-09-16T09:00:00.000Z', '2026-12-15T09:00:00.000Z'],
  ['2026-12-20T23:30:00.000Z', '2027-03-20T23:30:00.000Z'],
  ['2028-02-01T00:00:00.000Z', '2028-05-01T00:00:00.000Z'],
]) assert.equal(validity({ status: 'Approved', approved_at }).valid_until, expected);
for (const item of [
  { status: 'Pending Approval', approved_at: '2026-09-16T09:00:00Z' },
  { status: 'Cancelled', approved_at: '2026-09-16T09:00:00Z' },
  { status: 'Approved', approved_at: null },
  { status: 'Approved', approved_at: 'invalid' },
]) assert.equal(validity(item).valid_until, null);
const approve = () => handler(new Request('https://example.invalid/functions/v1/quotations/q-test/approve', { method: 'POST', headers: { Authorization: 'Bearer test-token' } }));
(async () => {
  role = 'administrator'; record = { id: 'q-test', status: 'Pending Approval', approved_at: null };
  const result = await approve(); assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(Date.parse(body.valid_until) - Date.parse(body.approved_at), 90 * 86400000);
  const original = record.approved_at;
  const second = await approve(); assert.notEqual(second.status, 200); assert.equal(record.approved_at, original);
  const list = await handler(new Request('https://example.invalid/functions/v1/quotations', { headers: { Authorization: 'Bearer test-token' } }));
  assert.equal((await list.json()).data[0].valid_until, body.valid_until);
  record = { id: 'q-test', status: 'Pending Approval', approved_at: null };
  const races = await Promise.all([approve(), approve()]);
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
  role = 'client'; record = { id: 'q-test', status: 'Pending Approval', approved_at: null };
  assert.equal((await approve()).status, 403); assert.equal(record.approved_at, null);
  console.log('Passed: 90-day approval validity, calendar boundaries, missing dates, API listing, repeat/concurrent approval and client authorization.');
})().catch(error => { console.error(error); process.exitCode = 1; });
