/**
 * Cloud Functions for the Señor Snacks operations tool.
 *
 *   anthropicProxy - HTTP endpoint behind /api/anthropic. Forwards calls to
 *                    the Anthropic API so the API key stays server-side.
 *
 *   poetsApi       - HTTP endpoint behind /api/poets. Powers the sandboxed
 *                    poets-extern.html page: read poets state + mark trucks
 *                    as cleaned. Page itself never touches Firebase, so the
 *                    project's API key is not shipped to that audience.
 *
 * Both endpoints are rate-limited per IP via the project's Realtime Database.
 *
 * Note: the Microsoft 365 calendar sync runs entirely client-side in the
 * browser (MSAL) — there is deliberately no Cloud Function for it.
 */
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: 'https://operationssenorsnacks-default-rtdb.europe-west1.firebasedatabase.app',
  });
}

const REGION = 'europe-west1';

const ALLOWED_ORIGINS = [
  'https://operationssenorsnacks.web.app',
  'https://operationssenorsnacks.firebaseapp.com',
];

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// ── Rate limiter ────────────────────────────────────────────────
// Fixed-window counter per (endpoint, ip), persisted in RTDB so it
// survives across function instances. Returns null on success, or
// {status, retryAfter} when the caller has exhausted its budget.
async function rateLimit(req, endpoint, { limit, windowSec }) {
  const rawIp = (
    req.headers['x-forwarded-for'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown'
  ).toString().split(',')[0].trim();
  const ipKey = rawIp.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 64) || 'unknown';
  const ref = admin.database().ref(`_rateLimits/${endpoint}/${ipKey}`);
  const now = Date.now();
  const winMs = windowSec * 1000;
  const tx = await ref.transaction((cur) => {
    if (!cur || (now - (cur.ts || 0)) > winMs) {
      return { ts: now, count: 1 };
    }
    return { ts: cur.ts, count: (cur.count || 0) + 1 };
  });
  const val = tx.snapshot.val();
  if (val && val.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((winMs - (now - val.ts)) / 1000));
    return { retryAfter };
  }
  return null;
}

// ── HTTP: Anthropic API proxy ────────────────────────────────────
exports.anthropicProxy = onRequest(
  {
    region: REGION,
    secrets: [ANTHROPIC_API_KEY],
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'Gebruik POST.' } });
      return;
    }
    const rl = await rateLimit(req, 'anthropic', { limit: 20, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({
        error: { message: `Rate limit: max 20 calls/min. Probeer over ${rl.retryAfter}s opnieuw.` },
      });
      return;
    }
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.set('Cache-Control', 'no-store');
      res.status(response.status).json(data);
    } catch (e) {
      logger.error('anthropicProxy mislukt', e);
      res.status(500).json({ error: { message: String(e?.message || e) } });
    }
  },
);

// ── HTTP: sandboxed Poets API ───────────────────────────────────
// Powers poets-extern.html. The sandbox page has NO Firebase SDK and
// NO API key in its source: every read/write goes through this proxy,
// which exposes only the minimum needed for poetscrew.
//
// Allowlist is the source-of-truth for which trucks can be marked.
// Keep in sync with ALL_TRUCKS in poets.html / checkin.html.
const POETS_TRUCKS = [
  'Bicky Burger Wagen 201','Food Wagen (Snackmuur) 305','Food container (Friet) C201','Food container (Friet-2_Vallen) C203',
  'Friet Container (Postel) 501','Friet Wagen (HR-ketel) 502','Friet Wagen 304','Friet Wagen 402','Friet Wagen 403',
  'Friet Wagen 503','Friet Wagen 504','Friet Wagen 801','Friet Wagen 802','Friet Wagen 803','Friet Wagen 804',
  'Friet Wagen 805','Friet Wagen 806','Friet Wagen 901',
  'Food container (Hamburger) C202','Hamburger Container 12','Hamburger Container 13','Hamburger Wagen (Kiosk) 14',
  'Hamburger Wagen 202','Hamburger Wagen 306',
  'Pasta Wagen 11','Pizza en Broodjes Wagen 21','Pizza en Broodjes Wagen 22','Pizza en Pasta Container 23','Food container (Pasta) C105',
  'Ijs Wagen (Humbaur Ola) 51','Ijs Wagen (Kermis Ola) 52','Sweet corner Container 55','Sweet corner Wagen (Humbaur) 54','Sweetcorner Wagen (Kiosk) 53',
  'Tap Wagen (Dubble-as) 42','Tap Wagen (Klein) 44','Tap Wagen 43',
  'Brascheria 1','Fiat 404','Jumper 302',
  'Bureau container 71','Bureau container 72','Food container (4 Pot) C206','Food container (Berging en Dampkap) C209',
  'Food container (Dampkap) C205','Food container (Met koeling) C103','Food container (Met koeling) C107',
  'Food container (Met koeling) C108','Food container (Met koeling en Dampkap) C207','Food container (Met koeling en Dampkap) C208',
  'Food container (Snackmuur) C110','Food container (Zonder koeling) C101','Food container (Zonder koeling) C102',
  'Food container (Zonder koeling) C104','Food container C106','Food container C109','Food container C204',
  'Kassa units','Koelaanhangwagen 61','Koelcontainer 63','Stockage container S101','Stockage container S102',
];
const POETS_TRUCK_SET = new Set(POETS_TRUCKS);
const HISTORY_LIMIT = 500;

