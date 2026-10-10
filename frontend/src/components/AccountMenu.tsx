"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";

type AccountMenuProps = {
  name: string;
  email: string;
  initials: string;
  updateHref: string;
  className?: string;
  showChangePassword?: boolean;
  passwordFirst?: boolean;
  navigationLinks?: { href: string; label: string }[];
  updateLabel?: string;
  passwordLabel?: string;
  signOutLabel?: string;
};

export default function AccountMenu({
  name,
  email,
  initials,
  updateHref,
  className = "",
  showChangePassword = true,
  passwordFirst = false,
  navigationLinks = [],
  updateLabel = "Update information",
  passwordLabel = "Change password",
  signOutLabel = "Sign out",
}: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  };

  return <div className={`account-menu ${className}`} ref={menu}>
    <button type="button" className="account-menu-trigger" aria-label={`${name} account menu`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
      <span className="account-menu-avatar">{initials}</span><span className="account-menu-summary"><b>{name}</b><small>{email || "Account settings"}</small></span><span className="account-menu-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></span>
    </button>
    {open && <div className="account-menu-popover" role="menu">
      <div className="account-menu-heading"><b>{name}</b><small>{email || "Signed-in account"}</small></div>
      {passwordFirst && showChangePassword && <Link href="/change-password" role="menuitem" onClick={() => setOpen(false)}>{passwordLabel}</Link>}
      <Link href={updateHref} role="menuitem" onClick={() => setOpen(false)}>{updateLabel}</Link>
      {navigationLinks.map(link => <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpen(false)}>{link.label}</Link>)}
      {!passwordFirst && showChangePassword && <Link href="/change-password" role="menuitem" onClick={() => setOpen(false)}>{passwordLabel}</Link>}
      <button type="button" role="menuitem" className="account-menu-signout" onClick={() => void signOut()}>{signOutLabel}</button>
    </div>}
  </div>;
}