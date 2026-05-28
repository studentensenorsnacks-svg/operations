'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Sector, StockItem } from '@/lib/types';
import { ErrorAlert, InfoAlert } from '@/components/Alert';

export default function VoorraadPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<number[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Sector[] | { data: Sector[] }>('/sectors')
      .then((res) =>
        setSectors(Array.isArray(res) ? res : 'data' in res ? res.data : []),
      )
      .catch((e) => setError(e));
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = {};
      if (selectedSectors.length > 0) query.sector_ids = selectedSectors;
      const res = await api.get<StockItem[] | { data: StockItem[] }>(
        '/stock',
        query as Record<string, number[]>,
      );
      setItems(Array.isArray(res) ? res : 'data' in res ? res.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSector = (id: number) => {
    setSelectedSectors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const stockSectors = sectors.filter((s) => s.is_stock_location);
  const otherSectors = sectors.filter((s) => !s.is_stock_location);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Voorraad</h2>
          <p>
            Actuele stock per sector, met historiek en — indien aanwezig —
            stockbreuk. Filter op één of meerdere sectoren.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />

      <div className="card">
        <h3>Filter op sectoren</h3>
        {stockSectors.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 6 }}>
              Sectoren met stock-locatie
            </div>
            <div className="pill-toolbar">
              {stockSectors.map((s) => (
                <button
                  key={s.sector_id}
                  className={selectedSectors.includes(s.sector_id) ? 'active' : ''}
                  onClick={() => toggleSector(s.sector_id)}
                >
                  {s.sector_name}
                </button>
              ))}
            </div>
          </>
        )}
        {otherSectors.length > 0 && (
          <details>
            <summary>Alle andere sectoren tonen ({otherSectors.length})</summary>
            <div className="pill-toolbar">
              {otherSectors.map((s) => (
                <button
                  key={s.sector_id}
                  className={selectedSectors.includes(s.sector_id) ? 'active' : ''}
                  onClick={() => toggleSector(s.sector_id)}
                >
                  {s.sector_name}
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="toolbar">
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? <span className="loading" /> : 'Voorraad ophalen'}
          </button>
          {selectedSectors.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedSectors([])}
            >
              Selectie wissen ({selectedSectors.length})
            </button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="card">
          <h3>Stock ({items.length} regels)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Sector</th>
                  <th>Product</th>
                  <th className="cell-num">Hoeveelheid</th>
                  <th>Eenheid</th>
                  <th>Historiek</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const sector = sectors.find((s) => s.sector_id === it.sector_id);
                  const key = it.stock_id ?? i;
                  return (
                    <tr key={key}>
                      <td className="mono">{it.stock_id ?? '—'}</td>
                      <td>
                        {sector?.sector_name ?? it.sector_name ?? it.sector_id}
                      </td>
                      <td>{it.product_name ?? `Product #${it.product_id}`}</td>
                      <td className="cell-num">{it.stock_amount ?? '—'}</td>
                      <td>{it.stock_unit ?? ''}</td>
                      <td>
                        {it.history && it.history.length > 0 ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setExpandedHistory(
                                expandedHistory === key ? null : (key as number),
                              )
                            }
                          >
                            {expandedHistory === key
                              ? 'Verbergen'
                              : `${it.history.length} regels`}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {expandedHistory !== null && (
            <div className="card-section">
              <h3 style={{ fontSize: '0.95rem' }}>
                Historiek voor stock #{expandedHistory}
              </h3>
              <pre className="json">
                {JSON.stringify(
                  items.find((i) => i.stock_id === expandedHistory)?.history,
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>
      )}

      {items.length === 0 && !loading && (
        <InfoAlert>
          Kies één of meerdere sectoren en klik op{' '}
          <strong>Voorraad ophalen</strong>. Zonder sectorfilter wordt alle
          stock teruggegeven. Op deze EventPay-omgeving is de voorraad nu leeg.
        </InfoAlert>
      )}
    </>
  );
}
