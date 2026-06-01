// POST /api/eventpay-admin/set-sector
// Body: { device_uid, device_app, sector_id, sector_name }
// Voert via een ingelogde sessie + Livewire-flow de sector-koppeling uit.

import { NextRequest, NextResponse } from 'next/server';
import { setDeviceSector } from '@/lib/eventpay-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { device_uid, device_app, sector_id, sector_name } = body ?? {};
    if (
      typeof device_uid !== 'string' ||
      typeof device_app !== 'string' ||
      typeof sector_id !== 'number' ||
      typeof sector_name !== 'string'
    ) {
      return NextResponse.json(
        {
          message:
            'Body verwacht: { device_uid: string, device_app: string, sector_id: number, sector_name: string }',
        },
        { status: 400 },
      );
    }
    await setDeviceSector(device_uid, device_app, sector_id, sector_name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
