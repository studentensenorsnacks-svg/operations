// Verkoopdata uit EventPay /sales ophalen en defensief parsen.
//
// De /sales-respons geeft een rijke maar niet hard-gedocumenteerde structuur
// (data[], days[], methods[]). De exacte veldnamen variëren, dus we zoeken
// heuristisch naar sector-id/naam, totaal-bedrag en geneste productregels.

import { call } from './eventpay';
import { toNumber } from './types';
import { normalizeName } from './prognose-match';
import type { SalesForRange, SalesPerProduct, SalesPerDay } from './prognose-types';

// ── Datum/tijd helpers (Brussels, DST-bewust) ──────────────────────
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function brusselsOffset(dateStr: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Brussels',
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(new Date(`${dateStr}T12:00:00Z`));
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
    const m = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    if (!m) return '+01:00';
    return `${m[1]}${m[2]}:${m[3] ?? '00'}`;
  } catch {
    return '+01:00';
  }
}

export function rangeRfc3339(
  startDate: string,
  endDate: string,
  padDays = 1,
): { start_date: string; end_date: string } {
  const s = addDays(startDate, -padDays);
  const e = addDays(endDate, padDays);
  return {
    start_date: `${s}T00:00:00${brusselsOffset(s)}`,
    end_date: `${e}T23:59:59${brusselsOffset(e)}`,
  };
}

// ── Defensieve veld-vinders ────────────────────────────────────────
function findNumber(row: Record<string, unknown>, patterns: RegExp[]): number | null {
  for (const pat of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (pat.test(k)) {
        const n = toNumber(v as number | string);
        if (n !== undefined) return n;
      }
    }
  }
  return null;
}

function findString(row: Record<string, unknown>, patterns: RegExp[]): string | null {
  for (const pat of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (pat.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
  }
  return null;
}

function findArray(row: Record<string, unknown>, patterns: RegExp[]): Record<string, unknown>[] {
  for (const pat of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (pat.test(k) && Array.isArray(v)) {
        return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
      }
    }
  }
  return [];
}

const TOTAL_PATTERNS = [/^(sales_)?total$/i, /total/i, /amount/i, /omzet/i, /revenue/i, /sum/i];
const SECTOR_ID_PATTERNS = [/sector.*id/i, /^id$/i, /divider.*id/i];
const SECTOR_NAME_PATTERNS = [/sector.*name/i, /divider.*name/i, /^name$/i, /label/i, /title/i];
const PRODUCT_ARR_PATTERNS = [/products?/i, /children/i, /items/i, /details?/i];
const PROD_NAME_PATTERNS = [/product.*name/i, /detail_item_name/i, /^name$/i, /naam/i, /label/i];
const PROD_QTY_PATTERNS = [/quantity/i, /qty/i, /aantal/i, /count/i, /amount_plus/i];
const PROD_ID_PATTERNS = [/product_id/i, /product.*id/i, /^id$/i];

function parseProduct(row: Record<string, unknown>): SalesPerProduct | null {
  const name = findString(row, PROD_NAME_PATTERNS);
  if (!name) return null;
  const id = findNumber(row, PROD_ID_PATTERNS);
  const total = findNumber(row, TOTAL_PATTERNS) ?? 0;
  const qty = findNumber(row, PROD_QTY_PATTERNS);
  return {
    productKey: id != null ? `id:${id}` : `naam:${normalizeName(name)}`,
    name,
    total,
    qty,
  };
}

export function parseSectorSales(body: unknown): SalesForRange[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  const rows = Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [];
  const out: SalesForRange[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const sectorId = findNumber(row, SECTOR_ID_PATTERNS);
    const sectorName = findString(row, SECTOR_NAME_PATTERNS);
    const total = findNumber(row, TOTAL_PATTERNS) ?? 0;
    const products: SalesPerProduct[] = [];
    for (const pr of findArray(row, PRODUCT_ARR_PATTERNS)) {
      const p = parseProduct(pr);
      if (p) products.push(p);
    }
    out.push({
      sectorId: sectorId != null ? Math.round(sectorId) : null,
      sectorName,
      total,
      products,
      days: [],
    });
  }
  return out;
}

// Per-dag-totalen uit days[] (voor week-buckets bij meerdaagse events).
export function parseDays(body: unknown): SalesPerDay[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  const rows = Array.isArray(b.days) ? (b.days as Record<string, unknown>[]) : [];
  const out: SalesPerDay[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const date = findString(row, [/date/i, /datum/i, /day/i]);
    const total = findNumber(row, TOTAL_PATTERNS) ?? 0;
    if (date) out.push({ date: String(date).slice(0, 10), total });
  }
  return out;
}

// ── Dagtotalen voor een periode (top-down, sector-agnostisch) ──────
// Eén /sales-call met show_days levert dagomzet voor het hele bereik. Dit is de
// robuuste basis voor de week/maand/jaar-prognose: hangt enkel af van days[],
// niet van sectorvelden. Geeft een Map datum→omzet terug.
export async function fetchDailyTotals(
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const { start_date, end_date } = rangeRfc3339(startDate, endDate, 0);
  const res = await call({
    method: 'POST',
    path: '/sales',
    query: {
      start_date,
      end_date,
      show_products: false,
      show_methods: false,
      show_days: true,
      show_dividers: false,
      product_filters: 'sales',
    },
  });
  if (!res.ok) {
    const msg =
      res.body && typeof res.body === 'object' && 'message' in res.body
        ? String((res.body as { message?: unknown }).message)
        : `EventPay /sales gaf status ${res.status}`;
    throw new Error(msg);
  }
  const days = parseDays(res.body);
  const map = new Map<string, number>();
  for (const d of days) map.set(d.date, (map.get(d.date) ?? 0) + d.total);
  return map;
}

// ── Ophalen voor een periode (per-sector, voor toekomstige verfijning) ──
export async function fetchSalesForRange(
  startDate: string,
  endDate: string,
  sectorId?: number | null,
): Promise<{ sectors: SalesForRange[]; days: SalesPerDay[] }> {
  const { start_date, end_date } = rangeRfc3339(startDate, endDate);
  const query: Record<string, string | number | boolean | number[]> = {
    start_date,
    end_date,
    divider_type: 'sector',
    show_products: true,
    show_days: true,
    show_dividers: true,
    product_filters: 'sales',
  };
  if (sectorId != null) query.sector_ids = [sectorId];

  const res = await call({ method: 'POST', path: '/sales', query });
  if (!res.ok) {
    const msg =
      res.body && typeof res.body === 'object' && 'message' in res.body
        ? String((res.body as { message?: unknown }).message)
        : `EventPay /sales gaf status ${res.status}`;
    throw new Error(msg);
  }
  const sectors = parseSectorSales(res.body);
  const days = parseDays(res.body);
  return { sectors, days };
}
