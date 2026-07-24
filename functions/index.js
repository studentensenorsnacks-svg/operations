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
const { onSchedule } = require('firebase-functions/v2/scheduler');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
const MISTRAL_API_KEY = defineSecret('MISTRAL_API_KEY');

// ── Geplande back-up van de planning ────────────────────────────
// 2×/dag (12u & 17u, Brussel) een volledige momentopname van ft_planning_v1
// naar ft_planning_backup/{tijdstip}. Bewaart de laatste 30 (≈ 2 weken), zodat
// het back-up-venster niet binnen één dag volloopt zoals bij back-up-per-save.
const PLANNING_BACKUP_KEEP = 30;
exports.planningBackup = onSchedule(
  { schedule: '0 12,17 * * *', timeZone: 'Europe/Brussels', region: REGION },
  async () => {
    const snap = await admin.database().ref('ft_planning_v1').once('value');
    const data = snap.val();
    if (data == null) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    await admin.database().ref('ft_planning_backup/' + ts).set(data);
    const allSnap = await admin.database().ref('ft_planning_backup').once('value');
    const keys = Object.keys(allSnap.val() || {}).sort();
    for (let i = 0; i < keys.length - PLANNING_BACKUP_KEEP; i++) {
      await admin.database().ref('ft_planning_backup/' + keys[i]).remove();
    }
  }
);

// ── Weekplanning: e-mailmeldingen ───────────────────────────────
// Instellingen staan in ft_weekplanning_v1/meldingen (beheerd via het
// tabblad "Meldingen" op weekplanning.html): aan, frequentie
// (dagelijks|werkdagen|wekelijks), weekdag, uur, alleenOpen, emails[].
// Draait elk uur; verstuurt alleen op het ingestelde uur/dag en maximaal
// 1× per dag (lastSent-guard). SMTP-gegevens via secrets.
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

const WP_DAG_KEYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const WP_DAG_NAMEN = {
  ma: 'Maandag', di: 'Dinsdag', wo: 'Woensdag', do: 'Donderdag',
  vr: 'Vrijdag', za: 'Zaterdag', zo: 'Zondag',
};

function wpBrusselsNow() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now); // YYYY-MM-DD
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dagKey = WP_DAG_KEYS[(utc.getUTCDay() + 6) % 7];
  // ISO-weeknummer (zelfde logica als op de pagina)
  const x = new Date(utc);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3);
  const jan4 = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((x - jan4) / 86400000 / 7 + ((jan4.getUTCDay() + 6) % 7) / 7);
  const weekKey = x.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  return { dateStr, hour, dagKey, weekKey, week };
}

function wpTakenVoorDag(data, weekKey, dagKey) {
  const wkData = (data.weeks || {})[weekKey] || {};
  const checks = wkData.checks || {};
  const vast = Object.entries((data.taken || {})[dagKey] || {})
    .map(([id, t]) => ({
      naam: t.naam || '', tijd: t.tijd || '',
      volgorde: t.volgorde || 0, af: !!checks[id],
    }))
    .sort((a, b) => a.volgorde - b.volgorde);
  const extra = Object.values((wkData.extra || {})[dagKey] || {})
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .map((t) => ({ naam: (t.naam || '') + ' (extra)', tijd: '', af: !!t.done }));
  return vast.concat(extra);
}

function wpTaakRegel(t) {
  return '  ' + (t.af ? '[x]' : '[ ]') + ' ' + (t.tijd ? t.tijd + '  ' : '') + t.naam;
}

