'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/transacties', label: 'Transacties' },
  { href: '/verkoop', label: 'Verkoop' },
  { href: '/operatoren', label: 'Operatoren' },
  { href: '/apparaten', label: 'Apparaten' },
  { href: '/voorraad', label: 'Voorraad' },
  { href: '/producten', label: 'Producten & sectoren' },
  { href: '/reusables', label: 'Reusables' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <h1>
        <span className="brand-bar" />
        EventPay beheer
      </h1>
      <nav>
        {links.map((l) => {
          const isActive =
            l.href === '/' ? pathname === '/' : pathname?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={isActive ? 'active' : ''}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="footnote">
        Productie-omgeving — er is geen testmodus. Bevestigingen verschijnen
        voor acties die schrijven.
      </div>
    </aside>
  );
}
