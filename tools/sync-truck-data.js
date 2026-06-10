/**
 * sync-truck-data.js — houdt functions/truck-data.js gelijk aan /truck-data.js.
 *
 * De webpagina's laden /truck-data.js; het functions-pakket wordt apart
 * gedeployd en heeft z'n eigen kopie nodig. Draai dit na elke wijziging:
 *
 *   node tools/sync-truck-data.js          → kopieert webroot → functions/
 *   node tools/sync-truck-data.js --check  → faalt (exit 1) als ze verschillen
 *                                            (voor in CI, vóór deploy)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'truck-data.js');
const DST = path.join(ROOT, 'functions', 'truck-data.js');

const src = fs.readFileSync(SRC, 'utf8');
const dst = fs.existsSync(DST) ? fs.readFileSync(DST, 'utf8') : null;

if (process.argv.includes('--check')) {
  if (src !== dst) {
    console.error('❌ functions/truck-data.js loopt achter op /truck-data.js — draai: node tools/sync-truck-data.js');
    process.exit(1);
  }
  console.log('✓ functions/truck-data.js is in sync.');
} else {
  if (src === dst) { console.log('✓ al in sync, niets te doen.'); }
  else { fs.writeFileSync(DST, src); console.log('📝 functions/truck-data.js bijgewerkt vanuit /truck-data.js.'); }
}