exports.weekplanningMelding = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Europe/Brussels',
    region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS],
  },
  async () => {
    const snap = await admin.database().ref('ft_weekplanning_v1').once('value');
    const data = snap.val() || {};
    const cfg = data.meldingen;
    if (!cfg || !cfg.aan) return;
    const emails = (Array.isArray(cfg.emails) ? cfg.emails : Object.values(cfg.emails || {}))
      .filter((e) => typeof e === 'string' && e.includes('@'));
    if (!emails.length) return;

    const now = wpBrusselsNow();
    if (Number(cfg.uur != null ? cfg.uur : 8) !== now.hour) return;
    const freq = cfg.frequentie || 'dagelijks';
    if (freq === 'werkdagen' && (now.dagKey === 'za' || now.dagKey === 'zo')) return;
    if (freq === 'wekelijks' && now.dagKey !== (cfg.weekdag || 'ma')) return;
    if (cfg.lastSent === now.dateStr) return;

    let onderwerp;
    const regels = [];
    let openCount = 0;

    if (freq === 'wekelijks') {
      onderwerp = 'Weekplanning week ' + now.week + ' — weekoverzicht';
      regels.push('Weekplanning — overzicht week ' + now.week, '');
      for (const k of WP_DAG_KEYS) {
        const taken = wpTakenVoorDag(data, now.weekKey, k);
        openCount += taken.filter((t) => !t.af).length;
        regels.push(WP_DAG_NAMEN[k] + ':');
        regels.push(taken.length ? taken.map(wpTaakRegel).join('\n') : '  (geen taken)');
        regels.push('');
      }
    } else {
      const taken = wpTakenVoorDag(data, now.weekKey, now.dagKey);
      const open = taken.filter((t) => !t.af);
      openCount = open.length;
      onderwerp = 'Weekplanning ' + WP_DAG_NAMEN[now.dagKey].toLowerCase() +
        ' — ' + openCount + ' open ' + (openCount === 1 ? 'taak' : 'taken');
      regels.push('Weekplanning — ' + WP_DAG_NAMEN[now.dagKey] + ' (week ' + now.week + ')', '');
      if (open.length) {
        regels.push('Open taken:', open.map(wpTaakRegel).join('\n'), '');
      }
      const af = taken.filter((t) => t.af);
      if (af.length) {
        regels.push('Al afgevinkt:', af.map(wpTaakRegel).join('\n'), '');
      }
      if (!taken.length) regels.push('Geen taken voor vandaag.', '');
    }

    if (cfg.alleenOpen !== false && openCount === 0) {
      logger.info('weekplanningMelding: geen open taken, mail overgeslagen.');
      return;
    }

    regels.push('Afvinken en bewerken: https://operationssenorsnacks.web.app/weekplanning.html');

    const nodemailer = require('nodemailer');
    const port = Number(SMTP_PORT.value() || 587);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port,
      secure: port === 465,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });
    await transporter.sendMail({
      from: '"Señor Snacks Operations" <' + SMTP_USER.value() + '>',
      to: emails.join(', '),
      subject: onderwerp,
      text: regels.join('\n'),
    });
    await admin.database().ref('ft_weekplanning_v1/meldingen/lastSent').set(now.dateStr);
    logger.info('weekplanningMelding: verstuurd naar ' + emails.join(', '));
  }
);

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
    const rl = await rateLimit(req, 'anthropic', { limit: 60, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({
        error: { message: `Rate limit: max 60 calls/min. Probeer over ${rl.retryAfter}s opnieuw.` },
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

// ── HTTP: Mistral API proxy ─────────────────────────────────────
// Achter /api/mistral. Houdt de Mistral-key serverside en vertaalt het
// Anthropic-verzoekformaat (dat ai-chat.js gebruikt) naar Mistral's
// OpenAI-compatibele chat/completions en het antwoord weer terug, zodat de
// front-end z'n bestaande tool-loop ongewijzigd kan hergebruiken.
function anthropicToMistral(body) {
  const out = [];
  if (body.system) out.push({ role: 'system', content: String(body.system) });
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  for (const m of msgs) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
        id: b.id,
        type: 'function',
        function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
      }));
      const asg = { role: 'assistant', content: text || '' };
      if (toolCalls.length) asg.tool_calls = toolCalls;
      out.push(asg);
    } else {
      // user: kan tool_result-blokken en/of tekst bevatten.
      const results = blocks.filter((b) => b.type === 'tool_result');
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      for (const r of results) {
        out.push({ role: 'tool', tool_call_id: r.tool_use_id, content: String(r.content == null ? '' : r.content) });
      }
      if (text) out.push({ role: 'user', content: text });
    }
  }
  const tools = Array.isArray(body.tools) ? body.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  })) : undefined;
  const req = {
    model: body.model || 'mistral-large-latest',
    max_tokens: body.max_tokens || 2048,
    messages: out,
  };
  if (tools && tools.length) req.tools = tools;
  return req;
}

