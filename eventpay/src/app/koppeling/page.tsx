'use client';

import { useEffect, useMemo, useState } from 'react';
import { ErrorAlert, SuccessAlert, WarnAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

const UNASSIGNED = -999;

interface AdminDevice {
  device_name: string;
  device_uid: string;
  device_app: string;
  sector_id: number | null;
  sector_name: string | null;
  comment: string | null;
}

interface AdminSector {
  id: number;
  name: string;
  disabled: boolean;
}

interface OverviewResponse {
  devices: AdminDevice[];
  sectors: AdminSector[];
}

function displaySectorName(name: string): string {
  return name.replace(/\s*\[ID:\s*-?\d+\]\s*$/, '');
}

export default function KoppelingPage() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [sectors, setSectors] = useState<AdminSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [pending, setPending] = useState<{
    device: AdminDevice;
    sector: AdminSector;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/eventpay-admin/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body && body.message) || `Overview laden mislukt (${res.status})`,
        );
      }
      const data = (await res.json()) as OverviewResponse;
      setDevices(data.devices);
      setSectors(data.sectors.filter((s) => !s.disabled));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(() => {
    const map = new Map<number, AdminDevice[]>();
    map.set(UNASSIGNED, []);
    for (const s of sectors) map.set(s.id, []);
    for (const d of devices) {
      const key = d.sector_id ?? UNASSIGNED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [devices, sectors]);

  const onDrop = (sectorId: number) => {
    if (!dragging) return;
    const device = devices.find((d) => d.device_uid === dragging);
    setDragging(null);
    setDropTarget(null);
    if (!device) return;
    if (sectorId === UNASSIGNED) return; // ontkoppelen niet ondersteund via dezelfde flow
    const sector = sectors.find((s) => s.id === sectorId);
    if (!sector) return;
    if (device.sector_id === sector.id) return;
    setPending({ device, sector });
  };

  const confirmAssign = async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/eventpay-admin/set-sector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_uid: pending.device.device_uid,
          device_app: pending.device.device_app,
          sector_id: pending.sector.id,
          sector_name: pending.sector.name,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body && body.message) || `Koppelen mislukt (${res.status})`,
        );
      }
      setSuccess(
        `${pending.device.device_name} gekoppeld aan ${displaySectorName(pending.sector.name)}.`,
      );
      setPending(null);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Event-koppeling</h2>
          <p>
            Sleep een apparaat naar een event om het te koppelen. De wijziging
            wordt onmiddellijk doorgevoerd in EventPay's admin.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}
      <WarnAlert>
        Loopt via je EventPay-login (geen officiële API). Wijzigingen
        verschijnen meteen in EventPay's admin.
      </WarnAlert>

      <div className="toolbar">
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <span className="loading" /> : 'Verversen'}
        </button>
        <span className="muted">
          {devices.length} apparaten · {sectors.length} events
        </span>
      </div>

      <div className="kanban">
        <KanbanColumn
          title="Niet gekoppeld"
          subtitle="Geen sector"
          devices={columns.get(UNASSIGNED) ?? []}
          dragging={dragging}
          isOver={false}
          onDragOver={() => {}}
          onDragLeave={() => {}}
          onDrop={() => onDrop(UNASSIGNED)}
          onDragStart={setDragging}
          onDragEnd={() => {
            setDragging(null);
            setDropTarget(null);
          }}
          unassigned
        />
        {sectors.map((s) => (
          <KanbanColumn
            key={s.id}
            title={displaySectorName(s.name)}
            subtitle={`#${s.id}`}
            devices={columns.get(s.id) ?? []}
            dragging={dragging}
            isOver={dropTarget === s.id}
            onDragOver={() => setDropTarget(s.id)}
            onDragLeave={() =>
              setDropTarget((t) => (t === s.id ? null : t))
            }
            onDrop={() => onDrop(s.id)}
            onDragStart={setDragging}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
          />
        ))}
      </div>

      {sectors.length === 0 && !loading && (
        <div className="empty">Geen events gevonden.</div>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Apparaat koppelen?"
        message={
          pending ? (
            <>
              Apparaat <span className="mono">{pending.device.device_name}</span>{' '}
              wordt gekoppeld aan{' '}
              <strong>{displaySectorName(pending.sector.name)}</strong>. Doorgaan?
            </>
          ) : null
        }
        confirmLabel={submitting ? 'Bezig…' : 'Koppelen'}
        onConfirm={confirmAssign}
        onCancel={() => !submitting && setPending(null)}
      />
    </>
  );
}

function KanbanColumn({
  title,
  subtitle,
  devices,
  dragging,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  unassigned,
}: {
  title: string;
  subtitle: string;
  devices: AdminDevice[];
  dragging: string | null;
  isOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStart: (uid: string) => void;
  onDragEnd: () => void;
  unassigned?: boolean;
}) {
  return (
    <div
      className={`kanban-col${isOver ? ' is-over' : ''}${unassigned ? ' kanban-col-unassigned' : ''}`}
      onDragOver={(e) => {
        if (unassigned) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (unassigned) return;
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="kanban-col-head">
        <div className="kanban-col-title">{title}</div>
        <div className="kanban-col-sub">
          {subtitle} · {devices.length}
        </div>
      </div>
      <div className="kanban-col-body">
        {devices.map((d) => (
          <div
            key={d.device_uid}
            className={`kanban-card${dragging === d.device_uid ? ' is-dragging' : ''}`}
            draggable={!unassigned ? true : true}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', d.device_uid);
              onDragStart(d.device_uid);
            }}
            onDragEnd={onDragEnd}
            style={{ cursor: 'grab' }}
          >
            <div className="kanban-card-name mono">{d.device_name}</div>
            <div className="kanban-card-meta">
              <span>{d.device_app}</span>
              {d.comment && <span className="badge">{d.comment}</span>}
            </div>
          </div>
        ))}
        {devices.length === 0 && (
          <div className="kanban-col-empty">
            {unassigned ? 'Geen' : 'Sleep hier'}
          </div>
        )}
      </div>
    </div>
  );
}
