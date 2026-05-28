'use client';

import { useEffect, useState } from 'react';
import {
  api,
  formatAmount,
  formatDateTime,
  toRfc3339,
  uuidv4,
} from '@/lib/client';
import {
  toNumber,
  type Paginated,
  type Transaction,
  type TransactionMethod,
} from '@/lib/types';
import { ErrorAlert, SuccessAlert, WarnAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

interface TabState {
  current: 'lijst' | 'aanmaken' | 'ongedaan';
}

export default function TransactiesPage() {
  const [tab, setTab] = useState<TabState['current']>('lijst');
  const [methods, setMethods] = useState<TransactionMethod[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TransactionMethod[]>('/transaction_methods')
      .then((res) => setMethods(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Transacties</h2>
          <p>
            Bekijk transacties met uitgebreide filters, maak nieuwe transacties
            aan (opladen / cash / kaart) of maak ze ongedaan.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="pill-toolbar">
        <button
          className={tab === 'lijst' ? 'active' : ''}
          onClick={() => setTab('lijst')}
        >
          Lijst doorzoeken
        </button>
        <button
          className={tab === 'aanmaken' ? 'active' : ''}
          onClick={() => setTab('aanmaken')}
        >
          Transactie aanmaken
        </button>
        <button
          className={tab === 'ongedaan' ? 'active' : ''}
          onClick={() => setTab('ongedaan')}
        >
          Transactie ongedaan maken
        </button>
      </div>

      {tab === 'lijst' && (
        <TransactionList
          methods={methods}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === 'aanmaken' && (
        <CreateTransaction
          methods={methods}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === 'ongedaan' && (
        <UndoTransaction setError={setError} setSuccess={setSuccess} />
      )}
    </>
  );
}

function TransactionList({
  methods,
  setError,
  setSuccess,
}: {
  methods: TransactionMethod[];
  setError: (e: unknown) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 25,
    id: '',
    wallet_code: '',
    amount: '',
    amount_type: '=',
    method_id: '',
    comment: '',
    operator: '',
    sector: '',
    device: '',
    begin: '',
    end: '',
    is_charge: '' as '' | 'true' | 'false',
    is_order: '' as '' | 'true' | 'false',
    sort_by: 'date',
    sort_direction: 'desc',
  });
  const [data, setData] = useState<Paginated<Transaction> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const query: Record<string, unknown> = {
        page: filters.page,
        limit: filters.limit,
      };
      if (filters.id) query.id = filters.id;
      if (filters.wallet_code) query.wallet_code = filters.wallet_code;
      if (filters.amount) {
        query.amount = filters.amount;
        query.amount_type = filters.amount_type;
      }
      if (filters.method_id) query.methods = [filters.method_id];
      if (filters.comment) query.comment = filters.comment;
      if (filters.operator) query.operator = filters.operator;
      if (filters.sector) query.sector = filters.sector;
      if (filters.device) query.device = filters.device;
      if (filters.begin) query.begin = toRfc3339(filters.begin);
      if (filters.end) query.end = toRfc3339(filters.end);
      if (filters.is_charge !== '') query.is_charge = filters.is_charge;
      if (filters.is_order !== '') query.is_order = filters.is_order;
      if (filters.sort_by) query.sort_by = filters.sort_by;
      if (filters.sort_direction) query.sort_direction = filters.sort_direction;
      const res = await api.get<Paginated<Transaction>>(
        '/transactions',
        query as Record<string, string | number | boolean | string[]>,
      );
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setError(null);
    try {
      const res = await api.get<{ data?: Transaction } | Transaction>(
        `/transaction/${id}`,
      );
      const tx =
        res && typeof res === 'object' && 'data' in res
          ? ((res as { data: Transaction }).data ?? null)
          : (res as Transaction);
      setSelectedTx(tx);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card">
      <h3>Filters</h3>
      <div className="grid grid-3">
        <div className="field">
          <label>Transactie-ID</label>
          <input
            type="text"
            value={filters.id}
            onChange={(e) => setFilters({ ...filters, id: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Wallet-code</label>
          <input
            type="text"
            value={filters.wallet_code}
            onChange={(e) =>
              setFilters({ ...filters, wallet_code: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label>Comment (bevat)</label>
          <input
            type="text"
            value={filters.comment}
            onChange={(e) =>
              setFilters({ ...filters, comment: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label>Bedrag</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={filters.amount_type}
              onChange={(e) =>
                setFilters({ ...filters, amount_type: e.target.value })
              }
              style={{ width: 70 }}
            >
              <option value="=">=</option>
              <option value="<">&lt;</option>
              <option value=">">&gt;</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={filters.amount}
              onChange={(e) =>
                setFilters({ ...filters, amount: e.target.value })
              }
            />
          </div>
        </div>
        <div className="field">
          <label>Methode</label>
          <select
            value={filters.method_id}
            onChange={(e) =>
              setFilters({ ...filters, method_id: e.target.value })
            }
          >
            <option value="">— alle —</option>
            {methods.map((m) => (
              <option key={m.method_id} value={m.method_id}>
                {m.method_name} (id {m.method_id})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Operator</label>
          <input
            type="text"
            value={filters.operator}
            onChange={(e) =>
              setFilters({ ...filters, operator: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label>Sector</label>
          <input
            type="text"
            value={filters.sector}
            onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Apparaat</label>
          <input
            type="text"
            value={filters.device}
            onChange={(e) => setFilters({ ...filters, device: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Type</label>
          <select
            value={`${filters.is_charge}|${filters.is_order}`}
            onChange={(e) => {
              const [ch, or] = e.target.value.split('|');
              setFilters({
                ...filters,
                is_charge: ch as '' | 'true' | 'false',
                is_order: or as '' | 'true' | 'false',
              });
            }}
          >
            <option value="|">— alle —</option>
            <option value="true|">Alleen opladingen</option>
            <option value="|true">Alleen bestellingen</option>
            <option value="false|false">Andere</option>
          </select>
        </div>
        <div className="field">
          <label>Begin (datum/tijd)</label>
          <input
            type="datetime-local"
            value={filters.begin}
            onChange={(e) => setFilters({ ...filters, begin: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Eind (datum/tijd)</label>
          <input
            type="datetime-local"
            value={filters.end}
            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Sorteren op / richting</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={filters.sort_by}
              onChange={(e) =>
                setFilters({ ...filters, sort_by: e.target.value })
              }
            >
              <option value="date">Datum</option>
              <option value="id">ID</option>
              <option value="amount">Bedrag</option>
            </select>
            <select
              value={filters.sort_direction}
              onChange={(e) =>
                setFilters({ ...filters, sort_direction: e.target.value })
              }
            >
              <option value="desc">Nieuw → oud</option>
              <option value="asc">Oud → nieuw</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Per pagina (1-100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={filters.limit}
            onChange={(e) =>
              setFilters({ ...filters, limit: parseInt(e.target.value) || 25 })
            }
          />
        </div>
        <div className="field">
          <label>Pagina</label>
          <input
            type="number"
            min={1}
            value={filters.page}
            onChange={(e) =>
              setFilters({ ...filters, page: parseInt(e.target.value) || 1 })
            }
          />
        </div>
      </div>
      <div className="toolbar">
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? <span className="loading" /> : 'Ophalen'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            setFilters({
              page: 1,
              limit: 25,
              id: '',
              wallet_code: '',
              amount: '',
              amount_type: '=',
              method_id: '',
              comment: '',
              operator: '',
              sector: '',
              device: '',
              begin: '',
              end: '',
              is_charge: '',
              is_order: '',
              sort_by: 'date',
              sort_direction: 'desc',
            })
          }
        >
          Filters wissen
        </button>
      </div>

      {data && (
        <>
          <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 8 }}>
            Pagina {data.meta?.current_page ?? '?'} /{' '}
            {data.meta?.last_page ?? '?'} — totaal{' '}
            {data.meta?.total ?? data.data.length} transacties
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Datum</th>
                  <th>Type</th>
                  <th>Wallet</th>
                  <th>Methode</th>
                  <th className="cell-num">Bedrag</th>
                  <th>Sector</th>
                  <th>Apparaat</th>
                  <th>Operator</th>
                  <th>Comment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((t) => {
                  const amount = toNumber(t.transaction_amount);
                  return (
                    <tr key={t.transaction_id}>
                      <td className="mono">{t.transaction_id}</td>
                      <td>{formatDateTime(t.transaction_date)}</td>
                      <td>
                        <span className="badge">{t.transaction_type ?? '—'}</span>
                      </td>
                      <td className="mono">
                        {t.wallet_code ?? t.wallet_name ?? '—'}
                      </td>
                      <td>{t.method_name ?? '—'}</td>
                      <td
                        className={`cell-num amount ${
                          (amount ?? 0) < 0
                            ? 'amount-negative'
                            : 'amount-positive'
                        }`}
                      >
                        {formatAmount(amount)}
                      </td>
                      <td>{t.sector_name ?? '—'}</td>
                      <td>{t.device_name ?? '—'}</td>
                      <td>{t.operator_name ?? '—'}</td>
                      <td>{t.transaction_comment ?? ''}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => loadDetail(t.transaction_id)}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.data.length === 0 && (
            <div className="empty">Geen transacties gevonden.</div>
          )}
        </>
      )}

      {selectedTx && (
        <div className="modal-backdrop" onClick={() => setSelectedTx(null)}>
          <div
            className="modal"
            style={{ maxWidth: 720 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Transactie #{selectedTx.transaction_id}</h3>
            <pre className="json">{JSON.stringify(selectedTx, null, 2)}</pre>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedTx(null)}
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTransaction({
  methods,
  setError,
  setSuccess,
}: {
  methods: TransactionMethod[];
  setError: (e: unknown) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [walletCode, setWalletCode] = useState('');
  const [isNfc, setIsNfc] = useState(false);
  const [amount, setAmount] = useState('');
  const [methodId, setMethodId] = useState('');
  const [comment, setComment] = useState('');
  const [operatorSerial, setOperatorSerial] = useState('');
  const [uid, setUid] = useState(uuidv4());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const submit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        eventpay: walletCode.trim(),
        is_nfc: isNfc,
        amount: parseFloat(amount),
        method: methodId ? parseInt(methodId, 10) : undefined,
        comment: comment || undefined,
        uid,
      };
      if (operatorSerial) body.operator_serial = operatorSerial;
      const res = await api.post<unknown>('/transaction', body);
      setResult(res);
      setSuccess(
        `Transactie aangemaakt (${formatAmount(parseFloat(amount))} op ${walletCode}).`,
      );
      setUid(uuidv4());
      setAmount('');
      setComment('');
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    walletCode.trim().length > 0 &&
    amount.length > 0 &&
    !isNaN(parseFloat(amount)) &&
    methodId.length > 0;

  return (
    <div className="card">
      <h3>Nieuwe transactie</h3>
      <WarnAlert>
        <strong>Productie.</strong> Een opwaardering (positief bedrag) of
        verkoop (negatief bedrag) wordt direct uitgevoerd. De{' '}
        <span className="mono">uid</span> is een idempotency-key — als je per
        ongeluk twee keer klikt wordt de tweede aanvraag genegeerd.
      </WarnAlert>
      <div className="grid grid-2">
        <div className="field">
          <label>Wallet (QR-link / code / NFC UID)</label>
          <input
            type="text"
            value={walletCode}
            onChange={(e) => setWalletCode(e.target.value)}
          />
        </div>
        <div className="field" style={{ alignSelf: 'flex-end' }}>
          <label>
            <input
              type="checkbox"
              checked={isNfc}
              onChange={(e) => setIsNfc(e.target.checked)}
            />
            Is NFC UID
          </label>
        </div>
        <div className="field">
          <label>Bedrag (positief = opladen, negatief = verkoop)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Betaalmethode</label>
          <select
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
          >
            <option value="">— kies methode —</option>
            {methods.map((m) => (
              <option key={m.method_id} value={m.method_id}>
                {m.method_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Operator-serial (optioneel)</label>
          <input
            type="text"
            value={operatorSerial}
            onChange={(e) => setOperatorSerial(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Comment (optioneel)</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Idempotency UID (auto-gegenereerd)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              className="mono"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setUid(uuidv4())}
            >
              Nieuw
            </button>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <button
          className="btn"
          disabled={!isValid || submitting}
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? <span className="loading" /> : 'Transactie aanmaken'}
        </button>
      </div>

      {result !== null && (
        <details className="card-section" open>
          <summary>Antwoord van EventPay</summary>
          <pre className="json">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Transactie aanmaken?"
        message={
          <>
            <strong>{formatAmount(parseFloat(amount))}</strong> op wallet{' '}
            <span className="mono">{walletCode}</span> via methode {methodId}.
            Dit gaat direct naar productie. Doorgaan?
          </>
        }
        confirmLabel="Ja, aanmaken"
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function UndoTransaction({
  setError,
  setSuccess,
}: {
  setError: (e: unknown) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [walletCode, setWalletCode] = useState('');
  const [isNfc, setIsNfc] = useState(false);
  const [txId, setTxId] = useState('');
  const [txUid, setTxUid] = useState('');
  const [comment, setComment] = useState('');
  const [uid, setUid] = useState(uuidv4());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const submit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        eventpay: walletCode.trim(),
        is_nfc: isNfc,
        uid,
      };
      if (txId) body['undo-transaction-id'] = parseInt(txId, 10);
      if (txUid) body['undo-transaction-uid'] = txUid;
      if (comment) body['undo-transaction-with-comment'] = comment;
      const res = await api.del<unknown>('/transaction', body);
      setResult(res);
      setSuccess('Transactie ongedaan gemaakt.');
      setUid(uuidv4());
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    walletCode.trim().length > 0 && (txId.length > 0 || txUid.length > 0);

  return (
    <div className="card">
      <h3>Transactie ongedaan maken</h3>
      <WarnAlert>
        <strong>Onomkeerbaar in praktijk.</strong> Hier wordt een omgekeerde
        transactie aangemaakt op de wallet. Geef het ID of de UID van de
        oorspronkelijke transactie op.
      </WarnAlert>
      <div className="grid grid-2">
        <div className="field">
          <label>Wallet</label>
          <input
            type="text"
            value={walletCode}
            onChange={(e) => setWalletCode(e.target.value)}
          />
        </div>
        <div className="field" style={{ alignSelf: 'flex-end' }}>
          <label>
            <input
              type="checkbox"
              checked={isNfc}
              onChange={(e) => setIsNfc(e.target.checked)}
            />
            Is NFC UID
          </label>
        </div>
        <div className="field">
          <label>Originele transactie-ID (één van beide invullen)</label>
          <input
            type="number"
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Originele transactie-UID</label>
          <input
            type="text"
            value={txUid}
            onChange={(e) => setTxUid(e.target.value)}
            className="mono"
          />
        </div>
        <div className="field">
          <label>Comment voor de undo (optioneel)</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Idempotency UID</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              className="mono"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setUid(uuidv4())}
            >
              Nieuw
            </button>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <button
          className="btn btn-danger"
          disabled={!isValid || submitting}
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? (
            <span className="loading" />
          ) : (
            'Transactie ongedaan maken'
          )}
        </button>
      </div>

      {result !== null && (
        <details className="card-section" open>
          <summary>Antwoord van EventPay</summary>
          <pre className="json">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Transactie ongedaan maken?"
        message={
          <>
            Je maakt transactie{' '}
            <span className="mono">{txId || txUid}</span> op wallet{' '}
            <span className="mono">{walletCode}</span> ongedaan. Dit is direct
            zichtbaar voor de klant. Doorgaan?
          </>
        }
        confirmLabel="Ja, ongedaan maken"
        danger
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
