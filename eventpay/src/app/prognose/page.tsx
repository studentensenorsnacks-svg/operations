'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatAmount } from '@/lib/client';
import { ErrorAlert, InfoAlert, WarnAlert } from '@/components/Alert';
import type {
  Bucket,
  Confidence,
  EventForecast,
  ForecastMethod,
  ForecastResponse,
  Granularity,
  EventListItem,
} from '@/lib/prognose-types';

const HORIZONS = [3, 6, 12, 24];
const METHODS: { value: ForecastMethod; label: string }[] = [
  { value: 'blend', label: 'Trend (blend)' },
  { value: 'ols', label: 'Lineaire trend' },
  { value: 'cagr', label: 'Groei (CAGR)' },
  { value: 'weighted-avg', label: 'Gewogen gemiddelde' },
];
const GRANS: { value: Granularity; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Maand' },
  { value: 'year', label: 'Jaar' },
];

const CONF_LABEL: Record<Confidence, string> = {
  geen: 'geen data',
  laag: 'laag',
  matig: 'matig',
  goed: 'goed',
};

function ConfBadge({ c }: { c: Confidence }) {
  const cls = c === 'goed' ? 'badge badge-success' : 'badge';
  return <span className={cls}>{CONF_LABEL[c]}</span>;
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('nl-BE', { maximumFractionDigits: 1 });
}

