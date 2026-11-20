'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthArtwork } from '../../../src/components/AuthArtwork';
import { getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

export default function RecoveryOtpPage() {
  const router = useRouter();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem('aipt-password-reset-email');
    if (!saved) {
      router.replace('/forgot-password');
    } else {
      setEmail(saved);
      inputs.current[0]?.focus();
    }
  }, [router]);

  const update = (index: number, value: string) => {
    const next = [...digits];
    next[index] = value.replace(/\D/g, '').slice(-1);
    setDigits(next);
    if (next[index] && index < 5) inputs.current[index + 1]?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const token = digits.join('');
    if (token.length !== 6 || !email) {
      setError('Enter the six-digit code from your email.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError('Supabase is not configured.'); return; }

    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (verifyError) throw verifyError;
      router.replace('/change-password');
    } catch {
      setError('That code is invalid or expired. Request a new code and try again.');
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

          <form className="otp-form" onSubmit={submit}>
            <header>
              <h1>Verify your email</h1>
              <p>Enter the six-digit code sent to</p>
              <b>{email}</b>
            </header>

            <div className="otp-boxes">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { inputs.current[index] = element; }}
                  value={digit}
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Verification digit ${index + 1}`}
                  onChange={(event) => update(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !digits[index] && index > 0)
                      inputs.current[index - 1]?.focus();
                  }}
                />
              ))}
            </div>

            {error && <p className="trouble" role="alert">{error}</p>}

            <button className="primary-button" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>

            <p className="access">
              <Link href="/forgot-password">Use a different email</Link>
            </p>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
        <AuthArtwork />
      </section>
    </main>
  );
}
