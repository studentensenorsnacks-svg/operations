'use client';

import { useState } from 'react';
import { api, toRfc3339 } from '@/lib/client';
import type { SalesDivider, SalesProductFilter, SalesResponse } from '@/lib/types';
import { ErrorAlert, InfoAlert } from '@/components/Alert';

const dividers: { value: SalesDivider; label: string }[] = [
  { value: 'sector', label: 'Sector' },
  { value: 'device', label: 'Apparaat' },
  { value: 'operator', label: 'Operator' },
  { value: 'categories', label: 'Categorieën' },
  { value: 'btw', label: 'BTW-tarief' },
];

export default function VerkoopPage() {
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    0,
  );
  const endOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
  );

  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  };

  const [start, setStart] = useState(fmt(startOfToday));
  const [end, setEnd] = useState(fmt(endOfToday));
  const [divider, setDivider] = useState<SalesDivider>('sector');
  const [productFilter, setProductFilter] = useState<SalesProductFilter>('all');
  const [showProducts, setShowProducts] = useState(true);
  const [showMethods, setShowMethods] = useState(true);
  const [showDays, setShowDays] = useState(false);
  const [showDividers, setShowDividers] = useState(true);
  const [showLoopTypes, setShowLoopTypes] = useState(false);
  const [groupModifiers, setGroupModifiers] = useState(false);
  const [sectorIds, setSectorIds] = useState('');
  const [deviceIds, setDeviceIds] = useState('');
  const [operatorIds, setOperatorIds] = useState('');

  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const parseIds = (s: string): number[] =>
    s
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = {
        start_date: toRfc3339(start),
        end_date: toRfc3339(end),
        show_products: showProducts,
        show_methods: showMethods,
        show_days: showDays,
        show_dividers: showDividers,
        show_loop_types: showLoopTypes,
        divider_type: divider,
        group_modifiers: groupModifiers,
        product_filters: productFilter,
      };
      const sids = parseIds(sectorIds);
      const dids = parseIds(deviceIds);
      const oids = parseIds(operatorIds);
      if (sids.length) query.sector_ids = sids;
      if (dids.length) query.device_ids = dids;
      if (oids.length) query.operator_ids = oids;
      const res = await api.post<SalesResponse>(
        '/sales',
        undefined,
        query as Record<string, string | number | boolean | number[]>,
      );
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Verkoopsdata</h2>
          <p>
            Omzet over een gekozen periode, gegroepeerd op sector, apparaat,
            operator, categorie of BTW. Voor afsluiting, rapportage of een
            tussentijdse check.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />

      <div className="card">
        <h3>Periode en filters</h3>
        <div className="grid grid-3">
          <div className="field">
            <label>Begin (datum/tijd)</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Eind (datum/tijd)</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Groeperen op</label>
            <select
              value={divider}
              onChange={(e) => setDivider(e.target.value as SalesDivider)}
            >
              {dividers.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Productfilter</label>
            <select
              value={productFilter}
              onChange={(e) =>
                setProductFilter(e.target.value as SalesProductFilter)
              }
            >
              <option value="all">Alle</option>
              <option value="sales">Alleen verkopen</option>
              <option value="reusables">Alleen reusables</option>
            </select>
          </div>
          <div className="field">
            <label>Sector IDs (komma-gescheiden, leeg = alle)</label>
            <input
              type="text"
              value={sectorIds}
              onChange={(e) => setSectorIds(e.target.value)}
              placeholder="bv. 1,3,7"
            />
          </div>
          <div className="field">
            <label>Apparaat IDs</label>
            <input
              type="text"
              value={deviceIds}
              onChange={(e) => setDeviceIds(e.target.value)}
              placeholder="bv. 12,18"
            />
          </div>
          <div className="field">
            <label>Operator IDs</label>
            <input
              type="text"
              value={operatorIds}
              onChange={(e) => setOperatorIds(e.target.value)}
              placeholder="bv. 4,9"
            />
          </div>
        </div>

        <div className="card-section">
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: '0.9rem',
            }}
          >
            <label>
              <input
                type="checkbox"
                checked={showProducts}
                onChange={(e) => setShowProducts(e.target.checked)}
              />
              Producten tonen
            </label>
            <label>
              <input
                type="checkbox"
                checked={showMethods}
                onChange={(e) => setShowMethods(e.target.checked)}
              />
              Betaalmethoden tonen
            </label>
            <label>
              <input
                type="checkbox"
                checked={showDays}
                onChange={(e) => setShowDays(e.target.checked)}
              />
              Per dag splitsen
            </label>
            <label>
              <input
                type="checkbox"
                checked={showDividers}
                onChange={(e) => setShowDividers(e.target.checked)}
              />
              Groepen tonen
            </label>
            <label>
              <input
                type="checkbox"
                checked={showLoopTypes}
                onChange={(e) => setShowLoopTypes(e.target.checked)}
              />
              Loop-types tonen
            </label>
            <label>
              <input
                type="checkbox"
                checked={groupModifiers}
                onChange={(e) => setGroupModifiers(e.target.checked)}
              />
              Modifiers samenvoegen
            </label>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? <span className="loading" /> : 'Verkoopsdata ophalen'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setStart(fmt(startOfToday));
              setEnd(fmt(endOfToday));
            }}
          >
            Vandaag
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const y = new Date(today);
              y.setDate(y.getDate() - 1);
              const s = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0);
              const e = new Date(
                y.getFullYear(),
                y.getMonth(),
                y.getDate(),
                23,
                59,
              );
              setStart(fmt(s));
              setEnd(fmt(e));
            }}
          >
            Gisteren
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const e = new Date();
              const s = new Date(e);
              s.setDate(s.getDate() - 7);
              setStart(fmt(s));
              setEnd(fmt(e));
            }}
          >
            Laatste 7 dagen
          </button>
        </div>
      </div>

      {data && (
        <div className="card">
          <h3>Resultaat</h3>
          <InfoAlert>
            De EventPay API geeft sales-data terug in een rijke structuur (days,
            data, methods, loop_types, divider_type). Hieronder zie je de
            volledige respons; samenvattende tabellen kunnen we toevoegen zodra
            we de exacte veldnamen van je event weten.
          </InfoAlert>
          <SalesSummary data={data} />
          <details>
            <summary>Volledige JSON-respons</summary>
            <pre className="json">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>
      )}
    </>
  );
}

