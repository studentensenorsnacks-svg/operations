// Accountbeheer (admin-only).
//   GET  /api/admin/users  → lijst beheerders
//   POST /api/admin/users  → { username, password } maakt beheerder aan

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { listBeheerders, createBeheerder } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ message: 'Geen toegang.' }, { status: 403 });
  try {
    const beheerders = await listBeheerders();
    return NextResponse.json({ beheerders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ message: 'Geen toegang.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  try {
    await createBeheerder(
      String(body.username ?? ''),
      String(body.password ?? ''),
      admin.username,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 400 });
  }
}
