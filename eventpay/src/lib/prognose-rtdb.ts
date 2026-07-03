// RTDB-fetchers voor de Prognose-feature. Alleen lezen.
//
// Elke functie doet één getRtdb().ref(path).get() en normaliseert de ruwe data
// naar de typed structuren uit prognose-types.ts. Defensief: de RTDB-records
// zijn met de hand/HTML-formulieren gevuld, dus velden kunnen ontbreken.

import { getRtdb } from './firebase-admin';
import type {
  PlanningEvent,
  Laadlijst,
  Bestelling,
  CatalogusProduct,
} from './prognose-types';

export class RtdbUnavailableError extends Error {
  constructor() {
    super(
      'Realtime Database niet beschikbaar. Lokaal: zet GOOGLE_APPLICATION_CREDENTIALS ' +
        'of draai `gcloud auth application-default login`.',
    );
    this.name = 'RtdbUnavailableError';
  }
}

async function readPath(path: string): Promise<Record<string, unknown>> {
  const db = getRtdb();
  if (!db) throw new RtdbUnavailableError();
  const snap = await db.ref(path).get();
  const val = snap.val();
  if (!val || typeof val !== 'object') return {};
  return val as Record<string, unknown>;
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  return String(v);
}

function num(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function arr<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  // RTDB serialiseert soms een array als object {0:..,1:..}
  if (v && typeof v === 'object') return Object.values(v as object) as T[];
  return [];
}

// ── Events ─────────────────────────────────────────────────────────
function normalizeEvent(
  key: string,
  raw: Record<string, unknown>,
  source: 'planning' | 'archief',
): PlanningEvent | null {
  const start = str(raw.startDate || raw.start || raw.datum).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null; // geen bruikbare datum
  const end = str(raw.endDate || raw.end || start).slice(0, 10) || start;
  return {
    id: str(raw.id ?? key),
    source,
    name: str(raw.name || raw.naam || raw.subject || raw.title),
    location: str(raw.location || raw.locatie || raw.plaats),
    startDate: start,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start,
    color: strOrNull(raw.color),
    trucks: arr<string>(raw.trucks).map((t) => str(t)).filter(Boolean),
  };
}

export async function getPlanningEvents(): Promise<PlanningEvent[]> {
  const val = await readPath('ft_planning_v1');
  const out: PlanningEvent[] = [];
  for (const [key, raw] of Object.entries(val)) {
    if (raw && typeof raw === 'object') {
      const ev = normalizeEvent(key, raw as Record<string, unknown>, 'planning');
      if (ev) out.push(ev);
    }
  }
  return out;
}

export async function getArchiefEvents(): Promise<PlanningEvent[]> {
  const val = await readPath('ft_planning_outlook_archief');
  const out: PlanningEvent[] = [];
  for (const [key, raw] of Object.entries(val)) {
    if (raw && typeof raw === 'object') {
      const ev = normalizeEvent(key, raw as Record<string, unknown>, 'archief');
      if (ev) out.push(ev);
    }
  }
  return out;
}

// ── Laadlijsten ────────────────────────────────────────────────────
export async function getLaadlijsten(): Promise<Laadlijst[]> {
  const val = await readPath('ft_laadlijsten_v1');
  const out: Laadlijst[] = [];
  for (const [key, rawU] of Object.entries(val)) {
    if (!rawU || typeof rawU !== 'object') continue;
    const raw = rawU as Record<string, unknown>;
    const items: Laadlijst['items'] = [];

    // Primair: categorieën: { CAT: [{naam, aantal}] }
    const cats = (raw['categorieën'] || raw['categorieen'] || raw['categories']) as
      | Record<string, unknown>
      | undefined;
    if (cats && typeof cats === 'object') {
      for (const [catName, lineU] of Object.entries(cats)) {
        for (const lU of arr<Record<string, unknown>>(lineU)) {
          const naam = str(lU.naam || lU.name);
          if (!naam) continue;
          items.push({ naam, aantal: num(lU.aantal ?? lU.qty), categorie: catName });
        }
      }
    } else {
      // Fallback: platte items[]
      for (const lU of arr<Record<string, unknown>>(raw.items)) {
        const naam = str(lU.naam || lU.name);
        if (!naam) continue;
        items.push({
          naam,
          aantal: num(lU.aantal ?? lU.qty),
          categorie: str(lU.categorie || lU.cat),
        });
      }
    }

    out.push({
      key,
      eventId: strOrNull(raw.eventId),
      eventNaam: strOrNull(raw.eventNaam || raw.naam),
      datum: strOrNull(raw.datum) ? str(raw.datum).slice(0, 10) : null,
      wagen: strOrNull(raw.wagen),
      items,
    });
  }
  return out;
}

// ── Bestellingen ───────────────────────────────────────────────────
export async function getBestellingen(): Promise<Bestelling[]> {
  const val = await readPath('ft_bestellingen_v1');
  const out: Bestelling[] = [];
  for (const [key, rawU] of Object.entries(val)) {
    if (!rawU || typeof rawU !== 'object') continue;
    const raw = rawU as Record<string, unknown>;
    const lines: Bestelling['lines'] = [];
    for (const lU of arr<Record<string, unknown>>(raw.lines)) {
      const name = str(lU.name || lU.naam);
      if (!name) continue;
      lines.push({ name, art: strOrNull(lU.art), qty: num(lU.qty ?? lU.aantal) });
    }
    out.push({
      key,
      datum: strOrNull(raw.datum) ? str(raw.datum).slice(0, 10) : null,
      locatie: strOrNull(raw.locatie),
      kraam: strOrNull(raw.kraam),
      type: strOrNull(raw.type),
      lines,
    });
  }
  return out;
}

// ── Catalogus ──────────────────────────────────────────────────────
export async function getCatalogus(): Promise<CatalogusProduct[]> {
  const val = await readPath('ft_bestel_catalogus_v1');
  const out: CatalogusProduct[] = [];
  for (const [key, rawU] of Object.entries(val)) {
    if (!rawU || typeof rawU !== 'object') continue;
    const raw = rawU as Record<string, unknown>;
    const name = str(raw.name || raw.naam);
    if (!name) continue;
    out.push({
      key,
      name,
      art: strOrNull(raw.art),
      perDoos: raw.perDoos != null ? num(raw.perDoos) : null,
      cat: strOrNull(raw.cat),
    });
  }
  return out;
}
