'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthArtwork } from '../../src/components/AuthArtwork';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Guard: redirect to forgot-password if there is no active recovery session
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/forgot-password');
    });
  }, [router]);

  // Same 3-rule strength checks as the register page
  const checks = useMemo(
    () => [
      password.length >= 8,
      /[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
      Boolean(password) && password !== confirm || !confirm
        ? false
        : password === confirm,
    ],
    [password, confirm]
  );

  // Strength rule display (independent of confirm match)
  const strengthChecks = useMemo(
    () => [
      password.length >= 8,
      /[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
    ],
    [password]
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!strengthChecks.every(Boolean)) {
      setError('Password must be at least 8 characters with letters, numbers, and symbols.');
      return;
    }

    if (password !== confirm) {
      setError('New password and confirmation must match.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError('Supabase is not configured.'); return; }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Your verification session has expired. Request a new email code.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your verification session has expired. Request a new email code.');
        return;
      }

      // Unlock account if it was locked (resets failed_login_attempts + status)
      const unlockResponse = await fetchSupabaseFunction('reset-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!unlockResponse.ok) {
        // Non-fatal — password was changed, just the unlock step failed
        setError('Password changed, but the account could not be unlocked. Contact an administrator.');
        return;
      }

      window.sessionStorage.removeItem('aipt-password-reset-email');
      window.sessionStorage.setItem('aipt-auth-message', 'Password reset successfully. Please log in with your new password.');
      router.push('/login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <form className="login-form simple-auth reset-form" onSubmit={submit}>
            <header>
              <h1>Create New Password</h1>
              <p>Please enter a new password. It must be different from your previous password.</p>
            </header>

            <label htmlFor="new-password">New Password <em>*</em></label>
            <div className="field">
              <input
                id="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={shown ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a new password"
              />
              <button
                type="button"
                className="eye"
                aria-label="Toggle password visibility"
                onClick={() => setShown(!shown)}
              >
                {shown ? 'Hide' : 'Show'}
              </button>
            </div>

            <ul className="password-rules">
              <li className={strengthChecks[0] ? 'pass' : ''}>At least 8 characters</li>
              <li className={strengthChecks[1] ? 'pass' : ''}>Letters, numbers and symbols</li>
            </ul>

            <label htmlFor="confirm-password">Confirm New Password <em>*</em></label>
            <div className="field">
              <input
                id="confirm-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                type={shown ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your new password"
              />
            </div>

            {error && <p className="trouble" role="alert">{error}</p>}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
        <AuthArtwork />
      </section>
    </main>
  );
}
