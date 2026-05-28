// HTTP Basic Authentication voor alle pagina's en API-routes.
//
// Werking:
//   • Browser stuurt geen Authorization-header → we antwoorden 401 met
//     WWW-Authenticate: Basic, waarop de browser een login-popup toont.
//   • Browser stuurt Authorization: Basic base64(user:pass) → we vergelijken
//     met AUTH_USERNAME / AUTH_PASSWORD uit env (server-side, in Firebase
//     Secret Manager).
//   • Lokaal (npm run dev) zonder secrets ingesteld → auth wordt
//     overgeslagen, zodat ontwikkelen makkelijk blijft.
//
// Belangrijk: dit beschermt zowel de HTML-pagina's als /api/* — geen enkele
// EventPay-call kan zonder login.

import { NextRequest, NextResponse } from 'next/server';

const REALM = 'EventPay beheer';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(req: NextRequest) {
  const expectedUser = process.env.AUTH_USERNAME;
  const expectedPass = process.env.AUTH_PASSWORD;

  // Geen credentials geconfigureerd → ontwikkelmodus, laat door.
  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const header = req.headers.get('authorization') ?? '';
  if (header.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(header.slice(6).trim());
      const sep = decoded.indexOf(':');
      if (sep !== -1) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        if (
          timingSafeEqual(user, expectedUser) &&
          timingSafeEqual(pass, expectedPass)
        ) {
          return NextResponse.next();
        }
      }
    } catch {
      // base64 decode mislukt → behandelen als geen auth
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

// Beschermt alles behalve Next.js-interne assets en favicon.
// /api/* zit hier WEL in: zelfs de proxy is alleen voor ingelogde users.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
