// POST /api/prognose/forecast
// Body: { horizonMonths?, method?, eventIds? }
// Volledige join (events ↔ archief ↔ verkoop ↔ laadlijsten ↔ bestellingen) +
// trend-forecast + week/maand/jaar-rollups. Kan veel rate-limited /sales-calls
// doen, dus expliciet via knop.

import { NextRequest, NextResponse } from 'next/server';
import { runForecast } from '@/lib/prognose-engine';
import { RtdbUnavailableError } from '@/lib/prognose-rtdb';
import type { ForecastMethod } from '@/lib/prognose-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const METHODS: ForecastMethod[] = ['ols', 'cagr', 'weighted-avg', 'blend'];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ message: 'Ongeldige JSON in body.' }, { status: 400 });
  }

  const rawHorizon = Number(body.horizonMonths ?? 12);
  const horizonMonths = isNaN(rawHorizon) ? 12 : Math.min(36, Math.max(1, Math.round(rawHorizon)));
  const method = METHODS.includes(body.method as ForecastMethod)
    ? (body.method as ForecastMethod)
    : 'blend';
  const eventIds = Array.isArray(body.eventIds)
    ? body.eventIds.map((x) => String(x)).filter(Boolean)
    : undefined;

  try {
    const data = await runForecast({ horizonMonths, method, eventIds });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof RtdbUnavailableError) {
      return NextResponse.json({ message: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
