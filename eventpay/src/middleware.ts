// Auth-gate voor alle pagina's en API-routes van EventPay beheer.
//
// Werking:
//   • Geen geldige sessie-cookie → pagina's redirecten naar /login, API's
//     krijgen 401. De cookie wordt gezet door /api/auth/login.
//   • Wél een sessie → toegang. Rol staat in de cookie (admin | beheerder).
//   • Admin-only zones (/beheerders en /api/admin/*) zijn enkel voor de
//     centrale admin. Beheerders worden teruggestuurd (403 / naar dashboard).
//
// De sessie wordt geverifieerd met Web Crypto (HMAC), edge-compatibel — zie
// src/lib/session.ts. Geen node:* of firebase-admin hier.

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

// Paden die zonder sessie bereikbaar moeten zijn.
const PUBLIC_PAGES = ['/login'];
const PUBLIC_APIS = ['/api/auth/login'];

function isAdminOnly(pathname: string): boolean {
  return (
    pathname === '/beheerders' ||
    pathname.startsWith('/beheerders/') ||
    pathname.startsWith('/api/admin')
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_APIS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminOnly(pathname) && session.role !== 'admin') {
    if (isApi) {
      return NextResponse.json(
        { message: 'Geen toegang — admin vereist.' },
        { status: 403 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Beschermt alles behalve Next.js-interne assets en favicon.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
