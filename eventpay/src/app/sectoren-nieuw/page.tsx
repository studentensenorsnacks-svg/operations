'use client';

import { useEffect, useState } from 'react';
import { ErrorAlert, SuccessAlert, WarnAlert, InfoAlert } from '@/components/Alert';

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
  const [copyFrom, setCopyFrom] = useState<string>(''); // '' = lege locatie
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Diagnose van de wizard-structuur (alleen nodig als kopiëren faalt)
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<unknown>(null);

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
    if (
      sectors.some(
        (s) => displayName(s.name).toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setError(new Error(`Er bestaat al een locatie met de naam "${cleanName}".`));
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body: { name: string; copyFromSectorId?: number } = {
        name: cleanName,
      };
      if (copyFrom !== '') body.copyFromSectorId = parseInt(copyFrom, 10);
      const res = await fetch('/api/eventpay-admin/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Aanmaken mislukt (${res.status})`);
      }
      const copiedFrom =
        copyFrom !== ''
          ? displayName(
              sectors.find((s) => String(s.id) === copyFrom)?.name ?? '',
            )
          : null;
      setSuccess(
        copiedFrom
          ? `Locatie "${cleanName}" aangemaakt met de prijslijst van "${copiedFrom}".`
          : `Locatie "${cleanName}" aangemaakt (lege prijslijst).`,
      );
      setName('');
      setCopyFrom('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const runInspect = async () => {
    setInspecting(true);
    setInspection(null);
    setError(null);
    try {
      const res = await fetch('/api/eventpay-admin/sector-wizard-inspect');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Diagnose mislukt (${res.status})`);
      setInspection(data);
    } catch (e) {
      setError(e);
    } finally {
      setInspecting(false);
    }
  };

  const sortedSectors = [...sectors].sort((a, b) => b.id - a.id);
  const copyOptions = [...sectors]
    .filter((s) => !s.disabled)
    .sort((a, b) => displayName(a.name).localeCompare(displayName(b.name)));

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Locatie toevoegen</h2>
          <p>
            Maak een nieuwe locatie (sector) aan. Kies optioneel een bestaande
            locatie om de <strong>volledige prijslijst</strong> (categorieën +
            producten) van te kopiëren — bv. <em>Taptent</em> met hetzelfde
            aanbod als <em>Tapwagen</em>. Zo is de setup in één minuut klaar.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}
      <WarnAlert>
        Locaties kun je niet via deze app verwijderen of hernoemen. Doe dat in
        de EventPay admin-website zelf.
      </WarnAlert>

      <div className="card">
        <h3>Nieuwe locatie</h3>
        <form onSubmit={submit}>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="sector-name">Naam locatie</label>
              <input
                id="sector-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bv. Taptent, Bar 2, Combi Cross 2..."
                maxLength={100}
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="copy-from">Prijslijst kopiëren van</label>
              <select
                id="copy-from"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                disabled={loading}
              >
                <option value="">— Geen (lege locatie) —</option>
                {copyOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {displayName(s.name)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {copyFrom !== '' && (
            <InfoAlert>
              Alle categorieën en producten (met prijzen, BTW en kleuren) van de
              gekozen locatie worden overgenomen. Daarna kun je per product nog
              aanpassen via <strong>Producten &amp; sectoren</strong>.
            </InfoAlert>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="submit"
              className="btn"
              disabled={submitting || !name.trim()}
            >
              {submitting ? <span className="loading" /> : 'Locatie aanmaken'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setName('');
                setCopyFrom('');
              }}
              disabled={submitting || (!name && copyFrom === '')}
            >
              Wissen
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>
          Bestaande locaties{' '}
          <span
            className="muted"
            style={{ fontWeight: 400, fontSize: '0.85rem' }}
          >
            ({sectors.length})
          </span>
        </h3>
        {loading ? (
          <p className="muted">Laden…</p>
        ) : sectors.length === 0 ? (
          <div className="empty">Nog geen locaties.</div>
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

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Wizard-structuur tonen (diagnose)
        </summary>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Alleen nodig als het kopiëren faalt. Dit doorloopt de wizard
          read-only (maakt niets aan) en toont welke knoppen/velden de
          kopieer-stap aanbiedt.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={runInspect}
          disabled={inspecting}
        >
          {inspecting ? <span className="loading" /> : 'Structuur ophalen'}
        </button>
        {inspection !== null && (
          <pre className="json" style={{ marginTop: 10 }}>
            {JSON.stringify(inspection, null, 2)}
          </pre>
        )}
      </details>
    </>
  );
}
