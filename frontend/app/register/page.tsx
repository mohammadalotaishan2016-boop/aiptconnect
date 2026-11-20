'use client';
import { AuthArtwork } from '../../src/components/AuthArtwork';
import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { COUNTRIES, countryFlag } from '../../src/lib/countries';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

// ── Validation ──────────────────────────────────────────────────────────────
const schema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters.'),
  companyName: z.string().min(1, 'Company name is required.'),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'),
  dialCode: z.string().min(1, 'Select a dial code.'),
  localPhone: z.string().min(1, 'Enter your phone number.'),
  country: z.string().min(1, 'Select a country.'),
  address: z.string().min(1, 'Enter your address.'),
});

const E164 = /^\+[1-9]\d{6,14}$/;

type Kind = 'new_company' | 'existing_company';
type Company = { id: string; assigned_id: number; company_name: string };
type StoredInvitation = { claim_id: string; email: string; company: Company };

const authError = (code?: string, message?: string) =>
  code === 'email_exists' || code === 'user_already_exists'
    ? 'An account with this email already exists. Please log in.'
    : message || 'Unable to create your account.';

// ── DialCodePicker ──────────────────────────────────────────────────────────
function DialCodePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return COUNTRIES.filter((c) => c.dialCode.includes(q) || c.name.toLowerCase().includes(q)).slice(0, 60);
  }, [search]);

  const selected = COUNTRIES.find((c) => c.dialCode === value) ?? COUNTRIES[0];

  return (
    <div className="picker-wrap" ref={ref}>
      <button
        type="button"
        className="picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="picker-flag">{countryFlag(selected.iso2)}</span>
        <span className="picker-code">{selected.dialCode}</span>
        <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-dropdown" role="listbox">
          <input
            className="picker-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="picker-list">
            {filtered.map((c) => (
              <div
                key={c.iso2}
                role="option"
                aria-selected={c.dialCode === value}
                className={`picker-option${c.dialCode === value ? ' selected' : ''}`}
                onMouseDown={() => { onChange(c.dialCode); setOpen(false); setSearch(''); }}
              >
                <span className="picker-flag">{countryFlag(c.iso2)}</span>
                <span className="picker-code">{c.dialCode}</span>
                <span className="picker-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CountrySelect ───────────────────────────────────────────────────────────
function CountrySelect({ value, onChange }: { value: string; onChange: (iso2: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 60);
  }, [search]);

  const selected = COUNTRIES.find((c) => c.iso2 === value);

  return (
    <div className="picker-wrap country-picker-wrap" ref={ref}>
      <button
        type="button"
        className="picker-trigger country-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="picker-flag">{countryFlag(selected.iso2)}</span>
            <span className="picker-country-name">{selected.name}</span>
          </>
        ) : (
          <span className="picker-placeholder">Select country</span>
        )}
        <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-dropdown picker-dropdown-full" role="listbox">
          <input
            className="picker-search"
            placeholder="Search country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="picker-list">
            {filtered.map((c) => (
              <div
                key={c.iso2}
                role="option"
                aria-selected={c.iso2 === value}
                className={`picker-option${c.iso2 === value ? ' selected' : ''}`}
                onMouseDown={() => { onChange(c.iso2); setOpen(false); setSearch(''); }}
              >
                <span className="picker-flag">{countryFlag(c.iso2)}</span>
                <span className="picker-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Register page ───────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('new_company');

  // Form fields
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [dialCode, setDialCode] = useState('+966');
  const [localPhone, setLocalPhone] = useState('');
  const [countryIso2, setCountryIso2] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  // Invitation flow
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verified, setVerified] = useState<Company | null>(null);
  const [claimId, setClaimId] = useState('');

  // Suppress dial-code auto-sync after manual selection
  const [dialManuallySet, setDialManuallySet] = useState(false);

  // Restore invitation state if redirected from invitation link
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('invited') !== '1') return;
    try {
      const stored = JSON.parse(
        sessionStorage.getItem('aipt-registration-invitation') || 'null'
      ) as StoredInvitation | null;
      if (!stored?.claim_id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stored.email) || !stored.company?.id)
        throw Error();
      setKind('existing_company');
      setInviteEmail(stored.email);
      setEmail(stored.email);
      setCompany(stored.company.company_name);
      setVerified(stored.company);
      setClaimId(stored.claim_id);
      sessionStorage.removeItem('aipt-registration-invitation');
    } catch {
      setFormError('Your verified invitation session is missing or expired. Open the invitation link again.');
    }
  }, []);

  // Auto-sync dial code when country changes (unless user has manually picked a dial code)
  const handleCountryChange = (iso2: string) => {
    setCountryIso2(iso2);
    if (!dialManuallySet) {
      const c = COUNTRIES.find((x) => x.iso2 === iso2);
      if (c) setDialCode(c.dialCode);
    }
  };

  const handleDialCodeChange = (code: string) => {
    setDialCode(code);
    setDialManuallySet(true);
  };

  // Password strength
  const checks = useMemo(
    () => [
      password.length >= 8,
      /[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
      Boolean(password) &&
        Boolean(name.trim()) &&
        !password.toLowerCase().includes(name.trim().toLowerCase()) &&
        !password.toLowerCase().includes(email.trim().toLowerCase()),
    ],
    [name, email, password]
  );

  const choose = (next: Kind) => {
    setKind(next);
    setFormError('');
    setFieldErrors({});
    setVerified(null);
    setClaimId('');
    if (next === 'existing_company') {
      setInviteEmail(email);
      setVerifyOpen(true);
    } else {
      setCompany('');
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const mail = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || inviteCode.trim().length < 32) {
      setFormError('Enter the invited email and complete invitation code.');
      return;
    }
    try {
      setVerifyBusy(true);
      const response = await fetchSupabaseFunction('company-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_invitation', email: mail, invitation_code: inviteCode.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.verified) throw Error(body.error || 'Invitation verification failed.');
      setEmail(body.email);
      setInviteEmail(body.email);
      setCompany(body.company.company_name);
      setVerified(body.company);
      setClaimId(body.claim_id);
      setVerifyOpen(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Invitation verification failed.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    // Build E.164 phone from dial code + local digits
    const rawLocal = localPhone.trim().replace(/[\s()\-]/g, '');
    const e164Phone = dialCode + rawLocal;

    // Zod field validation
    const parsed = schema.safeParse({
      fullName: name.trim(),
      companyName: company.trim(),
      email: email.trim().toLowerCase(),
      dialCode,
      localPhone: localPhone.trim(),
      country: countryIso2,
      address: address.trim(),
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    // E.164 format check
    if (!E164.test(e164Phone)) {
      setFieldErrors((prev) => ({
        ...prev,
        localPhone: 'Enter a valid phone number (digits only after the country code).',
      }));
      return;
    }

    // Invitation state check
    if (
      kind === 'existing_company' &&
      (!verified || !claimId || email.trim().toLowerCase() !== inviteEmail.trim().toLowerCase())
    ) {
      setFormError('Verify your invitation again before registering.');
      setVerifyOpen(true);
      return;
    }

    // Password strength
    if (!checks.every(Boolean)) {
      setFormError('Please meet all password strength rules.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setFormError('Supabase is not configured.'); return; }

    let accountCreated = false;
    try {
      setBusy(true);
      const countryObj = COUNTRIES.find((c) => c.iso2 === countryIso2);
      const metadata: Record<string, string> = {
        full_name: name.trim(),
        company_name: company.trim(),
        phone: e164Phone,
        country: countryObj?.name ?? countryIso2,
        address: address.trim(),
        registration_type: kind,
      };
      if (kind === 'existing_company') metadata.registration_claim_id = claimId;

      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: metadata },
      });

      if (signupError) { setFormError(authError(signupError.code, signupError.message)); return; }
      if (!data.user) throw Error('Registration could not be completed.');
      accountCreated = true;
      if (data.session) await supabase.auth.signOut();
      sessionStorage.setItem(
        'aipt-auth-message',
        'Registration Successful — Your account has been created and is currently awaiting administrator approval. Please allow up to 24 hours for review.'
      );
      router.replace('/login');
    } catch (cause) {
      if (accountCreated) {
        await supabase.auth.signOut();
        sessionStorage.setItem('aipt-auth-message', 'Your account was created. Please log in after administrator approval.');
        router.replace('/login');
      } else {
        setFormError(cause instanceof Error ? cause.message : 'Unable to complete registration.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page register-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <form className="login-form register-form" onSubmit={submit} noValidate>
            <header>
              <h1>Create Your Account</h1>
              <p>Join AIP&T to manage your intellectual property with confidence.</p>
            </header>

            <div className="registration-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={kind === 'new_company'} className={kind === 'new_company' ? 'active' : ''} onClick={() => choose('new_company')}>New Client</button>
              <button type="button" role="tab" aria-selected={kind === 'existing_company'} className={kind === 'existing_company' ? 'active' : ''} onClick={() => choose('existing_company')}>Existing Client</button>
            </div>

            {verified && (
              <div className="company-verified" role="status">
                <b>{verified.company_name}</b> verified. Continue as Client #{verified.assigned_id}.
              </div>
            )}

            <Field label="Full Name" error={fieldErrors.fullName}>
              <input placeholder="Enter your full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field label="Company Name" error={fieldErrors.companyName}>
              <input placeholder="Enter your company name" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} readOnly={kind === 'existing_company'} required />
            </Field>

            <Field label="Email Address" error={fieldErrors.email}>
              <input type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={kind === 'existing_company' && Boolean(verified)} required />
            </Field>

            <label className="register-field">
              <span>Phone Number <em>*</em></span>
              <div className="field phone-field">
                <DialCodePicker value={dialCode} onChange={handleDialCodeChange} />
                <input
                  type="tel"
                  placeholder="50 123 4567"
                  autoComplete="tel-national"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value)}
                  required
                />
              </div>
              {fieldErrors.localPhone && <span className="field-error">{fieldErrors.localPhone}</span>}
            </label>

            <label className="register-field">
              <span>Country <em>*</em></span>
              <div className="field">
                <CountrySelect value={countryIso2} onChange={handleCountryChange} />
              </div>
              {fieldErrors.country && <span className="field-error">{fieldErrors.country}</span>}
            </label>

            <Field label="Address" error={fieldErrors.address}>
              <textarea placeholder="Enter your full address (street, building, city, postal code)" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} required />
            </Field>
            <small className="address-help">Include street, building, city and postal code.</small>

            <label>Password <em>*</em></label>
            <div className="field">
              <input placeholder="Create a password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} type={shown ? 'text' : 'password'} required />
              <button type="button" className="eye" onClick={() => setShown((v) => !v)}>{shown ? 'Hide' : 'Show'}</button>
            </div>
            <ul className="password-rules">
              <li className={checks[0] ? 'pass' : ''}>At least 8 characters</li>
              <li className={checks[1] ? 'pass' : ''}>Letters, numbers and symbols</li>
              <li className={checks[2] ? 'pass' : ''}>Does not contain your name or email</li>
            </ul>

            <button className="primary-button" disabled={busy}>{busy ? 'Creating account...' : 'Create Account'}</button>
            {formError && <p className="trouble" role="alert">{formError}</p>}
            <p className="auth-link">Already have an account? <Link href="/login">Login</Link></p>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>
        <AuthArtwork />
      </section>

      {verifyOpen && (
        <div className="company-verify-backdrop">
          <form className="company-verify-modal" onSubmit={verify}>
            <button type="button" className="company-verify-close" onClick={() => { setVerifyOpen(false); if (!verified) setKind('new_company'); }}>×</button>
            <span>EXISTING CLIENT</span>
            <h2>Verify your company invitation</h2>
            <p>Use the exact email invited by the company administrator. Company records are never exposed through public search.</p>
            <label>Invited Email</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <label>Invitation Code</label>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} minLength={32} autoComplete="one-time-code" required />
            {formError && <p className="trouble" role="alert">{formError}</p>}
            <button className="primary-button" disabled={verifyBusy}>{verifyBusy ? 'Verifying...' : 'Verify Company'}</button>
          </form>
        </div>
      )}
    </main>
  );
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="register-field">
      <span>{label} <em>*</em></span>
      <div className="field">{children}</div>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
