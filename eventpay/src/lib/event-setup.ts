// Event-setup: verbindt de operations-planning en de prijslijsten (RTDB)
// met EventPay. Per event stellen we één sector per kassa-assortiment voor
// (op basis van de "waarvoor?"-koppeling van de betaalterminals in de
// planning), met prijzen uit de gekozen prijslijst. Uitvoeren = sector
// aanmaken als kopie van de CATALOGUS-sector, prijzen/zichtbaarheid zetten
// via de publieke API en de kastjes (herkend aan comment 1..n = EP1..EPn)
// aan de sector koppelen.

import { getRtdb } from './firebase-admin';
import { call } from './eventpay';
import {
  getAdminOverview,
  createSector,
  setDeviceSector,
} from './eventpay-admin';
import type { Paginated, SectorWithCategories } from './types';

export const CATALOG_SECTOR_NAME = 'CATALOGUS';

export class RtdbUnavailableError extends Error {
  constructor() {
    super(
      'Realtime Database niet beschikbaar. Lokaal: zet GOOGLE_APPLICATION_CREDENTIALS ' +
        'of draai `gcloud auth application-default login`.',
    );
    this.name = 'RtdbUnavailableError';
  }
}

// ── Types ──────────────────────────────────────────────────────────
export interface SetupTerminal {
  name: string; // "EP1"
  use: string | null; // "Friet + Hamburger" uit de planning, of null
}

export interface SetupEvent {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  terminals: SetupTerminal[];
}

export interface SetupPrijslijstItem {
  name: string;
  euro: number;
  note: string;
}

export interface SetupPrijslijstCategorie {
  title: string;
  items: SetupPrijslijstItem[];
}

export interface SetupPrijslijst {
  id: string;
  name: string;
  mode: string;
  rate: number;
  categories: SetupPrijslijstCategorie[];
}

export interface CatalogProduct {
  id: number;
  name: string;
  categorie: string;
  price: number | null;
}

export interface SetupCatalog {
  sectorId: number;
  sectorName: string;
  products: CatalogProduct[];
}

export interface KastjeMatch {
  terminal: string; // "EP1"
  use: string | null;
  deviceUid: string | null;
  deviceApp: string | null;
  deviceName: string | null;
  comment: string | null;
}

export interface SetupGroup {
  use: string | null;
  terminals: string[];
  suggestedName: string;
  suggestedCategories: string[]; // titels uit de prijslijst
}

export interface ItemMatch {
  categorie: string;
  name: string;
  euro: number;
  productId: number | null;
  productName: string | null;
}

export interface SetupPlan {
  event: SetupEvent;
  prijslijst: SetupPrijslijst;
  catalog: SetupCatalog | null;
  kastjes: KastjeMatch[];
  groups: SetupGroup[];
  matches: ItemMatch[];
  warnings: string[];
}

