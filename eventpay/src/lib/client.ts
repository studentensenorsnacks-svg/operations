// Client-side wrapper voor /api/eventpay/* — geen token, geen geheimen.
// De browser praat alleen met onze eigen Next.js backend, die proxiet naar
// EventPay met het bearer token (zie src/app/api/eventpay/[...path]/route.ts).

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `EventPay-fout (${status})`);
    this.status = status;
    this.body = body;
  }
}

function buildQueryString(
  query?: Record<
    string,
    string | number | boolean | undefined | null | (string | number)[]
  >,
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null) continue;
        params.append(`${key}[]`, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  opts?: {
    query?: Parameters<typeof buildQueryString>[0];
    body?: unknown;
  },
): Promise<T> {
  const url = `/api/eventpay${path}${buildQueryString(opts?.query)}`;
  const res = await fetch(url, {
    method,
    headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const contentType = res.headers.get('content-type');
  let body: unknown = null;
  if (contentType?.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  if (!res.ok) {
    let msg = `EventPay-fout (${res.status})`;
    if (body && typeof body === 'object' && 'message' in body) {
      const m = (body as { message?: unknown }).message;
      if (typeof m === 'string') msg = m;
    }
    throw new ApiError(res.status, body, msg);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: Parameters<typeof buildQueryString>[0]) =>
    request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, query?: Parameters<typeof buildQueryString>[0]) =>
    request<T>('POST', path, { body, query }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
};

// UUIDv4 voor idempotency keys. Werkt in modern browsers (crypto.randomUUID).
export function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helpers voor weergave
export function formatAmount(value: number | undefined | null, currency = '€'): string {
  if (value === undefined || value === null || isNaN(value)) return '—';
  return `${currency} ${value.toFixed(2).replace('.', ',')}`;
}

export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString('nl-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

// Convert a <input type="datetime-local"> waarde naar RFC-3339.
// Bv. "2026-05-28T14:30" → "2026-05-28T14:30:00+02:00" (lokale offset).
export function toRfc3339(localDatetime: string): string {
  if (!localDatetime) return '';
  const d = new Date(localDatetime);
  if (isNaN(d.getTime())) return localDatetime;
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
