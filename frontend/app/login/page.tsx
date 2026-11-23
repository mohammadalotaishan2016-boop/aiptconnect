'use client';

import { AuthArtwork } from '../../src/components/AuthArtwork';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import './login.css';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';
import { getRoleDestination } from '../../src/lib/auth/role-routing';

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Modal =
  | { type: 'locked'; email: string }
  | { type: 'invalid'; remaining: number | null }
  | { type: 'status'; message: string };

export default function LoginPage() {
  const router = useRouter();
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [unblockState, setUnblockState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    const message = window.sessionStorage.getItem('aipt-auth-message');
    if (message) {
      setServerError(message);
      window.sessionStorage.removeItem('aipt-auth-message');
    }
  }, []);

  const emailError = submitted && !validEmail.test(email.trim().toLowerCase());
  const passwordError = submitted && password.length === 0;

  async function requestUnblock(lockedEmail: string) {
    if (unblockState === 'sending' || unblockState === 'sent') return;
    setUnblockState('sending');
    try {
      await fetch('/api/auth/unblock-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lockedEmail }),
      });
      setUnblockState('sent');
    } catch {
      setUnblockState('error');
    }
  }

  function closeModal() {
    setModal(null);
    setUnblockState('idle');
  }

  function getDeviceFingerprint(): string {
    const key = 'aipt-device-fp';
    let fp = window.localStorage.getItem(key);
    if (!fp) {
      fp = crypto.randomUUID();
      window.localStorage.setItem(key, fp);
    }
    return fp;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;

    setSubmitted(true);
    setServerError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail.test(normalizedEmail) || password.length === 0) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setServerError('Supabase is not configured.');
      return;
    }

    requestPending.current = true;
    setBusy(true);

    const deviceFingerprint = getDeviceFingerprint();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password, device_fingerprint: deviceFingerprint }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setServerError(body.error || 'Too many login attempts. Please wait before trying again.');
        return;
      }

      // New device is waiting for approval from an existing logged-in device
      if (response.ok && body.waiting && body.request_id) {
        router.push(`/login/waiting?id=${body.request_id}`);
        return;
      }

      if (response.ok && body.ok) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) {
          setServerError('Sign-in failed. Please try again.');
          return;
        }
        // Set the device fingerprint as an httpOnly cookie for middleware validation
        await fetch('/api/auth/set-device-cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: deviceFingerprint }),
        }).catch(() => undefined);
        const destination = await getRoleDestination(supabase);
        router.push(destination);
        return;
      }

      const code: string = body.code ?? '';

      if (response.status === 423 || code === 'account_locked') {
        setModal({ type: 'locked', email: normalizedEmail });
        return;
      }

      if (response.status === 403) {
        if (code === 'device_limit_hard') {
          setModal({ type: 'status', message: 'You have reached your maximum device limit. Please log out from an existing device or contact an administrator.' });
          return;
        }
        if (code === 'account_pending') {
          setModal({ type: 'status', message: 'Your account is waiting for administrator approval. Please wait up to 24 hours while we validate your registration.' });
          return;
        }
        if (code === 'account_suspended') {
          setModal({ type: 'status', message: 'Your account has been suspended. Please contact the administrator for assistance.' });
          return;
        }
        if (code === 'account_deactivated') {
          setModal({ type: 'status', message: 'This account is deactivated. Please contact the administrator if you believe this is a mistake.' });
          return;
        }
        setModal({ type: 'status', message: 'Your account cannot log in at this time. Please contact support.' });
        return;
      }

      if (response.status === 401 && code === 'invalid_credentials') {
        const remaining = body.attempts_remaining == null ? null : Number(body.attempts_remaining);
        setModal({ type: 'invalid', remaining });
        return;
      }

      setServerError(body.error || 'Unable to log in. Please try again.');
    } catch (caught) {
      setServerError(caught instanceof Error ? caught.message : 'Unable to log in. Please try again.');
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-page login-reference-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <form className="login-form" onSubmit={submit} noValidate>
            <header>
              <h1>Welcome Back</h1>
              <p>Glad to see you again. Log in to your account.</p>
            </header>

            <label htmlFor="email">
              Email Address <em>*</em>
            </label>
            <div className={`field ${emailError ? 'invalid' : ''}`}>
              <span className="field-icon">✉</span>
              <input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                type="email"
                autoComplete="email"
              />
            </div>
            {emailError && (
              <p className="validation">
                <b>!</b>
                <span>
                  <strong>The email address you entered is wrong!</strong>
                  <small>Please enter a valid email address (e.g., name@domain.com).</small>
                </span>
              </p>
            )}

            <label htmlFor="password">
              Password <em>*</em>
            </label>
            <div className={`field ${passwordError ? 'invalid' : ''}`}>
              <span className="field-icon">♙</span>
              <input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="eye"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '◉' : '⊙'}
              </button>
            </div>
            {passwordError && (
              <p className="validation">
                <b>!</b>
                <span>
                  <strong>Password is required.</strong>
                  <small>Enter the password already registered for this account.</small>
                </span>
              </p>
            )}

            <div className="form-options">
              <span />
              <Link href="/forgot-password">Forgot Password?</Link>
            </div>

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Login'}
            </button>

            {((submitted && (emailError || passwordError)) || serverError) && (
              <p className="trouble">
                {serverError || 'Please check your details and try again.'}
              </p>
            )}

            <p className="auth-link">
              Don&apos;t have an account? <Link href="/register">Register</Link>
            </p>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>

        <AuthArtwork />
      </section>

      {/* Account locked modal */}
      {modal?.type === 'locked' && (
        <div
          className="approval-modal-backdrop"
          role="presentation"
          onMouseDown={closeModal}
        >
          <section
            className="approval-modal login-locked-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="locked-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="approval-modal-icon">🔒</div>
            <h2 id="locked-title">Your account has been locked</h2>
            <p>
              Your account was locked after five failed login attempts. You can
              reset your password, or submit an unblock request for an
              administrator to review.
            </p>
            {unblockState === 'sent' ? (
              <p className="trouble" style={{ color: '#17a2b8' }}>
                Unblock request sent. An administrator will review it shortly.
              </p>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={unblockState === 'sending'}
                onClick={() => requestUnblock(modal.email)}
              >
                {unblockState === 'sending' ? 'Sending…' : 'Request unblock'}
              </button>
            )}
            {unblockState === 'error' && (
              <p className="trouble">Unable to send request. Please try again.</p>
            )}
            <div className="form-options" style={{ marginTop: '0.75rem' }}>
              <Link href="/forgot-password" onClick={closeModal}>
                Forgot Password?
              </Link>
              <button type="button" onClick={closeModal}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Invalid credentials modal */}
      {modal?.type === 'invalid' && (
        <div
          className="approval-modal-backdrop"
          role="presentation"
          onMouseDown={closeModal}
        >
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invalid-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="approval-modal-icon">!</div>
            <h2 id="invalid-title">Invalid credentials</h2>
            <p>
              {modal.remaining === null
                ? 'The email address or password is incorrect.'
                : `The email address or password is incorrect. You have ${modal.remaining} attempt${modal.remaining === 1 ? '' : 's'} remaining before your account is locked.`}
            </p>
            <button type="button" onClick={closeModal}>
              Try again
            </button>
          </section>
        </div>
      )}

      {/* Status modals (pending / suspended / deactivated / unavailable) */}
      {modal?.type === 'status' && (
        <div
          className="approval-modal-backdrop"
          role="presentation"
          onMouseDown={closeModal}
        >
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="approval-modal-icon">⌛</div>
            <h2 id="status-title">Unable to log in</h2>
            <p>{modal.message}</p>
            <button type="button" onClick={closeModal}>
              Okay, I understand
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
