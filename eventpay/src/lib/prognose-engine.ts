// Orchestratie: brengt RTDB (events + aankoop) en EventPay (verkoop) samen tot
// een event-lijst en een volledige forecast. Wordt aangeroepen vanuit de
// /api/prognose routes (server).
//
// Aanpak (zie ook het plan):
//   • AGGREGAAT (week/maand/jaar): top-down dagomzet uit voorgaande jaren →
//     trend per zelfde periode. Robuust en goedkoop (~4 /sales-calls), hangt
//     niet af van sector-toewijzing. Lost meteen hoogfrequente stands (POSTEL)
//     op die anders honderden per-event calls zouden vergen.
//   • PER EVENT: voor discrete terugkerende events isoleren we de omzet per
//     sector (begrensd aantal events) en tonen we jaar-op-jaar + prognose.
//   • AANKOOP: laadlijst-historiek is (nog) te kort voor een meerjarige trend,
//     dus tonen we de reeds ingeplande aankoop per periode + per-event lijsten.

import {
  getPlanningEvents,
  getArchiefEvents,
  getLaadlijsten,
  getBestellingen,
  getCatalogus,
} from './prognose-rtdb';
import { buildEventClusters, matchSectorToName, yearOf, type EventCluster } from './prognose-match';
import { fetchSalesForRange, fetchDailyTotals } from './prognose-sales';
import {
  buildPurchaseForEvent,
  forecastEvent,
  buildSalesRollups,
  addKnownPurchaseToRollups,
} from './prognose-forecast';
import type {
  EventForecast,
  EventListItem,
  ForecastMethod,
  ForecastResponse,
  PlanningEvent,
  YearRecord,
} from './prognose-types';

const MAX_SALES_CALLS = 250; // veiligheidsplafond op per-event /sales-verzoeken
const HISTORY_YEARS = 3; // hoeveel jaren terug we dagomzet ophalen
const MAX_PER_EVENT = 60; // max discrete events met per-sector detail
const HIGH_FREQ_PER_YEAR = 12; // > maandelijks ⇒ hoogfrequent (geen per-event)

