import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../src/lib/supabase/server';
import { createLogger } from '../../../src/lib/logger';
import { recordLatency } from '../../../src/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  const log = createLogger({ route: '/api/ready' });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('profiles').select('id').limit(1);
    const durationMs = Date.now() - start;
    recordLatency(durationMs);

    if (error) {
      log.error('db_check_failed', { durationMs, error: error.message });
      return NextResponse.json(
        { status: 'unavailable', error: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    log.info('db_check_ok', { durationMs });
    return NextResponse.json(
      { status: 'ready', timestamp: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    const durationMs = Date.now() - start;
    log.error('db_connection_failed', { durationMs });
    return NextResponse.json(
      { status: 'unavailable', error: 'Database connection failed.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
