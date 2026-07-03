// Kern van de Prognose: trend-projectie over jaren, aankoop-assemblage
// (laadlijsten als basis + bestellingen aanvullend), verkoop-vs-aankoop
// sell-through, en week/maand/jaar-rollups.

import { normalizeName, normalizeLocation, nameSimilarity, yearOf } from './prognose-match';
import type {
  Bestelling,
  Bucket,
  CatalogusProduct,
  Confidence,
  EventForecast,
  ForecastMethod,
  Granularity,
  Laadlijst,
  ProductForecast,
  YearRecord,
  PlanningEvent,
} from './prognose-types';

// ── Trend-projectie ────────────────────────────────────────────────
interface TrendResult {
  forecast: number | null;
  band: number | null; // ± 1σ
  confidence: Confidence;
  method: ForecastMethod | 'fallback';
}

const RECENCY_BASE = 0.6;

export function trendProject(
  points: { year: number; value: number }[],
  targetYear: number,
  method: ForecastMethod = 'blend',
): TrendResult {
  const pts = [...points].sort((a, b) => a.year - b.year);
  const n = pts.length;
  if (n === 0) return { forecast: null, band: null, confidence: 'geen', method: 'fallback' };
  const latest = pts[n - 1];
  if (n === 1) {
    return { forecast: Math.max(0, latest.value), band: null, confidence: 'laag', method: 'fallback' };
  }

  // Recency-gewichten t.o.v. het meest recente jaar.
  const weights = pts.map((p) => Math.pow(RECENCY_BASE, latest.year - p.year));
  const sw = weights.reduce((a, b) => a + b, 0);
  const xbar = pts.reduce((a, p, i) => a + weights[i] * p.year, 0) / sw;
  const ybar = pts.reduce((a, p, i) => a + weights[i] * p.value, 0) / sw;

  // Gewogen OLS
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += weights[i] * (pts[i].year - xbar) ** 2;
    sxy += weights[i] * (pts[i].year - xbar) * (pts[i].value - ybar);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = ybar - slope * xbar;
  const ols = Math.max(0, intercept + slope * targetYear);

  // R² + residu-σ (gewogen)
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * pts[i].year;
    ssTot += weights[i] * (pts[i].value - ybar) ** 2;
    ssRes += weights[i] * (pts[i].value - pred) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const sigma = Math.sqrt(ssRes / sw);

  // CAGR tussen vroegste en laatste jaar
  const first = pts[0];
  const span = latest.year - first.year;
  let cagrForecast = latest.value;
  if (first.value > 0 && span > 0) {
    const cagr = Math.pow(latest.value / first.value, 1 / span) - 1;
    cagrForecast = Math.max(0, latest.value * Math.pow(1 + cagr, targetYear - latest.year));
  }

  const wavg = Math.max(0, ybar);

  let forecast: number;
  let chosen: ForecastMethod = method;
  if (method === 'ols') forecast = ols;
  else if (method === 'cagr') forecast = cagrForecast;
  else if (method === 'weighted-avg') forecast = wavg;
  else {
    // blend
    if (n >= 3) forecast = 0.7 * ols + 0.3 * cagrForecast;
    else forecast = 0.5 * wavg + 0.5 * cagrForecast;
    chosen = 'blend';
  }

  // Sanity-cap tegen wilde extrapolatie: nooit > 2,5× het laatste jaar
  // (tenzij CAGR dat zelf onderbouwt).
  const cap = Math.max(2.5 * latest.value, cagrForecast * 1.5, wavg * 2);
  forecast = Math.min(forecast, cap);

  let confidence: Confidence;
  if (n >= 3) confidence = r2 >= 0.7 ? 'goed' : r2 >= 0.4 ? 'matig' : 'laag';
  else confidence = 'matig';

  return { forecast: Math.max(0, forecast), band: sigma, confidence, method: chosen };
}

// ── Aankoop-assemblage per event ───────────────────────────────────
function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export interface PurchaseAggregate {
  byProduct: { productKey: string; name: string; qty: number }[];
  totalQty: number;
}

