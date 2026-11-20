import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../../src/lib/supabase/server';

/** Polled by the waiting new device to check whether its login_request was resolved. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: req } = await admin
    .from('login_requests')
    .select('status, session_access_token, session_refresh_token, expires_at')
    .eq('id', id)
    .single();

  if (!req) {
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  }

  // Treat overdue pending requests as expired
  const isExpired = req.status === 'pending' && new Date(req.expires_at) < new Date();
  if (isExpired) {
    await admin
      .from('login_requests')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ status: 'expired' });
  }

  if (req.status === 'approved' && req.session_access_token && req.session_refresh_token) {
    // Hand off tokens once, then clear them from the DB
    await admin
      .from('login_requests')
      .update({ session_access_token: null, session_refresh_token: null })
      .eq('id', id);
    return NextResponse.json({
      status: 'approved',
      access_token: req.session_access_token,
      refresh_token: req.session_refresh_token,
    });
  }

  return NextResponse.json({ status: req.status });
}