// ── Kleine helpers ─────────────────────────────────────────────────
function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
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
  if (v && typeof v === 'object') return Object.values(v as object) as T[];
  return [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

async function readPath(path: string): Promise<Record<string, unknown>> {
  const db = getRtdb();
  if (!db) throw new RtdbUnavailableError();
  const snap = await db.ref(path).get();
  const val = snap.val();
  if (!val || typeof val !== 'object') return {};
  return val as Record<string, unknown>;
}

// Naam normaliseren voor matching: kleine letters, accenten/leestekens weg.
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Planning: events met betaalterminals ───────────────────────────
export async function getSetupEvents(): Promise<SetupEvent[]> {
  const val = await readPath('ft_planning_v1');
  const today = new Date();
  today.setDate(today.getDate() - 30); // events tot 30 dagen terug tonen
  const cutoff = today.toISOString().slice(0, 10);

  const out: SetupEvent[] = [];
  for (const raw of Object.values(val)) {
    const ev = obj(raw);
    const start = str(ev.startDate).slice(0, 10);
    const end = str(ev.endDate || ev.startDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    if (end < cutoff) continue;

    // Terminals: vaste lijst + per-dag toewijzingen samenvoegen
    const names = new Set<string>();
    arr<string>(ev.terminals).forEach((t) => {
      const s = str(t);
      if (s) names.add(s);
    });
    for (const dayList of Object.values(obj(ev.terminalDays))) {
      arr<string>(dayList).forEach((t) => {
        const s = str(t);
        if (s) names.add(s);
      });
    }
    if (!names.size) continue;

    const uses = obj(ev.terminalTruck);
    const terminals: SetupTerminal[] = Array.from(names)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
      )
      .map((t) => ({ name: t, use: str(uses[t]) || null }));

    out.push({
      id: str(ev.id),
      name: str(ev.name) || '(zonder naam)',
      location: str(ev.location),
      startDate: start,
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start,
      terminals,
    });
  }
  out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return out;
}

// ── Prijslijsten uit de prijslijst-tool ────────────────────────────
export async function getSetupPrijslijsten(): Promise<SetupPrijslijst[]> {
  const val = await readPath('ft_prijslijsten_v1');
  const out: SetupPrijslijst[] = [];
  for (const [key, raw] of Object.entries(val)) {
    const l = obj(raw);
    const mode = str(l.mode) || 'euro';
    const rate = num(l.rate) || 0;
    const categories: SetupPrijslijstCategorie[] = arr(l.categories)
      .map((c) => {
        const cat = obj(c);
        const items: SetupPrijslijstItem[] = arr(cat.items)
          .map((it) => {
            const item = obj(it);
            const euro =
              mode === 'token'
                ? Math.round(num(item.tokens) * rate * 100) / 100
                : Math.round(num(item.euro) * 100) / 100;
            return {
              name: str(item.name),
              euro,
              note: str(item.note),
            };
          })
          .filter((it) => it.name);
        return { title: str(cat.title) || 'Menu', items };
      })
      .filter((c) => c.items.length);
    if (!categories.length) continue;
    out.push({
      id: str(l.id) || key,
      name: str(l.name) || key,
      mode,
      rate,
      categories,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ── EventPay: CATALOGUS-sector met producten ───────────────────────
function stripIdSuffix(name: string): string {
  return name.replace(/\s*\[ID:\s*-?\d+\]\s*$/, '').trim();
}

// Doorloopt alle pagina's van /sectors/list en geeft de sectorbomen terug.
async function fetchAllSectorTrees(): Promise<SectorWithCategories[]> {
  const all: SectorWithCategories[] = [];
  let page = 1;
  for (let guard = 0; guard < 30; guard++) {
    const res = await call({
      method: 'GET',
      path: '/sectors/list',
      query: { page, limit: 50 },
    });
    if (!res.ok) {
      throw new Error(
        `Sectorlijst ophalen mislukt (${res.status}): ${JSON.stringify(res.body).slice(0, 200)}`,
      );
    }
    const body = res.body as Paginated<SectorWithCategories>;
    all.push(...(body.data ?? []));
    const last = body.meta?.last_page ?? page;
    if (page >= last) break;
    page++;
  }
  return all;
}

export function catalogFromTrees(
  trees: SectorWithCategories[],
): SetupCatalog | null {
  const target = trees.find(
    (s) =>
      stripIdSuffix(str(s.sector_name)).toLowerCase() ===
      CATALOG_SECTOR_NAME.toLowerCase(),
  );
  if (!target) return null;
  const products: CatalogProduct[] = [];
  const walk = (cats: SectorWithCategories['categories'], parent: string) => {
    (cats ?? []).forEach((c) => {
      const catName = str(c.categorie_name) || parent;
      (c.products ?? []).forEach((p) => {
        const name = str(p.product_name_internal || p.product_name_external);
        if (!name) return;
        products.push({
          id: p.product_id,
          name,
          categorie: catName,
          price: typeof p.product_price === 'number' ? p.product_price : null,
        });
      });
      if (c.children?.length) walk(c.children, catName);
    });
  };
  walk(target.categories, '');
  return {
    sectorId: target.sector_id,
    sectorName: stripIdSuffix(str(target.sector_name)),
    products,
  };
}

// ── Categorie-suggesties: "waarvoor"-keuze ↔ prijslijst-categorie ──
// De veertien vaste keuzes uit de planning gematcht op categorie-titels.
const USE_SYNONYMS: Record<string, string[]> = {
  friet: ['fries', 'friet', 'frieten', 'frites', 'frituur'],
  hamburger: ['burger', 'burgers', 'hamburger', 'gourmet'],
  'bicky burger': ['bicky'],
  'beef burger': ['beef'],
  pizza: ['pizza'],
  pasta: ['pasta'],
  wok: ['wok'],
  'belegde broodjes / panini': ['broodje', 'broodjes', 'panini'],
  'kebab / pitta': ['kebab', 'pitta', 'pita'],
  wraps: ['wrap', 'wraps'],
  'poke bowls': ['poke'],
  'fried chicken': ['chicken', 'kip', 'fried', 'wings', 'nuggets'],
  sweet: ['sweet', 'dessert', 'ijs', 'snoep'],
  drank: ['drank', 'dranken', 'drinks', 'bar', 'beverages', 'tap'],
};

export function suggestCategoriesForUse(
  use: string | null,
  categoryTitles: string[],
): string[] {
  if (!use) return [];
  const parts = use
    .split(/\s+\+\s+/)
    .map((p) => normName(p))
    .filter(Boolean);
  const hit = new Set<string>();
  for (const title of categoryTitles) {
    const nt = normName(title);
    for (const part of parts) {
      const syns = USE_SYNONYMS[part] ?? [part];
      const words = nt.split(' ');
      if (
        syns.some(
          (s) => nt === s || words.includes(s) || nt.includes(s),
        ) ||
        nt === part ||
        part.includes(nt)
      ) {
        hit.add(title);
        break;
      }
    }
  }
  return Array.from(hit);
}

// ── Product-matching prijslijst ↔ catalogus ────────────────────────
export function matchItems(
  prijslijst: SetupPrijslijst,
  catalog: SetupCatalog | null,
): ItemMatch[] {
  const byNorm = new Map<string, CatalogProduct>();
  (catalog?.products ?? []).forEach((p) => {
    const key = normName(p.name);
    if (key && !byNorm.has(key)) byNorm.set(key, p);
  });
  const list = catalog?.products ?? [];

  const out: ItemMatch[] = [];
  for (const cat of prijslijst.categories) {
    for (const it of cat.items) {
      const key = normName(it.name);
      let hit: CatalogProduct | null = byNorm.get(key) ?? null;
      if (!hit && key.length >= 4) {
        // Fuzzy: de ene naam bevat de andere ("friet met saus" ~ "friet saus")
        hit =
          list.find((p) => {
            const pn = normName(p.name);
            return pn.length >= 4 && (pn.includes(key) || key.includes(pn));
          }) ?? null;
      }
      out.push({
        categorie: cat.title,
        name: it.name,
        euro: it.euro,
        productId: hit?.id ?? null,
        productName: hit?.name ?? null,
      });
    }
  }
  return out;
}

// ── Plan opbouwen (dry-run, alleen lezen) ──────────────────────────
export async function buildSetupPlan(
  eventId: string,
  prijslijstId: string,
): Promise<SetupPlan> {
  const [events, lijsten] = await Promise.all([
    getSetupEvents(),
    getSetupPrijslijsten(),
  ]);
  const event = events.find((e) => e.id === eventId);
  if (!event) throw new Error(`Event ${eventId} niet gevonden in de planning.`);
  const prijslijst = lijsten.find((l) => l.id === prijslijstId);
  if (!prijslijst) throw new Error(`Prijslijst ${prijslijstId} niet gevonden.`);

  const warnings: string[] = [];

  // EventPay-kant: kastjes + catalogus
  const [overview, trees] = await Promise.all([
    getAdminOverview(),
    fetchAllSectorTrees(),
  ]);
  const catalog = catalogFromTrees(trees);
  if (!catalog) {
    warnings.push(
      `Sector "${CATALOG_SECTOR_NAME}" bestaat nog niet in EventPay. Maak hem aan en zet er alle producten in — die sector is de bron waarvan elke event-sector gekopieerd wordt.`,
    );
  } else if (!catalog.products.length) {
    warnings.push(
      `Sector "${CATALOG_SECTOR_NAME}" bestaat maar bevat nog geen producten. Voeg de producten toe in de EventPay admin.`,
    );
  }

  // Kastjes: EPn ↔ apparaat met comment "n"
  const kastjes: KastjeMatch[] = event.terminals.map((t) => {
    const m = t.name.match(/^EP\s*(\d+)$/i);
    const nr = m ? String(parseInt(m[1], 10)) : null;
    const device = nr
      ? overview.devices.find((d) => str(d.comment).trim() === nr)
      : undefined;
    if (!m) {
      warnings.push(
        `Terminal "${t.name}" is geen EP-nummer — kan geen kastje koppelen.`,
      );
    } else if (!device) {
      warnings.push(
        `Geen EventPay-kastje gevonden met comment "${nr}" voor ${t.name}. Zet het nummer in het comment-veld van het apparaat in EventPay.`,
      );
    }
    return {
      terminal: t.name,
      use: t.use,
      deviceUid: device?.device_uid ?? null,
      deviceApp: device?.device_app ?? null,
      deviceName: device?.device_name ?? null,
      comment: device?.comment ?? null,
    };
  });

  // Groepen: terminals met dezelfde "waarvoor"-waarde → één sector
  const byUse = new Map<string, string[]>();
  for (const t of event.terminals) {
    const key = t.use ?? '';
    if (!byUse.has(key)) byUse.set(key, []);
    byUse.get(key)!.push(t.name);
  }
  const catTitles = prijslijst.categories.map((c) => c.title);
  const groups: SetupGroup[] = Array.from(byUse.entries()).map(
    ([use, terminals]) => {
      const suffix = use || terminals.join('+');
      const suggested = suggestCategoriesForUse(use || null, catTitles);
      if (use && !suggested.length) {
        warnings.push(
          `Geen prijslijst-categorie herkend voor "${use}" — vink de juiste categorieën handmatig aan.`,
        );
      }
      return {
        use: use || null,
        terminals,
        suggestedName: `${event.name} — ${suffix}`.slice(0, 100),
        // Zonder "waarvoor"-keuze: alles voorstellen
        suggestedCategories: use ? suggested : catTitles,
      };
    },
  );

  const matches = matchItems(prijslijst, catalog);
  const misses = matches.filter((m) => !m.productId);
  if (catalog && misses.length) {
    warnings.push(
      `${misses.length} prijslijst-item(s) niet gevonden in de CATALOGUS: ${misses
        .map((m) => m.name)
        .slice(0, 8)
        .join(', ')}${misses.length > 8 ? ', …' : ''}. Voeg ze toe in de EventPay admin (de API kan geen producten aanmaken).`,
    );
  }

  return { event, prijslijst, catalog, kastjes, groups, matches, warnings };
}

// ── Uitvoeren ──────────────────────────────────────────────────────
export interface ExecuteSectorRequest {
  name: string;
  copyFromSectorId: number;
  // Producten die zichtbaar moeten blijven, met hun nieuwe prijs.
  // Match gebeurt op (genormaliseerde) productnaam in de nieuwe sector.
  visible: Array<{ productName: string; price: number }>;
  devices: Array<{ uid: string; app: string; terminal: string }>;
}

export interface ExecuteStepReport {
  sector: string;
  steps: string[];
  errors: string[];
}

export async function executeSetup(
  sectors: ExecuteSectorRequest[],
): Promise<ExecuteStepReport[]> {
  const reports: ExecuteStepReport[] = [];

  for (const req of sectors) {
    const report: ExecuteStepReport = { sector: req.name, steps: [], errors: [] };
    reports.push(report);
    try {
      // 1. Sector aanmaken als kopie van de catalogus
      await createSector(req.name, { copyFromSectorId: req.copyFromSectorId });
      report.steps.push(`Sector "${req.name}" aangemaakt (kopie van CATALOGUS)`);

      // 2. Nieuwe sector terugvinden (id) via de admin-lijst
      const overview = await getAdminOverview();
      const created = overview.sectors.find(
        (s) =>
          stripIdSuffix(s.name).toLowerCase() === req.name.trim().toLowerCase(),
      );
      if (!created) {
        throw new Error(
          `Sector "${req.name}" niet teruggevonden na aanmaken — prijzen en kastjes niet gezet.`,
        );
      }

      // 3. Producten van de nieuwe sector ophalen
      const trees = await fetchAllSectorTrees();
      const tree = trees.find((s) => s.sector_id === created.id);
      const products: Array<{ id: number; name: string }> = [];
      const walk = (cats: SectorWithCategories['categories']) => {
        (cats ?? []).forEach((c) => {
          (c.products ?? []).forEach((p) => {
            const name = str(p.product_name_internal || p.product_name_external);
            if (name) products.push({ id: p.product_id, name });
          });
          if (c.children?.length) walk(c.children);
        });
      };
      walk(tree?.categories);
      if (!products.length) {
        report.errors.push(
          'Geen producten gevonden in de nieuwe sector — is de CATALOGUS gevuld?',
        );
      }

      // 4. Prijzen + zichtbaarheid zetten
      const wanted = new Map<string, number>();
      req.visible.forEach((v) => wanted.set(normName(v.productName), v.price));
      let priced = 0;
      let hidden = 0;
      for (const p of products) {
        const key = normName(p.name);
        const price = wanted.get(key);
        const body =
          price !== undefined
            ? { product_price: price, product_visible: true }
            : { product_visible: false };
        const res = await call({
          method: 'PUT',
          path: `/products/${p.id}`,
          body,
        });
        if (!res.ok) {
          report.errors.push(
            `Product "${p.name}" bijwerken mislukt (${res.status})`,
          );
        } else if (price !== undefined) {
          priced++;
        } else {
          hidden++;
        }
      }
      report.steps.push(`${priced} product(en) geprijsd, ${hidden} verborgen`);

      // 5. Kastjes koppelen
      for (const d of req.devices) {
        try {
          await setDeviceSector(d.uid, d.app, created.id, req.name);
          report.steps.push(`${d.terminal} gekoppeld aan "${req.name}"`);
        } catch (err) {
          report.errors.push(
            `${d.terminal} koppelen mislukt: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return reports;
}