function todayStr(now: Date): string {
  return now.toISOString().slice(0, 10);
}
function horizonEndStr(now: Date, months: number): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function distinctYears(c: EventCluster): number {
  return new Set(c.occurrences.map((o) => yearOf(o.startDate))).size;
}
function upcomingOf(c: EventCluster, today: string, horizonEnd: string): PlanningEvent | null {
  const f = c.occurrences
    .filter((o) => o.source === 'planning' && o.startDate >= today && o.startDate <= horizonEnd)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return f[0] ?? null;
}
function historyOf(c: EventCluster, today: string): PlanningEvent[] {
  return c.occurrences
    .filter((o) => o.startDate < today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Lichte event-lijst (GET) ───────────────────────────────────────
export async function buildEventList(horizonMonths: number): Promise<{
  events: EventListItem[];
  warnings: string[];
}> {
  const now = new Date();
  const today = todayStr(now);
  const horizonEnd = horizonEndStr(now, horizonMonths);

  const [planning, archief] = await Promise.all([getPlanningEvents(), getArchiefEvents()]);
  const clusters = buildEventClusters([...planning, ...archief]);

  const events: EventListItem[] = [];
  for (const c of clusters) {
    const upcoming = upcomingOf(c, today, horizonEnd);
    if (!upcoming) continue;
    const history = historyOf(c, today);
    events.push({
      clusterKey: c.key,
      upcomingEventId: upcoming.id,
      name: upcoming.name || c.name,
      location: upcoming.location || c.location,
      color: upcoming.color ?? c.color,
      startDate: upcoming.startDate,
      endDate: upcoming.endDate,
      historyYears: Array.from(new Set(history.map((h) => yearOf(h.startDate)))).sort(),
    });
  }
  events.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return { events, warnings: [] };
}

// ── Volledige forecast (POST) ──────────────────────────────────────
export async function runForecast(opts: {
  horizonMonths: number;
  method: ForecastMethod;
  eventIds?: string[];
}): Promise<ForecastResponse> {
  const now = new Date();
  const today = todayStr(now);
  const curYear = now.getFullYear();
  const horizonEnd = horizonEndStr(now, opts.horizonMonths);
  const warnings: string[] = [];

  const [planning, archief, laadlijsten, bestellingen, catalogus] = await Promise.all([
    getPlanningEvents(),
    getArchiefEvents(),
    getLaadlijsten(),
    getBestellingen(),
    getCatalogus(),
  ]);

  // 1. AGGREGAAT — dagomzet per jaar ophalen (curYear-HISTORY_YEARS .. curYear).
  const dailyByDate = new Map<string, number>();
  let dailyOk = 0;
  for (let y = curYear - HISTORY_YEARS; y <= curYear; y++) {
    const start = `${y}-01-01`;
    const end = y < curYear ? `${y}-12-31` : today;
    try {
      const m = await fetchDailyTotals(start, end);
      for (const [d, v] of m) dailyByDate.set(d, (dailyByDate.get(d) ?? 0) + v);
      dailyOk++;
    } catch (e) {
      warnings.push(
        `Dagomzet ${y} ophalen mislukt: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  if (dailyOk === 0) {
    warnings.push(
      'Geen verkoopdata beschikbaar (EventPay onbereikbaar of geen key). Prognose toont enkel geplande aankoop.',
    );
  }

  const rollups = buildSalesRollups(dailyByDate, today, horizonEnd, opts.method);
  addKnownPurchaseToRollups(rollups, laadlijsten);

  const laadYears = new Set(laadlijsten.map((l) => (l.datum ? l.datum.slice(0, 4) : '')).filter(Boolean));
  if (laadYears.size <= 1) {
    warnings.push(
      'Aankoophistoriek beslaat slechts één jaar — aankoopcijfers tonen geplande hoeveelheden, geen meerjarige trend.',
    );
  }

  // 2. PER EVENT — discrete terugkerende events met sector-isolatie.
  const clusters = buildEventClusters([...planning, ...archief]);
  const eventIdFilter = opts.eventIds && opts.eventIds.length ? new Set(opts.eventIds) : null;

  const scoped: { cluster: EventCluster; upcoming: PlanningEvent; history: PlanningEvent[] }[] = [];
  for (const c of clusters) {
    const upcoming = upcomingOf(c, today, horizonEnd);
    if (!upcoming) continue;
    if (eventIdFilter && !eventIdFilter.has(upcoming.id)) continue;
    const history = historyOf(c, today);
    const perYear = c.occurrences.length / Math.max(1, distinctYears(c));
    if (perYear > HIGH_FREQ_PER_YEAR) continue; // hoogfrequent → enkel in aggregaat
    if (history.length === 0) continue; // geen vergelijking mogelijk
    scoped.push({ cluster: c, upcoming, history });
  }
  // Prioriteer events met de meeste historiek (meest betrouwbare prognose).
  scoped.sort((a, b) => b.history.length - a.history.length);
  if (scoped.length > MAX_PER_EVENT) {
    warnings.push(
      `${scoped.length} discrete events met historiek; alleen de top ${MAX_PER_EVENT} krijgen per-event detail.`,
    );
    scoped.length = MAX_PER_EVENT;
  }

  const salesCache = new Map<string, Awaited<ReturnType<typeof fetchSalesForRange>>>();
  let salesCalls = 0;
  const getSales = async (start: string, end: string) => {
    const ck = `${start}|${end}`;
    const hit = salesCache.get(ck);
    if (hit) return hit;
    if (salesCalls >= MAX_SALES_CALLS) return { sectors: [], days: [] };
    salesCalls++;
    try {
      const res = await fetchSalesForRange(start, end);
      salesCache.set(ck, res);
      return res;
    } catch {
      const empty = { sectors: [], days: [] };
      salesCache.set(ck, empty);
      return empty;
    }
  };

  const forecasts: EventForecast[] = [];
  for (const { cluster, upcoming, history } of scoped) {
    const yearRecords: YearRecord[] = [];
    for (const occ of history) {
      const { sectors } = await getSales(occ.startDate, occ.endDate);
      const matched = matchSectorToName(
        occ.name || cluster.name,
        sectors.map((s) => ({ sectorId: s.sectorId, sectorName: s.sectorName ?? '' })),
      );
      let salesTotal: number | null = null;
      let salesByProduct: YearRecord['salesByProduct'] = [];
      let sectorId: number | null = null;
      let sectorName: string | null = null;
      if (matched) {
        const row = sectors.find(
          (s) =>
            (matched.sectorId != null && s.sectorId === matched.sectorId) ||
            s.sectorName === matched.sectorName,
        );
        if (row) {
          salesTotal = row.total;
          salesByProduct = row.products;
          sectorId = row.sectorId;
          sectorName = row.sectorName;
        }
      }
      const purchase = buildPurchaseForEvent(occ, laadlijsten, bestellingen, catalogus);
      yearRecords.push({
        year: yearOf(occ.startDate),
        startDate: occ.startDate,
        endDate: occ.endDate,
        eventId: occ.id,
        salesTotal,
        salesByProduct,
        salesByDay: [],
        purchaseByProduct: purchase.byProduct,
        purchaseTotalQty: purchase.totalQty,
        sectorId,
        sectorName,
      });
    }

    forecasts.push(
      forecastEvent(
        cluster.key,
        upcoming.name || cluster.name,
        upcoming.location || cluster.location,
        upcoming.color ?? cluster.color,
        upcoming,
        yearRecords,
        opts.method,
      ),
    );
  }

  if (salesCalls >= MAX_SALES_CALLS) {
    warnings.push(`Plafond van ${MAX_SALES_CALLS} per-event verkoop-verzoeken bereikt.`);
  }

  forecasts.sort((a, b) => a.upcoming.startDate.localeCompare(b.upcoming.startDate));
  return {
    generatedFor: { horizonMonths: opts.horizonMonths, method: opts.method },
    events: forecasts,
    rollups,
    warnings,
  };
}
