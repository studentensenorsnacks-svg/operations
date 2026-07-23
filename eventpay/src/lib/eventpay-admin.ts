// Server-side helper voor de EventPay admin-website (Livewire).
// De publieke API kan geen sectoren toewijzen aan apparaten. De admin-UI op
// senor-snacks.eventpay.be wél — die werkt met een ingelogde sessie + Livewire.
// Daarom logt deze module met EVENTPAY_ADMIN_EMAIL/PASSWORD in en doet de
// nodige Livewire-calls. Niet officieel ondersteund door EventPay.

interface SessionState {
  cookies: Map<string, string>;
  eventId: string;
  expiresAt: number;
}

let cached: SessionState | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minuten

function config() {
  const baseUrl = process.env.EVENTPAY_BASE_URL?.replace(/\/$/, '');
  const email = process.env.EVENTPAY_ADMIN_EMAIL;
  const password = process.env.EVENTPAY_ADMIN_PASSWORD;
  if (!baseUrl) throw new Error('EVENTPAY_BASE_URL ontbreekt in .env.local');
  if (!email || !password)
    throw new Error(
      'EVENTPAY_ADMIN_EMAIL en EVENTPAY_ADMIN_PASSWORD moeten ingesteld zijn in .env.local',
    );
  return { baseUrl, email, password };
}

function cookieHeader(cookies: Map<string, string>): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function mergeSetCookies(cookies: Map<string, string>, res: Response) {
  const raw = (res.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  for (const sc of raw) {
    const sep = sc.indexOf(';');
    const pair = sep >= 0 ? sc.substring(0, sep) : sc;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.substring(0, eq).trim();
    const value = pair.substring(eq + 1).trim();
    if (value === '' || value === 'deleted') {
      cookies.delete(name);
    } else {
      cookies.set(name, value);
    }
  }
}

async function fetchWithJar(
  url: string,
  init: RequestInit,
  cookies: Map<string, string>,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const ch = cookieHeader(cookies);
  if (ch) headers.set('Cookie', ch);
  if (!headers.has('User-Agent'))
    headers.set('User-Agent', 'EventPay-beheer/0.1 (server)');
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  mergeSetCookies(cookies, res);
  return res;
}

function extractCsrf(html: string): string {
  const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('CSRF-token niet gevonden in HTML');
  return m[1];
}

async function login(): Promise<SessionState> {
  const { baseUrl, email, password } = config();
  const cookies = new Map<string, string>();

  // 1. GET /login → CSRF + initial cookies
  const r1 = await fetchWithJar(`${baseUrl}/login`, { method: 'GET' }, cookies);
  if (!r1.ok) throw new Error(`Login-pagina ophalen mislukt: status ${r1.status}`);
  const html1 = await r1.text();
  const loginCsrf = extractCsrf(html1);

  // 2. POST /login (form-urlencoded)
  const form = new URLSearchParams();
  form.set('_token', loginCsrf);
  form.set('email', email);
  form.set('password', password);
  const r2 = await fetchWithJar(
    `${baseUrl}/login`,
    {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    cookies,
  );
  if (r2.status !== 302) {
    throw new Error(
      `Login mislukt (verwacht 302, kreeg ${r2.status}). Klopt EVENTPAY_ADMIN_EMAIL/PASSWORD?`,
    );
  }

  // 3. Ontdek event_id via redirect van /dashboard
  const r3 = await fetchWithJar(
    `${baseUrl}/dashboard`,
    { method: 'GET' },
    cookies,
  );
  if (r3.status !== 302) {
    throw new Error(
      `Verwachtte redirect naar /dashboard/{id}/home maar kreeg status ${r3.status}`,
    );
  }
  const location = r3.headers.get('location') ?? '';
  const m = location.match(/\/dashboard\/(\d+)\//);
  if (!m) throw new Error(`Kan event_id niet uit redirect halen: ${location}`);
  const eventId = m[1];

  return { cookies, eventId, expiresAt: Date.now() + SESSION_TTL_MS };
}

async function ensureSession(): Promise<SessionState> {
  if (cached && cached.expiresAt > Date.now()) return cached;
  cached = await login();
  return cached;
}

export function clearSession() {
  cached = null;
}

interface DevicesPageData {
  csrf: string;
  snapshot: string; // raw decoded JSON-string van de devices.overview Livewire-snapshot
  html: string;
  eventId: string;
}

async function loadDevicesPage(): Promise<DevicesPageData> {
  const { baseUrl } = config();
  const session = await ensureSession();
  const url = `${baseUrl}/dashboard/${session.eventId}/devices`;
  const res = await fetchWithJar(url, { method: 'GET' }, session.cookies);
  if (res.status === 302) {
    // Sessie verlopen — opnieuw inloggen en hertesten
    clearSession();
    const s2 = await ensureSession();
    const res2 = await fetchWithJar(url, { method: 'GET' }, s2.cookies);
    if (!res2.ok)
      throw new Error(`Devices-pagina laden mislukt: status ${res2.status}`);
    const html = await res2.text();
    return {
      csrf: extractCsrf(html),
      snapshot: extractDevicesSnapshot(html),
      html,
      eventId: s2.eventId,
    };
  }
  if (!res.ok) throw new Error(`Devices-pagina laden mislukt: status ${res.status}`);
  const html = await res.text();
  return {
    csrf: extractCsrf(html),
    snapshot: extractDevicesSnapshot(html),
    html,
    eventId: session.eventId,
  };
}

function htmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function extractDevicesSnapshot(html: string): string {
  const re = /wire:snapshot="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = htmlDecode(m[1]);
    if (decoded.includes('devices.overview')) return decoded;
  }
  throw new Error('devices.overview snapshot niet gevonden op admin-pagina');
}

export interface AdminSectorOption {
  id: number;
  name: string;
  disabled: boolean;
}

export function extractSectorOptions(html: string): AdminSectorOption[] {
  const m = html.match(/window\.optionsformsectors\s*=\s*(\[[^;]+\]);/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]) as AdminSectorOption[];
  } catch {
    return [];
  }
}

