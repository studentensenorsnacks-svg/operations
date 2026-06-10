/**
 * build-truck-data.js — generator + verificatie voor de centrale truckenlijst.
 *
 * Leest de HUIDIGE truck-lijsten rechtstreeks uit de bronbestanden (de echte
 * waarheid), bouwt er één canonieke lijst van, en BEWIJST dat de afgeleide
 * views exact gelijk zijn aan wat er nu hardcoded staat. Zo kan er bij het
 * centraliseren geen enkele truck stilletjes wegvallen of verspringen.
 *
 *   node tools/build-truck-data.js          → rapport + schrijft truck-data.js
 *   node tools/build-truck-data.js --check  → enkel verifiëren, niets schrijven
 *
 * De camionetten/terminals uit planning.html blijven bewust buiten beschouwing;
 * die staan nergens anders en zijn geen duplicatie.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── Eén JS-array-literal uit een bestand plukken via bracket-matching ──
function extractArray(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error('marker niet gevonden: ' + marker);
  const start = src.indexOf('[', at);
  if (start === -1) throw new Error('geen [ na marker: ' + marker);
  let depth = 0, inStr = false, q = '', i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === q) inStr = false;
    } else if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; }
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = src.slice(start, i);
  // De literals zijn vertrouwde projectbestanden; Array.from(...) komt voor in
  // de (genegeerde) terminal-data maar niet in wat wij hier inlezen.
  // eslint-disable-next-line no-new-func
  return Function('"use strict";return (' + literal + ');')();
}

// ── Bronnen inlezen ───────────────────────────────────────────────────
const IDATA        = extractArray(read('keuringen.html'), 'var IDATA=');
const OCB_TRUCKS   = extractArray(read('ocb.html'), 'const TRUCKS');
const CHECKIN      = extractArray(read('checkin.html'), 'const TRUCK_GROUPS');
const PLAN_WAGENS  = extractArray(read('planning.html'), 'const GROUPS_WAGENS');
const POETS_HTML   = extractArray(read('poets.html'), 'ALL_TRUCKS');
const POETS_EXTERN = extractArray(read('poets-extern.html'), 'ALL_TRUCKS');
const POETS_FUNC   = extractArray(read('functions/index.js'), 'POETS_TRUCKS');

// ── Label → canonieke categorie-sleutel ───────────────────────────────
const CAT_BY_LABEL = {
  '🍟 Frituurwagens': 'frituur',
  '🍔 Hamburgerwagens': 'hamburger',
  '🍔 Hamburger': 'hamburger',
  '🍕 Pizza & Pasta': 'pizza_pasta',
  '🍦 Sweet & Ijs': 'sweet_ijs',
  '🍺 Tap & Dranken': 'tap',
  '🚛 Rijdend': 'rijdend',
  '📦 Containers & Support': 'support',
  '📦 Support': 'support',
};
function nameToCat(groups) {
  const m = new Map();
  for (const g of groups) {
    const cat = CAT_BY_LABEL[g.label];
    if (!cat) throw new Error('onbekend group-label: ' + g.label);
    for (const name of g.trucks) m.set(name, cat);
  }
  return m;
}
const checkinCat  = nameToCat(CHECKIN);
const planningCat = nameToCat(PLAN_WAGENS);
const poetsSet    = new Set(POETS_HTML);

// ── Canonieke lijst opbouwen vanuit de keuringen-vloot (rijkst) ────────
const ocbByName = new Map(OCB_TRUCKS.map((t) => [t.name, t]));
const TRUCKS = IDATA.map((t) => {
  const cat = checkinCat.get(t.name) || planningCat.get(t.name) || 'support';
  const ocb = ocbByName.get(t.name);
  return {
    id: t.id,
    name: t.name,
    plate: t.plate || '',
    type: t.type,
    category: cat,
    inCheckin: checkinCat.has(t.name),
    poets: poetsSet.has(t.name),
    // keuring-VEREIST (uit ocb.html); keuring-STATUS/datums blijven in keuringen.html / RTDB
    keuringElek: ocb ? !!ocb.elek : !!(t.elek && t.elek.present),
    keuringGas: ocb ? !!ocb.gas : !!(t.gas && t.gas.present),
  };
});

// ── Reconciliatie-rapport ─────────────────────────────────────────────
const fleetNames = new Set(IDATA.map((t) => t.name));
const report = {
  fleet: IDATA.length,
  checkinNotInFleet: [...checkinCat.keys()].filter((n) => !fleetNames.has(n)),
  planningNotInFleet: [...planningCat.keys()].filter((n) => !fleetNames.has(n)),
  poetsNotInFleet: POETS_HTML.filter((n) => !fleetNames.has(n)),
  fleetNotInCheckin: IDATA.map((t) => t.name).filter((n) => !checkinCat.has(n)),
  categoryConflicts: IDATA.map((t) => t.name)
    .filter((n) => checkinCat.has(n) && planningCat.has(n) && checkinCat.get(n) !== planningCat.get(n))
    .map((n) => ({ name: n, checkin: checkinCat.get(n), planning: planningCat.get(n) })),
  poetsHtmlVsExtern: symmetricDiff(POETS_HTML, POETS_EXTERN),
  poetsHtmlVsFunc: symmetricDiff(POETS_HTML, POETS_FUNC),
};

function symmetricDiff(a, b) {
  const A = new Set(a), B = new Set(b);
  return {
    onlyFirst: [...A].filter((x) => !B.has(x)),
    onlySecond: [...B].filter((x) => !A.has(x)),
  };
}
function eqSet(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

// ── Verificatie: afgeleide views == originelen (als verzamelingen) ─────
const derivedPoets = TRUCKS.filter((t) => t.poets).map((t) => t.name);
const checks = [
  ['poets ALL_TRUCKS (poets.html)', eqSet(derivedPoets, POETS_HTML)],
  ['poets ALL_TRUCKS (poets-extern.html)', eqSet(derivedPoets, POETS_EXTERN)],
  ['POETS_TRUCKS (functions)', eqSet(derivedPoets, POETS_FUNC)],
];
for (const g of CHECKIN) {
  const cat = CAT_BY_LABEL[g.label];
  const derived = TRUCKS.filter((t) => t.inCheckin && t.category === cat).map((t) => t.name);
  checks.push(['checkin-groep ' + g.label, eqSet(derived, g.trucks)]);
}

// ── Output ────────────────────────────────────────────────────────────
console.log('\n=== RECONCILIATIE-RAPPORT ===');
console.log('Vloot (keuringen IDATA):', report.fleet, 'trucks');
const flag = (label, arr) => console.log((arr.length ? '⚠️  ' : '✓  ') + label + ':', arr.length ? JSON.stringify(arr) : 'geen');
flag('namen in check-in maar niet in vloot', report.checkinNotInFleet);
flag('namen in planning maar niet in vloot', report.planningNotInFleet);
flag('namen in poets maar niet in vloot', report.poetsNotInFleet);
flag('vloot-trucks die NIET in check-in staan', report.fleetNotInCheckin);
flag('poets.html vs poets-extern.html (alleen 1e)', report.poetsHtmlVsExtern.onlyFirst);
flag('poets.html vs poets-extern.html (alleen 2e)', report.poetsHtmlVsExtern.onlySecond);
flag('poets.html vs functions (alleen 1e)', report.poetsHtmlVsFunc.onlyFirst);
flag('poets.html vs functions (alleen 2e)', report.poetsHtmlVsFunc.onlySecond);
if (report.categoryConflicts.length) {
  console.log('⚠️  categorie-conflicten check-in vs planning:');
  for (const c of report.categoryConflicts) console.log('     -', c.name, '→ checkin:', c.checkin, '| planning:', c.planning);
} else {
  console.log('✓  geen categorie-conflicten check-in vs planning');
}

console.log('\n=== VERIFICATIE (afgeleid == origineel) ===');
let allPass = true;
for (const [label, pass] of checks) { console.log((pass ? '✓ ' : '✗ ') + label); if (!pass) allPass = false; }
console.log(allPass ? '\n✅ ALLE afgeleide lijsten matchen de huidige.' : '\n❌ Er zijn verschillen — NIET wegschrijven tot opgelost.');

const wantWrite = !process.argv.includes('--check');
if (wantWrite) {
  const out = renderModule(TRUCKS);
  fs.writeFileSync(path.join(ROOT, 'truck-data.js'), out);
  fs.writeFileSync(path.join(ROOT, 'functions', 'truck-data.js'), out);
  console.log('\n📝 truck-data.js geschreven naar webroot + functions/ (' + TRUCKS.length + ' trucks).');
}

function renderModule(trucks) {
  const lines = trucks.map((t) => '  ' + JSON.stringify(t) + ',').join('\n');
  return `/**
 * truck-data.js — CENTRALE bron van waarheid voor de foodtruck-vloot.
 *
 * DIT is de plek om een foodtruck toe te voegen/wijzigen: voeg één object toe
 * aan de TRUCKS-lijst hieronder (naam, categorie, poets-vlag, keuring). De
 * check-in-, planning-, poets- en functions-lijsten leiden zich hier allemaal
 * uit af, dus je hoeft het nog op MAAR ÉÉN plaats te doen.
 *
 * Na bewerken: kopie naar functions/ syncen met  node tools/sync-truck-data.js
 * (de keuring-DATUMS zelf blijven in keuringen.html / RTDB, dat is live-data).
 *
 * Werkt in de browser (window.TruckData) én in Node (module.exports).
 * Oorspronkelijk gebootstrapt uit de oude lijsten via tools/build-truck-data.js.
 */
