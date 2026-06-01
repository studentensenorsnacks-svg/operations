import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'EventPay beheer — Señor Snacks',
  description: 'Beheer wallets, transacties, verkoop en meer via de EventPay API.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>
        <div className="app">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
