// Bouwt de attestpagina's van de QR-site opnieuw op vanuit de live keuringsdata.
//
// Waarom dit script bestaat: de vorige pagina's hadden de vervaldatum en het aantal
// resterende dagen hard in de HTML staan. Ze klopten dus enkel op de dag dat ze
// gebouwd werden. Hier staat de vervaldatum in een data-attribuut en rekent de
// pagina het aantal dagen zelf uit bij het openen.
//
// Gebruik:  node tools/build-keuringqr-attesten.js <keuringen.json>
// De JSON is een dump van RTDB-node ft_keuringen_beheer_v1.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QR = path.join(ROOT, 'keuringqr');
const PDFSRC = path.join(ROOT, 'keuring-attesten');
const PDFDST = path.join(QR, 'pdfs');
const TRUCKS = path.join(QR, 'trucks');

const dataFile = process.argv[2];
if (!dataFile) { console.error('Geef het pad naar de keuringen-JSON mee.'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

// Manifest = welke PDF hoort bij welk voertuig
global.window = {};
eval(fs.readFileSync(path.join(PDFSRC, 'manifest.js'), 'utf8'));
const ATT = window.KEUR_ATT;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');

const CSS = `*{box-sizing:border-box;margin:0;padding:0;}
body{background:#f8f6f2;font-family:system-ui,sans-serif;min-height:100vh;padding:20px 16px 48px;}
a.back{display:inline-block;margin-bottom:14px;font-size:13px;font-weight:700;color:#e8000f;text-decoration:none;}
.card{max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);border:1.5px solid #e8e4dc;}
.hdr{background:#e8000f;color:#fff;padding:26px 26px 20px;}
.brand{font-size:11px;font-weight:700;opacity:.7;margin-bottom:6px;}
.name{font-size:22px;font-weight:800;line-height:1.2;}
.sub{font-size:12px;font-family:monospace;opacity:.65;margin-top:4px;}
.body{padding:20px 26px;display:flex;flex-direction:column;gap:12px;}
.cert{border:1.5px solid #e8e4dc;border-radius:10px;overflow:hidden;}
.cert-hd{background:#faf8f4;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e8e4dc;gap:8px;}
.cert-title{font-size:13px;font-weight:700;color:#1a1915;}
.badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;text-transform:uppercase;white-space:nowrap;}
.cert-rows{padding:10px 14px;display:flex;flex-direction:column;gap:7px;}
.row{display:flex;justify-content:space-between;font-size:13px;gap:10px;}
.rl{color:#888;}.rv{font-family:monospace;font-weight:600;color:#1a1915;text-align:right;}
a.pdf-btn{display:flex;align-items:center;gap:8px;background:#1a1915;color:#fff;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;text-decoration:none;margin-top:6px;}
a.pdf-btn:hover{background:#333;}
.none{border:1.5px dashed #e8e4dc;border-radius:12px;padding:14px;font-size:13px;color:#999;text-align:center;}
.footer{padding:13px 26px;border-top:1.5px solid #e8e4dc;text-align:center;font-size:11px;color:#bbb;}`;

// Badge wordt bij het openen van de pagina berekend, niet bij het bouwen.
const SCRIPT = `<script>
document.querySelectorAll('.badge[data-exp]').forEach(function(b){
  var exp = b.getAttribute('data-exp');
  if(!exp){ b.textContent='Datum ontbreekt'; b.style.background='#fdecea'; b.style.color='#b3261e'; return; }
  var d = Math.ceil((new Date(exp+'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
  if(d < 0){ b.textContent='Verlopen (' + (-d) + 'd)'; b.style.background='#fdecea'; b.style.color='#b3261e'; }
  else if(d <= 60){ b.textContent='Nog ' + d + 'd'; b.style.background='#fff4e5'; b.style.color='#a15c00'; }
  else { b.textContent='\\u2713 ' + d + 'd resterend'; b.style.background='#e8f5ee'; b.style.color='#2e7d52'; }
});
</script>`;

function blok(titel, icoon, p, pdfs) {
  if (!p.present) {
    return `<div class="cert"><div class="cert-hd"><div class="cert-title">${icoon} ${titel}</div>` +
      `<span class="badge" style="background:#f1f0ec;color:#888">Niet van toepassing</span></div></div>`;
  }
  const knoppen = pdfs.map((a) =>
    `<a class="pdf-btn" href="../pdfs/${esc(a.f)}" target="_blank">\u{1F4C4} Open ${esc(a.l)}</a>`).join('');
  const geenAttest = pdfs.length ? '' :
    `<div class="row"><span class="rl">Attest</span><span class="rv">niet beschikbaar</span></div>`;
  return `<div class="cert"><div class="cert-hd"><div class="cert-title">${icoon} ${titel}</div>` +
    `<span class="badge" data-exp="${esc(p.exp)}"></span></div>` +
    `<div class="cert-rows">` +
    `<div class="row"><span class="rl">Keuringsdatum</span><span class="rv">${nl(p.date)}</span></div>` +
    `<div class="row"><span class="rl">Vervaldatum</span><span class="rv">${nl(p.exp)}</span></div>` +
    `<div class="row"><span class="rl">Instelling</span><span class="rv">${esc(p.org || 'OCB vzw')}</span></div>` +
    geenAttest + knoppen +
    `</div></div>`;
}

if (!fs.existsSync(PDFDST)) fs.mkdirSync(PDFDST, { recursive: true });

// 1) PDF-map van de QR-site opnieuw vullen: eerst leeg, dan de actuele attesten erin.
for (const f of fs.readdirSync(PDFDST)) {
  if (f.toLowerCase().endsWith('.pdf')) fs.unlinkSync(path.join(PDFDST, f));
}
let kopieen = 0;
for (const id of Object.keys(ATT)) {
  for (const a of ATT[id]) {
    fs.copyFileSync(path.join(PDFSRC, a.f), path.join(PDFDST, a.f));
    kopieen++;
  }
}

// 2) Attestpagina per voertuig
let gebouwd = 0;
for (const id of Object.keys(db).sort()) {
  const t = db[id];
  const att = ATT[id] || [];
  const elekPdfs = att.filter((a) => a.t === 'elek');
  const gasPdfs = att.filter((a) => a.t === 'gas');

  const body =
    blok('Elektriciteitskeuring', '⚡', t.elek, elekPdfs) +
    blok('Gaskeuring', '\u{1F525}', t.gas, gasPdfs);

  const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.name)} — Keuringsattest</title><style>${CSS}</style></head>
<body>
<div style="max-width:500px;margin:0 auto 0"><a class="back" href="${id}.html">&larr; Terug naar overzicht</a></div>
<div class="card"><div class="hdr"><div class="brand">\u{1F690} SEÑOR SNACKS — KEURINGSATTEST</div><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.plate || '—')} · ${esc(t.type)}</div></div><div class="body">${body}</div><div class="footer">Verantwoordelijke: ${esc(t.owner || 'Señor Snacks')}</div></div>
${SCRIPT}
</body></html>`;

  fs.writeFileSync(path.join(TRUCKS, id + '-attesten.html'), html, 'utf8');
  gebouwd++;
}

console.log('PDF\'s naar keuringqr/pdfs : ' + kopieen);
console.log('Attestpagina\'s herbouwd   : ' + gebouwd);
