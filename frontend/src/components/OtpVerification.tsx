'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthArtwork } from './AuthArtwork';
import { beginOtpRequest } from '../lib/otp-request-log';
import { getSupabaseBrowserClient } from '../lib/supabase/browser';

type Context = 'signup' | 'recovery';
const RESEND_COOLDOWN_SECONDS = 60;

export function OtpVerification({ context }: { context: Context }) {
  const router = useRouter();
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const queryEmail = new URLSearchParams(window.location.search).get('email') || '';
    setEmail(queryEmail);
  }, []);

  useEffect(() => {
    if (!seconds) return;
    const intervalId = window.setInterval(() => setSeconds((v) => v - 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [seconds]);

  const update = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  };

  const verify = async () => {
    if (requestPending.current) return;

    const token = digits.join('');
    if (!email || token.length !== 6) {
      setError('Enter the six-digit verification code.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    requestPending.current = true;
    setBusy(true);

    try {
      const { error: verificationError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: context,
      });
      if (verificationError) {
        setError('The verification code is invalid or expired.');
        return;
      }

      if (context === 'recovery') {
        router.push('/change-password');
        return;
      }

      // signup context — redirect to login after email confirmed
      router.push('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed. Please try again.');
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (requestPending.current || !email) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    requestPending.current = true;
    setBusy(true);

    const resendMeta =
      context === 'signup'
        ? {
            flow: 'resend_signup' as const,
            action: 'resend' as const,
            request: () => supabase.auth.resend({ type: 'signup', email }),
          }
        : {
            flow: 'resend_recovery' as const,
            action: 'resetPasswordForEmail' as const,
            request: () => supabase.auth.resetPasswordForEmail(email),
          };

    const otpRequest = beginOtpRequest({
      flow: resendMeta.flow,
      email,
      triggeredBy: 'OtpVerification.resend',
      action: resendMeta.action,
    });

    try {
      const { data, error: resendError } = await resendMeta.request();
      otpRequest.finish({ response: data, error: resendError });
      if (resendError) {
        setError('Unable to resend the code. Please try again.');
        return;
      }
      setError('');
      setSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      otpRequest.finish({ error: caught });
      setError('Unable to resend the code. Please try again.');
    } finally {
      requestPending.current = false;
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

          <div className="otp-form">
            <header>
              <h1>OTP Verification</h1>
              <p>Enter the six-digit code sent to</p>
              <b>{email}</b>
            </header>

            <div className="otp-boxes">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  value={digit}
                  autoFocus={index === 0}
                  onChange={(e) => update(index, e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    if (pasted.length !== 6) return;
                    e.preventDefault();
                    setDigits(pasted.split(''));
                    inputs.current[5]?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && index) inputs.current[index - 1]?.focus();
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`OTP digit ${index + 1}`}
                />
              ))}
            </div>

            <button className="primary-button" type="button" disabled={busy} onClick={verify}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>

            {error && <p className="trouble">{error}</p>}

            <button
              className="resend"
              type="button"
              disabled={seconds > 0 || busy}
              onClick={resend}
            >
              Resend code in <b>{`00:${String(seconds).padStart(2, '0')}`}</b>
            </button>
          </div>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>

        <AuthArtwork />
      </section>
    </main>
  );
}
