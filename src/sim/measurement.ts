import { CONFIG } from './config';
import { gaussian } from './rng';
import { hasStaff, ledger } from './storage';
import type { GameState } from './types';

/**
 * FOS/TAC-Messung. Der Spieler sieht nie den wahren Wert, sondern Laborwerte
 * mit Verzug und Messrauschen. Biologin und eigenes Labor verbessern das.
 */
export function measurementLevel(state: GameState) {
  const M = CONFIG.biology.measurement;
  if (state.unlocks.includes('labor')) return M.lab;
  if (hasStaff(state, 'biologin')) return M.biologist;
  return M.external;
}

export function measurementDay(state: GameState): void {
  const m = state.measurement;
  const lvl = measurementLevel(state);
  if (state.day - m.lastSampleDay >= lvl.intervalDays) {
    const value = Math.max(0, state.bio.fosTac + lvl.noise * gaussian(state.rng.bio));
    m.pending.push({ readyDay: state.day + lvl.delayDays, value, sampleDay: state.day });
    m.lastSampleDay = state.day;
    state.finance.balance -= lvl.costEur;
    ledger(state, 'labor', lvl.costEur);
  }
  const ready = m.pending.filter((p) => p.readyDay <= state.day);
  for (const p of ready) {
    m.fosTac = p.value;
    m.fosTacDay = p.sampleDay;
    m.history.push({ day: p.sampleDay, value: p.value });
  }
  m.pending = m.pending.filter((p) => p.readyDay > state.day);
}

/** Trend der letzten Messwerte (Steigung pro Tag), nur mit eigenem Labor sinnvoll. */
export function measuredTrend(state: GameState): number {
  const h = state.measurement.history;
  if (h.length < 2) return 0;
  const a = h[Math.max(0, h.length - CONFIG.biology.trendSamples)];
  const b = h[h.length - 1];
  return b.day > a.day ? (b.value - a.value) / (b.day - a.day) : 0;
}
