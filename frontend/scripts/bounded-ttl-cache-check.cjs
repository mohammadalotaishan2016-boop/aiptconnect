const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};

const { BoundedTtlCache } = require('../src/lib/bounded-ttl-cache.ts');
const cache = new BoundedTtlCache(2);

cache.set('user-a:projects', ['a'], 60_000, 1, 100);
cache.set('user-b:projects', ['b'], 60_000, 1, 100);
assert.deepEqual(cache.get('user-a:projects', 101), ['a']);
cache.set('user-c:projects', ['c'], 60_000, 1, 102);
assert.equal(cache.get('user-b:projects', 102), undefined, 'least recently used entry is evicted');
assert.deepEqual(cache.get('user-a:projects', 102), ['a']);
assert.deepEqual(cache.get('user-c:projects', 102), ['c']);

cache.set('expired', ['old'], 1, 1, 200);
assert.equal(cache.get('expired', 201), undefined, 'expired entry is not returned');
cache.set('fresh', ['new'], 60_000, 1, 202);
assert.deepEqual(cache.get('fresh', 202), ['new']);

cache.deleteWhere(key => key.startsWith('user-a:'));
assert.equal(cache.get('user-a:projects', 203), undefined, 'targeted invalidation removes matching keys');
assert.deepEqual(cache.get('user-c:projects', 203), ['c'], 'targeted invalidation preserves unrelated users');

cache.set('zero-ttl', ['never'], 0, 1, 300);
assert.equal(cache.get('zero-ttl', 300), undefined, 'non-positive TTL does not retain entries');

const weighted = new BoundedTtlCache(4, 3);
weighted.set('one', 'a', 100, 2, 400);
weighted.set('two', 'b', 100, 2, 401);
assert.equal(weighted.get('one', 402), undefined, 'weight limit evicts least recently used entries');
weighted.set('oversized', 'large', 100, 4, 403);
assert.equal(weighted.get('oversized', 404), undefined, 'oversized entry is not retained');

const { getSupabaseFunctionCacheMode } = require('../src/lib/supabase/browser.ts');
assert.equal(getSupabaseFunctionCacheMode('fees-api?category=Trademark'), 'default', 'public fee reads may use HTTP cache headers');
assert.equal(getSupabaseFunctionCacheMode('fees-api', 'POST'), 'no-store', 'writes are never cached');
assert.equal(getSupabaseFunctionCacheMode('quotations?lookup=true'), 'no-store', 'user-scoped reads stay uncached by HTTP');
assert.equal(getSupabaseFunctionCacheMode('fees-api', 'GET', 'reload'), 'reload', 'explicit cache policy is preserved');

console.log('PASS: bounded LRU eviction, TTL/weight limits, targeted invalidation, user-key isolation, and fee HTTP-cache policy.');