function nlDate(d) { return d.toLocaleDateString('nl-NL'); }
function nlTime(d) { return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }

async function getPoetsState() {
  const [opsSnap, prioSnap, histSnap] = await Promise.all([
    admin.database().ref('ft_ops_v2').once('value'),
    admin.database().ref('ft_priority_v1').once('value'),
    admin.database().ref('ft_poets_history').once('value'),
  ]);

  // Compress ft_ops_v2 down to latest entry per truck — no defect text,
  // no logs, no notes leave the server. Only what the sandbox needs.
  const opsRaw = opsSnap.val() || {};
  const all = (Array.isArray(opsRaw) ? opsRaw : Object.values(opsRaw))
    .filter((c) => c && c.id && c.truck);
  const latestByTruck = {};
  for (const c of all) {
    const prev = latestByTruck[c.truck];
    if (!prev || (c.timestamp || 0) > (prev.timestamp || 0)) {
      latestByTruck[c.truck] = c;
    }
  }
  const trucks = {};
  for (const [truck, c] of Object.entries(latestByTruck)) {
    if (!POETS_TRUCK_SET.has(truck)) continue;
    const statuses = Array.isArray(c.statuses) ? c.statuses : [];
    let status = 'unknown';
    if (statuses.includes('niet-gepoetst')) status = 'dirty';
    else if (statuses.includes('gepoetst')) status = 'clean';
    trucks[truck] = {
      status,
      date: typeof c.date === 'string' ? c.date.slice(0, 20) : '',
      time: typeof c.time === 'string' ? c.time.slice(0, 10) : '',
      employee: typeof c.employee === 'string' ? c.employee.slice(0, 40) : '',
      timestamp: Number(c.timestamp) || 0,
    };
  }

  const prioRaw = prioSnap.val() || {};
  const priority = {};
  Object.keys(prioRaw).forEach((k) => {
    const e = prioRaw[k];
    if (e && e.priority === true) {
      const t = (e.truck || k);
      if (POETS_TRUCK_SET.has(t)) priority[t] = true;
    }
  });

  const histRaw = histSnap.val() || {};
  const history = Object.keys(histRaw)
    .map((k) => ({
      truck: histRaw[k]?.truck || '',
      cleanedAt: Number(histRaw[k]?.cleanedAt) || 0,
    }))
    .filter((h) => h.truck && h.cleanedAt && POETS_TRUCK_SET.has(h.truck))
    .sort((a, b) => b.cleanedAt - a.cleanedAt)
    .slice(0, HISTORY_LIMIT);

  return { trucks, priority, history };
}

