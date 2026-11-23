import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../../src/lib/supabase/server';

function upstreamError(body: Record<string, unknown> | null, fallback: string): string {
  if (!body) return fallback;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.msg === 'string' && body.msg) return body.msg;
  return fallback;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'administrator' || profile.status !== 'active') {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

    // getSession() is used only to obtain the access token — the user identity
    // has already been verified above by getUser() (server-side JWT validation).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

    const upstream = await fetch(`${supabaseUrl}/functions/v1/users`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => null);

    if (!upstream) return NextResponse.json({ error: 'Unable to reach the user service.' }, { status: 503 });

    const body = await upstream.json().catch(() => null) as Record<string, unknown> | unknown[] | null;

    if (!upstream.ok) {
      const message = upstreamError(Array.isArray(body) ? null : body as Record<string, unknown> | null, 'The user service returned an error.');
      return NextResponse.json({ error: message }, { status: upstream.status >= 400 ? upstream.status : 502 });
    }

    return NextResponse.json(body);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Request failed.' },
      { status: 500 },
    );
  }
}
