// Gedeelde catalogus van toewijsbare pagina's voor het persoonlijke portaal.
//
// Eén bron van waarheid: zowel portaal.html (toont de tegels) als
// users.html (laat een admin tegels per gebruiker aan/uit zetten) lezen
// deze lijst. Voeg hier een pagina toe en ze verschijnt automatisch op
// beide plekken.
//
// Elke tegel:
//   key      - stabiele sleutel, opgeslagen in RTDB _userPages/<uid>/<key>
//   label    - tekst op de tegel
//   icon     - emoji
//   url      - waar de tegel naartoe linkt
//   desc     - korte omschrijving onder het label
//   external - true → opent in een nieuw tabblad (externe app)
window.PORTAL_PAGES = [
  { key: 'checkin',      label: 'Check-in',        icon: '🚚', url: 'checkin.html',                          desc: 'Trucks in- en uitchecken' },
  { key: 'poets',        label: 'Poets Dashboard', icon: '🧼', url: 'poets.html',                            desc: 'Poetsstatus van de trucks' },
  { key: 'vet',          label: 'Vet Status',      icon: '🛢️', url: 'vet.html',                              desc: 'Vettonnen & frituurvet' },
  { key: 'verhuur',      label: 'Verhuur',         icon: '🚐', url: 'verhuur.html',                          desc: 'Verhuringen beheren' },
  { key: 'planning',     label: 'Planning',        icon: '📅', url: 'planning.html',                         desc: 'Event- en truckplanning' },
  { key: 'notities',     label: 'Notities',        icon: '📝', url: 'notities.html',                         desc: 'Notities & stukken' },
  { key: 'ops',          label: 'Personeelsfiche', icon: '👥', url: 'ops.html',                              desc: 'Personeel' },
  { key: 'horeca',       label: 'Horeca Planning', icon: '🍔', url: 'horeca-planning.html',                  desc: 'Horeca-planning' },
  { key: 'lijsten',      label: 'Lijsten',         icon: '📋', url: 'lijsten.html',                          desc: 'Catalogus-lijsten' },
  { key: 'stroom',       label: 'Stroomaanvraag',  icon: '⚡', url: 'stroomaanvraag.html',                   desc: 'Stroomaanvragen' },
  { key: 'checklists',   label: 'Laadlijsten',     icon: '📦', url: 'checklists.html',                       desc: 'Laad-checklists' },
  { key: 'qrcodes',      label: 'QR codes',        icon: '🔳', url: 'qr-codes.html',                         desc: 'QR-codes' },
  { key: 'dashboard',    label: 'Ops Dashboard',   icon: '📊', url: 'dashboard.html',                        desc: 'Volledig ops-dashboard' },
  { key: 'bestellingen', label: 'Bestellingen',    icon: '🛒', url: 'bestellingen-dashboard.html',           desc: 'Bestellingen' },
  { key: 'keuringen',    label: 'Keuringen',       icon: '🧾', url: 'https://senorkeuringqr.web.app/index.html', desc: 'Keuringen (extern)', external: true },
];
