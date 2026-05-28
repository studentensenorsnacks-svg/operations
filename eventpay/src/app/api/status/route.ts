// Diagnostisch endpoint. Toont:
//   • of EVENTPAY_BASE_URL en EVENTPAY_API_KEY ingesteld zijn
//   • huidig rate-limit-gebruik (X / 40 in laatste 10 s)
//   • resultaat van een live /ping naar EventPay (verifieert auth)

import { NextResponse } from 'next/server';
import { call } from '@/lib/eventpay';
import { rateLimitSnapshot } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const hasBaseUrl = Boolean(process.env.EVENTPAY_BASE_URL);
  const hasApiKey = Boolean(process.env.EVENTPAY_API_KEY);
  let ping: { ok: boolean; status: number; body?: unknown; error?: string } = {
    ok: false,
    status: 0,
  };
  if (hasBaseUrl && hasApiKey) {
    try {
      const res = await call({ method: 'GET', path: '/ping' });
      ping = { ok: res.ok, status: res.status, body: res.body };
    } catch (e) {
      ping = {
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return NextResponse.json({
    config: {
      base_url_set: hasBaseUrl,
      api_key_set: hasApiKey,
      base_url: process.env.EVENTPAY_BASE_URL ?? null,
    },
    rate_limit: rateLimitSnapshot(),
    ping,
  });
}
