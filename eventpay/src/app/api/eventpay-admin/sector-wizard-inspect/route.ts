// GET /api/eventpay-admin/sector-wizard-inspect
// Read-only diagnose van de sector-wizard: rapporteert welke knoppen/velden de
// kopieer-stap aanbiedt, zónder een sector aan te maken. Gebruikt om de exacte
// kopieer-methode en het bron-sectorveld te bepalen.

import { NextResponse } from 'next/server';
import { inspectSectorWizard } from '@/lib/eventpay-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await inspectSectorWizard();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
