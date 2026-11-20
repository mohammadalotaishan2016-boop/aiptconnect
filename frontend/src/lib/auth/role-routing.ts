import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileRole = 'administrator' | 'client' | 'sub_administrator';

const destinations: Record<ProfileRole, string> = {
  administrator: '/overview',
  sub_administrator: '/overview',
  client: '/client-dashboard',
};

export async function getRoleDestination(supabase: SupabaseClient) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Your verified session could not be read.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || !(profile.role in destinations)) {
    throw new Error('Your account role is not configured. Please contact an administrator.');
  }

  const role = profile.role as ProfileRole;

  if (profile.status !== 'active') {
    await supabase.auth.signOut();
    const messages: Record<string, string> = {
      pending: 'Your account is awaiting administrator approval.',
      suspended: 'Your account has been suspended. Please contact support.',
      deactivated: 'Your account is deactivated. Contact an administrator.',
      locked: 'Your account is locked. Use Forgot Password or contact an administrator.',
    };
    throw new Error(
      messages[profile.status as string] ?? 'Your account cannot log in. Please contact support.',
    );
  }

  return destinations[role];
}