function mistralToAnthropic(data) {
  const choice = (data.choices && data.choices[0]) || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: String(msg.content) });
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  for (const c of calls) {
    let input = {};
    try { input = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (e) { input = {}; }
    content.push({ type: 'tool_use', id: c.id, name: c.function && c.function.name, input });
  }
  const stop = calls.length ? 'tool_use' : 'end_turn';
  return { role: 'assistant', content, stop_reason: stop, model: data.model };
}

exports.mistralProxy = onRequest(
  {
    region: REGION,
    secrets: [MISTRAL_API_KEY],
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'Gebruik POST.' } });
      return;
    }
    const rl = await rateLimit(req, 'mistral', { limit: 60, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({
        error: { message: `Rate limit: max 60 calls/min. Probeer over ${rl.retryAfter}s opnieuw.` },
      });
      return;
    }
    try {
      const mistralReq = anthropicToMistral(req.body || {});
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + MISTRAL_API_KEY.value(),
        },
        body: JSON.stringify(mistralReq),
      });
      const data = await response.json();
      res.set('Cache-Control', 'no-store');
      if (!response.ok) {
        const m = (data && data.message) || (data && data.error && data.error.message) || 'Mistral-fout.';
        res.status(response.status).json({ error: { message: String(m) } });
        return;
      }
      res.status(200).json(mistralToAnthropic(data));
    } catch (e) {
      logger.error('mistralProxy mislukt', e);
      res.status(500).json({ error: { message: String(e?.message || e) } });
    }
  },
);

// ── HTTP: keuring-attesten proxy ────────────────────────────────
// Achter /api/keuring. De keuringsattesten (gas/elektrisch) wonen als
// publieke statische PDF's op de aparte QR-app (senorkeuringqr.web.app),
// die GEEN CORS-headers stuurt. Daardoor kan de planning (ander domein)
// ze niet rechtstreeks inlezen om te bundelen. Deze proxy haalt ze
// server-side op en stuurt ze met de juiste CORS-headers terug.
//
// Twee modi:
//   ?list=ft036                  → JSON {id, files:[{type:'gas'|'elek', name}]}
//                                  (parset trucks/ft036.html voor de PDF-lijst)
//   ?path=pdfs/ft036_gas_1.pdf   → streamt die ene PDF (application/pdf)
const KEURING_BASE = 'https://senorkeuringqr.web.app';

