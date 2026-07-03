# -*- coding: utf-8 -*-
"""Bouwt de QR-landingspagina's voor keuringqr:
- trucks/<id>.html   -> keuzepagina (keuringsverslagen / friteuse / tabs)
- trucks/<id>-attesten.html -> de bestaande attestpagina (verplaatst, + terugknop)
- info/friteuse-aansteken.html -> gedeelde instructiepagina
"""
import re, os, json, html

ROOT = r"c:\Users\Jelle\Projects\operations\keuringqr"
TD = r"c:\Users\Jelle\Projects\operations\truck-data.js"

src = open(TD, encoding="utf-8").read()
trucks = []
for m in re.finditer(r'\{("id":"ft\d+".*?)\}', src):
    obj = json.loads("{" + m.group(1) + "}")
    trucks.append(obj)
print("trucks:", len(trucks))

# 1) attestpagina's verplaatsen naar <id>-attesten.html + terugknop injecteren
#    (enkel bij de eerste migratie: bestaat <id>-attesten.html al, dan is
#    <id>.html een landingspagina en blijven we er AF)
moved = 0
for t in trucks:
    p = os.path.join(ROOT, "trucks", t["id"] + ".html")
    dest = os.path.join(ROOT, "trucks", t["id"] + "-attesten.html")
    if os.path.exists(dest) or not os.path.exists(p):
        continue
    h = open(p, encoding="utf-8").read()
    if "Keuringsattest" not in h:  # geen attestpagina (bv. al een landingspagina)
        continue
    back = ('<div style="max-width:500px;margin:0 auto 0">'
            f'<a class="back" href="{t["id"]}.html">&larr; Terug naar overzicht</a></div>')
    if 'class="back"' not in h.split("</style>")[-1]:
        h = h.replace("<body>", "<body>\n" + back, 1)
    open(dest, "w", encoding="utf-8").write(h)
    os.remove(p)
    moved += 1
print("attesten verplaatst:", moved)

