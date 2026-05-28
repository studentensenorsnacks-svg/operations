'use client';

import { useState } from 'react';
import { api, formatAmount, formatDateTime } from '@/lib/client';
import {
  toNumber,
  type Wallet,
  type WalletAttribute,
  type Transaction,
  type Paginated,
} from '@/lib/types';
import { ErrorAlert, SuccessAlert, InfoAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

interface BalanceResponse {
  data?: Wallet;
  wallet?: Wallet;
  [key: string]: unknown;
}

function unwrapWallet(res: unknown): Wallet | null {
  if (!res || typeof res !== 'object') return null;
  const obj = res as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object') return obj.data as Wallet;
  if (obj.wallet && typeof obj.wallet === 'object') return obj.wallet as Wallet;
  return obj as Wallet;
}

function unwrapTransactions(res: unknown): Transaction[] {
  if (!res || typeof res !== 'object') return [];
  const obj = res as Record<string, unknown>;
  if (Array.isArray(obj.transactions)) return obj.transactions as Transaction[];
  if (obj.data && typeof obj.data === 'object') {
    const d = obj.data as Record<string, unknown>;
    if (Array.isArray(d.transactions)) return d.transactions as Transaction[];
  }
  return [];
}

export default function WalletsPage() {
  const [code, setCode] = useState('');
  const [isNfc, setIsNfc] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editAttr, setEditAttr] = useState<WalletAttribute>('name');
  const [editValue, setEditValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingAttr, setSavingAttr] = useState(false);

  const [listOpen, setListOpen] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(15);
  const [listWithHistory, setListWithHistory] = useState(false);
  const [listData, setListData] = useState<Paginated<Wallet> | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const lookupBalance = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post<BalanceResponse>('/wallet_balance', {
        eventpay: code.trim(),
        is_nfc: isNfc,
      });
      setWallet(unwrapWallet(res));
      setTransactions([]);
    } catch (e) {
      setError(e);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  };

  const lookupHistory = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post<BalanceResponse>('/wallet_history', {
        eventpay: code.trim(),
        is_nfc: isNfc,
      });
      setWallet(unwrapWallet(res));
      setTransactions(unwrapTransactions(res));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const requestEdit = (attr: WalletAttribute) => {
    setEditAttr(attr);
    if (!wallet) {
      setEditValue('');
    } else if (attr === 'groups') {
      const groups = wallet.groups ?? [];
      setEditValue(groups.map((g) => g.group_id).join(','));
    } else {
      const map: Record<WalletAttribute, keyof Wallet> = {
        name: 'wallet_name',
        comment: 'wallet_comment',
        can_refund: 'wallet_can_refund',
        can_topup: 'wallet_can_topup',
        can_order: 'wallet_can_order',
        allow_negative: 'wallet_allow_negative',
        pin: 'wallet_pin',
        groups: 'groups',
      };
      const v = wallet[map[attr]];
      setEditValue(
        typeof v === 'boolean' ? (v ? 'true' : 'false') : v == null ? '' : String(v),
      );
    }
    setEditing(true);
  };

  const confirmAttrChange = async () => {
    setConfirmOpen(false);
    setSavingAttr(true);
    setError(null);
    setSuccess(null);
    try {
      let value: unknown = editValue;
      if (
        editAttr === 'can_refund' ||
        editAttr === 'allow_negative' ||
        editAttr === 'can_order' ||
        editAttr === 'can_topup'
      ) {
        value = editValue === 'true';
      } else if (editAttr === 'groups') {
        value = editValue
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
      }
      const res = await api.post<BalanceResponse>('/wallet_attribute', {
        eventpay: code.trim(),
        is_nfc: isNfc,
        attribute: editAttr,
        value,
      });
      setWallet(unwrapWallet(res));
      setEditing(false);
      setSuccess(`Eigenschap "${editAttr}" bijgewerkt.`);
    } catch (e) {
      setError(e);
    } finally {
      setSavingAttr(false);
    }
  };

  const loadList = async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<Wallet>>('/wallets', {
        page: listPage,
        limit: listLimit,
        with_history: listWithHistory,
      });
      setListData(res);
    } catch (e) {
      setError(e);
    } finally {
      setListLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Wallets</h2>
          <p>
            Zoek een wallet via QR-link, alfanumerieke code of NFC UID. Bekijk
            saldo en historiek, pas eigenschappen aan.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="card">
        <h3>Wallet opzoeken</h3>
        <div className="field-row">
          <div className="field" style={{ flex: 3 }}>
            <label htmlFor="code">QR-link / code / NFC UID</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="bv. ABCD-1234 of een NFC UID"
              onKeyDown={(e) => {
                if (e.key === 'Enter') lookupBalance();
              }}
            />
          </div>
          <div className="field" style={{ alignSelf: 'flex-end', flex: 0 }}>
            <label>
              <input
                type="checkbox"
                checked={isNfc}
                onChange={(e) => setIsNfc(e.target.checked)}
              />
              Is NFC UID
            </label>
          </div>
          <div className="field" style={{ alignSelf: 'flex-end', flex: 0 }}>
            <button className="btn" onClick={lookupBalance} disabled={loading}>
              {loading ? <span className="loading" /> : 'Saldo'}
            </button>
          </div>
          <div className="field" style={{ alignSelf: 'flex-end', flex: 0 }}>
            <button
              className="btn btn-secondary"
              onClick={lookupHistory}
              disabled={loading}
            >
              Saldo + historiek
            </button>
          </div>
        </div>
      </div>

      {wallet && (
        <div className="card">
          <h3>
            Wallet:{' '}
            <span className="mono">
              {wallet.wallet_code ?? wallet.wallet_uid ?? '(onbekend)'}
            </span>
            {wallet.wallet_name ? ` — ${wallet.wallet_name}` : ''}
          </h3>
          <div className="grid grid-3">
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Saldo
              </div>
              <div className="amount" style={{ fontSize: '1.6rem' }}>
                {formatAmount(toNumber(wallet.wallet_balance))}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Rechten
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span
                  className={`badge ${wallet.wallet_can_refund ? 'badge-success' : ''}`}
                >
                  refund {wallet.wallet_can_refund ? 'ja' : 'nee'}
                </span>
                <span
                  className={`badge ${wallet.wallet_can_topup ? 'badge-success' : ''}`}
                >
                  opladen {wallet.wallet_can_topup ? 'ja' : 'nee'}
                </span>
                <span
                  className={`badge ${wallet.wallet_can_order ? 'badge-success' : ''}`}
                >
                  bestellen {wallet.wallet_can_order ? 'ja' : 'nee'}
                </span>
                <span
                  className={`badge ${wallet.wallet_allow_negative ? 'badge-warn' : ''}`}
                >
                  negatief {wallet.wallet_allow_negative ? 'toegestaan' : 'nee'}
                </span>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Groepen
              </div>
              <div>
                {wallet.groups && wallet.groups.length > 0
                  ? wallet.groups.map((g) => (
                      <span
                        key={g.group_id}
                        className="badge"
                        style={{ marginRight: 4 }}
                      >
                        {g.group_name} ({g.group_id})
                      </span>
                    ))
                  : '—'}
              </div>
            </div>
          </div>

          {wallet.buckets && wallet.buckets.length > 0 && (
            <div className="card-section">
              <div
                className="muted"
                style={{ fontSize: '0.78rem', marginBottom: 6 }}
              >
                Buckets
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Naam</th>
                      <th className="cell-num">Bedrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.buckets.map((b, i) => (
                      <tr key={b.bucket_id ?? i}>
                        <td>{b.bucket_name ?? '(zonder naam)'}</td>
                        <td className="cell-num">
                          {formatAmount(
                            toNumber(b.bucket_amount),
                            b.bucket_currency ?? '€',
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {wallet.vouchers && wallet.vouchers.length > 0 && (
            <div className="card-section">
              <div
                className="muted"
                style={{ fontSize: '0.78rem', marginBottom: 6 }}
              >
                Vouchers
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Naam</th>
                      <th className="cell-num">Bedrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.vouchers.map((v, i) => (
                      <tr key={v.voucher_id ?? i}>
                        <td>{v.voucher_id ?? '—'}</td>
                        <td>{v.voucher_name ?? '—'}</td>
                        <td className="cell-num">
                          {formatAmount(toNumber(v.voucher_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card-section">
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>
              Eigenschap aanpassen
            </h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Schrijft direct naar productie. Je krijgt een bevestiging voor de
              wijziging effectief wordt.
            </p>
            <div className="pill-toolbar">
              {(
                [
                  'name',
                  'comment',
                  'can_refund',
                  'can_topup',
                  'can_order',
                  'allow_negative',
                  'pin',
                  'groups',
                ] as WalletAttribute[]
              ).map((a) => (
                <button
                  key={a}
                  className={editing && editAttr === a ? 'active' : ''}
                  onClick={() => requestEdit(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            {editing && (
              <div className="field-row">
                <div className="field" style={{ flex: 3 }}>
                  <label>Nieuwe waarde voor "{editAttr}"</label>
                  {editAttr === 'can_refund' ||
                  editAttr === 'can_topup' ||
                  editAttr === 'can_order' ||
                  editAttr === 'allow_negative' ? (
                    <select
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    >
                      <option value="true">true (ja)</option>
                      <option value="false">false (nee)</option>
                    </select>
                  ) : editAttr === 'groups' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="ID's gescheiden door komma, bv: 1,5,12"
                    />
                  ) : (
                    <input
                      type={editAttr === 'pin' ? 'password' : 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                  )}
                </div>
                <div className="field" style={{ alignSelf: 'flex-end' }}>
                  <button
                    className="btn"
                    onClick={() => setConfirmOpen(true)}
                    disabled={savingAttr}
                  >
                    {savingAttr ? <span className="loading" /> : 'Opslaan'}
                  </button>
                </div>
                <div className="field" style={{ alignSelf: 'flex-end' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditing(false)}
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </div>

          <details className="card-section">
            <summary>Volledige JSON-respons tonen</summary>
            <pre className="json">{JSON.stringify(wallet, null, 2)}</pre>
          </details>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="card">
          <h3>Transactiehistoriek ({transactions.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Datum</th>
                  <th>Methode</th>
                  <th className="cell-num">Bedrag</th>
                  <th>Sector</th>
                  <th>Apparaat</th>
                  <th>Operator</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const amount = toNumber(t.transaction_amount);
                  return (
                    <tr key={t.transaction_id}>
                      <td className="mono">{t.transaction_id}</td>
                      <td>{formatDateTime(t.transaction_date)}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>
          <button
            className="btn btn-ghost"
            onClick={() => setListOpen(!listOpen)}
            style={{ padding: 0, fontSize: '1.05rem' }}
          >
            {listOpen ? '▼' : '▶'} Alle wallets doorbladeren
          </button>
        </h3>
        {listOpen && (
          <>
            <InfoAlert>
              Deze functie haalt wallets paginagewijs op. Wees voorzichtig met{' '}
              <span className="mono">with_history</span> op grote events — dat
              maakt elke respons fors.
            </InfoAlert>
            <div className="field-row">
              <div className="field">
                <label>Pagina</label>
                <input
                  type="number"
                  min={1}
                  value={listPage}
                  onChange={(e) => setListPage(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="field">
                <label>Per pagina (max 100)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={listLimit}
                  onChange={(e) => setListLimit(parseInt(e.target.value) || 15)}
                />
              </div>
              <div className="field" style={{ alignSelf: 'flex-end' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={listWithHistory}
                    onChange={(e) => setListWithHistory(e.target.checked)}
                  />
                  Met historiek
                </label>
              </div>
              <div className="field" style={{ alignSelf: 'flex-end' }}>
                <button
                  className="btn"
                  onClick={loadList}
                  disabled={listLoading}
                >
                  {listLoading ? <span className="loading" /> : 'Ophalen'}
                </button>
              </div>
            </div>
            {listData && (
              <>
                <div
                  className="muted"
                  style={{ fontSize: '0.85rem', marginBottom: 8 }}
                >
                  Pagina {listData.meta?.current_page ?? '?'} /{' '}
                  {listData.meta?.last_page ?? '?'} — totaal{' '}
                  {listData.meta?.total ?? listData.data.length} wallets
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID / UID</th>
                        <th>Code</th>
                        <th>Naam</th>
                        <th className="cell-num">Saldo</th>
                        <th>Groepen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.data.map((w, i) => (
                        <tr key={w.wallet_id ?? w.wallet_uid ?? i}>
                          <td className="mono">
                            {w.wallet_id ?? w.wallet_uid ?? '—'}
                          </td>
                          <td className="mono">{w.wallet_code ?? '—'}</td>
                          <td>{w.wallet_name ?? '—'}</td>
                          <td className="cell-num">
                            {formatAmount(toNumber(w.wallet_balance))}
                          </td>
                          <td>
                            {w.groups && Array.isArray(w.groups)
                              ? w.groups.map((g) => g.group_name).join(', ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listData.data.length === 0 && (
                  <div className="empty">
                    Geen wallets op deze pagina. Het event heeft mogelijk nog
                    geen wallets.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Eigenschap "${editAttr}" wijzigen?`}
        message={
          <>
            Je staat op het punt om de eigenschap <strong>{editAttr}</strong>{' '}
            van wallet <span className="mono">{code}</span> te wijzigen naar{' '}
            <strong>{editValue || '(leeg)'}</strong>. Dit gaat direct naar
            productie. Doorgaan?
          </>
        }
        confirmLabel="Ja, wijzigen"
        danger
        onConfirm={confirmAttrChange}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
