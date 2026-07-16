'use client';

// Event-setup: kies een event uit de planning + een prijslijst, bekijk het
// dry-run plan (sectoren per kassa-assortiment, product-matching, kastjes)
// en voer het daarna in één keer uit in EventPay.

import { useEffect, useMemo, useState } from 'react';
import { ErrorAlert, SuccessAlert, WarnAlert, InfoAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

// ── Types (spiegel van lib/event-setup.ts) ─────────────────────────
interface SetupTerminal {
  name: string;
  use: string | null;
}
interface SetupEvent {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  terminals: SetupTerminal[];
}
interface PrijslijstSummary {
  id: string;
  name: string;
  mode: string;
  rate: number;
  categorieCount: number;
  itemCount: number;
}
interface SetupPrijslijstItem {
  name: string;
  euro: number;
  note: string;
}
interface SetupPrijslijstCategorie {
  title: string;
  items: SetupPrijslijstItem[];
}
interface KastjeMatch {
  terminal: string;
  use: string | null;
  deviceUid: string | null;
  deviceApp: string | null;
  deviceName: string | null;
  comment: string | null;
}
interface SetupGroup {
  use: string | null;
  terminals: string[];
  suggestedName: string;
  suggestedCategories: string[];
}
interface ItemMatch {
  categorie: string;
  name: string;
  euro: number;
  productId: number | null;
  productName: string | null;
}
interface SetupPlan {
  event: SetupEvent;
  prijslijst: {
    id: string;
    name: string;
    mode: string;
    rate: number;
    categories: SetupPrijslijstCategorie[];
  };
  catalog: {
    sectorId: number;
    sectorName: string;
    products: Array<{ id: number; name: string; categorie: string }>;
  } | null;
  kastjes: KastjeMatch[];
  groups: SetupGroup[];
  matches: ItemMatch[];
  warnings: string[];
}
interface ExecuteReport {
  sector: string;
  steps: string[];
  errors: string[];
}

function fmtEuro(n: number): string {
  return '€ ' + n.toFixed(2).replace('.', ',');
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export default function EventSetupPage() {
  const [events, setEvents] = useState<SetupEvent[]>([]);
  const [prijslijsten, setPrijslijsten] = useState<PrijslijstSummary[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [eventId, setEventId] = useState('');
  const [prijslijstId, setPrijslijstId] = useState('');
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Per groep (index) de aangevinkte prijslijst-categorieën
  const [checked, setChecked] = useState<Record<number, Set<string>>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [reports, setReports] = useState<ExecuteReport[] | null>(null);
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingSources(true);
      setError(null);
      try {
        const res = await fetch('/api/eventpay-setup/sources');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || `Laden mislukt (${res.status})`);
        setEvents(data.events ?? []);
        setPrijslijsten(data.prijslijsten ?? []);
      } catch (e) {
        setError(e);
      } finally {
        setLoadingSources(false);
      }
    })();
  }, []);

  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  const loadPlan = async () => {
    if (!eventId || !prijslijstId) return;
    setLoadingPlan(true);
    setError(null);
    setPlan(null);
    setReports(null);
    try {
      const res = await fetch('/api/eventpay-setup/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, prijslijstId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Plan bouwen mislukt (${res.status})`);
      const p = data as SetupPlan;
      setPlan(p);
      const ch: Record<number, Set<string>> = {};
      const nm: Record<number, string> = {};
      p.groups.forEach((g, i) => {
        ch[i] = new Set(g.suggestedCategories);
        nm[i] = g.suggestedName;
      });
      setChecked(ch);
      setNames(nm);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingPlan(false);
    }
  };

  const toggleCat = (gi: number, title: string) => {
    setChecked((prev) => {
      const next = { ...prev };
      const set = new Set(next[gi] ?? []);
      if (set.has(title)) set.delete(title);
      else set.add(title);
      next[gi] = set;
      return next;
    });
  };

  // Per groep: welke prijslijst-items doen mee, en welke daarvan matchen?
  const groupData = useMemo(() => {
    if (!plan) return [];
    return plan.groups.map((g, gi) => {
      const cats = checked[gi] ?? new Set<string>();
      const items = plan.matches.filter((m) => cats.has(m.categorie));
      const matched = items.filter((m) => m.productId != null);
      const missing = items.filter((m) => m.productId == null);
      const kastjes = plan.kastjes.filter((k) => g.terminals.includes(k.terminal));
      const devicesOk = kastjes.filter((k) => k.deviceUid);
      const hiddenCount = plan.catalog
        ? plan.catalog.products.length - matched.length
        : 0;
      return { g, gi, items, matched, missing, kastjes, devicesOk, hiddenCount };
    });
  }, [plan, checked]);

  const canExecute =
    !!plan &&
    !!plan.catalog &&
    plan.catalog.products.length > 0 &&
    groupData.some((d) => d.matched.length > 0);

  const execute = async () => {
    if (!plan || !plan.catalog) return;
    setConfirmOpen(false);
    setExecuting(true);
    setError(null);
    setReports(null);
    try {
      const sectors = groupData
        .filter((d) => d.matched.length > 0)
        .map((d) => ({
          name: (names[d.gi] ?? d.g.suggestedName).trim(),
          copyFromSectorId: plan.catalog!.sectorId,
          visible: d.matched.map((m) => ({
            productName: m.productName as string,
            price: m.euro,
          })),
          devices: d.devicesOk.map((k) => ({
            uid: k.deviceUid as string,
            app: k.deviceApp as string,
            terminal: k.terminal,
          })),
        }));
      const res = await fetch('/api/eventpay-setup/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, sectors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Uitvoeren mislukt (${res.status})`);
      setReports(data.reports ?? []);
    } catch (e) {
      setError(e);
    } finally {
      setExecuting(false);
    }
  };

  const createCatalog = async () => {
    setCreatingCatalog(true);
    setCatalogMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/eventpay-admin/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CATALOGUS' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Aanmaken mislukt (${res.status})`);
      setCatalogMsg(
        'Sector "CATALOGUS" aangemaakt. Voeg nu in de EventPay admin alle producten toe (categorieën Friet, Hamburger, … Drank) — daarna kan deze wizard event-sectoren kopiëren.',
      );
    } catch (e) {
      setError(e);
    } finally {
      setCreatingCatalog(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Event-setup</h2>
          <p>
            Kies een event uit de planning en een prijslijst. De wizard stelt per
            kassa-assortiment een sector voor (kopie van de{' '}
            <strong>CATALOGUS</strong>-sector), zet de prijzen uit de prijslijst
            en koppelt de EP-kastjes. Niets wordt uitgevoerd vóór jouw
            bevestiging.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {catalogMsg && <SuccessAlert>{catalogMsg}</SuccessAlert>}

      <div className="card">
        <h3>Stap 1 — Event &amp; prijslijst</h3>
        {loadingSources && <p className="loading">Planning en prijslijsten laden…</p>}
        <div className="grid grid-2">
          <div className="field">
            <label>Event (uit de planning, met betaalterminals)</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">— kies een event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} · {fmtDate(ev.startDate)}
                  {ev.endDate !== ev.startDate ? `–${fmtDate(ev.endDate)}` : ''} ·{' '}
                  {ev.terminals.length} terminal(s)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Prijslijst</label>
            <select
              value={prijslijstId}
              onChange={(e) => setPrijslijstId(e.target.value)}
            >
              <option value="">— kies een prijslijst —</option>
              {prijslijsten.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.itemCount} items
                  {l.mode === 'token' ? ` · 1 token = ${fmtEuro(l.rate)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedEvent && (
          <p className="muted">
            Terminals op dit event:{' '}
            {selectedEvent.terminals
              .map((t) => `${t.name}${t.use ? ` (${t.use})` : ''}`)
              .join(' · ')}
          </p>
        )}
        <button
          className="btn"
          disabled={!eventId || !prijslijstId || loadingPlan}
          onClick={loadPlan}
        >
          {loadingPlan ? 'Plan bouwen…' : 'Toon plan (dry-run)'}
        </button>
      </div>

      {plan && (
        <>
          {plan.warnings.length > 0 && (
            <WarnAlert>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </WarnAlert>
          )}

          {!plan.catalog && (
            <div className="card">
              <h3>CATALOGUS ontbreekt</h3>
              <p>
                De wizard kopieert elke event-sector van de sector{' '}
                <strong>CATALOGUS</strong>. Die bestaat nog niet. Maak hem hier
                aan en vul hem daarna éénmalig in de EventPay admin met alle
                producten (de EventPay API kan zelf geen producten aanmaken).
              </p>
              <button
                className="btn"
                disabled={creatingCatalog}
                onClick={createCatalog}
              >
                {creatingCatalog ? 'Aanmaken…' : 'Maak sector CATALOGUS aan'}
              </button>
            </div>
          )}

          {plan.catalog && (
            <InfoAlert>
              CATALOGUS gevonden (sector #{plan.catalog.sectorId}) met{' '}
              {plan.catalog.products.length} producten.
            </InfoAlert>
          )}

          <div className="card">
            <h3>Stap 2 — Kastjes</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Terminal (planning)</th>
                    <th>Waarvoor</th>
                    <th>EventPay-kastje</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.kastjes.map((k) => (
                    <tr key={k.terminal}>
                      <td>{k.terminal}</td>
                      <td>{k.use ?? <span className="muted">—</span>}</td>
                      <td>
                        {k.deviceUid ? (
                          <>
                            {k.deviceName}{' '}
                            <span className="muted mono">
                              (comment {k.comment})
                            </span>
                          </>
                        ) : (
                          <span className="muted">niet gevonden</span>
                        )}
                      </td>
                      <td>
                        {k.deviceUid ? (
                          <span className="badge badge-success">koppelt</span>
                        ) : (
                          <span className="badge badge-danger">geen match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {groupData.map(({ g, gi, matched, missing, kastjes, devicesOk, hiddenCount }) => (
            <div className="card" key={gi}>
              <h3>
                Sector {gi + 1} — {g.use ?? 'alles'}{' '}
                <span className="muted">
                  ({kastjes.map((k) => k.terminal).join(', ')})
                </span>
              </h3>
              <div className="field">
                <label>Sectornaam</label>
                <input
                  type="text"
                  value={names[gi] ?? g.suggestedName}
                  maxLength={100}
                  onChange={(e) =>
                    setNames((p) => ({ ...p, [gi]: e.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Categorieën uit de prijslijst op deze kassa</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {plan.prijslijst.categories.map((c) => (
                    <label
                      key={c.title}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={(checked[gi] ?? new Set()).has(c.title)}
                        onChange={() => toggleCat(gi, c.title)}
                      />
                      {c.title}{' '}
                      <span className="muted">({c.items.length})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prijslijst-item</th>
                      <th>Prijs</th>
                      <th>CATALOGUS-product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((m, i) => (
                      <tr key={'m' + i}>
                        <td>
                          {m.name}{' '}
                          <span className="muted">({m.categorie})</span>
                        </td>
                        <td className="cell-num">{fmtEuro(m.euro)}</td>
                        <td>{m.productName}</td>
                      </tr>
                    ))}
                    {missing.map((m, i) => (
                      <tr key={'x' + i}>
                        <td>
                          {m.name}{' '}
                          <span className="muted">({m.categorie})</span>
                        </td>
                        <td className="cell-num">{fmtEuro(m.euro)}</td>
                        <td>
                          <span className="badge badge-warn">
                            niet in CATALOGUS
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                {matched.length} product(en) zichtbaar met prijs · {hiddenCount}{' '}
                catalogusproduct(en) worden verborgen ·{' '}
                {devicesOk.length}/{kastjes.length} kastje(s) koppelen
              </p>
            </div>
          ))}

          {!reports && (
            <div className="card">
              <h3>Stap 3 — Uitvoeren</h3>
              <WarnAlert>
                Dit schrijft direct in EventPay-productie: sector(en) aanmaken,
                prijzen en zichtbaarheid aanpassen en kastjes omhangen.
              </WarnAlert>
              <button
                className="btn btn-danger"
                disabled={!canExecute || executing}
                onClick={() => setConfirmOpen(true)}
              >
                {executing
                  ? 'Bezig met uitvoeren… (kan een minuut duren)'
                  : 'Voer plan uit in EventPay'}
              </button>
            </div>
          )}

          {reports && (
            <div className="card">
              <h3>Resultaat</h3>
              {reports.map((r, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <strong>{r.sector}</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {r.steps.map((s, j) => (
                      <li key={'s' + j}>✅ {s}</li>
                    ))}
                    {r.errors.map((e, j) => (
                      <li key={'e' + j} style={{ color: '#b91c1c' }}>
                        ⚠️ {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {reports.every((r) => r.errors.length === 0) ? (
                <SuccessAlert>
                  Alles gelukt. De kassa&apos;s tonen het nieuwe assortiment na hun
                  eerstvolgende sync.
                </SuccessAlert>
              ) : (
                <WarnAlert>
                  Er waren fouten — kijk de lijst na en herstel handmatig in de
                  EventPay admin waar nodig.
                </WarnAlert>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Plan uitvoeren in EventPay?"
        message={
          plan
            ? `${groupData.filter((d) => d.matched.length > 0).length} sector(en) aanmaken als kopie van CATALOGUS, prijzen zetten uit "${plan.prijslijst.name}" en ${groupData.reduce((s, d) => s + d.devicesOk.length, 0)} kastje(s) koppelen. Dit gebeurt direct in productie.`
            : ''
        }
        confirmLabel="Ja, uitvoeren"
        danger
        onConfirm={execute}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
