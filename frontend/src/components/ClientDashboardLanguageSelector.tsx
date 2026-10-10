'use client';

import { useEffect, useRef, useState } from 'react';

const languages = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'zh', label: '中文' },
];

export type DashboardLanguage = typeof languages[number]['code'];

function LanguageFlag({ code }: { code: DashboardLanguage }) {
  if (code === 'ar') return <svg className="client-language-flag" viewBox="0 0 30 18" aria-hidden="true">
    <rect width="30" height="18" fill="#006c35" />
    <text x="15" y="8" fill="#fff" fontSize="4.4" textAnchor="middle" textLength="25" lengthAdjust="spacingAndGlyphs">لا إله إلا الله محمد رسول الله</text>
    <path d="M6 13.3h18" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    <path d="m5.2 13.3 1.3-1.2" fill="none" stroke="#fff" strokeWidth=".8" />
  </svg>;
  if (code === 'en') return <svg className="client-language-flag" viewBox="0 0 30 18" aria-hidden="true">
    <rect width="30" height="18" fill="#012169" />
    <path d="m0 0 30 18M30 0 0 18" stroke="#fff" strokeWidth="4" />
    <path d="m0 0 30 18M30 0 0 18" stroke="#c8102e" strokeWidth="1.5" />
    <path d="M15 0v18M0 9h30" stroke="#fff" strokeWidth="6" />
    <path d="M15 0v18M0 9h30" stroke="#c8102e" strokeWidth="2.5" />
  </svg>;
  if (code === 'fil') return <svg className="client-language-flag" viewBox="0 0 30 18" aria-hidden="true">
    <rect width="30" height="9" fill="#0038a8" />
    <rect y="9" width="30" height="9" fill="#ce1126" />
    <path d="M0 0 13 9 0 18Z" fill="#fff" />
    <circle cx="4.6" cy="9" r="2.1" fill="#fcd116" />
    <path d="m4.6 5.9.45 1.8 1.25-.9-.65 1.5 1.9.2-1.7.8 1.1 1.4-1.7-.7-.65 1.8-.4-1.8-1.4.9.8-1.6-1.8-.1 1.6-.8-1.1-1.4 1.7.7Z" fill="#fcd116" />
    <circle cx="10.6" cy="4" r=".75" fill="#fcd116" />
    <circle cx="10.6" cy="14" r=".75" fill="#fcd116" />
    <circle cx="1.8" cy="9" r=".75" fill="#fcd116" />
  </svg>;
  return <svg className="client-language-flag" viewBox="0 0 30 18" aria-hidden="true">
    <rect width="30" height="18" fill="#de2910" />
    <path d="m6 2 1.15 2.35 2.6.38-1.88 1.83.44 2.59L6 7.93l-2.32 1.22.44-2.59-1.88-1.83 2.6-.38Z" fill="#ffde00" />
    <path d="m12 2.4.52.65.82-.13-.4.73.4.73-.82-.13-.52.65-.14-.82-.75-.32.75-.33Z M14.1 4.8l.52.65.82-.13-.4.73.4.73-.82-.13-.52.65-.14-.82-.75-.32.75-.33Z M14 8l.52.65.82-.13-.4.73.4.73-.82-.13-.52.65-.14-.82-.75-.32.75-.33Z M11.8 10.3l.52.65.82-.13-.4.73.4.73-.82-.13-.52.65-.14-.82-.75-.32.75-.33Z" fill="#ffde00" />
  </svg>;
}

export default function ClientDashboardLanguageSelector() {
  const [selectedLanguage, setSelectedLanguage] = useState(languages[1]);
  const [open, setOpen] = useState(false);
  const selector = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('aipt-client-dashboard-language');
    const initial = languages.find((language) => language.code === saved) || languages[1];
    setSelectedLanguage(initial);
    document.documentElement.lang = initial.code;
    document.documentElement.dir = initial.code === 'ar' ? 'rtl' : 'ltr';
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!selector.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return <div className="client-language-selector" ref={selector}>
    <button
      type="button"
      className="client-language-trigger"
      aria-label={`Language: ${selectedLanguage.label}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls="client-language-menu"
      onClick={() => setOpen((value) => !value)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M4.9 6.5h14.2M4.9 17.5h14.2" />
      </svg>
      <LanguageFlag code={selectedLanguage.code} />
      <span>{selectedLanguage.label}</span>
      <svg className="client-language-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    {open && <div className="client-language-menu" id="client-language-menu" role="menu" aria-label="Choose a language">
      {languages.map((language) => <button
        key={language.label}
        type="button"
        role="menuitemradio"
        aria-checked={selectedLanguage.label === language.label}
        onClick={() => {
          setSelectedLanguage(language);
          window.localStorage.setItem('aipt-client-dashboard-language', language.code);
          document.documentElement.lang = language.code;
          document.documentElement.dir = language.code === 'ar' ? 'rtl' : 'ltr';
          window.dispatchEvent(new CustomEvent('aipt-client-dashboard-language-change', { detail: language.code }));
          setOpen(false);
        }}
      >
        <LanguageFlag code={language.code} />
        <span lang={language.code}>{language.label}</span>
        {selectedLanguage.label === language.label && <svg className="client-language-check" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
      </button>)}
    </div>}
  </div>;
}
