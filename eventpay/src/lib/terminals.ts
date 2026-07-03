// Centrale interne nummering van de betaalterminals.
//
// EventPay kent elke terminal enkel via zijn eigen terminal-ID (bv. 2796) en
// een sector/kassa-naam. Het "interne nummer" (1..n) is ÓNZE conventie en
// leeft daarom hier — één plek om een terminal toe te voegen of een nummer te
// wijzigen (vergelijkbaar met de centrale truck-data).
//
// group:
//   'standaard' → terminals die al een intern nummer hadden (1..10)
//   'intern'    → de 4 COMBI 1 MARIO-terminals die voorheen géén nummer
//                 hadden en nu 11..14 krijgen (apart tabblad "Interne nummering")

export type TerminalGroup = 'standaard' | 'intern';

export interface TerminalEntry {
  internalNumber: number; // interne nummering (1..n)
  terminalId: number; // EventPay payment-terminal-ID
  label: string; // sector/kassa-naam zoals in EventPay
  group: TerminalGroup;
}

export const TERMINALS: TerminalEntry[] = [
  { internalNumber: 1, terminalId: 2796, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 2, terminalId: 2698, label: 'PIZZA / Ketnet', group: 'standaard' },
  { internalNumber: 3, terminalId: 2754, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 4, terminalId: 2713, label: 'BROODJES / Ketnet', group: 'standaard' },
  { internalNumber: 5, terminalId: 2712, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 6, terminalId: 2820, label: 'COMBI DECRAM', group: 'standaard' },
  { internalNumber: 7, terminalId: 2756, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 8, terminalId: 2700, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 9, terminalId: 2813, label: 'Kassa', group: 'standaard' },
  { internalNumber: 10, terminalId: 2823, label: 'DRANKEN / Ketnet', group: 'standaard' },
  { internalNumber: 11, terminalId: 3188, label: 'COMBI 1 MARIO', group: 'intern' },
  { internalNumber: 12, terminalId: 3246, label: 'COMBI 1 MARIO', group: 'intern' },
  { internalNumber: 13, terminalId: 3175, label: 'COMBI 1 MARIO', group: 'intern' },
  { internalNumber: 14, terminalId: 3181, label: 'COMBI 1 MARIO', group: 'intern' },
];

// Snelle lookup: EventPay terminal-ID → intern nummer (en omgekeerd).
export const internalByTerminalId: Map<number, TerminalEntry> = new Map(
  TERMINALS.map((t) => [t.terminalId, t]),
);

export const terminalByInternal: Map<number, TerminalEntry> = new Map(
  TERMINALS.map((t) => [t.internalNumber, t]),
);

/** Intern nummer voor een EventPay terminal-ID, of null als onbekend. */
export function internalNumberFor(terminalId: number | null | undefined): number | null {
  if (terminalId == null) return null;
  return internalByTerminalId.get(terminalId)?.internalNumber ?? null;
}