exports.keuringPdfProxy = onRequest(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Gebruik GET.' });
      return;
    }
    const rl = await rateLimit(req, 'keuring', { limit: 300, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({ error: `Even rustig — probeer over ${rl.retryAfter}s opnieuw.` });
      return;
    }

    try {
      // ── Modus 1: lijst van attesten voor één voertuig ──────────
      const listId = req.query.list;
      if (listId != null) {
        const id = String(listId);
        if (!/^ft[0-9a-z]+$/i.test(id)) {
          res.status(400).json({ error: 'Ongeldig id.' });
          return;
        }
        const page = await fetch(`${KEURING_BASE}/trucks/${id}.html`);
        if (!page.ok) {
          // Geen pagina → geen attesten bekend. Geen fout: lege lijst.
          res.set('Cache-Control', 'public, max-age=300');
          res.status(200).json({ id, files: [] });
          return;
        }
        const html = await page.text();
        // Vind alle verwijzingen naar pdfs/<id>_(gas|elek)_<n>.pdf
        const re = new RegExp(`(${id}_(gas|elek)_\\d+\\.pdf)`, 'gi');
        const seen = new Set();
        const files = [];
        let m;
        while ((m = re.exec(html)) !== null) {
          const name = m[1];
          if (seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          files.push({ type: m[2].toLowerCase() === 'gas' ? 'gas' : 'elek', name });
        }
        res.set('Cache-Control', 'public, max-age=300');
        res.status(200).json({ id, files });
        return;
      }

      // ── Modus 2: één PDF doorsturen ────────────────────────────
      const rawPath = req.query.path;
      if (rawPath == null) {
        res.status(400).json({ error: 'Geef ?list=<id> of ?path=pdfs/<bestand>.pdf' });
        return;
      }
      const path = String(rawPath);
      // Strikt: enkel pdfs/<naam>.pdf, geen submappen, geen ".."
      if (!/^pdfs\/[A-Za-z0-9_.-]+\.pdf$/.test(path) || path.includes('..')) {
        res.status(400).json({ error: 'Ongeldig pad.' });
        return;
      }
      const upstream = await fetch(`${KEURING_BASE}/${path}`);
      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Attest niet gevonden.' });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', 'application/pdf');
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(buf);
    } catch (e) {
      logger.error('keuringPdfProxy mislukt', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
);

// ── HTTP: sandboxed Poets API ───────────────────────────────────
// Powers poets-extern.html. The sandbox page has NO Firebase SDK and
// NO API key in its source: every read/write goes through this proxy,
// which exposes only the minimum needed for poetscrew.
//
// Allowlist = welke trucks gemarkeerd mogen worden. Afgeleid uit de centrale
// truck-vloot (truck-data.js, gesynct vanuit /truck-data.js via
// `node tools/sync-truck-data.js`) — geen handmatige sync meer met de pagina's.
const POETS_TRUCKS = require('./truck-data').poetsTrucks();
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

  // allTrucks: volledige vloot zodat de sandbox-pagina geen eigen kopie nodig heeft.
  return { trucks, priority, history, allTrucks: POETS_TRUCKS };
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
  'personeel',
  'qrcodes', 'poets', 'keuringen', 'vet', 'bestellingen',
  'stroomaanvraag', 'archief', 'eindstock', 'trucks', 'horeca', 'krisdc',
  'fiches',
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
  const ai = !!(request.data && request.data.ai);
  const agent = !!(request.data && request.data.agent);

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
  const claims = { role, finance, ai, agent };
  if (pages) claims.pages = pages;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    role,
    finance,
    ai,
    agent,
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

// Vlag een gebruiker met (of zonder) AI-assistent-toegang. Net als finance
// een losse claim; bewaart rol en overige claims ongemoeid.
exports.setUserAi = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  const ai = !!(request.data && request.data.ai);
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');
  const userRec = await admin.auth().getUser(uid);
  const newClaims = Object.assign({}, userRec.customClaims || {}, { ai });
  await admin.auth().setCustomUserClaims(uid, newClaims);
  return { uid, ai };
});

// Vlag een gebruiker met (of zonder) agent-modus: de AI mag dan handelingen in
// de app uitvoeren (na goedkeuring per stap). Apart recht bovenop 'ai'.
exports.setUserAgent = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const uid = String((request.data && request.data.uid) || '');
  const agent = !!(request.data && request.data.agent);
  if (!uid) throw new HttpsError('invalid-argument', 'uid vereist.');
  const userRec = await admin.auth().getUser(uid);
  const newClaims = Object.assign({}, userRec.customClaims || {}, { agent });
  await admin.auth().setCustomUserClaims(uid, newClaims);
  return { uid, agent };
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
    ai: !!(u.customClaims && u.customClaims.ai),
    agent: !!(u.customClaims && u.customClaims.agent),
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

// ── HTTP: SK Lommel offerte achter een code-gate ─────────────────
// De volledige (gevoelige) offerte wordt server-side bewaard in
// functions/lommel-offer.html en NOOIT statisch geserveerd: de hosting-target
// 'lommel' herschrijft elke route naar deze functie. Zonder geldig, server-
// ondertekend cookie krijgt de bezoeker enkel het inlogscherm te zien — de
// offerte-HTML verlaat de server pas na de juiste code. Een puur front-end
// gate zou de inhoud al meesturen; dit niet.
const LOMMEL_CODE = '1932';
// Server-side HMAC-sleutel: enkel nodig om het auth-cookie te ondertekenen
// zodat het niet client-side te vervalsen is. Leeft alleen in deze (private)
// functiebron, gaat nooit naar de browser.
const LOMMEL_SIGN_KEY = 'lommel-sk-9f4c2e7a8b1d6035e2c9a4f70b8d1e63c5a27f90';
// Firebase Hosting stuurt enkel een cookie met de naam `__session` door naar
// de functie; alle andere cookies worden gestript. Vandaar deze naam.
const LOMMEL_COOKIE = '__session';
const LOMMEL_COOKIE_MAXAGE = 60 * 60 * 12; // 12 uur

