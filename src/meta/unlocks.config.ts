import type { UnlockKey } from '../sim/unlockKeys';
import { UNLOCK_KEYS } from '../sim/unlockKeys';

/**
 * Freischaltungen: Wissen und Werkzeuge, keine pauschale Stärke.
 * Jedes Werkzeug gibt es, weil jemand an diesem Problem gescheitert ist.
 * Erweiterbar: neue Schlüssel in sim/unlockKeys.ts HINTEN anhängen
 * (die Position ist das Bit im Speichercode), dann hier einen Auslöser eintragen.
 */
export type UnlockTrigger =
  | { kind: 'failure'; failureType: string }
  | { kind: 'success'; minTier: number };

export interface UnlockDef {
  key: UnlockKey;
  trigger: UnlockTrigger;
  title: string;
  text: string;
}

export const UNLOCKS: UnlockDef[] = [
  { key: 'labor', trigger: { kind: 'failure', failureType: 'failure_biology' }, title: 'Eigenes Labor', text: 'FOS/TAC wird täglich und genauer gemessen, mit Trend.' },
  { key: 'grosses_lager', trigger: { kind: 'failure', failureType: 'failure_overflow' }, title: 'Größeres Gärrestlager', text: 'Neue Durchläufe können mit einem zweiten Gärrestlager starten.' },
  { key: 'abnahmevertraege', trigger: { kind: 'failure', failureType: 'failure_overflow' }, title: 'Abnahmeverträge', text: 'Landwirte mit eigenem Lager nehmen Gärrest auch in der Sperrfrist ab.' },
  { key: 'buergerdialog', trigger: { kind: 'failure', failureType: 'failure_acceptance' }, title: 'Bürgerdialog', text: 'Gespräche mit den Nachbarn als eigene Aktion.' },
  { key: 'abdeckung_guenstig', trigger: { kind: 'failure', failureType: 'failure_acceptance' }, title: 'Günstigere Lagerabdeckung', text: 'Die Abdeckung des Gärrestlagers kostet weniger.' },
  { key: 'wartungsvertrag', trigger: { kind: 'failure', failureType: 'failure_technical' }, title: 'Wartungsvertrag', text: 'Feste Monatskosten, Wartung inklusive, geringeres Ausfallrisiko.' },
  { key: 'kostenaufstellung', trigger: { kind: 'failure', failureType: 'failure_insolvency' }, title: 'Kosten pro Kilowattstunde', text: 'Eine Aufstellung, was jede Kilowattstunde kostet.' },
  { key: 'eigene_felder', trigger: { kind: 'success', minTier: 0 }, title: 'Eigene Felder', text: 'Startszenario mit eigenen Feldern von Beginn an.' },
  { key: 'waermeleitung_start', trigger: { kind: 'success', minTier: 2 }, title: 'Wärmeleitung ab Start', text: 'Die Wärmeleitung ins Dorf kann von Beginn an genutzt werden.' },
  { key: 'schwieriger_standort', trigger: { kind: 'success', minTier: 2 }, title: 'Schwieriger Standort', text: 'Ein Standort mit weniger Gülle in der Nähe und dem Dorf direkt an der Zufahrt.' },
];

export function keysToFlags(keys: readonly string[]): number {
  let flags = 0;
  for (const k of keys) {
    const i = UNLOCK_KEYS.indexOf(k as UnlockKey);
    if (i >= 0) flags |= 1 << i;
  }
  return flags >>> 0;
}

export function flagsToKeys(flags: number): UnlockKey[] {
  return UNLOCK_KEYS.filter((_, i) => (flags >>> i) & 1);
}
