// Gebruikersbeheer (node-only — gebruikt node:crypto + firebase-admin).
//
// Twee soorten accounts:
//   • Centrale admin: vast account (senorphbss). Mag alles, inclusief het
//     beheren van beheerders. Credentials komen uit env met een ingebouwde
//     fallback, zodat de app altijd een admin heeft.
//   • Beheerders: door de admin aangemaakt, opgeslagen in Firestore. Mogen
//     alles in de app behalve accountbeheer. Wachtwoorden worden gehasht
//     (scrypt + per-account salt) — nooit plain opgeslagen.

import crypto from 'node:crypto';
import { getDb } from './firebase-admin';
import type { Session } from './session';

const COLLECTION = 'eventpay_beheerders';

export function centralAdmin(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'senorphbss',
    password: process.env.ADMIN_PASSWORD || '123654789phbss',
  };
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return (
    computed.length === expected.length &&
    crypto.timingSafeEqual(computed, expected)
  );
}

// Constant-time vergelijking van twee strings (voor de admin-credentials).
function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface Beheerder {
  username: string;
  createdAt: number;
  createdBy: string;
}

export async function authenticate(
  username: string,
  password: string,
): Promise<Session | null> {
  const admin = centralAdmin();
  if (safeStringEqual(username, admin.username)) {
    return safeStringEqual(password, admin.password)
      ? { username: admin.username, role: 'admin' }
      : null;
  }

  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(COLLECTION).doc(username.toLowerCase()).get();
  if (!snap.exists) return null;
  const data = snap.data() as { salt?: string; hash?: string };
  if (!data.salt || !data.hash) return null;
  if (!verifyPassword(password, data.salt, data.hash)) return null;
  return { username: username.toLowerCase(), role: 'beheerder' };
}

export async function listBeheerders(): Promise<Beheerder[]> {
  const db = getDb();
  if (!db) return [];
  const qs = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
  return qs.docs.map((d) => {
    const data = d.data() as { createdAt?: number; createdBy?: string };
    return {
      username: d.id,
      createdAt: data.createdAt ?? 0,
      createdBy: data.createdBy ?? '',
    };
  });
}

export async function createBeheerder(
  username: string,
  password: string,
  createdBy: string,
): Promise<void> {
  const db = getDb();
  if (!db)
    throw new Error(
      'Firestore is niet beschikbaar. Accountbeheer werkt in productie of met service-account credentials.',
    );

  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(clean))
    throw new Error(
      'Gebruikersnaam: 3–40 tekens, alleen kleine letters, cijfers en . _ -',
    );
  if (password.length < 6)
    throw new Error('Code moet minstens 6 tekens lang zijn.');
  if (safeStringEqual(clean, centralAdmin().username.toLowerCase()))
    throw new Error('Die gebruikersnaam is gereserveerd.');

  const existing = await db.collection(COLLECTION).doc(clean).get();
  if (existing.exists)
    throw new Error('Er bestaat al een beheerder met die gebruikersnaam.');

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  await db.collection(COLLECTION).doc(clean).set({
    salt,
    hash,
    role: 'beheerder',
    createdAt: Date.now(),
    createdBy,
  });
}

export async function deleteBeheerder(username: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore is niet beschikbaar.');
  await db.collection(COLLECTION).doc(username.toLowerCase()).delete();
}
