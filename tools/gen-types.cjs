const fs = require('fs');
const path = require('path');

const DL = 'C:/Users/Jelle/Downloads';
const OUT = 'c:/Users/Jelle/Projects/operations/checklist-types.js';

// ---- minimal CSV parser (handles quoted fields with commas) ----
function parseCSV(text){
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length){
    const c = text[i];
    if (inQ){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"'){ inQ = true; i++; continue; }
    if (c === ','){ row.push(field); field = ''; i++; continue; }
    if (c === '\n'){ row.push(field); rows.push(row); field = ''; row = []; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// ---- mojibake repair (double-encoded UTF-8) ----
function fix(s){
  if (s == null) return s;
  return s
    .replace(/Ã©/g,'é').replace(/Ã¨/g,'è').replace(/Ã«/g,'ë').replace(/Ã¯/g,'ï')
    .replace(/Ã¶/g,'ö').replace(/Ã¼/g,'ü').replace(/Ã´/g,'ô').replace(/Ã§/g,'ç')
    .replace(/Ã /g,'à').replace(/Ã¢/g,'â').replace(/Ã®/g,'î').replace(/Ã¹/g,'ù')
    .replace(/Â/g,'');
}
const num = v => { const n = parseInt(String(v).trim(),10); return Number.isFinite(n) ? n : 0; };
const norm = s => fix(String(s||'')).trim().replace(/\s+/g,' ').toLowerCase();

// ---- 1) catalogus: naam -> categorie (alleen echte productrijen) ----
const prodRows = parseCSV(fs.readFileSync(path.join(DL,'senorsnacks_producten.csv'),'utf8'));
const catByName = new Map();
const CATS = new Set(['DIEPVRIES','KOELING','DROOG','SAUZEN','DRANK']);
for (let r=1; r<prodRows.length; r++){
  const [actief, categorie, naam] = prodRows[r];
  if (!naam || !String(naam).trim()) continue;       // materiaalrijen overslaan
  const cat = String(categorie||'').trim().toUpperCase();
  if (!CATS.has(cat)) continue;
  catByName.set(norm(naam), cat);
}

// ---- 2) types-basis: id -> {naam, actief, counts} ----
const typeRows = parseCSV(fs.readFileSync(path.join(DL,'senorsnacks_types.csv'),'utf8'));
const types = new Map();
for (let r=1; r<typeRows.length; r++){
  const [id, naam, actief, ap, am] = typeRows[r];
  if (!id || !String(id).trim()) continue;
  types.set(String(id).trim(), {
    id: num(id), naam: fix(naam).trim(),
    actief: String(actief).trim().toLowerCase() !== 'false',
    aantalProducten: num(ap), aantalMaterialen: num(am),
    producten: [], materialen: []
  });
}

// ---- 3) koppeling: vul producten/materialen per type ----
const linkRows = parseCSV(fs.readFileSync(path.join(DL,'senorsnacks_types_met_producten.csv'),'utf8'));
let prodCnt=0, matCnt=0, unmatched=new Set();
for (let r=1; r<linkRows.length; r++){
  const [tid, tnaam, soort, naam, hoev] = linkRows[r];
  const id = String(tid||'').trim();
  if (!id || !types.has(id)) continue;
  const s = String(soort||'').trim().toLowerCase();
  const nm = fix(naam).trim();
  if (!s || !nm) continue;                            // lege type-rij
  const t = types.get(id);
  if (s === 'product'){
    const cat = catByName.get(norm(nm)) || null;
    if (!cat) unmatched.add(nm);
    t.producten.push({ naam: nm, aantal: num(hoev), categorie: cat });
    prodCnt++;
  } else if (s === 'materiaal'){
    t.materialen.push({ naam: nm, aantal: num(hoev) });
    matCnt++;
  }
}

// ---- 4) schrijf checklist-types.js ----
const arr = Array.from(types.values()).sort((a,b)=>a.naam.localeCompare(b.naam,'nl'));
const banner = `// Checklist-/laadlijst-types — GEGENEREERD, niet handmatig bewerken.
// Bron: senorsnacks_types.csv + senorsnacks_types_met_producten.csv + senorsnacks_producten.csv
// Regenereer met tools/gen-types.cjs. RTDB-pad: ft_checklist_types_v1 (key = string(id)).
// Productcategorie is afgeleid uit de catalogus; null = geen match gevonden.
`;
const body = 'window.CHECKLIST_TYPES = ' + JSON.stringify(arr, null, 1) + ';\n';
const seeder = `
// Idempotente seeder: schrijft types naar ft_checklist_types_v1.
// Standaard alleen als de collectie leeg is; geef {force:true} om te overschrijven.
window.seedChecklistTypes = function (db, opts) {
  opts = opts || {};
  const ref = db.ref('ft_checklist_types_v1');
  return ref.once('value').then(function (snap) {
    if (snap.exists() && !opts.force) return { seeded: 0, skipped: true };
    const out = {};
    window.CHECKLIST_TYPES.forEach(function (t) {
      out[String(t.id)] = {
        naam: t.naam,
        actief: t.actief !== false,
        aantalProducten: t.aantalProducten || 0,
        aantalMaterialen: t.aantalMaterialen || 0,
        producten: t.producten || [],
        materialen: t.materialen || []
      };
    });
    return ref.set(out).then(function () {
      return { seeded: window.CHECKLIST_TYPES.length, skipped: false };
    });
  });
};
`;
fs.writeFileSync(OUT, banner + body + seeder, 'utf8');

// ---- rapport ----
const withProd = arr.filter(t=>t.producten.length||t.materialen.length).length;
console.log('Types:', arr.length, '| met inhoud:', withProd, '| leeg:', arr.length-withProd);
console.log('Productregels:', prodCnt, '| materiaalregels:', matCnt);
console.log('Producten zonder categorie-match:', unmatched.size);
if (unmatched.size) console.log('  bv:', Array.from(unmatched).slice(0,15).join(' | '));