export interface AdminDevice {
  device_name: string;
  device_uid: string;
  device_app: string;
  sector_id: number | null;
  sector_name: string | null;
  comment: string | null;
}

// Parseert de admin-tabel: per rij vinden we device_name + uid + app uit de
// wire:click-knop, en de sectornaam uit de derde td.
function parseDevicesTable(
  html: string,
  sectorOptions: AdminSectorOption[],
): AdminDevice[] {
  const result: AdminDevice[] = [];
  // Vind alle edit('UID', 'APP')-buttons; per match werken we vanuit die positie
  // omhoog en omlaag om de hele <tr>...</tr> rij te isoleren.
  const editRe = /wire:click="edit\('([^']+)',\s*'([^']+)'\)"/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = editRe.exec(html)) !== null) {
    const uid = m[1];
    const app = m[2];
    if (seen.has(uid + ':' + app)) continue;
    seen.add(uid + ':' + app);
    const at = m.index;
    const rowStart = html.lastIndexOf('<tr', at);
    const rowEnd = html.indexOf('</tr>', at);
    if (rowStart < 0 || rowEnd < 0) continue;
    const row = html.substring(rowStart, rowEnd);

    // td-cellen extraheren
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let tdm: RegExpExecArray | null;
    while ((tdm = tdRe.exec(row)) !== null) {
      cells.push(stripTags(tdm[1]).trim());
    }
    // td 1: device_name + uid + leeftijd + comment (op één regel)
    const cell1 = cells[0] ?? '';
    const nameMatch = cell1.match(/\[([^\]]+)\]/);
    const device_name = nameMatch ? nameMatch[1] : uid;
    // Comment: het laatste woord/cijfer na de UID. We zijn defensief.
    const commentMatch = cell1.match(/SUNMI\s+(.+)$/);
    const comment = commentMatch ? commentMatch[1].trim() || null : null;

    // td 3: sector_name (met lock-emoji voorop, mogelijk leeg)
    const cell3 = cells[2] ?? '';
    const sector_name = cell3.replace(/[\u{1F500}-\u{1F6FF}]/gu, '').trim() || null;

    let sector_id: number | null = null;
    if (sector_name) {
      const opt = sectorOptions.find(
        (o) =>
          o.name === sector_name ||
          o.name.replace(/\s*\[ID:\s*-?\d+\]\s*$/, '') === sector_name,
      );
      if (opt) sector_id = opt.id;
    }

    result.push({
      device_name,
      device_uid: uid,
      device_app: app,
      sector_id,
      sector_name,
      comment,
    });
  }
  return result;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

