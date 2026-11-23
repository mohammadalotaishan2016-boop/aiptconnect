/**
 * Lightweight circuit breaker for Edge Functions.
 * State persists within a warm Deno isolate; resets on cold start (safe default: CLOSED).
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number; // failures before opening (default 5)
  cooldownMs?: number;       // ms in OPEN before trying HALF_OPEN (default 30_000)
  timeoutMs?: number;        // per-call timeout (default 10_000)
}

function log(level: "info" | "warn" | "error", name: string, message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, circuit: name, message, ...extra }));
}

export function createCircuitBreaker(opts: CircuitBreakerOptions) {
  const { name, failureThreshold = 5, cooldownMs = 30_000, timeoutMs = 10_000 } = opts;
  let state: CircuitState = "CLOSED";
  let failures = 0;
  let lastFailureAt = 0;

  function onSuccess() {
    if (state === "HALF_OPEN") {
      log("info", name, "circuit_closed", { previousState: "HALF_OPEN" });
    }
    state = "CLOSED";
    failures = 0;
  }

  function onFailure() {
    failures += 1;
    lastFailureAt = Date.now();
    if (failures >= failureThreshold) {
      if (state !== "OPEN") {
        log("warn", name, "circuit_opened", { failures });
      }
      state = "OPEN";
    }
  }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    // Check if OPEN → maybe transition to HALF_OPEN
    if (state === "OPEN") {
      if (Date.now() - lastFailureAt >= cooldownMs) {
        state = "HALF_OPEN";
        log("info", name, "circuit_half_open");
      } else {
        throw new CircuitOpenError(name);
      }
    }

    // Execute with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new Error(`Circuit breaker ${name}: call timed out after ${timeoutMs}ms`))
          );
        }),
      ]);
      clearTimeout(timer);
      onSuccess();
      return result;
    } catch (err) {
      clearTimeout(timer);
      onFailure();
      throw err;
    }
  }

  return {
    call,
    state: () => state,
    reset: () => { state = "CLOSED"; failures = 0; },
  };
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker ${name} is OPEN — call rejected.`);
    this.name = "CircuitOpenError";
  }
}
