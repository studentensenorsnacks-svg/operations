// DELETE /api/admin/users/{username} — verwijdert een beheerder (admin-only).

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { deleteBeheerder } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ message: 'Geen toegang.' }, { status: 403 });

  const { username } = await params;
  try {
    await deleteBeheerder(decodeURIComponent(username));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 400 });
  }
}