function SalesSummary({ data }: { data: SalesResponse }) {
  // Best-effort samenvatting: zoek bekende velden, render als tabellen.
  const sections: Array<{ title: string; rows: Record<string, unknown>[] }> = [];

  if (Array.isArray(data.data) && data.data.length > 0) {
    sections.push({ title: 'Hoofdverdeling (data)', rows: data.data });
  }
  if (Array.isArray(data.methods) && data.methods.length > 0) {
    sections.push({ title: 'Betaalmethoden', rows: data.methods });
  }
  if (Array.isArray(data.days) && data.days.length > 0) {
    sections.push({ title: 'Per dag', rows: data.days });
  }
  if (Array.isArray(data.loop_types) && data.loop_types.length > 0) {
    sections.push({ title: 'Loop-types', rows: data.loop_types });
  }

  if (sections.length === 0) {
    return <div className="muted">Geen gestructureerde gegevens om te tonen.</div>;
  }
  return (
    <>
      {sections.map((s, i) => (
        <div key={i} className="card-section">
          <h3 style={{ fontSize: '0.95rem' }}>{s.title}</h3>
          <DynamicTable rows={s.rows} />
        </div>
      ))}
    </>
  );
}

function DynamicTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <div className="muted">Leeg.</div>;
  const allKeys = new Set<string>();
  for (const r of rows) Object.keys(r).forEach((k) => allKeys.add(k));
  const keys = Array.from(allKeys);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k}>
                  {typeof r[k] === 'object' && r[k] !== null
                    ? JSON.stringify(r[k])
                    : String(r[k] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
