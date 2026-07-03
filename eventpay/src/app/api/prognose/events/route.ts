// GET /api/prognose/events?horizonMonths=12
// Lichte event-lijst: komende events binnen de horizon + voor welke jaren er
// historiek (archief/planning) bestaat. Alleen RTDB, geen verkoop-calls.

import { NextRequest, NextResponse } from 'next/server';
import { buildEventList } from '@/lib/prognose-engine';
import { RtdbUnavailableError } from '@/lib/prognose-rtdb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const raw = parseInt(req.nextUrl.searchParams.get('horizonMonths') ?? '12', 10);
  const horizonMonths = isNaN(raw) ? 12 : Math.min(36, Math.max(1, raw));
  try {
    const data = await buildEventList(horizonMonths);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof RtdbUnavailableError) {
      return NextResponse.json({ message: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
