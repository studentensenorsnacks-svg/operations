// GET /api/auth/me — geeft de huidige sessie terug (of 401).
// Gebruikt door de UI om rol-afhankelijke onderdelen te tonen.

import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ message: 'Niet ingelogd.' }, { status: 401 });
  }
  return NextResponse.json(session);
}