// Laadlijsten = per-event basis (sterke koppeling via eventId).
// Bestellingen = aanvullend: alleen producten die nog niet in een laadlijst
// staan, en enkel als datum binnen het venster valt én locatie/naam matcht.
export function buildPurchaseForEvent(
  ev: PlanningEvent,
  laadlijsten: Laadlijst[],
  bestellingen: Bestelling[],
  _catalogus: CatalogusProduct[],
): PurchaseAggregate {
  const map = new Map<string, { name: string; qty: number }>();

  const addItem = (rawName: string, qty: number) => {
    if (!rawName || !qty) return;
    const key = `naam:${normalizeName(rawName)}`;
    const cur = map.get(key);
    if (cur) cur.qty += qty;
    else map.set(key, { name: rawName, qty });
  };

  // 1. Laadlijsten: primair via eventId (== planning-id-veld), met fallback op
  //    naam + datumvenster (eventId kan ontbreken of niet resolveren).
  for (const ll of laadlijsten) {
    const linkedById = !!ll.eventId && ll.eventId === ev.id;
    const linkedByMeta =
      ll.datum != null &&
      ll.datum >= addDays(ev.startDate, -1) &&
      ll.datum <= addDays(ev.endDate, 1) &&
      ll.eventNaam != null &&
      nameSimilarity(ll.eventNaam, ev.name) >= 0.7;
    if (linkedById || linkedByMeta) {
      for (const it of ll.items) addItem(it.naam, it.aantal);
    }
  }
  const laadlijstKeys = new Set(map.keys());

  // 2. Bestellingen aanvullend (datum binnen venster + locatie/naam fuzzy)
  for (const b of bestellingen) {
    if (b.type && !/bestelling/i.test(b.type)) continue;
    if (!b.datum) continue;
    if (b.datum < addDays(ev.startDate, -2) || b.datum > addDays(ev.endDate, 2)) continue;
    const locSim = b.locatie
      ? normalizeLocation(b.locatie) === normalizeLocation(ev.location) ||
        nameSimilarity(b.locatie, ev.location) >= 0.7
      : false;
    const naamSim = b.kraam ? nameSimilarity(b.kraam, ev.name) >= 0.6 : false;
    if (!locSim && !naamSim) continue;
    for (const line of b.lines) {
      const key = `naam:${normalizeName(line.name)}`;
      if (laadlijstKeys.has(key)) continue; // laadlijst is authoritatief
      addItem(line.name, line.qty);
    }
  }

  const byProduct = Array.from(map.entries()).map(([productKey, v]) => ({
    productKey,
    name: v.name,
    qty: v.qty,
  }));
  const totalQty = byProduct.reduce((a, p) => a + p.qty, 0);
  return { byProduct, totalQty };
}