let _lommelHtml = null;
function lommelHtml() {
  if (_lommelHtml == null) {
    _lommelHtml = fs.readFileSync(path.join(__dirname, 'lommel-offer.html'), 'utf8');
  }
  return _lommelHtml;
}

function lommelSign(payload) {
  return crypto.createHmac('sha256', LOMMEL_SIGN_KEY).update(payload).digest('hex');
}
function lommelMakeToken() {
  const payload = 'ok.' + Math.floor(Date.now() / 1000);
  return payload + '.' + lommelSign(payload);
}
function lommelValidToken(tok) {
  if (!tok || typeof tok !== 'string') return false;
  const i = tok.lastIndexOf('.');
  if (i < 0) return false;
  const payload = tok.slice(0, i);
  const sig = tok.slice(i + 1);
  const expect = lommelSign(payload);
  if (sig.length !== expect.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}
function lommelParseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}
function lommelLoginPage(error) {
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Señor Snacks · Offerte SK Lommel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#08231A;font-family:'Inter',system-ui,sans-serif;color:#F4F1EA;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:360px;text-align:center}
.kick{font-size:10.5px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#8FE3B5;margin-bottom:14px}
h1{font-family:'Bebas Neue',sans-serif;font-size:40px;line-height:.95;letter-spacing:.02em;color:#F4F1EA;margin-bottom:6px}
p.sub{font-size:13px;color:rgba(244,241,234,.6);margin-bottom:26px;line-height:1.5}
form{display:flex;flex-direction:column;gap:12px}
input{background:rgba(255,255,255,.06);border:1px solid rgba(143,227,181,.32);border-radius:10px;padding:14px 16px;font-size:18px;letter-spacing:.25em;text-align:center;color:#F4F1EA;font-family:'Bebas Neue',sans-serif;outline:none}
input:focus{border-color:#8FE3B5}
button{background:#8FE3B5;color:#08231A;border:0;border-radius:10px;padding:13px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
button:hover{background:#a5ecc4}
.err{color:#ffb4a8;font-size:12.5px;margin-bottom:14px;min-height:16px}
.foot{margin-top:24px;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(244,241,234,.4)}
</style></head><body>
<div class="card">
  <div class="kick">Vertrouwelijk · Toegang vereist</div>
  <h1>Offerte SK Lommel</h1>
  <p class="sub">Deze offerte is beveiligd. Voer de toegangscode in om verder te gaan.</p>
  ${error ? '<div class="err">Onjuiste code. Probeer opnieuw.</div>' : '<div class="err"></div>'}
  <form method="POST" action="">
    <input name="code" type="password" inputmode="numeric" autocomplete="off" autofocus placeholder="• • • •" aria-label="Toegangscode">
    <button type="submit">Toegang</button>
  </form>
  <div class="foot">Señor Snacks · Taste — Enjoy — Smile</div>
</div>
</body></html>`;
}

exports.lommelOffer = onRequest({ region: REGION, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');

  const cookies = lommelParseCookies(req);
  // Reeds geauthenticeerd → serveer de offerte.
  if (lommelValidToken(cookies[LOMMEL_COOKIE])) {
    res.status(200).type('html').send(lommelHtml());
    return;
  }

  // Code-inzending.
  if (req.method === 'POST') {
    const rl = await rateLimit(req, 'lommelGate', { limit: 12, windowSec: 300 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).type('html').send(lommelLoginPage(true));
      return;
    }
    let code = '';
    if (req.body && typeof req.body === 'object') code = String(req.body.code || '');
    else if (typeof req.body === 'string') {
      const m = /(?:^|&)code=([^&]*)/.exec(req.body);
      code = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }
    code = code.trim();
    if (code === LOMMEL_CODE) {
      res.set('Set-Cookie',
        `${LOMMEL_COOKIE}=${lommelMakeToken()}; Max-Age=${LOMMEL_COOKIE_MAXAGE}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      res.status(200).type('html').send(lommelHtml());
      return;
    }
    res.status(401).type('html').send(lommelLoginPage(true));
    return;
  }

  // Geen geldig cookie → inlogscherm.
  res.status(200).type('html').send(lommelLoginPage(false));
});

// ── HTTP: Señor Snacks klant-offertes (generieke code-gate) ──────
// Elke klant-offerte krijgt een geheime URL onder senorsnacks-offertes.web.app
// en zit achter een code-gate. Net als de Lommel-gate hierboven wordt de
// (gevoelige) offerte-HTML server-side bewaard en verlaat ze de server pas na
// de juiste code — een puur front-end gate zou de inhoud al meesturen.
//
// Een nieuwe offerte toevoegen = één regel in OFFERS + het HTML-bestand onder
// functions/offers/. Het auth-cookie is per offerte gescopet (Path + id in het
// ondertekende token), zodat toegang tot de ene offerte geen andere ontsluit.
const OFFER_SIGN_KEY = 'ss-offertes-6d2a91f4c7b0e58a3f19d64c2b7e0a85f3c1d9b62e40a7c58';
const OFFER_COOKIE = '__session'; // Firebase Hosting stuurt enkel deze cookie door.
const OFFER_COOKIE_MAXAGE = 60 * 60 * 12; // 12 uur

// Registry: pad (lowercase, zonder trailing slash) → offerte.
const OFFERS = {
  '/offerte-senorsnacks-jadaevents27020': {
    id: 'jadaevents27020',
    code: '014',
    file: 'offers/jadaevents27020.html',
    title: 'Offerte JADA Events',
  },
  // Detail-offerte als sub-pad. Deelt id + code met de landing hierboven, zodat
  // één keer de code invoeren op de landing ook deze pagina ontsluit: de cookie
  // wordt op Path=/offerte-senorsnacks-jadaevents27020 gezet en dekt dit sub-pad.
  '/offerte-senorsnacks-jadaevents27020/familiedag': {
    id: 'jadaevents27020',
    code: '014',
    file: 'offers/jadaevents27020-familiedag.html',
    title: 'Offerte JADA Events · Familiedag 27 020',
  },
};

function offerLookup(pathname) {
  const key = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  return OFFERS[key] || null;
}

const _offerHtmlCache = {};
function offerHtml(file) {
  if (_offerHtmlCache[file] == null) {
    _offerHtmlCache[file] = fs.readFileSync(path.join(__dirname, file), 'utf8');
  }
  return _offerHtmlCache[file];
}

function offerSign(payload) {
  return crypto.createHmac('sha256', OFFER_SIGN_KEY).update(payload).digest('hex');
}
function offerMakeToken(id) {
  const payload = id + '.' + Math.floor(Date.now() / 1000);
  return payload + '.' + offerSign(payload);
}
function offerValidToken(tok, id) {
  if (!tok || typeof tok !== 'string') return false;
  const i = tok.lastIndexOf('.');
  if (i < 0) return false;
  const payload = tok.slice(0, i);
  if (!payload.startsWith(id + '.')) return false; // token hoort bij déze offerte
  const sig = tok.slice(i + 1);
  const expect = offerSign(payload);
  if (sig.length !== expect.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}
function offerParseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}
function offerLoginPage(title, error) {
  // Señor Snacks huisstijl: Deep Black basis, Snack Red als signaal,
  // Anton (display) + Montserrat (tekst).
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Señor Snacks · ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#030304;font-family:'Montserrat',system-ui,sans-serif;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.bar{position:fixed;top:0;left:0;right:0;height:6px;background:#E6173B}
.card{width:100%;max-width:370px;text-align:center}
.wordmark{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:22px}
.wordmark .n{color:#E6173B}
.kick{font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#E6173B;margin-bottom:12px}
h1{font-family:'Anton',sans-serif;font-weight:400;font-size:44px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;margin-bottom:10px}
p.sub{font-size:13.5px;color:#b9b9bc;margin-bottom:24px;line-height:1.5}
form{display:flex;flex-direction:column;gap:12px}
input{background:#111112;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:15px 16px;font-size:20px;letter-spacing:.35em;text-align:center;color:#fff;font-family:'Anton',sans-serif;outline:none}
input:focus{border-color:#E6173B}
button{background:#E6173B;color:#fff;border:0;border-radius:10px;padding:14px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:background .15s}
button:hover{background:#c5122f}
.err{color:#ff6b81;font-size:12.5px;margin-bottom:14px;min-height:16px}
.foot{margin-top:26px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#6a6a6d}
</style></head><body>
<div class="bar"></div>
<div class="card">
  <div class="wordmark">SE<span class="n">Ñ</span>OR&nbsp;SNACKS</div>
  <div class="kick">Vertrouwelijk · Toegang vereist</div>
  <h1>${title}</h1>
  <p class="sub">Deze offerte is beveiligd. Voer de toegangscode in om verder te gaan.</p>
  ${error ? '<div class="err">Onjuiste code. Probeer opnieuw.</div>' : '<div class="err"></div>'}
  <form method="POST" action="">
    <input name="code" type="password" inputmode="numeric" autocomplete="off" autofocus placeholder="• • • •" aria-label="Toegangscode">
    <button type="submit">Toegang</button>
  </form>
  <div class="foot">Taste · Enjoy · Smile</div>
</div>
</body></html>`;
}

exports.offerteRouter = onRequest({ region: REGION, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');

  const offer = offerLookup(req.path);
  if (!offer) {
    res.status(404).type('html').send(offerLoginPage('Offerte niet gevonden', false));
    return;
  }
  const cookiePath = (req.path || '/').replace(/\/+$/, '') || '/';

  const cookies = offerParseCookies(req);
  // Reeds geauthenticeerd voor déze offerte → serveer ze.
  if (offerValidToken(cookies[OFFER_COOKIE], offer.id)) {
    res.status(200).type('html').send(offerHtml(offer.file));
    return;
  }

  // Code-inzending.
  if (req.method === 'POST') {
    const rl = await rateLimit(req, `offerGate_${offer.id}`, { limit: 12, windowSec: 300 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).type('html').send(offerLoginPage(offer.title, true));
      return;
    }
    let code = '';
    if (req.body && typeof req.body === 'object') code = String(req.body.code || '');
    else if (typeof req.body === 'string') {
      const m = /(?:^|&)code=([^&]*)/.exec(req.body);
      code = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }
    code = code.trim();
    if (code === offer.code) {
      res.set('Set-Cookie',
        `${OFFER_COOKIE}=${offerMakeToken(offer.id)}; Max-Age=${OFFER_COOKIE_MAXAGE}; Path=${cookiePath}; HttpOnly; Secure; SameSite=Lax`);
      res.status(200).type('html').send(offerHtml(offer.file));
      return;
    }
    res.status(401).type('html').send(offerLoginPage(offer.title, true));
    return;
  }

  // Geen geldig cookie → inlogscherm.
  res.status(200).type('html').send(offerLoginPage(offer.title, false));
});

// ── HTTP: VIES btw-nummer lookup (voor FrietFlow) ─────────────────
// De EU VIES REST-dienst geeft bij een geldig btw-nummer de officiële
// bedrijfsnaam en het adres terug, maar stuurt geen CORS-headers — vandaar
// deze kleine proxy. Response: { valid, name, address }.
exports.viesLookup = onRequest(
  { region: REGION, cors: ['https://frietflow.web.app', 'http://localhost:5000'] },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rl = await rateLimit(req, 'viesLookup', { limit: 20, windowSec: 60 });
    if (rl) {
      res.set('Retry-After', String(rl.retryAfter));
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    const vat = String(req.query.vat || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const m = /^([A-Z]{2})([0-9A-Z]{2,12})$/.exec(vat);
    if (!m) {
      res.status(400).json({ error: 'invalid_format' });
      return;
    }
    try {
      const r = await fetch(
        `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${m[1]}/vat/${m[2]}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) throw new Error('vies_status_' + r.status);
      const j = await r.json();
      res.json({
        valid: j.isValid === true,
        name: j.name && j.name !== '---' ? j.name : '',
        address: j.address && j.address !== '---' ? j.address : '',
      });
    } catch (e) {
      logger.warn('viesLookup failed', { message: e.message });
      res.status(502).json({ error: 'vies_unavailable' });
    }
  }
);
