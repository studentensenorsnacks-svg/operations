/**
 * check-syntax.js — compileert (zonder uit te voeren) alle JS in de opgegeven
 * bestanden om syntaxfouten te vangen vóór deploy. Voor .html worden de inline
 * <script>-blokken (zonder src) eruit gehaald en stuk voor stuk gecontroleerd.
 *
 *   node tools/check-syntax.js bestand1 bestand2 ...
 */
'use strict';
const fs = require('fs');
let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.js')) {
    try { new Function(src); console.log('✓ ' + f); }
    catch (e) { console.log('✗ ' + f + ' — ' + e.message); bad++; }
    continue;
  }
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0, ok = true;
  while ((m = re.exec(src))) {
    i++;
    try { new Function(m[1]); }
    catch (e) { console.log('✗ ' + f + ' inline-script #' + i + ' — ' + e.message); ok = false; bad++; }
  }
  console.log((ok ? '✓ ' : '✗ ') + f + ' (' + i + ' inline scripts)');
}
process.exit(bad ? 1 : 0);
