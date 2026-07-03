'use client';

import { useState } from 'react';
import { TERMINALS, type TerminalEntry } from '@/lib/terminals';
import { InfoAlert } from '@/components/Alert';

function TerminalTable({ rows }: { rows: TerminalEntry[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Intern nr</th>
            <th>Terminal-ID</th>
            <th>Naam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.terminalId}>
              <td className="cell-num">
                <strong>{t.internalNumber}</strong>
              </td>
              <td className="mono">{t.terminalId}</td>
              <td>{t.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TerminalsPage() {
  const [tab, setTab] = useState<'standaard' | 'intern'>('standaard');

  const standaard = TERMINALS.filter((t) => t.group === 'standaard').sort(
    (a, b) => a.internalNumber - b.internalNumber,
  );
  const intern = TERMINALS.filter((t) => t.group === 'intern').sort(
    (a, b) => a.internalNumber - b.internalNumber,
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Terminals</h2>
          <p>
            Betaalterminals met hun <strong>interne nummering</strong>. Elke
            terminal heeft een eigen EventPay terminal-ID; het interne nummer is
            onze eigen volgorde. Aanpassen of een terminal toevoegen? Dat doe je
            centraal in{' '}
            <span className="mono">src/lib/terminals.ts</span>.
          </p>
        </div>
      </div>

      <div className="pill-toolbar">
        <button
          className={tab === 'standaard' ? 'active' : ''}
          onClick={() => setTab('standaard')}
        >
          Terminals ({standaard.length})
        </button>
        <button
          className={tab === 'intern' ? 'active' : ''}
          onClick={() => setTab('intern')}
        >
          Interne nummering ({intern.length})
        </button>
      </div>

      {tab === 'standaard' && (
        <div className="card">
          <h3>Terminals — interne nummering 1 t/m {standaard.length}</h3>
          <TerminalTable rows={standaard} />
        </div>
      )}

      {tab === 'intern' && (
        <div className="card">
          <h3>Interne nummering — extra toegekend</h3>
          <InfoAlert>
            Deze terminals hadden in EventPay nog geen nummer. Ze kregen intern
            nummer <strong>11 t/m 14</strong> toegewezen.
          </InfoAlert>
          <TerminalTable rows={intern} />
        </div>
      )}
    </>
  );
}
