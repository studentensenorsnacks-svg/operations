/**
 * Microsoft 365 -> Firebase sync for the Señor Snacks planning tool.
 *
 * App-only (client credentials) authentication reads ONE central Outlook
 * calendar via Microsoft Graph and mirrors its events into Realtime Database
 * at /ms365_events. The planning page (planning.html) reads that node, so no
 * per-user Microsoft login is needed anywhere.
 *
 *   syncOutlook    - scheduled, runs every 15 minutes
 *   refreshOutlook - HTTP endpoint behind hosting rewrite /api/refresh-outlook
 *                    used by the "Sync" button for an on-demand pull
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp({
  databaseURL: 'https://operationssenorsnacks-default-rtdb.europe-west1.firebasedatabase.app',
});

// ── CONFIG ───────────────────────────────────────────────
// Azure AD app registration (the same one the browser sync already used).
const TENANT_ID = 'd613124d-7d7b-4fe5-be9f-04e9bab00da8';
const CLIENT_ID = '40a7956b-44eb-46fc-a9f1-cd6aa83407d2';

// Client secret — lives in Cloud Secret Manager, never in code or git:
//   firebase functions:secrets:set MS_CLIENT_SECRET
const MS_CLIENT_SECRET = defineSecret('MS_CLIENT_SECRET');

// Mailbox / UPN of the central Outlook calendar — set in functions/.env
const MS_MAILBOX = defineString('MS_MAILBOX');

const REGION = 'europe-west1';
const GRAPH = 'https://graph.microsoft.com/v1.0';

// Outlook category preset -> hex (same palette as planning.html).
const OUTLOOK_COLORS = {
  none: '#374151',
  preset0: '#C50F1F', preset1: '#CA5010', preset2: '#C19C00', preset3: '#498205',
  preset4: '#0078D4', preset5: '#038387', preset6: '#8764B8', preset7: '#C239B3',
  preset8: '#B45309', preset9: '#00B294', preset10: '#0099BC', preset11: '#7A7574',
  preset12: '#69797E', preset13: '#750B1C', preset14: '#BE185D', preset15: '#15803D',
  preset16: '#0E7490', preset17: '#1D4ED8', preset18: '#7C3AED', preset19: '#6B7280',
  preset20: '#92400E', preset21: '#065F46', preset22: '#1E40AF', preset23: '#5B21B6',
  preset24: '#831843',
};
const EVCOLORS = ['#e8001d', '#c2410c', '#b45309', '#1d4ed8', '#15803d', '#7c3aed', '#0e7490', '#be185d'];
const rndColor = () => EVCOLORS[Math.floor(Math.random() * EVCOLORS.length)];

// Date -> "YYYY-MM-DD" (same helper as planning.html).
function toStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// HTML-escape voor tekst die in een mailbericht terechtkomt.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Nederlandse datumnamen — geen afhankelijkheid van locale-data op de runtime.
const NL_DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const NL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// "YYYY-MM-DD" -> Date (lokale middernacht).
function fromStr(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "YYYY-MM-DD" + n dagen -> "YYYY-MM-DD".
function addStr(s, n) {
  const dt = fromStr(s);
  dt.setDate(dt.getDate() + n);
  return toStr(dt);
}

// "YYYY-MM-DD" -> "zaterdag 30 mei 2026".
function nlDate(s) {
  const d = fromStr(s);
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Compact weekendlabel, bv. "30–31 mei 2026" of "31 mei – 1 juni 2026".
function weekendLabel(sat, sun) {
  const a = fromStr(sat);
  const b = fromStr(sun);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${NL_MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${NL_MONTHS[a.getMonth()]} – `
    + `${b.getDate()} ${NL_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// ── MICROSOFT GRAPH ──────────────────────────────────────
async function getGraphToken(secret) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const resp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Token-fout ${resp.status}: ${data.error_description || data.error || 'onbekend'}`);
  }
  return data.access_token;
}

async function graphGet(url, token) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="Europe/Brussels"',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph API ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Pull the central calendar and convert it to the planning event shape.
async function fetchCalendar(secret, mailbox) {
  if (!mailbox) {
    throw new Error('MS_MAILBOX is niet ingesteld — vul het e-mailadres in functions/.env in.');
  }
  const token = await getGraphToken(secret);
  const box = encodeURIComponent(mailbox);

  // Step 1: category -> colour map.
  const catMap = {};
  try {
    const catData = await graphGet(`${GRAPH}/users/${box}/outlook/masterCategories`, token);
    (catData.value || []).forEach((c) => {
      catMap[c.displayName] = OUTLOOK_COLORS[c.color] || OUTLOOK_COLORS.none;
    });
  } catch (e) {
    logger.warn('Categorieën ophalen mislukt — val terug op willekeurige kleuren.', e);
  }

  // Step 2: calendar view, previous month through +8 months.
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 8, 0);
  let url = `${GRAPH}/users/${box}/calendarView`
    + `?startDateTime=${start.toISOString()}`
    + `&endDateTime=${end.toISOString()}`
    + '&$top=500'
    + '&$select=subject,start,end,location,isAllDay,categories'
    + '&$orderby=start/dateTime';

  let raw = [];
  while (url) {
    const data = await graphGet(url, token);
    raw = raw.concat(data.value || []);
    url = data['@odata.nextLink'] || null;
  }

  // Step 3: convert to the planning format used by planning.html.
  return raw
    .filter((e) => e.subject
      && !e.subject.startsWith('Geannuleerd:')
      && !e.subject.startsWith('Cancelled:'))
    .map((e) => {
      const s = new Date(e.start.dateTime || (e.start.date + 'T00:00:00'));
      const en = new Date(e.end.dateTime || (e.end.date + 'T00:00:00'));
      if (e.isAllDay) en.setDate(en.getDate() - 1); // Graph all-day end is exclusive
      const endClamped = en < s ? s : en;

      const cats = e.categories || [];
      const color = cats.length > 0 && catMap[cats[0]] ? catMap[cats[0]] : rndColor();

      return {
        name: e.subject.trim(),
        startDate: toStr(s),
        endDate: toStr(endClamped),
        location: (e.location?.displayName || '').trim(),
        color,
      };
    });
}

// Pull the calendar and write the mirror node /ms365_events.
async function syncToFirebase(secret, mailbox) {
  const events = await fetchCalendar(secret, mailbox);
  const payload = {
    updatedAt: new Date().toISOString(),
    count: events.length,
    events,
  };
  await admin.database().ref('ms365_events').set(payload);
  logger.info(`Outlook-sync: ${events.length} events naar /ms365_events geschreven.`);
  return payload;
}

// ── MICROSOFT GRAPH — MAIL VERSTUREN ─────────────────────
// Verstuurt een mail vanuit de centrale mailbox via Graph sendMail.
// Vereist de Application-machtiging Mail.Send op de Azure-app (zie MS365-SETUP.md).
async function sendGraphMail(secret, mailbox, message) {
  if (!mailbox) {
    throw new Error('MS_MAILBOX is niet ingesteld — vul het e-mailadres in functions/.env in.');
  }
  const token = await getGraphToken(secret);
  const box = encodeURIComponent(mailbox);
  const resp = await fetch(`${GRAPH}/users/${box}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph sendMail ${resp.status}: ${text}`);
  }
}

// Stelt het HTML-bericht samen voor een aanvraag extra foldtables.
function buildFoldtableMail({ sat, sun, planned, capacity, extra, items }) {
  const rows = (items || [])
    .filter((e) => e && Number(e.foldtables) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((e) => {
      const loc = e.location ? ` — ${escapeHtml(e.location)}` : '';
      return `<li><strong>${escapeHtml(e.name || 'Event')}</strong>${loc}`
        + ` — ${nlDate(e.date)} — ${Number(e.foldtables)} foldtables</li>`;
    })
    .join('');

  const html = `<p>Beste Jan,</p>`
    + `<p>Voor het weekend van <strong>${nlDate(sat)}</strong> en `
    + `<strong>${nlDate(sun)}</strong> staat er meer ingepland dan onze eigen `
    + `voorraad foldtables toelaat.</p>`
    + `<table cellpadding="4" style="border-collapse:collapse">`
    + `<tr><td>Ingepland (piek op één dag):</td><td><strong>${planned} foldtables</strong></td></tr>`
    + `<tr><td>Eigen voorraad:</td><td>${capacity} foldtables</td></tr>`
    + `<tr><td>Tekort:</td><td><strong>${extra} extra foldtables</strong></td></tr>`
    + `</table>`
    + (rows ? `<p>Events met foldtables dit weekend:</p><ul>${rows}</ul>` : '')
    + `<p>Graag <strong>${extra} extra foldtables</strong> voorzien voor dit weekend.</p>`
    + `<p style="color:#888;font-size:0.85em">Deze mail werd automatisch gegenereerd `
    + `vanuit de Señor Snacks planning-tool.</p>`;

  return {
    subject: `Aanvraag ${extra} extra foldtables — weekend ${weekendLabel(sat, sun)}`,
    body: { contentType: 'HTML', content: html },
    toRecipients: [
      { emailAddress: { address: 'jan@sesam.events' } },
      { emailAddress: { address: 'jan.junior@sesam.events' } },
    ],
  };
}

// ── SCHEDULED: keep /ms365_events fresh ──────────────────
exports.syncOutlook = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Europe/Brussels',
    region: REGION,
    secrets: [MS_CLIENT_SECRET],
  },
  async () => {
    await syncToFirebase(MS_CLIENT_SECRET.value(), MS_MAILBOX.value());
  },
);

// ── HTTP: on-demand "Sync nu" from the planning page ─────
// Reached at /api/refresh-outlook via the Firebase Hosting rewrite.
exports.refreshOutlook = onRequest(
  {
    region: REGION,
    secrets: [MS_CLIENT_SECRET],
    cors: true,
  },
  async (req, res) => {
    try {
      const payload = await syncToFirebase(MS_CLIENT_SECRET.value(), MS_MAILBOX.value());
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, ...payload });
    } catch (e) {
      logger.error('refreshOutlook mislukt', e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
);

// ── HTTP: aanvraag extra foldtables mailen ───────────────
// Aangeroepen door planning.html zodra een weekend boven de eigen foldtables-
// voorraad uitkomt. Bereikbaar op /api/request-foldtables via de Hosting-rewrite.
// Verstuurt — na bevestiging in de browser — een mail naar Jan.
exports.requestFoldtables = onRequest(
  {
    region: REGION,
    secrets: [MS_CLIENT_SECRET],
    cors: true,
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Gebruik POST.' });
      return;
    }
    try {
      const b = req.body || {};
      const weekStart = String(b.weekStart || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        throw new Error('Ongeldige of ontbrekende weekStart (verwacht "YYYY-MM-DD").');
      }
      const capacity = Number(b.capacity) || 60;
      const planned = Number(b.planned) || 0;
      const extra = Number(b.extra) || Math.max(0, planned - capacity);
      if (extra <= 0) {
        throw new Error('Geen tekort — niets te bestellen.');
      }
      const sat = addStr(weekStart, 5);
      const sun = addStr(weekStart, 6);

      const message = buildFoldtableMail({
        sat, sun, planned, capacity, extra,
        items: Array.isArray(b.events) ? b.events : [],
      });
      await sendGraphMail(MS_CLIENT_SECRET.value(), MS_MAILBOX.value(), message);

      logger.info(`Foldtables-aanvraag verstuurd: ${extra} extra voor weekend ${sat}.`);
      res.json({ ok: true, extra, weekend: { sat, sun } });
    } catch (e) {
      logger.error('requestFoldtables mislukt', e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
);