// ── Forecast per event-cluster ─────────────────────────────────────
export function forecastEvent(
  clusterKey: string,
  name: string,
  location: string,
  color: string | null,
  upcoming: PlanningEvent,
  history: YearRecord[],
  method: ForecastMethod,
): EventForecast {
  const notes: string[] = [];
  const targetYear = yearOf(upcoming.startDate);

  // Verkoop-totaal trend (alleen jaren met verkoopdata)
  const salesPoints = history
    .filter((h) => h.salesTotal != null)
    .map((h) => ({ year: h.year, value: h.salesTotal as number }));
  const salesTrend = trendProject(salesPoints, targetYear, method);

  // Aankoop-totaal trend (jaren met aankoopdata)
  const purchasePoints = history
    .filter((h) => h.purchaseTotalQty > 0)
    .map((h) => ({ year: h.year, value: h.purchaseTotalQty }));
  const purchaseTrend = trendProject(purchasePoints, targetYear, method);

  if (history.length === 0) notes.push('Geen historiek gevonden — geen prognose mogelijk.');
  else if (salesPoints.length === 1) notes.push('Slechts 1 jaar verkoopdata — prognose = vorig jaar (1:1).');
  if (salesPoints.length === 0 && history.length > 0)
    notes.push('Wel events in archief, maar geen gekoppelde verkoopdata gevonden.');

  // ── Per-product forecast (sales qty + purchase qty + sell-through) ──
  const histYears = history.map((h) => h.year).sort((a, b) => a - b);
  const latestYear = histYears.length ? histYears[histYears.length - 1] : targetYear;

  interface PAgg {
    name: string;
    salesByYear: Map<number, number>;
    purchByYear: Map<number, number>;
  }
  const products = new Map<string, PAgg>();
  const ensure = (key: string, name: string): PAgg => {
    let p = products.get(key);
    if (!p) {
      p = { name, salesByYear: new Map(), purchByYear: new Map() };
      products.set(key, p);
    }
    return p;
  };

  for (const h of history) {
    for (const sp of h.salesByProduct) {
      // Verenig op genormaliseerde naam zodat verkoop & aankoop joinen.
      const key = `naam:${normalizeName(sp.name)}`;
      const p = ensure(key, sp.name);
      p.salesByYear.set(h.year, (p.salesByYear.get(h.year) ?? 0) + (sp.qty ?? 0));
    }
    for (const pp of h.purchaseByProduct) {
      const key = pp.productKey.startsWith('naam:') ? pp.productKey : `naam:${normalizeName(pp.name)}`;
      const p = ensure(key, pp.name);
      p.purchByYear.set(h.year, (p.purchByYear.get(h.year) ?? 0) + pp.qty);
    }
  }

  const productForecasts: ProductForecast[] = [];
  for (const [key, p] of products) {
    const salesYears = Array.from(p.salesByYear.keys());
    const purchYears = Array.from(p.purchByYear.keys());
    const seenYears = new Set([...salesYears, ...purchYears]);
    const firstSeen = Math.min(...seenYears);
    const inLatest = seenYears.has(latestYear);

    let flag: ProductForecast['flag'] = null;
    if (firstSeen === latestYear && histYears.length > 1) flag = 'nieuw';
    else if (!inLatest && histYears.length > 1) flag = 'verdwenen';

    // Sales-qty forecast
    let salesQtyForecast: number | null = null;
    if (salesYears.length) {
      if (flag === 'nieuw') salesQtyForecast = p.salesByYear.get(latestYear) ?? 0;
      else if (flag === 'verdwenen') salesQtyForecast = 0;
      else {
        const pts = histYears
          .filter((y) => y >= firstSeen)
          .map((y) => ({ year: y, value: p.salesByYear.get(y) ?? 0 }));
        salesQtyForecast = trendProject(pts, targetYear, method).forecast;
      }
    }

    // Purchase-qty trend
    let purchaseQtyTrend: number | null = null;
    if (purchYears.length) {
      if (flag === 'verdwenen') purchaseQtyTrend = 0;
      else if (flag === 'nieuw') purchaseQtyTrend = p.purchByYear.get(latestYear) ?? 0;
      else {
        const pts = histYears
          .filter((y) => y >= firstSeen)
          .map((y) => ({ year: y, value: p.purchByYear.get(y) ?? 0 }));
        purchaseQtyTrend = trendProject(pts, targetYear, method).forecast;
      }
    }

    // Sell-through: gemiddelde (recency-gewogen) sales/purchase over jaren met beide.
    let sumW = 0;
    let sumWR = 0;
    for (const y of seenYears) {
      const s = p.salesByYear.get(y) ?? 0;
      const q = p.purchByYear.get(y) ?? 0;
      if (s > 0 && q > 0) {
        const w = Math.pow(RECENCY_BASE, latestYear - y);
        sumW += w;
        sumWR += w * (s / q);
      }
    }
    const sellThrough = sumW > 0 ? sumWR / sumW : null;
    let purchaseQtyAdvies: number | null = null;
    if (salesQtyForecast != null && sellThrough && sellThrough > 0) {
      purchaseQtyAdvies = salesQtyForecast / sellThrough;
      if (purchaseQtyTrend != null) purchaseQtyAdvies = Math.max(purchaseQtyAdvies, purchaseQtyTrend);
    }

    productForecasts.push({
      productKey: key,
      name: p.name,
      salesQtyForecast: salesQtyForecast != null ? round1(salesQtyForecast) : null,
      purchaseQtyTrend: purchaseQtyTrend != null ? round1(purchaseQtyTrend) : null,
      purchaseQtyAdvies: purchaseQtyAdvies != null ? round1(purchaseQtyAdvies) : null,
      flag,
    });
  }
  productForecasts.sort((a, b) => (b.salesQtyForecast ?? 0) - (a.salesQtyForecast ?? 0));

  let confidence = salesTrend.confidence;
  if (history.length === 0) confidence = 'geen';

  return {
    clusterKey,
    name,
    location,
    color,
    upcoming: { eventId: upcoming.id, startDate: upcoming.startDate, endDate: upcoming.endDate },
    history,
    salesForecast: salesTrend.forecast != null ? round2(salesTrend.forecast) : null,
    salesBand: salesTrend.band != null ? round2(salesTrend.band) : null,
    purchaseForecastQty: purchaseTrend.forecast != null ? round1(purchaseTrend.forecast) : null,
    confidence,
    method: salesTrend.method,
    products: productForecasts,
    notes,
  };
}