(function (global) {
  'use strict';

  // Categorie-presentatie (labels/kleuren) per view. Lidmaatschap komt uit
  // het 'category'-veld van elke truck, niet uit losse lijsten.
  var CATEGORIES = [
    { key: 'frituur',     checkinLabel: '🍟 Frituurwagens',         checkinType: 'frituur',   planningLabel: '🍟 Frituurwagens', color: '#b45309', bg: '#fef3c7' },
    { key: 'hamburger',   checkinLabel: '🍔 Hamburgerwagens',       checkinType: 'hamburger', planningLabel: '🍔 Hamburger',     color: '#e8001d', bg: '#fde8e8' },
    { key: 'pizza_pasta', checkinLabel: '🍕 Pizza & Pasta',         checkinType: 'overig',    planningLabel: '🍕 Pizza & Pasta', color: '#c2410c', bg: '#ffedd5' },
    { key: 'sweet_ijs',   checkinLabel: '🍦 Sweet & Ijs',           checkinType: 'overig',    planningLabel: '🍦 Sweet & Ijs',   color: '#7c3aed', bg: '#ede9fe' },
    { key: 'tap',         checkinLabel: '🍺 Tap & Dranken',         checkinType: 'overig',    planningLabel: '🍺 Tap & Dranken', color: '#1d4ed8', bg: '#dbeafe' },
    { key: 'rijdend',     checkinLabel: '🚛 Rijdend',               checkinType: 'rijdend',   planningLabel: '🚛 Rijdend',       color: '#374151', bg: '#f3f4f6' },
    { key: 'support',     checkinLabel: '📦 Containers & Support',  checkinType: 'overig',    planningLabel: '📦 Support',       color: '#374151', bg: '#f3f4f6' }
  ];

  var TRUCKS = [
${lines}
  ];

  function fleet() { return TRUCKS.slice(); }
  function poetsTrucks() { return TRUCKS.filter(function (t) { return t.poets; }).map(function (t) { return t.name; }); }

  // Bouwt de gegroepeerde structuur voor een view ('checkin' of 'planning').
  function groups(view) {
    return CATEGORIES.map(function (c) {
      var trucks = TRUCKS
        .filter(function (t) { return t.category === c.key && (view !== 'checkin' || t.inCheckin); })
        .map(function (t) { return t.name; });
      if (view === 'checkin') return { label: c.checkinLabel, type: c.checkinType, trucks: trucks };
      return { label: c.planningLabel, color: c.color, bg: c.bg, trucks: trucks };
    }).filter(function (g) { return g.trucks.length; });
  }

  var api = {
    TRUCKS: TRUCKS, CATEGORIES: CATEGORIES,
    fleet: fleet, poetsTrucks: poetsTrucks, groups: groups,
    checkinGroups: function () { return groups('checkin'); },
    planningGroups: function () { return groups('planning'); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TruckData = api;
})(typeof window !== 'undefined' ? window : globalThis);
`;
}
