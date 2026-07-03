// Gedeelde types voor de Prognose-feature.
//
// We brengen drie bronnen samen:
//   • Events/agenda    — RTDB ft_planning_v1 + ft_planning_outlook_archief
//   • Verkoop          — EventPay /sales (per sector + datum)
//   • Aankoop          — RTDB ft_laadlijsten_v1 (per event) + ft_bestellingen_v1
//
// Per terugkerend event ("cluster") bouwen we een jaar-tijdreeks en projecteren
// we een trend naar de komende occurrence. Rollups per week/maand/jaar.

export type Granularity = 'week' | 'month' | 'year';
export type ForecastMethod = 'ols' | 'cagr' | 'weighted-avg' | 'blend';
export type Confidence = 'geen' | 'laag' | 'matig' | 'goed';

// ── Genormaliseerd event (uit RTDB planning of archief) ────────────
export interface PlanningEvent {
  id: string; // RTDB key/id
  source: 'planning' | 'archief';
  name: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (== startDate als 1 dag)
  color: string | null; // Outlook hex
  trucks: string[];
}

// ── Aankoopbronnen (RTDB) ──────────────────────────────────────────
export interface Laadlijst {
  key: string;
  eventId: string | null;
  eventNaam: string | null;
  datum: string | null; // YYYY-MM-DD
  wagen: string | null;
  // product → aantal (gesommeerd over alle categorieën)
  items: { naam: string; aantal: number; categorie: string }[];
}

export interface Bestelling {
  key: string;
  datum: string | null; // YYYY-MM-DD
  locatie: string | null;
  kraam: string | null;
  type: string | null; // "Bestelling" | "Telling" | "Stocklijst"
  lines: { name: string; art: string | null; qty: number }[];
}

export interface CatalogusProduct {
  key: string;
  name: string;
  art: string | null;
  perDoos: number | null;
  cat: string | null;
}

// ── Verkoop (uit EventPay /sales) ──────────────────────────────────
export interface SalesPerProduct {
  productKey: string; // product_id als string, anders genormaliseerde naam
  name: string;
  total: number; // omzet €
  qty: number | null; // aantal verkocht (indien beschikbaar)
}

export interface SalesPerDay {
  date: string; // YYYY-MM-DD
  total: number;
}

export interface SalesForRange {
  sectorId: number | null;
  sectorName: string | null;
  total: number; // omzet € voor het gematchte sector(en) in deze periode
  products: SalesPerProduct[];
  days: SalesPerDay[];
}

// ── Per-jaar historiekrecord van één event-cluster ─────────────────
export interface YearRecord {
  year: number;
  startDate: string;
  endDate: string;
  eventId: string;
  salesTotal: number | null; // null = geen verkoopdata gevonden
  salesByProduct: SalesPerProduct[];
  salesByDay: SalesPerDay[];
  purchaseByProduct: { productKey: string; name: string; qty: number }[];
  purchaseTotalQty: number;
  sectorId: number | null;
  sectorName: string | null;
}

// ── Forecast-resultaat per event-cluster ───────────────────────────
export interface ProductForecast {
  productKey: string;
  name: string;
  salesQtyForecast: number | null;
  purchaseQtyTrend: number | null; // trend op historische aankoop
  purchaseQtyAdvies: number | null; // verkoop-afgeleide behoefte
  flag: 'nieuw' | 'verdwenen' | null;
}

export interface EventForecast {
  clusterKey: string;
  name: string;
  location: string;
  color: string | null;
  upcoming: {
    eventId: string;
    startDate: string;
    endDate: string;
  };
  history: YearRecord[];
  salesForecast: number | null;
  salesBand: number | null; // ± 1σ
  purchaseForecastQty: number | null;
  confidence: Confidence;
  method: ForecastMethod | 'fallback';
  products: ProductForecast[];
  notes: string[]; // bv. "geen historiek", "1 jaar → 1:1"
}

// ── Week/maand/jaar-bucket ─────────────────────────────────────────
export interface Bucket {
  key: string; // YYYY / YYYY-MM / YYYY-Www
  label: string;
  salesForecast: number;
  purchaseForecastQty: number;
  eventCount: number;
  confidence: Confidence;
}

export interface ForecastResponse {
  generatedFor: { horizonMonths: number; method: ForecastMethod };
  events: EventForecast[];
  rollups: {
    week: Bucket[];
    month: Bucket[];
    year: Bucket[];
  };
  warnings: string[];
}

// ── Lichte event-lijst (GET /api/prognose/events) ──────────────────
export interface EventListItem {
  clusterKey: string;
  upcomingEventId: string;
  name: string;
  location: string;
  color: string | null;
  startDate: string;
  endDate: string;
  historyYears: number[]; // jaren waarvoor we een occurrence in archief/planning vonden
}
