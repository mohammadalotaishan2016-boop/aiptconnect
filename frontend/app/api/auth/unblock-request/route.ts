import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../src/lib/supabase/server';

// Always return 200 regardless of outcome — never leak whether an email exists.
const genericSuccess = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return genericSuccess();

    const admin = createAdminClient();

    const { data: authUserId } = await admin.rpc('find_auth_user_id_by_email', {
      p_email: email,
    });
    if (!authUserId) return genericSuccess();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, status')
      .eq('id', authUserId as string)
      .single();

    // Only insert if the account is actually locked — ignore all other statuses
    if (!profile || profile.status !== 'locked') return genericSuccess();

    // Avoid duplicate pending requests from the same user
    const { data: existing } = await admin
      .from('unblock_requests')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      await admin.from('unblock_requests').insert({
        user_id: profile.id,
        status: 'pending',
        message: 'User requested unblock after login lockout.',
      });
    }
  } catch {
    // Swallow all errors — always return 200
  }

  return genericSuccess();
}
