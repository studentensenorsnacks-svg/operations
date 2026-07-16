// GET /api/eventpay-setup/sources
// Bronnen voor de Event-setup wizard: events met betaalterminals uit de
// planning (RTDB) en de beschikbare prijslijsten uit de prijslijst-tool.

import { NextResponse } from 'next/server';
import {
  getSetupEvents,
  getSetupPrijslijsten,
  RtdbUnavailableError,
} from '@/lib/event-setup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const [events, prijslijsten] = await Promise.all([
      getSetupEvents(),
      getSetupPrijslijsten(),
    ]);
    return NextResponse.json({
      events,
      prijslijsten: prijslijsten.map((l) => ({
        id: l.id,
        name: l.name,
        mode: l.mode,
        rate: l.rate,
        categorieCount: l.categories.length,
        itemCount: l.categories.reduce((s, c) => s + c.items.length, 0),
      })),
    });
  } catch (err) {
    const status = err instanceof RtdbUnavailableError ? 503 : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status });
  }
}
