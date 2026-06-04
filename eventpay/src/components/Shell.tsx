'use client';

import { usePathname } from 'next/navigation';
import Nav from './Nav';

// Wrapper rond de pagina-inhoud. Op /login tonen we geen nav/sidebar maar een
// schermvullend login-scherm; overal anders de gewone app-layout.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <Nav />
      <main>{children}</main>
    </div>
  );
}
