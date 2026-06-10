/**
 * check-planning-membership.js — bewijst dat de truck-data-ombouw GEEN trucks
 * uit de planning laat verdwijnen. Vergelijkt de oude GROUPS_WAGENS (uit git
 * HEAD) met wat TruckData.planningGroups() nu oplevert.
 *
 *   node tools/check-planning-membership.js
 */
'use strict';
const { execSync } = require('child_process');
const path = require('path');

// Oude planning.html uit git halen (vóór de ombouw, mét C111/C112/C211).
const oldSrc = execSync('git show HEAD:planning.html', {
  cwd: path.resolve(__dirname, '..'), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8',
});

function extractArray(src, marker) {
  const at = src.indexOf(marker);
  const start = src.indexOf('[', at);
  let depth = 0, inStr = false, q = '', i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === q) inStr = false; }
    else if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; }
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  return Function('"use strict";return (' + src.slice(start, i) + ');')();
}

const oldGroups = extractArray(oldSrc, 'const GROUPS_WAGENS');
const oldNames = new Set(oldGroups.flatMap((g) => g.trucks));

const TruckData = require(path.resolve(__dirname, '..', 'truck-data.js'));
const newGroups = TruckData.planningGroups();
const newNames = new Set(newGroups.flatMap((g) => g.trucks));

const verdwenen = [...oldNames].filter((n) => !newNames.has(n));   // KRITISCH
const bijgekomen = [...newNames].filter((n) => !oldNames.has(n));  // ok, toevoeging

console.log('Oude planning-lijst :', oldNames.size, 'trucks');
console.log('Nieuwe planning-lijst:', newNames.size, 'trucks');
console.log('');
console.log(verdwenen.length ? '❌ VERDWENEN uit planning: ' + JSON.stringify(verdwenen)
                             : '✅ Geen enkele truck verdwenen uit de planning.');
console.log(bijgekomen.length ? 'ℹ️  Nieuw zichtbaar in planning (toevoeging): ' + JSON.stringify(bijgekomen)
                              : 'ℹ️  Geen extra trucks.');

console.log('\n— Verschoven van groep (zelfde truck, andere categorie) —');
const oldGroupOf = {};
oldGroups.forEach((g) => g.trucks.forEach((t) => (oldGroupOf[t] = g.label)));
const newGroupOf = {};
newGroups.forEach((g) => g.trucks.forEach((t) => (newGroupOf[t] = g.label)));
let moved = 0;
[...newNames].forEach((t) => {
  if (oldGroupOf[t] && newGroupOf[t] && oldGroupOf[t] !== newGroupOf[t]) {
    console.log('  -', t, ':', oldGroupOf[t], '→', newGroupOf[t]); moved++;
  }
});
if (!moved) console.log('  (geen)');
