'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthArtwork } from '../../src/components/AuthArtwork';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const pending = useRef(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    setError('');

    if (!validEmail.test(email.trim().toLowerCase())) {
      setError('Enter a valid email address.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError('Supabase is not configured.'); return; }

    pending.current = true;
    setBusy(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;
      window.sessionStorage.setItem('aipt-password-reset-email', email.trim().toLowerCase());
      router.push('/forgot-password/verify-otp');
    } catch {
      setError('Unable to send a verification code right now. Please try again.');
    } finally {
      pending.current = false;
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

          <form className="login-form simple-auth" onSubmit={submit}>
            <header>
              <h1>Forgot Password</h1>
              <p>Enter your email and we will send a six-digit verification code.</p>
            </header>

            <label htmlFor="fp-email">Email Address <em>*</em></label>
            <div className="field">
              <span className="field-icon">✉</span>
              <input
                id="fp-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                type="email"
                autoComplete="email"
                autoFocus
              />
            </div>

            {error && <p className="trouble" role="alert">{error}</p>}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Sending code…' : 'Send verification code'}
            </button>

            <p className="access">
              <Link href="/login">Back to Login</Link>
            </p>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
        <AuthArtwork />
      </section>
    </main>
  );
}
