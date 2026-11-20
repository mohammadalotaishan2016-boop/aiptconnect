import { createServerClient } from '../src/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active') redirect('/login');

  if (profile.role === 'administrator' || profile.role === 'sub_administrator') {
    redirect('/overview');
  }

  if (profile.role === 'client') redirect('/client-dashboard');

  redirect('/login');
}
