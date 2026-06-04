// Server-side helpers om in API-routes de huidige sessie / admin-rol te checken.
// De middleware gatekeept ook al, maar routes verifiëren zelf opnieuw zodat
// niets enkel op de matcher-config leunt (defense in depth).

import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, type Session } from './session';

export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function requireAdmin(): Promise<Session | null> {
  const session = await currentSession();
  return session && session.role === 'admin' ? session : null;
}
