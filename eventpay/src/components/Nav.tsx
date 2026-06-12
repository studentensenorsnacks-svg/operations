'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const links: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/transacties', label: 'Transacties' },
  { href: '/verkoop', label: 'Verkoop' },
  { href: '/prognose', label: 'Prognose' },
  { href: '/operatoren', label: 'Operatoren' },
  { href: '/apparaten', label: 'Apparaten' },
  { href: '/koppeling', label: 'Event-koppeling' },
  { href: '/sectoren-nieuw', label: 'Sector aanmaken' },
  { href: '/voorraad', label: 'Voorraad' },
  { href: '/producten', label: 'Producten & sectoren' },
  { href: '/reusables', label: 'Reusables' },
];

interface Me {
  username: string;
  role: 'admin' | 'beheerder';
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setMe(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  };

  const navLinks =
    me?.role === 'admin'
      ? [...links, { href: '/beheerders', label: 'Beheerders' }]
      : links;

  return (
    <>
      <header className="topbar" role="banner">
        <button
          type="button"
          className="topbar-menu-btn"
          aria-label={open ? 'Menu sluiten' : 'Menu openen'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="topbar-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <div className="topbar-brand">
          <span className="brand-bar" />
          EventPay beheer
        </div>
      </header>

      {open && (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${open ? ' is-open' : ''}`}>
        <h1>
          <span className="brand-bar" />
          EventPay beheer
        </h1>
        <nav>
          {navLinks.map((l) => {
            const isActive =
              l.href === '/' ? pathname === '/' : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={isActive ? 'active' : ''}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-account">
          {me ? (
            <>
              <div className="sidebar-user">
                <span className="sidebar-user-name">{me.username}</span>
                <span
                  className={`badge ${
                    me.role === 'admin' ? 'badge-success' : ''
                  }`}
                >
                  {me.role === 'admin' ? 'Centrale beheerder' : 'Beheerder'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={logout}
              >
                Uitloggen
              </button>
            </>
          ) : null}
          <div className="footnote">
            Productie-omgeving — er is geen testmodus. Bevestigingen verschijnen
            voor acties die schrijven.
          </div>
        </div>
      </aside>
    </>
  );
}