async function markTruckClean(truck) {
  const opsSnap = await admin.database().ref('ft_ops_v2').once('value');
  const opsRaw = opsSnap.val() || {};
  const all = (Array.isArray(opsRaw) ? opsRaw : Object.values(opsRaw))
    .filter((c) => c && c.id && c.truck === truck)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const latest = all[0];
  const now = new Date();
  const stamp = `${nlDate(now)} ${nlTime(now)}`;

  if (latest) {
    const updated = { ...latest };
    updated.statuses = (updated.statuses || []).filter((s) => s !== 'niet-gepoetst');
    if (!updated.statuses.includes('gepoetst')) updated.statuses.push('gepoetst');
    updated.log = updated.log || [];
    updated.log.push(`${stamp} — gepoetst gemarkeerd via Poets-sandbox`);
    updated.cleanedAt = now.getTime();
    await admin.database().ref('ft_ops_v2/' + updated.id).set(updated);
  } else {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const entry = {
      id, truck, employee: 'Poets-sandbox',
      truckType: 'overig', truckStatus: 'beschikbaar',
      statuses: ['gepoetst'], hasDefect: false,
      defectWat: '', defectText: '', notes: '',
      date: nlDate(now), time: nlTime(now),
      timestamp: now.getTime(), cleanedAt: now.getTime(), log: [],
    };
    await admin.database().ref('ft_ops_v2/' + id).set(entry);
  }
  await admin.database().ref('ft_poets_history').push({ truck, cleanedAt: now.getTime() });
}

