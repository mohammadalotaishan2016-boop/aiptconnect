import { NextRequest, NextResponse } from 'next/server';

/**
 * Sets an httpOnly cookie with the device fingerprint so that
 * server-side middleware can validate the device session.
 * The fingerprint is already in localStorage but middleware can't read that.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const fingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint.trim() : '';
  if (!fingerprint || fingerprint.length > 500) {
    return NextResponse.json({ error: 'Invalid fingerprint.' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('aipt-device-fp', fingerprint, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
