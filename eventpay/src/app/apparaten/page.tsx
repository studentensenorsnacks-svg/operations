'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Device } from '@/lib/types';
import { ErrorAlert, SuccessAlert, WarnAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function ApparatenPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<Device | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Device[] | { data: Device[] }>('/devices');
      setDevices(Array.isArray(res) ? res : 'data' in res ? res.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Apparaten</h2>
          <p>
            Alle aangesloten apparaten (kassa's, terminals). Pas pinned
            instellingen aan of stuur een bericht naar één apparaat.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="toolbar">
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <span className="loading" /> : 'Verversen'}
        </button>
        <span className="muted">{devices.length} apparaten</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Naam</th>
                <th>App</th>
                <th>Versie</th>
                <th>Sector</th>
                <th>Fabrikant</th>
                <th>Pinned operator</th>
                <th>Pinned sector</th>
                <th>Batterij</th>
                <th>Comment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.device_name}>
                  <td className="mono">{d.device_name}</td>
                  <td>{d.device_app ?? '—'}</td>
                  <td>{d.app_version ?? '—'}</td>
                  <td>
                    {d.sector_name ?? (d.sector_id != null ? `#${d.sector_id}` : '—')}
                  </td>
                  <td>{d.manufacturer ?? '—'}</td>
                  <td>
                    {d.pinned_operator_name ??
                      (d.pinned_operator_id != null
                        ? `#${d.pinned_operator_id}`
                        : '—')}
                  </td>
                  <td>
                    {d.pinned_sector_name ??
                      (d.pinned_sector_id != null
                        ? `#${d.pinned_sector_id}`
                        : '—')}
                  </td>
                  <td className="cell-num">
                    {d.last_battery_percent != null
                      ? `${d.last_battery_percent}%`
                      : '—'}
                  </td>
                  <td>{d.comment ?? '—'}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelected(d)}
                    >
                      Acties
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {devices.length === 0 && !loading && (
          <div className="empty">Geen apparaten gevonden.</div>
        )}
      </div>

      {selected && (
        <DeviceActions
          device={selected}
          onClose={() => setSelected(null)}
          onError={setError}
          onSuccess={(msg) => {
            setSuccess(msg);
            setSelected(null);
            load();
          }}
        />
      )}
    </>
  );
}

function DeviceActions({
  device,
  onClose,
  onError,
  onSuccess,
}: {
  device: Device;
  onClose: () => void;
  onError: (e: unknown) => void;
  onSuccess: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'message' | 'settings'>('message');

  const [message, setMessage] = useState('');
  const [msgConfirmOpen, setMsgConfirmOpen] = useState(false);
  const [msgSubmitting, setMsgSubmitting] = useState(false);

  const [app, setApp] = useState(device.device_app ?? '');
  const [sectorId, setSectorId] = useState(
    device.sector_id != null ? String(device.sector_id) : '',
  );
  const [operatorId, setOperatorId] = useState(
    device.pinned_operator_id != null ? String(device.pinned_operator_id) : '',
  );
  const [terminalId, setTerminalId] = useState(
    device.pinned_payment_terminal_id != null
      ? String(device.pinned_payment_terminal_id)
      : '',
  );
  const [comment, setComment] = useState(device.comment ?? '');
  const [setConfirmOpen, _setSetConfirmOpen] = useState(false);
  const [setSubmitting, _setSetSubmitting] = useState(false);

  const sendMessage = async () => {
    setMsgConfirmOpen(false);
    setMsgSubmitting(true);
    try {
      await api.post(
        `/device/${encodeURIComponent(device.device_name)}/message`,
        { message },
      );
      onSuccess(`Bericht verzonden naar ${device.device_name}.`);
    } catch (e) {
      onError(e);
    } finally {
      setMsgSubmitting(false);
    }
  };

  const saveSettings = async () => {
    _setSetConfirmOpen(false);
    _setSetSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (sectorId !== '') body.sector_id = parseInt(sectorId, 10);
      if (operatorId !== '') body.operator_id = parseInt(operatorId, 10);
      if (terminalId !== '') body.terminal_id = parseInt(terminalId, 10);
      if (comment !== '') body.comment = comment;
      await api.post(
        `/devices/${encodeURIComponent(device.device_name)}/${encodeURIComponent(app || 'default')}`,
        body,
      );
      onSuccess(`Instellingen van ${device.device_name} bijgewerkt.`);
    } catch (e) {
      onError(e);
    } finally {
      _setSetSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          Apparaat <span className="mono">{device.device_name}</span>
        </h3>
        <div className="pill-toolbar">
          <button
            className={tab === 'message' ? 'active' : ''}
            onClick={() => setTab('message')}
          >
            Bericht sturen
          </button>
          <button
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => setTab('settings')}
          >
            Instellingen wijzigen
          </button>
        </div>

        {tab === 'message' && (
          <>
            <div className="field">
              <label>Bericht</label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Bv. 'Pauze tot 20:00' of 'Sluiten over 15 minuten'"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                Annuleren
              </button>
              <button
                className="btn"
                onClick={() => setMsgConfirmOpen(true)}
                disabled={!message || msgSubmitting}
              >
                {msgSubmitting ? <span className="loading" /> : 'Versturen'}
              </button>
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <WarnAlert>
              Wijzigingen worden direct toegepast op het apparaat.
            </WarnAlert>
            <div className="grid grid-2">
              <div className="field">
                <label>App</label>
                <input
                  type="text"
                  value={app}
                  onChange={(e) => setApp(e.target.value)}
                  placeholder="bv. one, cashier"
                />
              </div>
              <div className="field">
                <label>Sector ID</label>
                <input
                  type="number"
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Operator ID</label>
                <input
                  type="number"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Terminal ID</label>
                <input
                  type="number"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Comment</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                Annuleren
              </button>
              <button
                className="btn"
                onClick={() => _setSetConfirmOpen(true)}
                disabled={setSubmitting || !app}
              >
                {setSubmitting ? <span className="loading" /> : 'Opslaan'}
              </button>
            </div>
          </>
        )}

        <ConfirmDialog
          open={msgConfirmOpen}
          title="Bericht versturen?"
          message={
            <>
              Bericht <em>"{message}"</em> wordt verzonden naar apparaat{' '}
              <span className="mono">{device.device_name}</span>. Doorgaan?
            </>
          }
          onConfirm={sendMessage}
          onCancel={() => setMsgConfirmOpen(false)}
        />
        <ConfirmDialog
          open={setConfirmOpen}
          title="Instellingen wijzigen?"
          message={
            <>
              Pinned-instellingen van apparaat{' '}
              <span className="mono">{device.device_name}</span> worden
              bijgewerkt. Doorgaan?
            </>
          }
          danger
          onConfirm={saveSettings}
          onCancel={() => _setSetConfirmOpen(false)}
        />
      </div>
    </div>
  );
}
