// POST /api/eventpay-admin/sectors
// Body: { name: string, copyFromSectorId?: number }
// Maakt via de admin-wizard een nieuwe sector aan. Met copyFromSectorId wordt
// de volledige prijslijst (categorieën + producten) van die bron-sector
// gekopieerd via de ingebouwde kopieer-stap van de wizard.

import { NextRequest, NextResponse } from 'next/server';
import { createSector } from '@/lib/eventpay-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name : null;
    if (!name) {
      return NextResponse.json(
        { message: "Body verwacht: { name: string }" },
        { status: 400 },
      );
    }
    const copyFromSectorId =
      typeof body?.copyFromSectorId === 'number' ? body.copyFromSectorId : null;
    await createSector(name, { copyFromSectorId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
