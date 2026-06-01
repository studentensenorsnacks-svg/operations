// GET /api/eventpay-admin/overview
// Logt in op de EventPay admin-website, scrapeert de devices-pagina en
// retourneert {devices, sectors} zoals de admin-UI ze toont.

import { NextResponse } from 'next/server';
import { getAdminOverview } from '@/lib/eventpay-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getAdminOverview();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
