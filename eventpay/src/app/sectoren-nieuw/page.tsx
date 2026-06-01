'use client';

import { useEffect, useState } from 'react';
import { ErrorAlert, SuccessAlert, WarnAlert } from '@/components/Alert';

interface AdminSector {
  id: number;
  name: string;
  disabled: boolean;
}

interface Overview {
  sectors: AdminSector[];
}

function displayName(name: string): string {
  return name.replace(/\s*\[ID:\s*-?\d+\]\s*$/, '');
}

export default function NieuwSectorPage() {
  const [sectors, setSectors] = useState<AdminSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/eventpay-admin/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Laden mislukt (${res.status})`);
      }
      const data = (await res.json()) as Overview;
      setSectors(data.sectors);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    if (sectors.some((s) => displayName(s.name).toLowerCase() === cleanName.toLowerCase())) {
      setError(new Error(`Er bestaat al een sector met de naam "${cleanName}".`));
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/eventpay-admin/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Aanmaken mislukt (${res.status})`);
      }
      setSuccess(`Sector "${cleanName}" aangemaakt.`);
      setName('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const sortedSectors = [...sectors].sort((a, b) => b.id - a.id);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Nieuwe sector aanmaken</h2>
          <p>
            Maak een nieuwe sector aan voor een event. Werkt via de
            ingelogde sessie op EventPay's admin — dezelfde route als bij
            event-koppeling.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}
      <WarnAlert>
        Sectoren kun je niet via deze app verwijderen. Wil je er één weghalen
        of hernoemen? Doe dat in de EventPay admin-website zelf.
      </WarnAlert>

      <div className="card">
        <h3>Nieuwe sector</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="sector-name">Sectornaam</label>
            <input
              id="sector-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bv. Pizza Truck, Bar 2, Combi Cross 2..."
              maxLength={100}
              autoFocus
              required
            />
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="submit"
              className="btn"
              disabled={submitting || !name.trim()}
            >
              {submitting ? <span className="loading" /> : 'Aanmaken'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setName('')}
              disabled={submitting || !name}
            >
              Wissen
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>
          Bestaande sectoren{' '}
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
            ({sectors.length})
          </span>
        </h3>
        {loading ? (
          <p className="muted">Laden…</p>
        ) : sectors.length === 0 ? (
          <div className="empty">Nog geen sectoren.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Naam</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedSectors.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-num mono">{s.id}</td>
                    <td>{displayName(s.name)}</td>
                    <td>
                      {s.disabled ? (
                        <span className="badge">Inactief</span>
                      ) : (
                        <span className="badge badge-success">Actief</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