exports.poetsApi = onRequest(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Gebruik POST.' });
      return;
    }
    const rl = await rateLimit(req, 'poets', { limit: 60, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({ error: `Rate limit: max 60 calls/min. Wacht ${rl.retryAfter}s.` });
      return;
    }
    const body = req.body || {};
    const action = String(body.action || '');

    try {
      if (action === 'state') {
        const state = await getPoetsState();
        res.set('Cache-Control', 'no-store');
        res.json(state);
        return;
      }

      if (action === 'mark-clean') {
        const truck = String(body.truck || '').trim();
        if (!truck || truck.length > 80 || !POETS_TRUCK_SET.has(truck)) {
          res.status(400).json({ error: 'Onbekende of ongeldige truck.' });
          return;
        }
        await markTruckClean(truck);
        res.set('Cache-Control', 'no-store');
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Onbekende action.' });
    } catch (e) {
      logger.error('poetsApi mislukt', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
);

// ── HTTP: sandboxed Vettonnen API ───────────────────────────────
// Powers vet-tonnen-extern.html. Read-only: returns the current barrel
// counter. No writes — the internal vet.html keeps writing directly to
// RTDB. Page itself has no Firebase SDK or API key in its source.
exports.vetTonnenApi = onRequest(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 15,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Gebruik GET of POST.' });
      return;
    }
    const rl = await rateLimit(req, 'vetTonnen', { limit: 60, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({ error: `Rate limit: max 60 calls/min. Wacht ${rl.retryAfter}s.` });
      return;
    }
    try {
      const snap = await admin.database().ref('vet_tonnen').once('value');
      const d = snap.val() || {};
      res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
      res.json({
        groot: Number(d.groot) || 0,
        klein: Number(d.klein) || 0,
        updatedAt: Number(d.updatedAt) || 0,
      });
    } catch (e) {
      logger.error('vetTonnenApi mislukt', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
);

// EventFlow SaaS portal proxy lives in ../functions-saas/ — deployed
// to the senorkeuringqr project separately to avoid mixing secrets.

// ── User / role management ──────────────────────────────────────
// Callable functions voor admins om users + rollen te beheren. Rollen
// zitten als Firebase Auth custom claims (auth.token.role) zodat
// RTDB- en Storage-regels ze meteen zien zonder extra read.
//
// Rollen:
//   admin     - alles, incl. user-beheer
//   manager   - alle operationele pagina's schrijven, geen user-beheer
//   medewerker- operationele writes (checkin, eindstock, poets, notities, …)
//   viewer    - alleen lezen
const VALID_ROLES = ['admin', 'manager', 'medewerker', 'viewer', 'bakker', 'custom'];

// Tabs die een 'custom'-user kan krijgen. Page-codes zijn ook hoe ze
// gecodeerd worden in de Auth-claim 'pages' (pipe-delimited:
// "|notities|checkin|qrcodes|"). Houd ze kort en strikt zonder
// substring-overlap zodat de RTDB-rule .contains('|x|') uniek is.
const VALID_PAGES = [
  'notities', 'checkin', 'planning', 'laadlijsten', 'ops',
  'qrcodes', 'poets', 'keuringen', 'vet', 'bestellingen',
  'stroomaanvraag', 'archief', 'eindstock', 'trucks', 'horeca',
];

function buildPagesClaim(pages) {
  if (!Array.isArray(pages)) return '';
  const set = new Set();
  pages.forEach((p) => {
    const s = String(p || '').trim().toLowerCase();
    if (VALID_PAGES.indexOf(s) !== -1) set.add(s);
  });
  if (!set.size) return '';
  return '|' + Array.from(set).join('|') + '|';
}
const BOOTSTRAP_ADMIN_EMAIL = 'jelle@senorsnacks.be';

function requireAdmin(request) {
  const uid = request.auth && request.auth.uid;
  const role = request.auth && request.auth.token && request.auth.token.role;
  if (!uid || role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin-rechten vereist.');
  }
  return uid;
}

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'Rol moet één van: ' + VALID_ROLES.join(', '));
  }
  return role;
}

// Eenmalige bootstrap: pak admin-rol voor het hardgecodeerde e-mailadres
// als er nog géén admin bestaat. Daarna kan deze functie niets meer doen.
exports.bootstrapAdmin = onCall({ region: REGION }, async (request) => {
  const uid = request.auth && request.auth.uid;
  const email = request.auth && request.auth.token && request.auth.token.email;
  if (!uid) throw new HttpsError('unauthenticated', 'Log eerst in.');
  if (email !== BOOTSTRAP_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied',
      'Initiële admin moet ' + BOOTSTRAP_ADMIN_EMAIL + ' zijn.');
  }
  // Bestaat er al een admin? Dan dicht.
  const list = await admin.auth().listUsers(1000);
  const existing = list.users.find((u) => u.customClaims && u.customClaims.role === 'admin');
  if (existing) {
    throw new HttpsError('failed-precondition',
      'Er is al een admin (' + (existing.email || existing.uid) + '). Vraag die om je rol toe te kennen.');
  }
  await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
  logger.info('bootstrapAdmin: ' + email + ' gepromoveerd tot admin.');
  return { uid, role: 'admin' };
});

exports.createUser = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const email = String((request.data && request.data.email) || '').trim().toLowerCase();
  const password = String((request.data && request.data.password) || '');
  const displayName = String((request.data && request.data.displayName) || '').trim();
  const role = validateRole(request.data && request.data.role);
  const finance = !!(request.data && request.data.finance);

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Geldig e-mailadres vereist.');
  }
  if (password && password.length < 8) {
    throw new HttpsError('invalid-argument', 'Wachtwoord moet minstens 8 karakters zijn.');
  }

  const createProps = { email, emailVerified: true };
  if (password) createProps.password = password;
  if (displayName) createProps.displayName = displayName;

  let user;
  try {
    user = await admin.auth().createUser(createProps);
  } catch (e) {
    throw new HttpsError('already-exists', e && e.message ? e.message : String(e));
  }
  const pages = buildPagesClaim(request.data && request.data.pages);
  const claims = { role, finance };
  if (pages) claims.pages = pages;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    role,
    finance,
    pages,
  };
});

// Pas de toegankelijke tabs aan voor een custom-rol gebruiker.
// pages: array van page-codes (zie VALID_PAGES). Wordt opgeslagen als
// pipe-delimited string '|x|y|' in de Auth-claim 'pages'.
exports.setUserPages = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  const pages = buildPagesClaim(request.data && request.data.pages);
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');
  const userRec = await admin.auth().getUser(uid);
  const newClaims = Object.assign({}, userRec.customClaims || {}, { pages });
  await admin.auth().setCustomUserClaims(uid, newClaims);
  return { uid, pages };
});

// Vlag een gebruiker met (of zonder) finance-toegang. Bewaart de rol
// en eventuele andere bestaande claims ongemoeid.
exports.setUserFinance = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  const finance = !!(request.data && request.data.finance);
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');
  const userRec = await admin.auth().getUser(uid);
  const newClaims = Object.assign({}, userRec.customClaims || {}, { finance });
  await admin.auth().setCustomUserClaims(uid, newClaims);
  return { uid, finance };
});