// ── Rollups week/maand/jaar ────────────────────────────────────────
function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out.length ? out : [start];
}

function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7; // Ma=0
  date.setUTCDate(date.getUTCDate() - day + 3); // donderdag van deze week
  const isoYear = date.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date.getTime() - firstThu.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function bucketKeysFor(dateStr: string, g: Granularity): { key: string; label: string } {
  if (g === 'year') return { key: dateStr.slice(0, 4), label: dateStr.slice(0, 4) };
  if (g === 'month') {
    const ym = dateStr.slice(0, 7);
    return { key: ym, label: ym };
  }
  const wk = isoWeekKey(dateStr);
  return { key: wk, label: wk };
}

function isoWeekParts(dateStr: string): { isoYear: number; week: number } {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const isoYear = date.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date.getTime() - firstThu.getTime()) / (7 * 86400000));
  return { isoYear, week };
}

// Fractie van een periode die nog komt vanaf `today` (1 voor volledig
// toekomstige periodes; kleiner voor de lopende periode).
function remainingFraction(today: string, days: string[]): number {
  const future = days.filter((d) => d >= today).length;
  return days.length ? future / days.length : 0;
}

// ── Verkoop-rollups uit dagtotalen (trend over jaren per zelfde periode) ──
export function buildSalesRollups(
  dailyByDate: Map<string, number>,
  today: string,
  horizonEnd: string,
  method: ForecastMethod,
): { week: Bucket[]; month: Bucket[]; year: Bucket[] } {
  // Aggregeer historische dagomzet naar per-jaar/maand en per-jaar/week.
  const byYearMonth = new Map<number, Map<number, number>>();
  const byYearWeek = new Map<number, Map<number, number>>();
  const add = (map: Map<number, Map<number, number>>, yr: number, idx: number, v: number) => {
    let inner = map.get(yr);
    if (!inner) map.set(yr, (inner = new Map()));
    inner.set(idx, (inner.get(idx) ?? 0) + v);
  };
  for (const [date, total] of dailyByDate) {
    const y = parseInt(date.slice(0, 4), 10);
    const m = parseInt(date.slice(5, 7), 10);
    add(byYearMonth, y, m, total);
    const { isoYear, week } = isoWeekParts(date);
    add(byYearWeek, isoYear, week, total);
  }

  const allDays = enumerateRange(today, horizonEnd);

  // group future days per bucketkey
  const groupBy = (g: Granularity) => {
    const groups = new Map<string, string[]>();
    for (const d of allDays) {
      const { key } = bucketKeysFor(d, g);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
    }
    return groups;
  };

  const monthForecast = (fy: number, m: number): TrendOut => {
    const pts: { year: number; value: number }[] = [];
    for (const [yr, inner] of byYearMonth) {
      if (yr < fy && inner.has(m)) pts.push({ year: yr, value: inner.get(m)! });
    }
    return projForBucket(pts, fy, method);
  };
  const weekForecast = (fyIso: number, w: number): TrendOut => {
    const pts: { year: number; value: number }[] = [];
    for (const [yr, inner] of byYearWeek) {
      if (yr < fyIso && inner.has(w)) pts.push({ year: yr, value: inner.get(w)! });
    }
    return projForBucket(pts, fyIso, method);
  };

  const monthBuckets: Bucket[] = [];
  for (const [key, days] of groupBy('month')) {
    const fy = parseInt(key.slice(0, 4), 10);
    const m = parseInt(key.slice(5, 7), 10);
    const { forecast, confidence } = monthForecast(fy, m);
    const frac = remainingFraction(today, days);
    monthBuckets.push({
      key,
      label: key,
      salesForecast: forecast != null ? round2(forecast * frac) : 0,
      purchaseForecastQty: 0,
      eventCount: 0,
      confidence: forecast != null ? confidence : 'geen',
    });
  }

  const weekBuckets: Bucket[] = [];
  for (const [key, days] of groupBy('week')) {
    const fyIso = parseInt(key.slice(0, 4), 10);
    const w = parseInt(key.slice(6), 10);
    const { forecast, confidence } = weekForecast(fyIso, w);
    const frac = remainingFraction(today, days);
    weekBuckets.push({
      key,
      label: key,
      salesForecast: forecast != null ? round2(forecast * frac) : 0,
      purchaseForecastQty: 0,
      eventCount: 0,
      confidence: forecast != null ? confidence : 'geen',
    });
  }

  // Jaar = som van de maandprognoses binnen dat jaar.
  const yearMap = new Map<string, { sales: number; conf: Confidence }>();
  for (const b of monthBuckets) {
    const yk = b.key.slice(0, 4);
    const cur = yearMap.get(yk) ?? { sales: 0, conf: b.confidence };
    cur.sales += b.salesForecast;
    if (CONF_RANK[b.confidence] < CONF_RANK[cur.conf]) cur.conf = b.confidence;
    yearMap.set(yk, cur);
  }
  const yearBuckets: Bucket[] = Array.from(yearMap.entries()).map(([key, v]) => ({
    key,
    label: key,
    salesForecast: round2(v.sales),
    purchaseForecastQty: 0,
    eventCount: 0,
    confidence: v.conf,
  }));

  const sort = (a: Bucket, b: Bucket) => a.key.localeCompare(b.key);
  return {
    week: weekBuckets.sort(sort),
    month: monthBuckets.sort(sort),
    year: yearBuckets.sort(sort),
  };
}

