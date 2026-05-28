'use client';

import { useState } from 'react';
import { api, formatDateTime, toRfc3339, uuidv4 } from '@/lib/client';
import type {
  IdentifiedProductsOrder,
  RefundIdentifiedRequest,
} from '@/lib/types';
import { ErrorAlert, SuccessAlert, WarnAlert, InfoAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function ReusablesPage() {
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
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [start, setStart] = useState(fmt(startOfToday));
  const [end, setEnd] = useState(fmt(endOfToday));
  const [orders, setOrders] = useState<IdentifiedProductsOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [refundOrder, setRefundOrder] = useState<IdentifiedProductsOrder | null>(
    null,
  );
  const [refundLines, setRefundLines] = useState<Record<number, number>>({});
  const [refundUid, setRefundUid] = useState(uuidv4());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<
        IdentifiedProductsOrder[] | { data: IdentifiedProductsOrder[] }
      >('/identified_products', {
        start_date: toRfc3339(start),
        end_date: toRfc3339(end),
      });
      setOrders(Array.isArray(res) ? res : 'data' in res ? res.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const productIdOf = (line: { product_id?: number }) => line.product_id;
  const quantityOf = (line: { detail_amount?: number; quantity?: number }) =>
    line.detail_amount ?? line.quantity ?? 1;

  const openRefund = (order: IdentifiedProductsOrder) => {
    setRefundOrder(order);
    const init: Record<number, number> = {};
    for (const line of order.identified_products ?? []) {
      const pid = productIdOf(line);
      if (pid != null) init[pid] = 0;
    }
    setRefundLines(init);
    setRefundUid(uuidv4());
  };

  const submitRefund = async () => {
    if (!refundOrder) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const refund = Object.entries(refundLines)
        .map(([pid, qty]) => ({ product: parseInt(pid, 10), quantity: qty }))
        .filter((r) => r.quantity > 0);
      const body: RefundIdentifiedRequest = {
        order_uid: refundOrder.order_uid,
        refund,
        idempotency_key: refundUid,
      };
      await api.post('/refund_identified_products', body);
      setSuccess(
        `Refund verwerkt voor order ${refundOrder.order_uid} (${refund.reduce(
          (a, r) => a + r.quantity,
          0,
        )} stuks).`,
      );
      setRefundOrder(null);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const refundTotal = Object.values(refundLines).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Reusables</h2>
          <p>
            Herbruikbare items (bv. bekers). Bekijk welke geïdentificeerde
            producten verkocht zijn binnen een periode en verwerk
            terugbetalingen wanneer ze worden teruggebracht.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="card">
        <h3>Periode</h3>
        <div className="grid grid-3">
          <div className="field">
            <label>Begin</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Eind</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="field" style={{ alignSelf: 'flex-end' }}>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? <span className="loading" /> : 'Orders ophalen'}
            </button>
          </div>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="card">
          <h3>Identified-products orders ({orders.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Order UID</th>
                  <th>Apparaat</th>
                  <th>Methode</th>
                  <th>Items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_uid}>
                    <td>{formatDateTime(o.ticket_date)}</td>
                    <td className="mono" style={{ fontSize: '0.78rem' }}>
                      {o.order_uid}
                    </td>
                    <td className="mono">{o.device_name ?? '—'}</td>
                    <td>{o.method_name ?? String(o.payment_method ?? '—')}</td>
                    <td>
                      {(o.identified_products ?? []).map((p, i) => (
                        <span
                          key={i}
                          className="badge"
                          style={{ marginRight: 4 }}
                        >
                          {p.product_name ?? `#${productIdOf(p)}`} ×{' '}
                          {quantityOf(p)}
                        </span>
                      ))}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openRefund(o)}
                      >
                        Refund…
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {orders.length === 0 && !loading && (
        <InfoAlert>
          Kies een periode en klik op <strong>Orders ophalen</strong> om
          identified-products terug te vinden.
        </InfoAlert>
      )}

      {refundOrder && (
        <div className="modal-backdrop" onClick={() => setRefundOrder(null)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Refund voor order</h3>
            <p className="mono" style={{ fontSize: '0.78rem' }}>
              {refundOrder.order_uid}
            </p>
            <WarnAlert>
              Per regel: hoeveel stuks worden teruggebracht? Items met 0 worden
              genegeerd.
            </WarnAlert>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="cell-num">Verkocht</th>
                    <th className="cell-num">Te refunden</th>
                  </tr>
                </thead>
                <tbody>
                  {(refundOrder.identified_products ?? []).map((line, i) => {
                    const pid = productIdOf(line);
                    if (pid == null) return null;
                    const q = quantityOf(line);
                    return (
                      <tr key={i}>
                        <td>
                          {line.product_name ?? `Product #${pid}`}
                          <div
                            className="muted mono"
                            style={{ fontSize: '0.78rem' }}
                          >
                            ID {pid}
                          </div>
                        </td>
                        <td className="cell-num">{q}</td>
                        <td className="cell-num">
                          <input
                            type="number"
                            min={0}
                            max={q}
                            value={refundLines[pid] ?? 0}
                            onChange={(e) =>
                              setRefundLines({
                                ...refundLines,
                                [pid]: parseInt(e.target.value) || 0,
                              })
                            }
                            style={{ width: 80, textAlign: 'right' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="field">
              <label>Idempotency-key</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={refundUid}
                  onChange={(e) => setRefundUid(e.target.value)}
                  className="mono"
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRefundUid(uuidv4())}
                >
                  Nieuw
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setRefundOrder(null)}
              >
                Annuleren
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={refundTotal === 0 || submitting}
              >
                {submitting ? (
                  <span className="loading" />
                ) : (
                  `Refund ${refundTotal} stuk(s)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Refund verwerken?"
        message={
          <>
            Je gaat <strong>{refundTotal}</strong> item(s) refunden voor order{' '}
            <span className="mono">{refundOrder?.order_uid}</span>. Dit is
            direct zichtbaar in EventPay. Doorgaan?
          </>
        }
        confirmLabel="Ja, refund verwerken"
        danger
        onConfirm={submitRefund}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
