import { CONFIG } from './config';
import { sumMap } from './biology';
import { maizeShare } from './finance';
import { siloStock } from './storage';
import type { GameState } from './types';

/**
 * Jahresbilanz und Bewertung. Wird auch nach dem Scheitern berechnet
 * (dann ohne Stufe), damit die Analyse Kennzahlen zeigen kann.
 */
export interface YearSummary {
  days: number;
  kwhEl: number;
  profitEur: number;
  balanceEur: number;
  acceptance: number;
  acceptanceAvg: number;
  flaredM3: number;
  ch4LostStorageM3: number;
  gasLossShare: number;
  maizeShare: number;
  bioErrorShare: number;
  supplyDays: number;
  points: number;
  tier: number | null;
  ledger: Record<string, number>;
}

export function yearSummary(state: GameState): YearSummary {
  const R = CONFIG.rating;
  const t = state.totals;
  const days = Math.max(1, state.history.day.length);
  const ch4Total = t.ch4ProducedM3 + t.ch4LostStorageM3;
  const flaredCh4 = t.flaredM3 * state.bio.ch4Share;
  const gasLossShare = ch4Total > 0 ? (flaredCh4 + t.ch4LostStorageM3) / ch4Total : 0;
  const acc = state.history.acceptance;
  const acceptanceAvg = acc.length ? acc.reduce((a, b) => a + b, 0) / acc.length : state.acceptance.value;
  const dailySilage = state.feedTarget.mais + state.feedTarget.gruenroggen;
  const standing = state.fields
    .filter((f) => f.status === 'gefuehrt' && (f.standing === 'mais' || f.standing === 'zweitmais'))
    .reduce((a, f) => a + CONFIG.fields.list.find((x) => x.id === f.id)!.ha * (f.standing === 'mais' ? CONFIG.fields.yieldTPerHa.mais : CONFIG.fields.yieldTPerHa.maisNachRoggen), 0);
  const supplyDays = dailySilage > 0 ? siloStock(state) / dailySilage : Infinity;
  const profit = state.finance.balance - CONFIG.finance.startBalanceEur;
  const bioErrorShare = t.bioErrorDays / days;

  let points = 0;
  const score = (v: number, [good, great]: readonly [number, number], higherIsBetter = true) => {
    const ok = higherIsBetter ? v >= good : v <= good;
    const top = higherIsBetter ? v >= great : v <= great;
    return (ok ? 1 : 0) + (top ? 1 : 0);
  };
  points += score(profit, R.profitEur);
  points += score(acceptanceAvg, R.acceptance);
  points += score(gasLossShare, R.gasLossShare, false);
  points += score(bioErrorShare, R.bioErrorShare, false);
  // Versorgung bis zur nächsten Ernte: Silo plus stehender Mais
  if (supplyDays >= R.supplyDaysNeeded || standing > 0) points += 1;
  if (maizeShare(state) <= CONFIG.maizeCap.maxShare) points += 1;

  let tier: number | null = null;
  if (state.finished && !state.failure) {
    tier = 0;
    R.tiers.forEach((min, i) => {
      if (points >= min) tier = i;
    });
  }
  return {
    days,
    kwhEl: t.kwhEl,
    profitEur: profit,
    balanceEur: state.finance.balance,
    acceptance: state.acceptance.value,
    acceptanceAvg,
    flaredM3: t.flaredM3,
    ch4LostStorageM3: t.ch4LostStorageM3,
    gasLossShare,
    maizeShare: maizeShare(state),
    bioErrorShare,
    supplyDays: Number.isFinite(supplyDays) ? supplyDays : 0,
    points,
    tier,
    ledger: { ...state.finance.ledger, inputT: sumMap(state.inputTotals) },
  };
}