export async function getAdminOverview(): Promise<{
  devices: AdminDevice[];
  sectors: AdminSectorOption[];
}> {
  const { html } = await loadDevicesPage();
  const sectors = extractSectorOptions(html);
  const devices = parseDevicesTable(html, sectors);
  return { devices, sectors };
}

async function loadSectorsPage(): Promise<{
  csrf: string;
  wizardSnapshot: string;
  eventId: string;
}> {
  const { baseUrl } = config();
  const session = await ensureSession();
  const url = `${baseUrl}/dashboard/${session.eventId}/sectors`;
  let res = await fetchWithJar(url, { method: 'GET' }, session.cookies);
  if (res.status === 302) {
    clearSession();
    const s2 = await ensureSession();
    res = await fetchWithJar(url, { method: 'GET' }, s2.cookies);
  }
  if (!res.ok)
    throw new Error(`Sectors-pagina laden mislukt: status ${res.status}`);
  const html = await res.text();
  const csrf = extractCsrf(html);
  let snap: string | null = null;
  const re = /wire:snapshot="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = htmlDecode(m[1]);
    if (decoded.includes('sectors.wizard')) {
      snap = decoded;
      break;
    }
  }
  if (!snap) throw new Error('sectors.wizard snapshot niet gevonden');
  return { csrf, wizardSnapshot: snap, eventId: (await ensureSession()).eventId };
}

// ── Wizard-HTML parsen ─────────────────────────────────────────────
// De Livewire-respons bevat bij elke call de gerenderde HTML van de volgende
// wizard-stap (components[].effects.html). Daaruit lezen we de beschikbare
// knoppen (wire:click="methode") en formuliervelden (wire:model="veld") zodat
// we de kopieer-tak niet hoeven te raden maar live ontdekken.
function parseWizardMethods(html: string): string[] {
  const out = new Set<string>();
  const re = /wire:click(?:\.[a-zA-Z]+)*\s*=\s*"([a-zA-Z0-9_]+)\s*(?:\([^"]*\))?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return Array.from(out);
}

function parseWizardModels(html: string): string[] {
  const out = new Set<string>();
  const re = /wire:model(?:\.[a-zA-Z]+)*\s*=\s*"([a-zA-Z0-9_.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return Array.from(out);
}

interface LivewireStep {
  snapshot: string;
  html: string;
}

