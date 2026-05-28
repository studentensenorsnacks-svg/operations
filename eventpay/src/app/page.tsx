'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface StatusResponse {
  config: { base_url_set: boolean; api_key_set: boolean; base_url: string | null };
  rate_limit: { used: number; max: number; window_ms: number; next_slot_in_ms: number };
  ping: { ok: boolean; status: number; body?: unknown; error?: string };
}

const tiles: { href: string; title: string; desc: string }[] = [
  {
    href: '/wallets',
    title: 'Wallets',
    desc: 'Zoek wallets via QR/NFC/code, bekijk saldo en historiek, pas naam/PIN/rechten aan.',
  },
  {
    href: '/transacties',
    title: 'Transacties',
    desc: 'Lijst doorzoeken met filters, transacties aanmaken (opladen/cash) of ongedaan maken.',
  },
  {
    href: '/verkoop',
    title: 'Verkoopsdata',
    desc: 'Omzet per periode, gegroepeerd op sector, apparaat, operator, BTW of betaalmethode.',
  },
  {
    href: '/operatoren',
    title: 'Operatoren',
    desc: 'Operatoren en groepen bekijken, externe IDs synchroniseren, koppelen aan wallet.',
  },
  {
    href: '/apparaten',
    title: 'Apparaten',
    desc: 'Aangesloten kassa’s/terminals: instellingen aanpassen, berichten sturen.',
  },
  {
    href: '/voorraad',
    title: 'Voorraad',
    desc: 'Actuele stock per sector met historiek en stockbreuk.',
  },
  {
    href: '/producten',
    title: 'Producten & sectoren',
    desc: 'Producten zien en aanpassen (prijs, BTW, kleur, zichtbaarheid), sectoren met categorieën.',
  },
  {
    href: '/reusables',
    title: 'Reusables',
    desc: 'Herbruikbare items (bv. bekers) opvolgen en terugbetalingen verwerken.',
  },
];

export default function Dashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const json = (await res.json()) as StatusResponse;
      setStatus(json);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>EventPay beheer</h2>
          <p>
            Centrale tool voor wallets, transacties, verkoop en alle andere
            EventPay-functies. Werkt rechtstreeks op productie — er is geen
            testomgeving.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refresh}>
          {loading ? <span className="loading" /> : 'Status verversen'}
        </button>
      </div>

      <div className="card">
        <h3>Verbindingsstatus</h3>
        {statusError ? (
          <div className="alert alert-error">{statusError}</div>
        ) : !status ? (
          <p className="muted">
            <span className="loading" /> Verbinding controleren…
          </p>
        ) : (
          <div className="grid grid-3">
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Base URL
              </div>
              <div className="mono">
                {status.config.base_url ?? <em>niet ingesteld</em>}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Bearer token
              </div>
              <div>
                {status.config.api_key_set ? (
                  <span className="badge badge-success">ingesteld</span>
                ) : (
                  <span className="badge badge-danger">ontbreekt</span>
                )}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Live ping (auth-check)
              </div>
              <div>
                {status.ping.ok ? (
                  <span className="badge badge-success">
                    OK ({status.ping.status})
                  </span>
                ) : status.ping.status === 0 ? (
                  <span className="badge badge-warn">
                    {status.ping.error ?? 'niet uitgevoerd'}
                  </span>
                ) : (
                  <span className="badge badge-danger">
                    {status.ping.status}{' '}
                    {typeof status.ping.body === 'object' &&
                    status.ping.body &&
                    'message' in status.ping.body
                      ? `— ${(status.ping.body as { message?: string }).message ?? ''}`
                      : ''}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Rate-limit gebruik
              </div>
              <div>
                <strong>{status.rate_limit.used}</strong> / {status.rate_limit.max}{' '}
                in laatste 10 s
              </div>
            </div>
          </div>
        )}
      </div>

      <h3 style={{ margin: '8px 4px 12px' }}>Modules</h3>
      <div className="grid grid-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <div className="tile-title">{t.title}</div>
            <div className="tile-desc">{t.desc}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