exports.setUserRole = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  const role = validateRole(request.data && request.data.role);
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');

  // Voorkom dat de laatste admin zichzelf degradeert.
  if (uid === adminUid && role !== 'admin') {
    const list = await admin.auth().listUsers(1000);
    const others = list.users.filter(
      (u) => u.uid !== adminUid && u.customClaims && u.customClaims.role === 'admin',
    );
    if (others.length === 0) {
      throw new HttpsError('failed-precondition',
        'Kan jezelf niet degraderen — er moet minstens 1 admin overblijven.');
    }
  }

  const userRec = await admin.auth().getUser(uid);
  const newClaims = Object.assign({}, userRec.customClaims || {}, { role });
  await admin.auth().setCustomUserClaims(uid, newClaims);
  return { uid, role };
});

exports.listUsers = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const result = await admin.auth().listUsers(1000);
  const users = result.users.map((u) => {
    const pagesStr = (u.customClaims && u.customClaims.pages) || '';
    const pages = typeof pagesStr === 'string' && pagesStr.indexOf('|') === 0
      ? pagesStr.replace(/^\|/, '').replace(/\|$/, '').split('|').filter(Boolean)
      : [];
    return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    role: (u.customClaims && u.customClaims.role) || null,
    finance: !!(u.customClaims && u.customClaims.finance),
    pages: pages,
    disabled: !!u.disabled,
    providers: (u.providerData || []).map((p) => p.providerId),
    lastSignInAt: u.metadata && u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).getTime() : 0,
    createdAt: u.metadata && u.metadata.creationTime
      ? new Date(u.metadata.creationTime).getTime() : 0,
    };
  });
  // Sorteer: admins eerst, dan op recentste login.
  users.sort((a, b) => {
    const ra = a.role === 'admin' ? 0 : 1;
    const rb = b.role === 'admin' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (b.lastSignInAt || 0) - (a.lastSignInAt || 0);
  });
  return { users };
});

// One-shot HTTP endpoint om de initiële admin met password aan te maken,
// alleen bruikbaar zolang er nog GEEN admin bestaat. Daarna geeft hij 409.
// Hardgecodeerd op BOOTSTRAP_ADMIN_EMAIL — past geen andere users aan.
exports.bootstrapEmailAdmin = onRequest(
  { region: REGION, cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    const password = (req.body && req.body.password) || '';
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Geldig password vereist (min 8 chars).' });
      return;
    }
    try {
      const list = await admin.auth().listUsers(1000);
      const existingAdmin = list.users.find(
        (u) => u.customClaims && u.customClaims.role === 'admin',
      );
      if (existingAdmin) {
        res.status(409).json({
          error: 'Er bestaat al een admin.',
          existing: existingAdmin.email || existingAdmin.uid,
        });
        return;
      }
      let user;
      try {
        user = await admin.auth().getUserByEmail(BOOTSTRAP_ADMIN_EMAIL);
        await admin.auth().updateUser(user.uid, {
          password,
          emailVerified: true,
        });
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
        user = await admin.auth().createUser({
          email: BOOTSTRAP_ADMIN_EMAIL,
          password,
          displayName: 'Jelle Verboven',
          emailVerified: true,
        });
      }
      await admin.auth().setCustomUserClaims(user.uid, {
        ...(user.customClaims || {}),
        role: 'admin',
      });
      logger.info('bootstrapEmailAdmin: ' + BOOTSTRAP_ADMIN_EMAIL + ' is nu admin.');
      res.json({ ok: true, uid: user.uid, email: user.email });
    } catch (e) {
      logger.error('bootstrapEmailAdmin error', e);
      res.status(500).json({ error: e && e.message ? e.message : String(e) });
    }
  },
);

exports.deleteUser = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');
  if (uid === adminUid) throw new HttpsError('failed-precondition', 'Kan jezelf niet verwijderen.');
  await admin.auth().deleteUser(uid);
  return { uid };
});