# 2) landingspagina per truck
LANDING = """<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{NAME} — Señor Snacks</title><style>*{{box-sizing:border-box;margin:0;padding:0;}}
body{{background:#f8f6f2;font-family:system-ui,sans-serif;min-height:100vh;padding:20px 16px 48px;}}
.card{{max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);border:1.5px solid #e8e4dc;}}
.hdr{{background:#e8000f;color:#fff;padding:26px 26px 20px;}}
.brand{{font-size:11px;font-weight:700;opacity:.7;margin-bottom:6px;}}
.name{{font-size:22px;font-weight:800;line-height:1.2;}}
.sub{{font-size:12px;font-family:monospace;opacity:.65;margin-top:4px;}}
.body{{padding:20px 22px 24px;}}
a.big{{display:flex;align-items:center;gap:12px;background:#1a1915;color:#fff;border-radius:12px;padding:16px;font-size:15px;font-weight:800;text-decoration:none;margin-bottom:10px;}}
a.big.gas{{background:#e8000f;}}
a.big.hulp{{background:#fff;color:#1a1915;border:1.5px solid #e8e4dc;}}
a.big.hulp small{{color:#888;opacity:1;}}
a.big .ic{{font-size:22px;}}
a.big small{{display:block;font-weight:500;font-size:11.5px;opacity:.7;margin-top:2px;}}
.none{{border:1.5px dashed #e8e4dc;border-radius:12px;padding:14px;font-size:13px;color:#999;text-align:center;margin-bottom:10px;}}
.tabs{{display:flex;gap:4px;margin:18px 0 0;border-bottom:2px solid #e8e4dc;}}
.tabs button{{flex:1;background:none;border:none;padding:10px 4px;font-size:12.5px;font-weight:700;color:#999;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;font-family:inherit;}}
.tabs button.on{{color:#e8000f;border-bottom-color:#e8000f;}}
/* smal scherm (gsm): 2 tabs boven, 1 eronder — als knoppen i.p.v. tab-balk */
@media(max-width:420px){{
  .tabs{{flex-wrap:wrap;gap:6px;border-bottom:none;}}
  .tabs button{{flex:1 1 40%;border:1.5px solid #e8e4dc;border-radius:9px;padding:11px 4px;margin-bottom:0;font-size:13px;}}
  .tabs button:last-child{{flex-basis:100%;}}
  .tabs button.on{{border-color:#e8000f;background:#fff3f3;}}
}}
.pane{{display:none;padding:16px 2px 0;}}
.pane.on{{display:block;}}
.pane ul{{list-style:none;display:flex;flex-direction:column;gap:9px;}}
.pane li{{font-size:13.5px;line-height:1.5;padding-left:22px;position:relative;color:#333;}}
.pane li::before{{content:"•";position:absolute;left:6px;color:#e8000f;font-weight:800;}}
.pane li b{{color:#1a1915;}}
.warn{{background:#fff3f3;border:1.5px solid #f3c2c2;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#8f1616;margin-bottom:11px;font-weight:600;}}
.footer{{padding:13px 26px;border-top:1.5px solid #e8e4dc;text-align:center;font-size:11px;color:#bbb;}}</style></head>
<body>
<div class="card">
  <div class="hdr"><div class="brand">🚐 SEÑOR SNACKS</div><div class="name">{NAME}</div><div class="sub">{SUB}</div></div>
  <div class="body">
    {ATTESTEN}
    {GAS}
    <a class="big hulp" href="../info/links.html"><span class="ic">❓</span><span>Vragen?<small>Eerst deze nuttige links en handleidingen bekijken</small></span></a>
    <div class="tabs">
      <button class="on" onclick="tab(this,'p1')">Voedselveiligheid</button>
      <button onclick="tab(this,'p2')">Brandveiligheid</button>
      <button onclick="tab(this,'p3')">Vuistregels</button>
    </div>
    <div class="pane on" id="p1"><ul>
      <li><b>Handen wassen</b> vóór de dienst, na toiletbezoek en na contact met rauw product.</li>
      <li><b>Koelketen:</b> koeling 0–4&nbsp;°C, diepvries −18&nbsp;°C. Controleer bij opstart — twijfel = melden, niet gebruiken.</li>
      <li><b>Frituurolie:</b> dagelijks controleren op kleur, geur en schuim. Tijdig verversen.</li>
      <li><b>Kruisbesmetting:</b> rauw en bereid gescheiden houden; aparte tangen en snijplanken.</li>
      <li><b>FIFO:</b> eerste in, eerste uit. Houdbaarheidsdata controleren bij het laden.</li>
      <li><b>Ontdooien</b> altijd in de koeling, nooit op het werkblad.</li>
      <li>Werkblad en materiaal <b>proper bij start én einde</b> van de dienst.</li>
      <li>Ziek (braken, diarree, koorts)? <b>Niet werken met voeding</b> — verwittig de verantwoordelijke.</li>
    </ul></div>
    <div class="pane" id="p2">
      <div class="warn">🔥 Vetbrand? NOOIT water! Deksel of blusdeken erop en gas dicht.</div>
      <ul>
      <li>Weet <b>waar blustoestel en blusdeken</b> hangen vóór je opstart.</li>
      <li><b>Gasflessen:</b> rechtop, vastgezet en verlucht. Hoofdkraan dicht na elke dienst.</li>
      <li><b>Gasgeur?</b> Alles dichtdraaien, géén schakelaars of vlammen, verluchten en verantwoordelijke bellen.</li>
      <li>Frituur <b>nooit onbewaakt</b> laten branden.</li>
      <li><b>Doorgang en nooduitgang</b> altijd vrijhouden.</li>
      <li><b>Elektriciteit:</b> geen dominostekkers of overbelasting; beschadigde kabels direct melden.</li>
      <li>Keuringen in orde? Zie <b>Keuringsverslagen</b> bovenaan.</li>
    </ul></div>
    <div class="pane" id="p3"><ul>
      <li><b>Opstart:</b> koeltemperaturen checken, gas en elektriciteit visueel nakijken, werkblad ontsmetten.</li>
      <li><b>Tijdens de dienst:</b> werkplek proper, olieniveau in het oog, afval gescheiden.</li>
      <li><b>Afsluiten:</b> hoofdkraan gas dicht, toestellen uit, koeling gecontroleerd, afval mee, werkblad proper.</li>
      <li><b>Schade of defect?</b> Direct melden — niet zelf herstellen.</li>
      <li><b>Twijfel</b> over veiligheid of voedsel? Niet gebruiken en de verantwoordelijke bellen.</li>
    </ul></div>
  </div>
  <div class="footer">Señor Snacks · Taste · Enjoy · Smile</div>
</div>
<script>function tab(b,id){{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));
b.classList.add('on');document.getElementById(id).classList.add('on');}}</script>
</body></html>
"""

made = 0
for t in trucks:
    tid = t["id"]
    name = html.escape(t.get("name", tid))
    sub = html.escape((t.get("plate") or "--") + " · " + t.get("type", ""))
    has_att = os.path.exists(os.path.join(ROOT, "trucks", tid + "-attesten.html"))
    att = (f'<a class="big" href="{tid}-attesten.html"><span class="ic">📄</span>'
           '<span>Keuringsverslagen<small>Elektriciteit &amp; gas — attesten en vervaldata</small></span></a>'
           ) if has_att else '<div class="none">Nog geen keuringsverslagen beschikbaar</div>'
    gas = ('<a class="big gas" href="../info/friteuse-aansteken.html"><span class="ic">🔥</span>'
           '<span>Hoe friteuse aansteken?<small>Filmpje + stap voor stap</small></span></a>'
           ) if t.get("keuringGas") else ''
    page = LANDING.format(NAME=name, SUB=sub, ATTESTEN=att, GAS=gas)
    open(os.path.join(ROOT, "trucks", tid + ".html"), "w", encoding="utf-8").write(page)
    made += 1
print("landingspagina's:", made)
