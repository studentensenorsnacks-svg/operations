// Catalogus van tegels voor het persoonlijke portaal (portaal.html).
//
// De sleutels (key) zijn EXACT de page-codes uit VALID_PAGES in
// functions/index.js en PAGE_DEFS in users.html, en de url's vallen
// binnen de toegestane paden (PAGE_FILES) in auth.js. Zo komt elke tegel
// die een 'custom'-gebruiker mag zien overeen met een pagina die hij ook
// echt mag openen.
//
// Let op: de code 'trucks' is een data-rechten-scope zonder eigen pagina
// en staat daarom bewust NIET als tegel in deze lijst.
window.PORTAL_PAGES = [
  { key: 'notities',       label: 'Notities',        icon: '📝', url: 'notities.html',               desc: 'Notities & stukken' },
  { key: 'checkin',        label: 'Check-in',        icon: '🚚', url: 'checkin.html',                desc: 'Trucks in- en uitchecken' },
  { key: 'planning',       label: 'Planning',        icon: '📅', url: 'planning.html',               desc: 'Event-, truck- & verhuurplanning' },
  { key: 'laadlijsten',    label: 'Laadlijsten',     icon: '📦', url: 'lijsten.html',                desc: 'Laadlijsten & catalogus-lijsten' },
  { key: 'ops',            label: 'Personeelsfiche', icon: '👥', url: 'ops.html',                    desc: 'Personeel' },
  { key: 'personeel',      label: 'Personeelsregister', icon: '🧑‍🍳', url: 'personeel.html',         desc: 'Personeelsfiches & aanmeldingen' },
  { key: 'qrcodes',        label: 'QR codes',        icon: '🔳', url: 'qr-codes.html',               desc: 'QR-codes' },
  { key: 'poets',          label: 'Poets',           icon: '🧼', url: 'poets.html',                  desc: 'Poetsstatus van de trucks' },
  { key: 'keuringen',      label: 'Keuringen',       icon: '✅', url: 'ocb.html',                    desc: 'Keuringen (OCB)' },
  { key: 'vet',            label: 'Vet / tonnen',    icon: '🛢️', url: 'vet.html',                    desc: 'Vettonnen & frituurvet' },
  { key: 'bestellingen',   label: 'Bestellingen',    icon: '🛒', url: 'bestellingen-dashboard.html', desc: 'Bestellingen (Postel)' },
  { key: 'stroomaanvraag', label: 'Stroomaanvraag',  icon: '⚡', url: 'stroomaanvraag.html',         desc: 'Stroomaanvragen' },
  { key: 'archief',        label: 'Archief',         icon: '🗂️', url: 'archief.html',                desc: 'Archief' },
  { key: 'eindstock',      label: 'Eindstock',       icon: '📊', url: 'eindstock.html',              desc: 'Eindstock' },
  { key: 'horeca',         label: 'Horeca Planning', icon: '🍔', url: 'horeca-planning.html',        desc: 'Horeca-planning' },
  { key: 'krisdc',         label: 'Kris DC',         icon: '🍟', url: 'kris-dc.html',                desc: 'Wekelijkse stock (elke dinsdag)' },
  { key: 'fiches',         label: "Technische fiche's", icon: '🔧', url: 'technische-fiches.html',   desc: 'Technische fiches van wagens & containers' },
];
