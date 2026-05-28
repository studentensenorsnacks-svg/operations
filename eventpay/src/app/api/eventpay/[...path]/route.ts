// Generieke proxy: alles wat de browser POST/GET/PUT/DELETE'et naar
// /api/eventpay/<wat dan ook> wordt doorgestuurd naar de EventPay API.
//
// Dit houdt het bearer token server-side. De browser kent het token niet.
// Rate limiting (40/10s) wordt centraal toegepast in eventpay.ts.

import { NextRequest, NextResponse } from 'next/server';
import { call } from '@/lib/eventpay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ path: string[] }>;
}

function buildPath(segments: string[]): string {
  return '/' + segments.map(encodeURIComponent).join('/');
}

function queryFromUrl(req: NextRequest): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    const arrayKey = key.endsWith('[]') ? key.slice(0, -2) : null;
    const target = arrayKey ?? key;
    if (arrayKey) {
      const existing = out[target];
      if (Array.isArray(existing)) existing.push(value);
      else if (typeof existing === 'string') out[target] = [existing, value];
      else out[target] = [value];
    } else if (out[target] !== undefined) {
      // Meerdere keren dezelfde key zonder [] — promove naar array
      const existing = out[target];
      out[target] = Array.isArray(existing) ? [...existing, value] : [existing as string, value];
    } else {
      out[target] = value;
    }
  });
  return out;
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ message: 'Pad ontbreekt.' }, { status: 400 });
  }
  const eventpayPath = buildPath(path);
  const query = queryFromUrl(req);

  let body: unknown = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const text = await req.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { message: 'Ongeldige JSON in body.' },
          { status: 400 },
        );
      }
    }
  }

  try {
    const result = await call({
      method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      path: eventpayPath,
      query,
      body,
    });
    const headers: Record<string, string> = {};
    if (result.retryAfter) headers['Retry-After'] = result.retryAfter;
    return NextResponse.json(result.body, {
      status: result.status,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: `Proxy-fout: ${message}` },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
