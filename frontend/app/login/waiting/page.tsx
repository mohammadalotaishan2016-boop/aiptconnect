'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';
import { getRoleDestination } from '../../../src/lib/auth/role-routing';
import Link from 'next/link';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60; // 5 min max

function WaitingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get('id') ?? '';
  const pollCount = useRef(0);
  const [status, setStatus] = useState<'waiting' | 'approved' | 'denied' | 'expired' | 'error'>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(300);

  useEffect(() => {
    if (!requestId) { router.replace('/login'); return; }

    // Countdown timer
    const countdown = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);

    // Subscribe via Realtime broadcast on this request's channel
    const supabase = getSupabaseBrowserClient();
    let channel = supabase?.channel(`login-request-${requestId}`);
    channel
      ?.on('broadcast', { event: 'login_request_denied' }, () => setStatus('denied'))
      .subscribe();

    // Poll for status
    const poll = async () => {
      if (pollCount.current >= MAX_POLLS) { setStatus('expired'); return; }
      pollCount.current += 1;

      try {
        const res = await fetch(`/api/auth/login-request/${requestId}`);
        const body = await res.json().catch(() => ({}));

        if (body.status === 'approved' && body.access_token) {
          const supabase = getSupabaseBrowserClient();
          if (!supabase) { setStatus('error'); return; }
          const { error } = await supabase.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          if (error) { setStatus('error'); return; }
          // Set device fingerprint cookie for middleware session validation
          const fp = window.localStorage.getItem('aipt-device-fp');
          if (fp) {
            await fetch('/api/auth/set-device-cookie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fingerprint: fp }),
            }).catch(() => undefined);
          }
          setStatus('approved');
          const destination = await getRoleDestination(supabase);
          router.push(destination);
          return;
        }

        if (body.status === 'denied' || body.status === 'expired' || body.status === 'not_found') {
          setStatus(body.status === 'not_found' ? 'expired' : body.status);
          return;
        }
      } catch {
        // Network error — keep polling
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(countdown);
      window.clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [requestId, router]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <main className="auth-page login-reference-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <div className="otp-form" style={{ textAlign: 'center' }}>
            {status === 'waiting' && (
              <>
                <div className="approval-modal-icon" style={{ fontSize: '2.5rem' }}>📱</div>
                <h2>Waiting for approval</h2>
                <p>
                  You are already signed in on another device. An approval
                  request has been sent to that device.
                </p>
                <p style={{ color: '#17a2b8', fontWeight: 'bold' }}>
                  Time remaining: {minutes}:{String(seconds).padStart(2, '0')}
                </p>
                <p className="trouble">
                  Keep this page open. It will update automatically once
                  approved or denied.
                </p>
              </>
            )}

            {status === 'denied' && (
              <>
                <div className="approval-modal-icon">✗</div>
                <h2>Login request denied</h2>
                <p>
                  The existing device denied your login request.
                </p>
                <Link href="/login">
                  <button className="primary-button" type="button">
                    Back to login
                  </button>
                </Link>
              </>
            )}

            {status === 'expired' && (
              <>
                <div className="approval-modal-icon">⌛</div>
                <h2>Request expired</h2>
                <p>
                  Your login request was not approved in time. Please try
                  logging in again.
                </p>
                <Link href="/login">
                  <button className="primary-button" type="button">
                    Back to login
                  </button>
                </Link>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="approval-modal-icon">!</div>
                <h2>Something went wrong</h2>
                <p>Unable to complete the login. Please try again.</p>
                <Link href="/login">
                  <button className="primary-button" type="button">
                    Back to login
                  </button>
                </Link>
              </>
            )}
          </div>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
      </section>
    </main>
  );
}

export default function WaitingPage() {
  return (
    <Suspense>
      <WaitingContent />
    </Suspense>
  );
}
