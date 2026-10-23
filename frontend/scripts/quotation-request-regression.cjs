// Test cancellation and timeout composition without network access or real timers.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(__dirname, "../src/lib/supabase/browser.ts"),
  "utf8",
);
const functionSource = source.slice(
  source.indexOf("export async function fetchSupabaseFunction"),
);
async function check(mode) {
  let fireTimeout,
    cleared = false,
    fetchSignal;
  const caller = new AbortController();
  const sandbox = {
    exports: {},
    process: { env: {} },
    AbortController,
    Headers,
    DOMException,
    Error,
    window: {
      location: { pathname: '/' },
      setTimeout(callback) {
        fireTimeout = callback;
        return 1;
      },
      clearTimeout() {
        cleared = true;
      },
    },
    getSupabaseBrowserClient: () => null,
    getSupabaseFunctionUrl: () => "https://fixture.invalid",
    getSupabaseFunctionCacheMode: () => "no-store",
    fetch: async (url, init) => {
      fetchSignal = init.signal;
      return new Promise((resolve, reject) => {
        const fail = () => reject(new DOMException("Aborted", "AbortError"));
        if (init.signal.aborted) fail();
        else init.signal.addEventListener("abort", fail, { once: true });
      });
    },
  };
  vm.runInNewContext(
    ts.transpileModule(functionSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    sandbox,
  );
  if (mode === "already-aborted") caller.abort();
  const request = sandbox.exports.fetchSupabaseFunction("quotations", {
    headers: { Authorization: "fixture-token" },
    signal: caller.signal,
  });
  if (mode === "timeout") fireTimeout();
  else if (mode === "cancel") caller.abort();
  await assert.rejects(request, /took too long/);
  assert.ok(fetchSignal.aborted);
  assert.ok(cleared, "Timer must be cleaned up");
}
(async () => {
  await check("cancel");
  await check("timeout");
  await check("already-aborted");
  console.log(
    "Passed: caller cancellation, service timeout with a caller signal, pre-aborted requests, and timer cleanup.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
