// POST /api/eventpay-setup/plan
// Body: { eventId: string, prijslijstId: string }
// Bouwt het dry-run plan: sectoren per kassa-assortiment, kastje-matches,
// product-matching prijslijst ↔ CATALOGUS. Alleen lezen — voert niets uit.

import { NextRequest, NextResponse } from 'next/server';
import { buildSetupPlan, RtdbUnavailableError } from '@/lib/event-setup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
    const prijslijstId =
      typeof body?.prijslijstId === 'string' ? body.prijslijstId : '';
    if (!eventId || !prijslijstId) {
      return NextResponse.json(
        { message: 'Body verwacht: { eventId, prijslijstId }' },
        { status: 400 },
      );
    }
    const plan = await buildSetupPlan(eventId, prijslijstId);
    return NextResponse.json(plan);
  } catch (err) {
    const status = err instanceof RtdbUnavailableError ? 503 : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status });
  }
}