interface TrendOut {
  forecast: number | null;
  confidence: Confidence;
}
function projForBucket(
  pts: { year: number; value: number }[],
  targetYear: number,
  method: ForecastMethod,
): TrendOut {
  const t = trendProject(pts, targetYear, method);
  return { forecast: t.forecast, confidence: t.confidence };
}

function enumerateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 1200) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

// Reeds ingeplande aankoop (stuks) uit laadlijsten, gebucket per periode.
// Aankoophistoriek is (nog) te kort voor een meerjarige trend, dus dit toont
// wat er feitelijk al gepland staat — geen voorspelling.
export function addKnownPurchaseToRollups(
  rollups: { week: Bucket[]; month: Bucket[]; year: Bucket[] },
  laadlijsten: Laadlijst[],
): void {
  const addTo = (buckets: Bucket[], g: Granularity) => {
    const idx = new Map(buckets.map((b) => [b.key, b]));
    for (const ll of laadlijsten) {
      if (!ll.datum) continue;
      const qty = ll.items.reduce((a, it) => a + it.aantal, 0);
      if (!qty) continue;
      const { key } = bucketKeysFor(ll.datum, g);
      const b = idx.get(key);
      if (b) b.purchaseForecastQty = round1(b.purchaseForecastQty + qty);
    }
  };
  addTo(rollups.week, 'week');
  addTo(rollups.month, 'month');
  addTo(rollups.year, 'year');
}

const CONF_RANK: Record<Confidence, number> = { geen: 0, laag: 1, matig: 2, goed: 3 };

export function rollupBuckets(events: EventForecast[]): {
  week: Bucket[];
  month: Bucket[];
  year: Bucket[];
} {
  const make = (g: Granularity): Bucket[] => {
    const buckets = new Map<string, Bucket & { _confSum: number; _confN: number }>();
    for (const ev of events) {
      const days = enumerateDays(ev.upcoming.startDate, ev.upcoming.endDate);
      const nDays = days.length;
      const salesPer = (ev.salesForecast ?? 0) / nDays;
      const purchPer = (ev.purchaseForecastQty ?? 0) / nDays;
      const counted = new Set<string>();
      for (const day of days) {
        const { key, label } = bucketKeysFor(day, g);
        let b = buckets.get(key);
        if (!b) {
          b = {
            key,
            label,
            salesForecast: 0,
            purchaseForecastQty: 0,
            eventCount: 0,
            confidence: 'geen',
            _confSum: 0,
            _confN: 0,
          };
          buckets.set(key, b);
        }
        b.salesForecast += salesPer;
        b.purchaseForecastQty += purchPer;
        if (!counted.has(key)) {
          counted.add(key);
          b.eventCount += 1;
          b._confSum += CONF_RANK[ev.confidence];
          b._confN += 1;
        }
      }
    }
    const ranks: Confidence[] = ['geen', 'laag', 'matig', 'goed'];
    return Array.from(buckets.values())
      .map((b) => {
        const avg = b._confN ? Math.round(b._confSum / b._confN) : 0;
        return {
          key: b.key,
          label: b.label,
          salesForecast: round2(b.salesForecast),
          purchaseForecastQty: round1(b.purchaseForecastQty),
          eventCount: b.eventCount,
          confidence: ranks[Math.min(3, Math.max(0, avg))],
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  };
  return { week: make('week'), month: make('month'), year: make('year') };
}

// ── Afrondhelpers ──────────────────────────────────────────────────
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
