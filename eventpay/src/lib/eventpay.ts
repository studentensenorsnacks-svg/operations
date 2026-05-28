// Server-side wrapper rond fetch() naar de EventPay API.
// Wordt alleen aangeroepen vanuit Next.js API-routes (server). Het bearer
// token zit in process.env en raakt nooit de browser.
//
// Eigenschappen:
//   • Wacht op het rate-limit slot (40 verzoeken / 10 s)
//   • Bouwt automatisch de juiste headers
//   • Vertaalt fouten naar een nette { status, body } structuur
//   • Logt 429-antwoorden met Retry-After info naar de console

import { acquireSlot } from './rate-limiter';

export interface EventPayResponse {
  status: number;
  ok: boolean;
  body: unknown;
  contentType: string | null;
  retryAfter?: string | null;
}

function getConfig() {
  const baseUrl = process.env.EVENTPAY_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.EVENTPAY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      'EVENTPAY_BASE_URL en EVENTPAY_API_KEY moeten ingesteld zijn (zie .env.local).',
    );
  }
  return { baseUrl, apiKey };
}

export interface CallOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  // Begin met "/", bv "/wallets" of "/transactions"
  path: string;
  // Query params worden URL-encoded; arrays worden meerdere keren toegevoegd
  // (param[]=a&param[]=b)
  query?: Record<string, string | number | boolean | string[] | number[] | undefined | null>;
  // JSON-body voor POST/PUT/DELETE/PATCH
  body?: unknown;
  // Headers die de standaard mogen overschrijven
  headers?: Record<string, string>;
}

function buildUrl(baseUrl: string, path: string, query?: CallOptions['query']) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}/api/v1${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v === undefined || v === null) continue;
          url.searchParams.append(`${key}[]`, String(v));
        }
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function call(options: CallOptions): Promise<EventPayResponse> {
  const { baseUrl, apiKey } = getConfig();
  const url = buildUrl(baseUrl, options.path, options.query);
  await acquireSlot();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  let body: string | undefined;
  if (options.body !== undefined && options.body !== null) {
    body = JSON.stringify(options.body);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method,
    headers,
    body,
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type');
  const retryAfter = res.headers.get('retry-after');
  let parsed: unknown = null;
  if (contentType?.includes('application/json')) {
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
  } else {
    parsed = await res.text();
  }

  if (res.status === 429) {
    console.warn(
      `[EventPay] 429 ontvangen voor ${options.method} ${options.path}; retry-after=${retryAfter}`,
    );
  }

  return {
    status: res.status,
    ok: res.ok,
    body: parsed,
    contentType,
    retryAfter,
  };
}
