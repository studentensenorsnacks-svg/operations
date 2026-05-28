'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Operator, OperatorGroup } from '@/lib/types';
import { ErrorAlert, SuccessAlert, InfoAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function OperatorenPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [groups, setGroups] = useState<OperatorGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tab, setTab] = useState<'list' | 'sync'>('list');

  const [extId, setExtId] = useState('');
  const [name, setName] = useState('');
  const [eventpay, setEventpay] = useState('');
  const [groupIds, setGroupIds] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncResult, setSyncResult] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ops, grs] = await Promise.all([
        api.get<Operator[] | { data: Operator[] }>('/operators'),
        api.get<OperatorGroup[] | { data: OperatorGroup[] }>('/operator_groups'),
      ]);
      setOperators(Array.isArray(ops) ? ops : 'data' in ops ? ops.data : []);
      setGroups(Array.isArray(grs) ? grs : 'data' in grs ? grs.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitSync = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    try {
      const body: Record<string, unknown> = { id: extId, name };
      if (eventpay) body.eventpay = eventpay;
      const gids = groupIds
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (gids.length) body.groups = gids;
      const res = await api.post<unknown>('/operator_sync', body);
      setSyncResult(res);
      setSuccess(`Operator "${name}" gesynchroniseerd.`);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const rolesToString = (roles?: Record<string, boolean>) => {
    if (!roles) return '—';
    const active = Object.entries(roles)
      .filter(([, v]) => v)
      .map(([k]) => k);
    return active.length ? active.join(', ') : '—';
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Operatoren</h2>
          <p>
            Bekijk operatoren en hun groepen. Synchroniseer een externe ID (uit
            een personeels­systeem) zodat EventPay weet wie wie is.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="pill-toolbar">
        <button
          className={tab === 'list' ? 'active' : ''}
          onClick={() => setTab('list')}
        >
          Lijst
        </button>
        <button
          className={tab === 'sync' ? 'active' : ''}
          onClick={() => setTab('sync')}
        >
          Operator synchroniseren
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={load}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? <span className="loading" /> : 'Verversen'}
        </button>
      </div>

      {tab === 'list' && (
        <>
          <div className="card">
            <h3>Operatorgroepen ({groups.length})</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Naam</th>
                    <th>Zichtbaar</th>
                    <th>PIN</th>
                    <th>Apps</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.group_id}>
                      <td className="mono">{g.group_id}</td>
                      <td>{g.group_name}</td>
                      <td>{g.group_visible ? 'ja' : 'nee'}</td>
                      <td className="mono">{g.group_pin ?? '—'}</td>
                      <td className="muted" style={{ fontSize: '0.83rem' }}>
                        {g.group_apps
                          ? Object.entries(g.group_apps)
                              .filter(([, v]) => v)
                              .map(([k]) => k)
                              .join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Operatoren ({operators.length})</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Serial</th>
                    <th>Naam</th>
                    <th>PIN</th>
                    <th>Rollen</th>
                    <th>Groepen</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((o) => (
                    <tr key={o.operator_id}>
                      <td className="mono">{o.operator_id}</td>
                      <td className="mono">{o.operator_serial ?? '—'}</td>
                      <td>{o.operator_name}</td>
                      <td className="mono">{o.operator_pin ?? '—'}</td>
                      <td>{rolesToString(o.roles)}</td>
                      <td>
                        {o.groups && o.groups.length > 0
                          ? o.groups.map((g) => g.group_name).join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {operators.length === 0 && !loading && (
              <div className="empty">Geen operatoren gevonden.</div>
            )}
          </div>
        </>
      )}

      {tab === 'sync' && (
        <div className="card">
          <h3>Operator aanmaken / updaten</h3>
          <InfoAlert>
            Geef een externe ID op (uit jouw personeelssysteem). EventPay
            gebruikt die om te bepalen of het een nieuwe of bestaande operator
            is. De serial en wallet UID worden teruggegeven.
          </InfoAlert>
          <div className="grid grid-2">
            <div className="field">
              <label>Externe ID (verplicht)</label>
              <input
                type="text"
                value={extId}
                onChange={(e) => setExtId(e.target.value)}
                placeholder="bv. emp-2026-0145"
              />
            </div>
            <div className="field">
              <label>Naam (verplicht, max 255 tekens)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Wallet UID koppelen (optioneel)</label>
              <input
                type="text"
                value={eventpay}
                onChange={(e) => setEventpay(e.target.value)}
                placeholder="bv. wallet-uid uit /wallet_balance"
              />
            </div>
            <div className="field">
              <label>Groep-IDs (komma-gescheiden, optioneel)</label>
              <input
                type="text"
                value={groupIds}
                onChange={(e) => setGroupIds(e.target.value)}
                placeholder="bv. 1,3"
              />
            </div>
          </div>
          <div className="toolbar">
            <button
              className="btn"
              disabled={!extId || !name || submitting}
              onClick={() => setConfirmOpen(true)}
            >
              {submitting ? <span className="loading" /> : 'Synchroniseren'}
            </button>
          </div>
          {syncResult !== null && (
            <details className="card-section" open>
              <summary>Antwoord van EventPay</summary>
              <pre className="json">{JSON.stringify(syncResult, null, 2)}</pre>
            </details>
          )}

          <ConfirmDialog
            open={confirmOpen}
            title="Operator synchroniseren?"
            message={
              <>
                Operator <strong>{name}</strong> met externe ID{' '}
                <span className="mono">{extId}</span> wordt aangemaakt of
                bijgewerkt in productie. Doorgaan?
              </>
            }
            confirmLabel="Ja, synchroniseren"
            onConfirm={submitSync}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      )}
    </>
  );
}