export default function PrognosePage() {
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [method, setMethod] = useState<ForecastMethod>('blend');
  const [granularity, setGranularity] = useState<Granularity>('month');

  const [list, setList] = useState<EventListItem[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // De client-api wrapper richt zich op /api/eventpay/*. Onze prognose-routes
  // staan op /api/prognose/*, dus we fetchen die direct.
  const fetchEvents = async (months: number) => {
    setListError(null);
    try {
      const res = await fetch(`/api/prognose/events?horizonMonths=${months}`, {
        cache: 'no-store',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Fout (${res.status})`);
      setList(body.events as EventListItem[]);
    } catch (e) {
      setList(null);
      setListError(e);
    }
  };

  useEffect(() => {
    fetchEvents(horizonMonths);
  }, [horizonMonths]);

  const runForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/prognose/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horizonMonths, method }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Fout (${res.status})`);
      setData(body as ForecastResponse);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const buckets: Bucket[] = useMemo(() => {
    if (!data) return [];
    return data.rollups[granularity] ?? [];
  }, [data, granularity]);

  const totals = useMemo(() => {
    if (!data) return { sales: 0, purchase: 0 };
    // Gezaghebbende totalen komen uit de periode-rollups (top-down dagomzet),
    // niet uit de per-event som.
    return data.rollups.year.reduce(
      (acc, b) => ({
        sales: acc.sales + b.salesForecast,
        purchase: acc.purchase + b.purchaseForecastQty,
      }),
      { sales: 0, purchase: 0 },
    );
  }, [data]);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Prognose</h2>
          <p>
            Verwachte verkoop voor de komende maanden op basis van de omzet in
            voorgaande jaren (trend uit EventPay), met per discreet event een
            jaar-op-jaar vergelijking. Aankoop toont de reeds ingeplande
            hoeveelheden uit de laadlijsten (de aankoophistoriek is nog te kort
            voor een eigen trend).
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      <ErrorAlert error={listError} />

      <div className="card">
        <h3>Periode en methode</h3>
        <div className="grid grid-3">
          <div className="field">
            <label>Horizon</label>
            <select
              value={horizonMonths}
              onChange={(e) => setHorizonMonths(parseInt(e.target.value, 10))}
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  Komende {h} maanden
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Methode</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as ForecastMethod)}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={runForecast} disabled={loading}>
              {loading ? <span className="loading" /> : 'Bereken prognose'}
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {list
            ? `${list.length} terugkerende events binnen de horizon gevonden.`
            : 'Events laden…'}
        </div>
      </div>

      {!data && list && list.length > 0 && (
        <div className="card">
          <h3>Events in scope</h3>
          <InfoAlert>
            Dit zijn de komende events met (mogelijk) historiek. Klik “Bereken
            prognose” om verkoop op te halen en de trend te projecteren.
          </InfoAlert>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Locatie</th>
                  <th>Datum</th>
                  <th>Historiek (jaren)</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.clusterKey}>
                    <td>{e.name || '—'}</td>
                    <td>{e.location || '—'}</td>
                    <td>{e.startDate}</td>
                    <td>{e.historyYears.length ? e.historyYears.join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (
        <>
          {data.warnings.length > 0 && (
            <WarnAlert>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </WarnAlert>
          )}

          <div className="card">
            <div className="page-header" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Prognose per {granLabel(granularity)}</h3>
              <div className="toolbar" style={{ margin: 0 }}>
                {GRANS.map((g) => (
                  <button
                    key={g.value}
                    className={`btn btn-sm ${granularity === g.value ? '' : 'btn-secondary'}`}
                    onClick={() => setGranularity(g.value)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-3" style={{ marginBottom: 12 }}>
              <Stat label="Totaal verwachte omzet" value={formatAmount(totals.sales)} />
              <Stat label="Geplande aankoop (stuks)" value={fmtQty(totals.purchase)} />
              <Stat label="Events" value={String(data.events.length)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{granLabel(granularity)}</th>
                    <th>Verwachte omzet</th>
                    <th>Geplande aankoop (stuks)</th>
                    <th>Events</th>
                    <th>Betrouwbaarheid</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key}>
                      <td>{b.label}</td>
                      <td>{formatAmount(b.salesForecast)}</td>
                      <td>{fmtQty(b.purchaseForecastQty)}</td>
                      <td>{b.eventCount}</td>
                      <td>
                        <ConfBadge c={b.confidence} />
                      </td>
                    </tr>
                  ))}
                  {buckets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Geen prognosegegevens.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Per event</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Datum</th>
                    <th>Verwachte omzet</th>
                    <th>Verwachte aankoop</th>
                    <th>Historiek</th>
                    <th>Betrouwbaarheid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev) => (
                    <EventRow
                      key={ev.clusterKey}
                      ev={ev}
                      open={expanded === ev.clusterKey}
                      onToggle={() =>
                        setExpanded(expanded === ev.clusterKey ? null : ev.clusterKey)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function granLabel(g: Granularity): string {
  return g === 'week' ? 'week' : g === 'month' ? 'maand' : 'jaar';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-section" style={{ textAlign: 'center' }}>
      <div className="muted" style={{ fontSize: '0.8rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function EventRow({
  ev,
  open,
  onToggle,
}: {
  ev: EventForecast;
  open: boolean;
  onToggle: () => void;
}) {
  const histYears = Array.from(new Set(ev.history.map((h) => h.year))).sort();
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td>
          <strong>{ev.name || '—'}</strong>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {ev.location}
          </div>
        </td>
        <td>{ev.upcoming.startDate}</td>
        <td>
          {formatAmount(ev.salesForecast)}
          {ev.salesBand != null && ev.salesForecast != null && (
            <span className="muted" style={{ fontSize: '0.75rem' }}>
              {' '}
              ± {formatAmount(ev.salesBand)}
            </span>
          )}
        </td>
        <td>{fmtQty(ev.purchaseForecastQty)}</td>
        <td>{histYears.length ? histYears.join(', ') : '—'}</td>
        <td>
          <ConfBadge c={ev.confidence} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: 'rgba(0,0,0,0.02)' }}>
            {ev.notes.length > 0 && (
              <ul style={{ margin: '4px 0 10px 18px' }} className="muted">
                {ev.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <HistoryTable ev={ev} />
            <ProductTable ev={ev} />
          </td>
        </tr>
      )}
    </>
  );
}

function HistoryTable({ ev }: { ev: EventForecast }) {
  if (!ev.history.length) return <div className="muted">Geen historiek.</div>;
  return (
    <>
      <h4 style={{ margin: '6px 0' }}>Historiek per jaar</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jaar</th>
              <th>Periode</th>
              <th>Omzet</th>
              <th>Aankoop (stuks)</th>
              <th>Sector (EventPay)</th>
            </tr>
          </thead>
          <tbody>
            {ev.history.map((h) => (
              <tr key={h.eventId}>
                <td>{h.year}</td>
                <td>
                  {h.startDate}
                  {h.endDate !== h.startDate ? ` … ${h.endDate}` : ''}
                </td>
                <td>{h.salesTotal != null ? formatAmount(h.salesTotal) : '—'}</td>
                <td>{fmtQty(h.purchaseTotalQty)}</td>
                <td>{h.sectorName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductTable({ ev }: { ev: EventForecast }) {
  const rows = ev.products.filter(
    (p) => p.salesQtyForecast != null || p.purchaseQtyAdvies != null || p.purchaseQtyTrend != null,
  );
  if (!rows.length) return null;
  return (
    <>
      <h4 style={{ margin: '12px 0 6px' }}>Per product (prognose)</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Verwachte verkoop (stuks)</th>
              <th>Aankoop trend</th>
              <th>Aankoopadvies</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((p) => (
              <tr key={p.productKey}>
                <td>{p.name}</td>
                <td>{fmtQty(p.salesQtyForecast)}</td>
                <td>{fmtQty(p.purchaseQtyTrend)}</td>
                <td>{fmtQty(p.purchaseQtyAdvies)}</td>
                <td>
                  {p.flag === 'nieuw' && <span className="badge">nieuw</span>}
                  {p.flag === 'verdwenen' && <span className="badge">verdwenen</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 50 && (
        <div className="muted" style={{ fontSize: '0.8rem' }}>
          {rows.length - 50} extra producten niet getoond.
        </div>
      )}
    </>
  );
}
