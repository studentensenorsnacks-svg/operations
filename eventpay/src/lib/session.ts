// Sessiebeheer voor EventPay beheer.
//
// We gebruiken een ondertekende cookie (HMAC-SHA256 met Web Crypto) i.p.v. een
// server-side sessietabel. Dat houdt het stateless én werkt in de Edge-runtime
// van de Next.js middleware — daar zijn firebase-admin en node:crypto niet
// beschikbaar, crypto.subtle/btoa/atob wél.
//
// Token-formaat:  base64url(JSON payload) "." base64url(HMAC)
// Payload:        { u: gebruikersnaam, r: rol, exp: unix-seconden }
//
// Dit bestand mag NIETS uit node:* of firebase-admin importeren, zodat het
// veilig in de middleware (edge) gebruikt kan worden.

export type Role = 'admin' | 'beheerder';

export interface Session {
  username: string;
  role: Role;
}

interface TokenPayload {
  u: string;
  r: Role;
  exp: number;
}

// LET OP: moet exact '__session' heten — Firebase Hosting stript álle andere
// cookies vóór het verzoek de backend (Cloud Run) bereikt.
export const SESSION_COOKIE = '__session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 uur

const enc = new TextEncoder();
const dec = new TextDecoder();

// Ondertekensleutel. Bij voorkeur via SESSION_SECRET (Firebase Secret Manager).
// Valt anders terug op een afgeleide van het admin-wachtwoord zodat de app ook
// zonder extra configuratie werkt. Zet SESSION_SECRET in productie expliciet.
export function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    `ep-session:${process.env.ADMIN_PASSWORD || '123654789phbss'}`
  );
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

export async function signSession(
  session: Session,
  secret = sessionSecret(),
): Promise<string> {
  const payload: TokenPayload = {
    u: session.username,
    r: session.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = bytesToB64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifySession(
  token: string | undefined | null,
  secret = sessionSecret(),
): Promise<Session | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = bytesToB64url(await hmac(secret, body));
  if (!timingSafeEqual(enc.encode(sig), enc.encode(expected))) return null;

  try {
    const payload = JSON.parse(dec.decode(b64urlToBytes(body))) as TokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.r !== 'admin' && payload.r !== 'beheerder') return null;
    if (!payload.u) return null;
    return { username: payload.u, role: payload.r };
  } catch {
    return null;
  }
}
