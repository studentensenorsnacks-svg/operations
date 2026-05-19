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
