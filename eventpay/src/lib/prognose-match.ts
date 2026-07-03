// Events over meerdere jaren clusteren ("hetzelfde event vorig jaar") en
// EventPay-sectornamen matchen aan planning-events.
//
// Een cluster = alle occurrences (over jaren) van hetzelfde terugkerende event.
// Matching: exacte clusterKey (genormaliseerde naam + locatie + kleurbucket),
// met een fuzzy fallback voor hernoemingen/typo's binnen hetzelfde seizoen.

import type { PlanningEvent } from './prognose-types';

// ── Tekstnormalisatie ──────────────────────────────────────────────
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

const NOISE_WORDS = new Set([
  'feest',
  'festival',
  'editie',
  'the',
  'de',
  'het',
  'een',
  'van',
  'te',
]);

export function normalizeName(name: string): string {
  let s = stripDiacritics(String(name || '').toLowerCase());
  s = s.replace(/\b(19|20)\d{2}\b/g, ' '); // jaartal
  s = s.replace(/\b(editie|edition|nr|no|#)\s*\d+\b/g, ' '); // editie N / #N
  s = s.replace(/#\d+/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s.replace(/\s+/g, ' ');
}

export function nameTokens(name: string): string[] {
  // Filter ruis: enkel-cijfer tokens (aantallen, telefoonnummers) en losse
  // letters dragen niets bij aan event-identiteit en vertroebelen de matching.
  return normalizeName(name)
    .split(' ')
    .filter((t) => t && t.length > 1 && !/^\d+$/.test(t) && !NOISE_WORDS.has(t));
}

export function normalizeLocation(loc: string): string {
  return stripDiacritics(String(loc || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Outlook-hex → semantisch label (zacht signaal). Onbekend → 'overig'.
const COLOR_BUCKETS: Record<string, string> = {
  '#C19C00': 'feesten',
  '#CA5010': 'friet',
  '#498205': 'verhuur',
  '#0078D4': 'sport',
  '#038387': 'langverhuur',
  '#750B1C': 'postel',
  '#69797E': 'intern',
  '#C50F1F': 'waarschuwing',
};

export function colorBucket(color: string | null): string {
  if (!color) return 'overig';
  return COLOR_BUCKETS[color.toUpperCase()] ?? 'overig';
}

// Harde clustersleutel = genormaliseerde naam. Locatie (vaak leeg) en kleur
// (jaar-op-jaar inconsistent) zijn te onbetrouwbaar als harde sleutel; ze
// dienen enkel als zachte signalen in de fuzzy-merge.
export function clusterKeyOf(ev: PlanningEvent): string {
  return normalizeName(ev.name);
}

// ── Datum/seizoen ──────────────────────────────────────────────────
export function dayOfYear(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, 0, 1));
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
}

// Circulaire afstand in dagen (0..182)
export function circularDayDiff(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 365 - raw);
}

export function yearOf(dateStr: string): number {
  return parseInt(dateStr.slice(0, 4), 10);
}

// ── Gelijkenis ─────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length];
}

function levRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Naam-gelijkenis = max(token-set Jaccard, Levenshtein-ratio op genormaliseerde naam)
export function nameSimilarity(a: string, b: string): number {
  const j = jaccard(nameTokens(a), nameTokens(b));
  const l = levRatio(normalizeName(a), normalizeName(b));
  return Math.max(j, l);
}

// ── Clusters bouwen ────────────────────────────────────────────────
export interface EventCluster {
  key: string;
  name: string; // representatieve (meest recente) naam
  location: string;
  color: string | null;
  occurrences: PlanningEvent[]; // gesorteerd op startDate oplopend
  medianDoy: number;
}

function medianDoy(occ: PlanningEvent[]): number {
  const doys = occ.map((o) => dayOfYear(o.startDate)).sort((x, y) => x - y);
  const mid = Math.floor(doys.length / 2);
  return doys.length % 2 ? doys[mid] : Math.round((doys[mid - 1] + doys[mid]) / 2);
}

function finalizeCluster(key: string, occ: PlanningEvent[]): EventCluster {
  const sorted = [...occ].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const rep = sorted[sorted.length - 1]; // meest recente als representatief
  return {
    key,
    name: rep.name,
    location: rep.location,
    color: rep.color,
    occurrences: sorted,
    medianDoy: medianDoy(sorted),
  };
}

const SEASON_TOLERANCE_DAYS = 21;
const FUZZY_MERGE_THRESHOLD = 0.75;

// Voegt twee clusters samen als ze waarschijnlijk hetzelfde terugkerende event
// zijn (naam-gelijkenis + seizoensnabijheid + locatie/kleur).
function clusterMatchScore(a: EventCluster, b: EventCluster): number {
  const nameSim = nameSimilarity(a.name, b.name);
  const season = circularDayDiff(a.medianDoy, b.medianDoy);
  if (season > SEASON_TOLERANCE_DAYS) return 0;
  const sameLoc = normalizeLocation(a.location) === normalizeLocation(b.location);
  if (!sameLoc && nameSim < 0.92) return 0;
  if (nameSim < 0.82 && levRatio(normalizeName(a.name), normalizeName(b.name)) < 0.85)
    return 0;
  const seasonScore = 1 - season / SEASON_TOLERANCE_DAYS;
  const colorScore = colorBucket(a.color) === colorBucket(b.color) ? 1 : 0;
  return 0.6 * nameSim + 0.25 * seasonScore + 0.15 * colorScore;
}

function distinctYears(c: EventCluster): number {
  return new Set(c.occurrences.map((o) => yearOf(o.startDate))).size;
}

export function buildEventClusters(events: PlanningEvent[]): EventCluster[] {
  // 1. Exacte naam-groepering (vangt terugkerende events met identieke naam,
  //    bv. "ROMMELMARKT WORTEL" over meerdere jaren).
  const byKey = new Map<string, PlanningEvent[]>();
  for (const ev of events) {
    if (!ev.name.trim()) continue; // naamloos event kan niet matchen
    const k = clusterKeyOf(ev);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push(ev);
    byKey.set(k, list);
  }
  const clusters = Array.from(byKey.entries()).map(([k, occ]) => finalizeCluster(k, occ));

  // 2. Snelle fuzzy-merge: alleen singletons (1 occurrence) proberen we te
  //    laten opgaan in een terugkerend cluster (≥2 occurrences). Dat vangt
  //    hernoemingen/typo's zonder de O(n²) all-pairs kost op ~1900 events.
  const recurring = clusters.filter((c) => c.occurrences.length >= 2);
  const singles = clusters.filter((c) => c.occurrences.length < 2);
  const leftover: EventCluster[] = [];
  for (const s of singles) {
    let best: EventCluster | null = null;
    let bestScore = FUZZY_MERGE_THRESHOLD;
    for (const r of recurring) {
      const score = clusterMatchScore(s, r);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best) best.occurrences.push(...s.occurrences);
    else leftover.push(s);
  }
  const finalRecurring = recurring.map((r) => finalizeCluster(r.key, r.occurrences));
  void distinctYears; // beschikbaar voor toekomstige verfijning
  return [...finalRecurring, ...leftover];
}

// ── Sector ↔ event ─────────────────────────────────────────────────
// Strip "[ID: 123]"-suffix zoals de admin-UI doet (koppeling/page.tsx).
export function displaySectorName(name: string): string {
  return String(name || '').replace(/\s*\[ID:\s*-?\d+\]\s*$/, '');
}

export interface SectorCandidate {
  sectorId: number | null;
  sectorName: string;
}

// Beste sector-match voor een event-naam. Drempel 0.6; null = geen match.
export function matchSectorToName(
  eventName: string,
  candidates: SectorCandidate[],
): SectorCandidate | null {
  let best: SectorCandidate | null = null;
  let bestSim = 0.6;
  for (const c of candidates) {
    const sim = nameSimilarity(eventName, displaySectorName(c.sectorName));
    if (sim > bestSim) {
      bestSim = sim;
      best = c;
    }
  }
  return best;
}