// Bouwt een caller voor de sector-wizard op basis van een geladen sessie.
async function sectorWizardCaller(): Promise<{
  wizardSnapshot: string;
  call: (
    snapshot: string,
    method: string,
    updates?: Record<string, unknown>,
  ) => Promise<LivewireStep>;
}> {
  const { baseUrl } = config();
  const session = await ensureSession();
  const { csrf, wizardSnapshot, eventId } = await loadSectorsPage();
  const livewireUrl = `${baseUrl}/livewire/${eventId}/update`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-CSRF-TOKEN': csrf,
    'X-Livewire': '1',
    Referer: `${baseUrl}/dashboard/${eventId}/sectors`,
  };
  const call = async (
    snapshot: string,
    method: string,
    updates: Record<string, unknown> = {},
  ): Promise<LivewireStep> => {
    const body = JSON.stringify({
      _token: csrf,
      components: [{ snapshot, updates, calls: [{ path: '', method, params: [] }] }],
    });
    const r = await fetchWithJar(
      livewireUrl,
      { method: 'POST', body, headers },
      session.cookies,
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(
        `Sector-wizard ${method}() mislukt (${r.status}): ${t.slice(0, 300)}`,
      );
    }
    const json = (await r.json()) as {
      components: Array<{ snapshot: string; effects?: { html?: string } }>;
    };
    const comp = json.components[0];
    if (!comp?.snapshot) throw new Error(`Geen snapshot na ${method}()`);
    return { snapshot: comp.snapshot, html: comp.effects?.html ?? '' };
  };
  return { wizardSnapshot, call };
}

export interface CreateSectorOptions {
  // Bron-sector-ID waarvan de volledige prijslijst (categorieën + producten)
  // gekopieerd wordt. Niet opgegeven → lege sector (zoals voorheen).
  copyFromSectorId?: number | null;
}

export async function createSector(
  name: string,
  options: CreateSectorOptions = {},
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Sectornaam mag niet leeg zijn.');
  if (cleanName.length > 100)
    throw new Error('Sectornaam te lang (max 100 tekens).');

  const copyFromSectorId = options.copyFromSectorId ?? null;
  const { wizardSnapshot, call } = await sectorWizardCaller();

  // Stap 1: wizard openen. Deze stap bevat zowel de keuze "kopiëren of niet"
  // (doCopy / noCopy) als het veld waarin je de bron-sector aanduidt (copy).
  const start = await call(wizardSnapshot, 'start');
  let snap = start.snapshot;
  let laatsteHtml = start.html;

  if (copyFromSectorId != null) {
    const methods = parseWizardMethods(start.html);
    const copyMethod = methods.find(
      (m) => /copy/i.test(m) && m.toLowerCase() !== 'nocopy',
    );
    if (!copyMethod) {
      throw new Error(
        `Kon de kopieer-stap niet vinden in de sector-wizard. ` +
          `Beschikbare knoppen: ${methods.join(', ') || '(geen)'}. ` +
          `Gebruik "Wizard-structuur tonen" om dit te diagnosticeren.`,
      );
    }
    // Het bronveld staat op DEZE stap, niet op de volgende. Zoek het hier en
    // sluit sector_name uit: dat is de naam van de nieuwe sector, niet de bron.
    // Werd dat veld toch gekozen, dan bleef de bron leeg en kwam er een lege
    // sector uit de wizard.
    const models = parseWizardModels(start.html).filter(
      (m) => !/name/i.test(m),
    );
    const bronVeld = models.find((m) =>
      /(copy|from|source|bron|kopie|sector)/i.test(m),
    );
    if (!bronVeld) {
      throw new Error(
        `Kon het bron-sector-veld niet vinden in de kopieer-stap. ` +
          `Beschikbare velden: ${models.join(', ') || '(geen)'}. ` +
          `Gebruik "Wizard-structuur tonen" om dit te diagnosticeren.`,
      );
    }
    const r = await call(snap, copyMethod, { [bronVeld]: copyFromSectorId });
    snap = r.snapshot;
    laatsteHtml = r.html;
  } else {
    const r = await call(snap, 'noCopy');
    snap = r.snapshot;
    laatsteHtml = r.html;
  }

  // Slotstap: naam invullen en aanmaken. Ontdek beide live, zodat een
  // gewijzigde wizard een duidelijke fout geeft in plaats van een lege sector.
  const slotModels = parseWizardModels(laatsteHtml);
  const naamVeld = slotModels.find((m) => /name/i.test(m)) ?? 'sector_name';
  const slotMethods = parseWizardMethods(laatsteHtml).filter(
    (m) => !/^(back|previous|terug|cancel|annul)/i.test(m),
  );
  const maakMethod =
    slotMethods.find((m) => /^(create|save|store|aanmaken|opslaan)$/i.test(m)) ??
    'create';
  await call(snap, maakMethod, { [naamVeld]: cleanName });
}

