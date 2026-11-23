import { NextRequest } from 'next/server';

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  route?: string;
  userId?: string;
  tenantId?: string;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  route?: string;
  userId?: string;
  tenantId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, context: LogContext, message: string, extra?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    ...extra,
  };
  // Structured JSON to stdout — CloudWatch / Amplify captures it
  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export function createLogger(context: LogContext) {
  return {
    info: (message: string, extra?: Record<string, unknown>) => emit('info', context, message, extra),
    warn: (message: string, extra?: Record<string, unknown>) => emit('warn', context, message, extra),
    error: (message: string, extra?: Record<string, unknown>) => emit('error', context, message, extra),
  };
}

/** Extract request ID from headers (set by middleware) */
export function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID();
}
