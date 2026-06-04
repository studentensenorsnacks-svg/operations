// POST /api/auth/login  — { username, password } → zet sessie-cookie.
// Publiek bereikbaar (zie middleware): dit is hét punt waar je inlogt.

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/users';
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  if (!username || !password) {
    return NextResponse.json(
      { message: 'Gebruikersnaam en code zijn verplicht.' },
      { status: 400 },
    );
  }

  let session = null;
  try {
    session = await authenticate(username, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json(
      { message: 'Onjuiste gebruikersnaam of code.' },
      { status: 401 },
    );
  }

  const token = await signSession(session);
  const res = NextResponse.json({
    username: session.username,
    role: session.role,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
