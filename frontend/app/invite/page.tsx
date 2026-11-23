'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthArtwork } from '../../src/components/AuthArtwork';

type InvitationInfo = {
  invitation_id: string;
  email: string;
  role: string;
  client_name: string | null;
  max_devices: number;
};

type PageState = 'loading' | 'valid' | 'done' | 'error';

export default function InvitePage() {
  const [state, setState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
    if (token.length < 32) {
      setErrorMessage('This invitation link is invalid. Ask the administrator for a new invitation.');
      setState('error');
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/invitation/verify?token=${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.valid) {
          setErrorCode(body.code ?? '');
          setErrorMessage(body.error ?? 'This invitation is invalid or expired.');
          setState('error');
          return;
        }
        setInvitation(body as InvitationInfo);
        setState('valid');
      } catch {
        setErrorMessage('Unable to verify the invitation. Check your connection and try again.');
        setState('error');
      }
    })();
  }, []);

  const strengthChecks = useMemo(
    () => [
      password.length >= 8,
      /[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
    ],
    [password],
  );
  const passwordStrong = strengthChecks.every(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError('');
    if (!invitation) return;
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFieldError('Full name must be at least 2 characters.');
      return;
    }
    if (!passwordStrong) {
      setFieldError('Password does not meet the strength requirements.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
      const res = await fetch('/api/invitation/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldError(body.error ?? 'Unable to create your account. Try again or contact the administrator.');
        return;
      }
      setState('done');
    } catch {
      setFieldError('Unable to reach the service. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = invitation?.role === 'administrator' ? 'Administrator' : 'Client';

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <div className="login-form">
            {state === 'loading' && (
              <>
                <header>
                  <h1>Verifying invitation</h1>
                  <p>Please wait...</p>
                </header>
                <p className="trouble">Checking your invitation link...</p>
              </>
            )}

            {state === 'error' && (
              <>
                <header>
                  <h1>Invitation unavailable</h1>
                </header>
                <p className="trouble" role="alert">{errorMessage}</p>
                {errorCode === 'expired' && (
                  <p className="auth-link">Ask your administrator to resend the invitation.</p>
                )}
                {errorCode === 'revoked' && (
                  <p className="auth-link">This invitation was cancelled. Contact your administrator for a new one.</p>
                )}
                {errorCode === 'consumed' && (
                  <p className="auth-link">
                    This invitation was already used. <Link href="/login">Sign in</Link> or contact your administrator.
                  </p>
                )}
                {!errorCode && (
                  <p className="auth-link"><Link href="/login">Return to login</Link></p>
                )}
              </>
            )}

            {state === 'valid' && invitation && (
              <>
                <header>
                  <h1>Accept invitation</h1>
                  <p>Set your password to activate your account.</p>
                </header>

                <form onSubmit={(e) => void submit(e)} noValidate>
                  <div className="form-group">
                    <label htmlFor="inv-email">Email</label>
                    <input
                      id="inv-email"
                      type="email"
                      value={invitation.email}
                      readOnly
                      className="input-readonly"
                      aria-describedby="inv-role-info"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="inv-role">Role</label>
                    <input
                      id="inv-role"
                      type="text"
                      value={roleLabel + (invitation.client_name ? ` — ${invitation.client_name}` : '')}
                      readOnly
                      className="input-readonly"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="inv-devices">Maximum allowed devices</label>
                    <input
                      id="inv-devices"
                      type="text"
                      value={invitation.max_devices}
                      readOnly
                      className="input-readonly"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="inv-name">Full name <em>*</em></label>
                    <input
                      id="inv-name"
                      type="text"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={200}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      disabled={busy}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="inv-password">Password <em>*</em></label>
                    <div className="password-field">
                      <input
                        id="inv-password"
                        type={showPw ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Choose a password"
                        disabled={busy}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {password && (
                      <ul className="strength-list" aria-live="polite">
                        <li className={strengthChecks[0] ? 'met' : ''}>At least 8 characters</li>
                        <li className={strengthChecks[1] ? 'met' : ''}>Letters, numbers, and a symbol</li>
                      </ul>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="inv-confirm">Confirm password <em>*</em></label>
                    <input
                      id="inv-confirm"
                      type={showPw ? 'text' : 'password'}
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      disabled={busy}
                      autoComplete="new-password"
                    />
                  </div>

                  {fieldError && (
                    <p className="trouble" role="alert">{fieldError}</p>
                  )}

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={busy || !fullName.trim() || !password || !confirm}
                  >
                    {busy ? 'Creating account...' : 'Activate account'}
                  </button>
                </form>
              </>
            )}

            {state === 'done' && (
              <>
                <header>
                  <h1>Account activated</h1>
                </header>
                <p className="trouble" style={{ color: 'inherit' }}>
                  Your account has been created and is ready to use.
                </p>
                <p className="auth-link">
                  <Link href="/login" className="primary-button" style={{ display: 'inline-block', marginTop: '1rem' }}>
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
        <AuthArtwork />
      </section>
    </main>
  );
}