// ── Algemene Livewire-caller ───────────────────────────────────────
// Laadt een dashboard-pagina, pikt de snapshot van het gevraagde component en
// geeft een functie terug om er methodes op aan te roepen. createSector heeft
// zijn eigen variant omdat die de wizard-stappen aan elkaar rijgt.
async function livewireCaller(
  pad: string,
  component: string,
): Promise<{
  snapshot: string;
  call: (
    snapshot: string,
    method: string,
    params?: unknown[],
    updates?: Record<string, unknown>,
  ) => Promise<LivewireStep>;
}> {
  const { baseUrl } = config();
  let session = await ensureSession();
  const url = `${baseUrl}/dashboard/${session.eventId}/${pad}`;
  let res = await fetchWithJar(url, { method: 'GET' }, session.cookies);
  if (res.status === 302) {
    clearSession();
    session = await ensureSession();
    res = await fetchWithJar(url, { method: 'GET' }, session.cookies);
  }
  if (!res.ok) throw new Error(`Pagina ${pad} laden mislukt: status ${res.status}`);
  const html = await res.text();
  const csrf = extractCsrf(html);

  let snapshot: string | null = null;
  const re = /wire:snapshot="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = htmlDecode(m[1]);
    if (decoded.includes(component)) {
      snapshot = decoded;
      break;
    }
  }
  if (!snapshot) throw new Error(`Component ${component} niet gevonden op /${pad}`);

  const livewireUrl = `${baseUrl}/livewire/${session.eventId}/update`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-CSRF-TOKEN': csrf,
    'X-Livewire': '1',
    Referer: url,
  };
  const call = async (
    snap: string,
    method: string,
    params: unknown[] = [],
    updates: Record<string, unknown> = {},
  ): Promise<LivewireStep> => {
    const r = await fetchWithJar(
      livewireUrl,
      {
        method: 'POST',
        body: JSON.stringify({
          _token: csrf,
          components: [{ snapshot: snap, updates, calls: [{ path: '', method, params }] }],
        }),
        headers,
      },
      session.cookies,
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`${component}.${method}() mislukt (${r.status}): ${t.slice(0, 200)}`);
    }
    const json = (await r.json()) as {
      components: Array<{ snapshot: string; effects?: { html?: string } }>;
    };
    const comp = json.components[0];
    if (!comp?.snapshot) throw new Error(`Geen snapshot na ${component}.${method}()`);
    return { snapshot: comp.snapshot, html: comp.effects?.html ?? '' };
  };
  return { snapshot, call };
}

// Maakt een categorie in een sector. Met copyFromCategorieId komt de volledige
// productinhoud van die bron-categorie mee — dat is de enige manier om
// producten aan een sector te hangen zonder de admin-UI in een browser te
// bedienen.
export async function createCategoryInSector(
  sectorId: number,
  name: string,
  copyFromCategorieId?: number | null,
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Categorienaam mag niet leeg zijn.');
  const { snapshot, call } = await livewireCaller('sectors', 'sectors.overview');
  const open = await call(snapshot, 'editCategorie', [sectorId]);
  const updates: Record<string, unknown> = { 'categorieForm.name': cleanName };
  if (copyFromCategorieId != null) {
    updates['categorieForm.categorie_copy'] = copyFromCategorieId;
  }
  await call(open.snapshot, 'updateCategorie', [], updates);
}

