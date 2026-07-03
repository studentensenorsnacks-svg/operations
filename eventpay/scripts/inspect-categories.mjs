// Dev-only introspectie: logt in op de EventPay admin (Livewire) en dumpt
// alles wat we nodig hebben om de "categorie aanmaken"-flow na te bouwen.
//
// Gebruik:
//   1. Zet in eventpay/.env.local:
//        EVENTPAY_BASE_URL=https://senor-snacks.eventpay.be
//        EVENTPAY_ADMIN_EMAIL=...
//        EVENTPAY_ADMIN_PASSWORD=...
//   2. node scripts/inspect-categories.mjs
//
// Het script verandert NIETS op EventPay — het leest enkel pagina's en print
// de Livewire-componenten, hun snapshot-namen en alle wire:click-methodes
// (vooral die met "categor" / "cat" erin). Daarmee leiden we de echte
// wizard-stappen af, net zoals createSector ze gebruikt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = join(__dirname, '..', '.env.local');
  let txt = '';
  try {
    txt = readFileSync(path, 'utf8');
  } catch {
    console.error(`\n✗ ${path} niet gevonden. Maak het aan met EVENTPAY_BASE_URL/EMAIL/PASSWORD.\n`);
    process.exit(1);
  }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

loadEnvLocal();

const baseUrl = (process.env.EVENTPAY_BASE_URL || '').replace(/\/$/, '');
const email = process.env.EVENTPAY_ADMIN_EMAIL;
const password = process.env.EVENTPAY_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) {
  console.error('\n✗ EVENTPAY_BASE_URL, EVENTPAY_ADMIN_EMAIL en EVENTPAY_ADMIN_PASSWORD moeten in .env.local staan.\n');
  process.exit(1);
}

const cookies = new Map();
function cookieHeader() {
  return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}
function mergeSetCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const sc of raw) {
    const sep = sc.indexOf(';');
    const pair = sep >= 0 ? sc.slice(0, sep) : sc;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === '' || value === 'deleted') cookies.delete(name);
    else cookies.set(name, value);
  }
}
async function jar(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const ch = cookieHeader();
  if (ch) headers.set('Cookie', ch);
  if (!headers.has('User-Agent')) headers.set('User-Agent', 'EventPay-inspect/0.1');
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  mergeSetCookies(res);
  return res;
}
function csrf(html) {
  const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('CSRF-token niet gevonden');
  return m[1];
}
function htmlDecode(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

async function login() {
  const r1 = await jar(`${baseUrl}/login`, { method: 'GET' });
  const html1 = await r1.text();
  const token = csrf(html1);
  const form = new URLSearchParams();
  form.set('_token', token);
  form.set('email', email);
  form.set('password', password);
  const r2 = await jar(`${baseUrl}/login`, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (r2.status !== 302) throw new Error(`Login verwacht 302, kreeg ${r2.status} — kloppen de creds?`);
  const r3 = await jar(`${baseUrl}/dashboard`, { method: 'GET' });
  const loc = r3.headers.get('location') ?? '';
  const m = loc.match(/\/dashboard\/(\d+)\//);
  if (!m) throw new Error(`event_id niet gevonden in redirect: ${loc}`);
  return m[1];
}

function dumpPage(label, html) {
  console.log(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}`);

  // 1. Livewire-componenten (snapshot memo.name)
  const comps = new Set();
  const snapRe = /wire:snapshot="([^"]+)"/g;
  let m;
  while ((m = snapRe.exec(html)) !== null) {
    const dec = htmlDecode(m[1]);
    const nm = dec.match(/"name":"([^"]+)"/);
    if (nm) comps.add(nm[1]);
  }
  console.log('\n• Livewire-componenten op deze pagina:');
  for (const c of comps) console.log('    -', c);

  // 2. Alle wire:click-methodes
  const methods = new Set();
  const clickRe = /wire:click(?:\.[a-z]+)?="([^"]+)"/g;
  while ((m = clickRe.exec(html)) !== null) methods.add(m[1]);
  console.log('\n• Alle wire:click handlers:');
  for (const c of [...methods].sort()) console.log('    -', c);

  // 3. Category-gerichte hints
  console.log('\n• Category-gerelateerde handlers/strings:');
  for (const c of methods) {
    if (/categor|\bcat\b|categorie/i.test(c)) console.log('    wire:click ->', c);
  }
  const wireModel = new Set();
  const modelRe = /wire:model(?:\.[a-z]+)?="([^"]+)"/g;
  while ((m = modelRe.exec(html)) !== null) {
    if (/categor|cat/i.test(modelRe.lastIndex ? m[1] : m[1])) wireModel.add(m[1]);
  }
  for (const c of wireModel) console.log('    wire:model ->', c);

  // 4. window.* JS-config vars (zoals window.optionsformsectors bij sectoren)
  const win = html.match(/window\.[A-Za-z0-9_]+\s*=/g) ?? [];
  console.log('\n• window.* config-vars:', [...new Set(win)].join(', ') || '(geen)');
}

(async () => {
  console.log('→ Inloggen op', baseUrl, 'als', email, '…');
  const eventId = await login();
  console.log('✓ Ingelogd, event_id =', eventId);

  const pages = [
    ['SECTORS-PAGINA', `${baseUrl}/dashboard/${eventId}/sectors`],
    ['PRODUCTS-PAGINA', `${baseUrl}/dashboard/${eventId}/products`],
    ['CATEGORIES-PAGINA (gok)', `${baseUrl}/dashboard/${eventId}/categories`],
  ];
  for (const [label, url] of pages) {
    const res = await jar(url, { method: 'GET' });
    if (res.status === 200) {
      dumpPage(`${label}  (${url})`, await res.text());
    } else {
      console.log(`\n${label}: HTTP ${res.status} (${url})`);
    }
  }
  console.log('\nKlaar. Plak de relevante output hierbij dan bouw ik createCategory.\n');
})().catch((e) => {
  console.error('\n✗ Fout:', e.message, '\n');
  process.exit(1);
});
