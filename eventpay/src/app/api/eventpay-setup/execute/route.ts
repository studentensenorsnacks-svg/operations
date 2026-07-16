// POST /api/eventpay-setup/execute
// Body: { confirm: true, sectors: ExecuteSectorRequest[] }
// Voert het plan uit in EventPay-PRODUCTIE: sector aanmaken (kopie van
// CATALOGUS), prijzen + zichtbaarheid zetten, kastjes koppelen.

import { NextRequest, NextResponse } from 'next/server';
import { executeSetup, type ExecuteSectorRequest } from '@/lib/event-setup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // veel product-updates → ruim de tijd geven

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body?.confirm !== true) {
      return NextResponse.json(
        { message: 'Bevestiging ontbreekt (confirm: true).' },
        { status: 400 },
      );
    }
    const sectors = Array.isArray(body?.sectors)
      ? (body.sectors as ExecuteSectorRequest[])
      : [];
    if (!sectors.length) {
      return NextResponse.json(
        { message: 'Geen sectoren om aan te maken.' },
        { status: 400 },
      );
    }
    for (const s of sectors) {
      if (
        typeof s?.name !== 'string' ||
        !s.name.trim() ||
        typeof s?.copyFromSectorId !== 'number' ||
        !Array.isArray(s?.visible) ||
        !Array.isArray(s?.devices)
      ) {
        return NextResponse.json(
          { message: 'Ongeldige sector-aanvraag in body.' },
          { status: 400 },
        );
      }
    }
    const reports = await executeSetup(sectors);
    return NextResponse.json({ reports });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
