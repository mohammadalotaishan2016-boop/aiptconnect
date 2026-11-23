import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '../../../../../src/lib/supabase/server';
import { extractIdempotencyKey, checkIdempotencyKey, saveIdempotencyResult, idempotentResponse } from '../../../../../src/lib/idempotency';

const ROUTE = '/api/admin/users';

function upstreamError(body: Record<string, unknown> | null, fallback: string): string {
  if (!body) return fallback;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.msg === 'string' && body.msg) return body.msg;
  return fallback;
}

async function getAdminSession() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { session: null, error: NextResponse.json({ error: 'Authentication is required.' }, { status: 401 }) };

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || profile.role !== 'administrator' || profile.status !== 'active') {
    return { session: null, error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) };
  }

  // getSession() is used only to obtain the access token — the user identity
  // has already been verified above by getUser() (server-side JWT validation).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, error: NextResponse.json({ error: 'Authentication is required.' }, { status: 401 }) };

  return { session, error: null };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { session, error } = await getAdminSession();
    if (error) return error;

    // Idempotency check
    const idempotencyKey = extractIdempotencyKey(req);
    if (idempotencyKey) {
      const adminClient = createAdminClient();
      const cached = await checkIdempotencyKey(adminClient, idempotencyKey, ROUTE);
      if (cached) return idempotentResponse(cached);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

    const body = await req.text().catch(() => '{}');
    const upstream = await fetch(`${supabaseUrl}/functions/v1/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session!.access_token}`,
      },
      body,
    }).catch(() => null);

    if (!upstream) return NextResponse.json({ error: 'Unable to reach the user service.' }, { status: 503 });

    const upstreamBody = await upstream.json().catch(() => null) as Record<string, unknown> | null;

    if (!upstream.ok) {
      const message = upstreamError(upstreamBody, 'The user service returned an error.');
      return NextResponse.json({ error: message }, { status: upstream.status >= 400 ? upstream.status : 502 });
    }

    if (idempotencyKey && upstreamBody) {
      await saveIdempotencyResult(createAdminClient(), idempotencyKey, session!.user.id, ROUTE, { body: upstreamBody, status: upstream.status });
    }

    return NextResponse.json(upstreamBody);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Request failed.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { session, error } = await getAdminSession();
    if (error) return error;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

    const body = await req.text().catch(() => '{}');
    const upstream = await fetch(`${supabaseUrl}/functions/v1/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session!.access_token}`,
      },
      body,
    }).catch(() => null);

    if (!upstream) return NextResponse.json({ error: 'Unable to reach the user service.' }, { status: 503 });

    const upstreamBody = await upstream.json().catch(() => null) as Record<string, unknown> | null;

    if (!upstream.ok) {
      const message = upstreamError(upstreamBody, 'The user service returned an error.');
      return NextResponse.json({ error: message }, { status: upstream.status >= 400 ? upstream.status : 502 });
    }

    return NextResponse.json(upstreamBody);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Request failed.' },
      { status: 500 },
    );
  }
}