// Zet de prijs van een product voor één specifieke sector. Dit is EventPay's
// "dynamic prices": het laat product_price ongemoeid, en dat is cruciaal —
// product_price geldt globaal en zou de prijs op elke andere kassa wijzigen.
export async function setSectorPrice(
  productId: number,
  sectorId: number,
  price: number,
): Promise<void> {
  const { snapshot, call } = await livewireCaller('products', 'dynamic-pricing');
  const open = await call(snapshot, 'editDynamicPrices', [productId]);
  await call(open.snapshot, 'changeDefaultSector', [sectorId, price]);
}

// Read-only diagnose: doorloopt de wizard zonder create en rapporteert welke
// knoppen/velden elke stap aanbiedt. Handig om de exacte kopieer-methode en
// het bron-sectorveld te bepalen zonder iets aan te maken in productie.
export interface WizardInspection {
  step1: { methods: string[]; models: string[] };
  copyStep: { method: string | null; methods: string[]; models: string[] } | null;
}

export async function inspectSectorWizard(): Promise<WizardInspection> {
  const { wizardSnapshot, call } = await sectorWizardCaller();
  const start = await call(wizardSnapshot, 'start');
  const step1 = {
    methods: parseWizardMethods(start.html),
    models: parseWizardModels(start.html),
  };
  let copyStep: WizardInspection['copyStep'] = null;
  const copyMethod =
    step1.methods.find((m) => /copy/i.test(m) && m.toLowerCase() !== 'nocopy') ??
    null;
  if (copyMethod) {
    try {
      const afterCopy = await call(start.snapshot, copyMethod);
      copyStep = {
        method: copyMethod,
        methods: parseWizardMethods(afterCopy.html),
        models: parseWizardModels(afterCopy.html),
      };
    } catch {
      copyStep = { method: copyMethod, methods: [], models: [] };
    }
  }
  return { step1, copyStep };
}

export async function setDeviceSector(
  deviceUid: string,
  deviceApp: string,
  sectorId: number,
  sectorName: string,
): Promise<void> {
  const { baseUrl } = config();
  const session = await ensureSession();
  const { csrf, snapshot, eventId } = await loadDevicesPage();
  const livewireUrl = `${baseUrl}/livewire/${eventId}/update`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-CSRF-TOKEN': csrf,
    'X-Livewire': '1',
    Referer: `${baseUrl}/dashboard/${eventId}/devices`,
  };

  // Stap 1: edit() — opent form voor dit apparaat, geeft nieuwe snapshot
  const editBody = JSON.stringify({
    _token: csrf,
    components: [
      {
        snapshot,
        updates: {},
        calls: [{ path: '', method: 'edit', params: [deviceUid, deviceApp] }],
      },
    ],
  });
  const r1 = await fetchWithJar(
    livewireUrl,
    { method: 'POST', body: editBody, headers },
    session.cookies,
  );
  if (!r1.ok) {
    const body = await r1.text();
    throw new Error(`Edit-call mislukt (${r1.status}): ${body.slice(0, 300)}`);
  }
  const editResp = (await r1.json()) as {
    components: Array<{ snapshot: string }>;
  };
  const snapshot2 = editResp.components[0]?.snapshot;
  if (!snapshot2) throw new Error('Geen snapshot in edit-respons');

  // Stap 2: save() met updates voor form.sectors (single-item array)
  const sectorObj = { id: sectorId, name: sectorName, disabled: false };
  const saveBody = JSON.stringify({
    _token: csrf,
    components: [
      {
        snapshot: snapshot2,
        updates: { 'form.sectors': [sectorObj] },
        calls: [{ path: '', method: 'save', params: [] }],
      },
    ],
  });
  const r2 = await fetchWithJar(
    livewireUrl,
    { method: 'POST', body: saveBody, headers },
    session.cookies,
  );
  if (!r2.ok) {
    const body = await r2.text();
    throw new Error(`Save-call mislukt (${r2.status}): ${body.slice(0, 300)}`);
  }
}
