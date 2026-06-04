'use client';

import { useEffect, useState } from 'react';
import { ErrorAlert, SuccessAlert, InfoAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Beheerder {
  username: string;
  createdAt: number;
  createdBy: string;
}

function formatDate(ms: number): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString('nl-BE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export default function BeheerdersPage() {
  const [beheerders, setBeheerders] = useState<Beheerder[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Laden mislukt (${res.status})`);
      }
      const data = (await res.json()) as { beheerders: Beheerder[] };
      setBeheerders(data.beheerders);
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
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Aanmaken mislukt (${res.status})`);
      }
      setSuccess(`Beheerder "${username.trim().toLowerCase()}" aangemaakt.`);
      setUsername('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(target)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Verwijderen mislukt (${res.status})`);
      }
      setSuccess(`Beheerder "${target}" verwijderd.`);
      await load();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Beheerders</h2>
          <p>
            Maak accounts aan voor medewerkers. Een beheerder mag alles in deze
            app, behalve het beheren van accounts — dat blijft voorbehouden aan
            de centrale beheerder.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="card">
        <h3>Nieuwe beheerder</h3>
        <form onSubmit={submit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="bh-user">Gebruikersnaam</label>
              <input
                id="bh-user"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="bv. jan, bar2, kassa-piet"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={40}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="bh-pass">Code</label>
              <input
                id="bh-pass"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="minstens 6 tekens"
                autoComplete="off"
                required
              />
            </div>
          </div>
          <div
            className="modal-actions"
            style={{ justifyContent: 'flex-start' }}
          >
            <button
              type="submit"
              className="btn"
              disabled={submitting || !username.trim() || password.length < 6}
            >
              {submitting ? <span className="loading" /> : 'Beheerder aanmaken'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
            Tip: de code is hier zichtbaar zodat je hem kunt doorgeven. Geef
            elke medewerker een eigen account zodat je toegang per persoon kunt
            intrekken.
          </p>
        </form>
      </div>

      <div className="card">
        <h3>
          Bestaande beheerders{' '}
          <span
            className="muted"
            style={{ fontWeight: 400, fontSize: '0.85rem' }}
          >
            ({beheerders.length})
          </span>
        </h3>
        {loading ? (
          <p className="muted">
            <span className="loading" /> Laden…
          </p>
        ) : beheerders.length === 0 ? (
          <InfoAlert>
            Nog geen beheerders. Alleen de centrale beheerder kan momenteel
            inloggen.
          </InfoAlert>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gebruikersnaam</th>
                  <th>Aangemaakt</th>
                  <th>Door</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {beheerders.map((b) => (
                  <tr key={b.username}>
                    <td className="mono">{b.username}</td>
                    <td>{formatDate(b.createdAt)}</td>
                    <td className="muted">{b.createdBy || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setToDelete(b.username)}
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Beheerder verwijderen"
        message={
          <>
            Account <strong>{toDelete}</strong> verwijderen? Deze persoon kan
            daarna niet meer inloggen.
          </>
        }
        confirmLabel="Verwijderen"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
