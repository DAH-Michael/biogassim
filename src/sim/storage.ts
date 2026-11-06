import { CONFIG } from './config';
import { dayOfDate, inWindow, windowDays } from './calendar';
import { addCause, decayCauses, logEvent, topCauses } from './eventlog';
import { round } from './biology';
import { say } from './messages';
import { difficulty } from './difficulty';
import type { GameState } from './types';
import { cfg } from './plant';

/**
 * Lager: Fahrsilo und Gärrestlager.
 */


export type SilageKind = 'mais' | 'gruenroggen';

/** Lieferungen eines Tages, die am Tagesende verdichtet werden. */
export interface SiloDelivery { kind: SilageKind; t: number; quality: number; source?: string; throughVillage: boolean; distanceKm: number; origin?: string }

export function siloStock(state: GameState): number {
  return state.silo.mais.t + state.silo.gruenroggen.t;
}

export function siloCapacity(state: GameState): number {
  return state.silo.capacityT;
}

/** Lagert die Lieferungen des Tages ein, berechnet Verdichtung, Qualität und Überlauf. */
export function siloDay(state: GameState, deliveries: SiloDelivery[]): void {
  const silo = state.silo;
  const log = state.log;
  decayCauses(silo.compactionCauses, cfg(state).silo.causeHalfLifeDays);
  const delivered = deliveries.reduce((a, d) => a + d.t, 0);
  silo.deliveredToday = delivered;
  if (delivered > 0) {
    const compaction = difficulty(state).siloCompaction ? Math.min(1, cfg(state).silo.compactionCapacityTPerDay / delivered) : 1;
    silo.compactionToday = compaction;
    silo.compactingDays++;
    let space = Math.max(0, silo.capacityT - siloStock(state));
    let overflowT = 0;
    const overflowSources: string[] = [];
    for (const d of deliveries) {
      const stored = Math.min(d.t, space);
      space -= stored;
      if (d.t > stored) {
        overflowT += d.t - stored;
        if (d.source) overflowSources.push(d.source);
      }
      if (stored <= 0) continue;
      const q = d.quality * (1 - cfg(state).silo.compactionQualityWeight * (1 - compaction));
      const stock = silo[d.kind];
      stock.quality = (stock.quality * stock.t + q * stored) / (stock.t + stored);
      stock.t += stored;
      if (compaction < 1) addCause(silo.compactionCauses, d.source, d.t * (1 - compaction));
    }
    if (compaction < cfg(state).silo.poorCompactionThreshold && !silo.poorCompactionEvent) {
      const ev = logEvent(log, state.day, {
        type: 'silo_compaction_poor',
        severity: 'warning',
        causes: topCauses(silo.compactionCauses),
        data: { deliveredT: Math.round(delivered), compaction: round(compaction, 2) },
      });
      silo.poorCompactionEvent = ev.id;
    }
    if (overflowT > 0) {
      state.today.siloSoldT += overflowT;
      state.finance.balance += overflowT * cfg(state).silo.overflowSalePricePerT;
      state.finance.ledger.silageSold = (state.finance.ledger.silageSold ?? 0) + overflowT * cfg(state).silo.overflowSalePricePerT;
      if (!silo.overflowEvent) {
        const ev = logEvent(log, state.day, {
          type: 'silo_overflow',
          severity: 'warning',
          causes: [...overflowSources, state.origin.silo],
          data: { overflowT: Math.round(overflowT), capacityT: silo.capacityT },
        });
        silo.overflowEvent = ev.id;
        say(state, 'betriebsleiter', 'silo_voll', { t: Math.round(overflowT) }, ev.id);
      }
    }
  } else {
    silo.compactionToday = 1;
    silo.compactingDays = 0;
  }

  // Lagerverluste
  for (const kind of ['mais', 'gruenroggen'] as const) {
    const stock = silo[kind];
    const rate = (cfg(state).silo.baseLossPerYear + (1 - stock.quality) * cfg(state).silo.poorCompactionLossPerYear) / CONFIG.units.daysPerYear;
    stock.t = Math.max(0, stock.t * (1 - rate));
  }
}

/** Methanpotenzial-Faktor aus der Silagequalität. */
export function silageCh4Factor(quality: number): number {
  return 1 - (1 - quality) * CONFIG.silo.qualityCh4Penalty;
}

/** Gärrestlager: Zufluss, Regen, Nachgasen, Ausbringung, Sperrfrist, Überlauf. */
export function digestateDay(state: GameState, digestateT: number, residualCh4: number, ambientC: number): { capturedCh4: number } {
  const dg = state.digestate;
  const log = state.log;
  const day = state.day;
  const weather = state.weather.days[day];
  decayCauses(dg.inflowCauses, cfg(state).digestate.causeHalfLifeDays);

  // Zufluss
  const inflow = digestateT * cfg(state).plant.inputVolumeM3PerT;
  dg.m3 += inflow;
  addCause(dg.inflowCauses, state.feedTargetEvent ?? state.origin.feeding, inflow);
  dg.rainToday = 0;
  if (!dg.covered && weather.rainMm > 0) {
    dg.rainToday = weather.rainMm * dg.capacityM3 * cfg(state).plant.digestateAreaPerM3 * cfg(state).digestate.rainM3PerM2PerMm;
    dg.m3 += dg.rainToday;
    addCause(dg.inflowCauses, state.origin.openStorage, dg.rainToday);
  }

  // Nachgasen: offen geht es verloren, abgedeckt wird es aufgefangen
  dg.residualCh4 += residualCh4;
  const [tMin, tMax] = cfg(state).digestate.residualTempFactorRange;
  const tf = Math.min(tMax, Math.max(tMin, ambientC / cfg(state).digestate.residualGasRefC));
  const released = dg.residualCh4 * cfg(state).digestate.residualGasPerDay * tf;
  dg.residualCh4 -= released;
  let capturedCh4 = 0;
  if (dg.covered) capturedCh4 = released;
  else state.totals.ch4LostStorageM3 += released;

  // Ausbringung
  const blackout = inWindow(day, cfg(state).digestate.blackout);
  const fieldsOk = !weather.wet && !weather.frost;
  let demand = 0;
  if (!blackout && fieldsOk) {
    for (const r of cfg(state).digestate.regionalDemand) if (inWindow(day, r.window)) demand += r.m3PerDay;
    if (hasStaff(state, 'agrar')) demand *= 1 + CONFIG.staff.advisorDemandBonus;
    demand += ownFieldDemand(state);
  }
  // Nachfrage vor der Sperrfrist mitschreiben
  const bStart = dayOfDate(cfg(state).digestate.blackout.from);
  if (day < bStart) dg.demandBeforeBlackout += Math.min(demand, cfg(state).digestate.spreadCapacityM3PerDay);
  dg.spreadToday = 0;
  if (dg.spreadOrderM3 > 0 && demand > 0) {
    const amount = Math.min(dg.spreadOrderM3, demand, cfg(state).digestate.spreadCapacityM3PerDay, dg.m3);
    if (amount > 0) {
      dg.m3 -= amount;
      dg.spreadOrderM3 -= amount;
      dg.spreadToday = amount;
      dg.spreadTotal += amount;
      if (day < bStart) dg.spreadBeforeBlackout += amount;
      applyOwnFieldDigestate(state, amount);
      const cost = amount * (cfg(state).digestate.spreadCostPerM3 + cfg(state).digestate.spreadCostPerM3Km * cfg(state).digestate.regionalDistanceKm);
      state.finance.balance -= cost;
      ledger(state, 'gaerrest', cost);
    }
  }
  // Abnahmeverträge (Freischaltung): Abgabe an Betriebe mit eigenem Lager, ganzjährig
  dg.offtakeToday = 0;
  if (dg.offtake) {
    const amount = Math.min(cfg(state).digestate.offtake.m3PerDay, dg.m3);
    dg.offtakeToday = amount;
    dg.m3 -= amount;
    dg.spreadToday += amount;
    dg.spreadTotal += amount;
    const cost = amount * cfg(state).digestate.offtake.costPerM3;
    state.finance.balance -= cost;
    ledger(state, 'gaerrest', cost);
  }

  // Beginn der Sperrfrist
  if (day === bStart) {
    const share = dg.m3 / dg.capacityM3;
    const used = dg.demandBeforeBlackout > 0 ? dg.spreadBeforeBlackout / dg.demandBeforeBlackout : 1;
    const summary = logEvent(log, day, {
      type: 'spreading_before_blackout',
      severity: used < cfg(state).digestate.blackoutUsedShare ? 'warning' : 'info',
      playerDecision: true,
      causes: [],
      data: { spreadM3: Math.round(dg.spreadBeforeBlackout), possibleM3: Math.round(dg.demandBeforeBlackout), fillShare: round(share, 2) },
    });
    if (share >= cfg(state).digestate.blackoutStartHighShare) {
      const causes = used < cfg(state).digestate.blackoutUsedShare ? [summary.id, state.origin.storage] : [state.origin.storage, summary.id];
      const ev = logEvent(log, day, {
        type: 'blackout_start_high',
        severity: 'warning',
        causes,
        data: { fillShare: round(share, 2), capacityM3: dg.capacityM3 },
      });
      dg.blackoutEvent = ev.id;
    }
  }

  // Hoher Füllstand
  const share = dg.m3 / dg.capacityM3;
  if (share >= cfg(state).digestate.highShare && !dg.highEvent) {
    // In der Sperrfrist: voller Start (falls vorhanden), sonst die zu kleine Lagerkapazität, dann der Zufluss
    const startVolume = (Object.values(cfg(state).feeding.start) as number[]).reduce((x, y) => x + y, 0);
    const nowVolume = Object.values(state.feedTarget).reduce((x, y) => x + y, 0);
    const volumeUp = nowVolume > startVolume * (1 + cfg(state).digestate.volumeIncreaseShare);
    const structural = blackout ? [dg.blackoutEvent ?? state.origin.storage] : [];
    const causes = volumeUp ? [...topCauses(dg.inflowCauses), ...structural] : [...structural, ...topCauses(dg.inflowCauses)];
    const ev = logEvent(log, day, {
      type: 'digestate_high',
      severity: 'warning',
      causes,
      data: { fillShare: round(share, 2), m3: Math.round(dg.m3) },
    });
    dg.highEvent = ev.id;
    say(state, 'betriebsleiter', 'gaerrest_hoch', { prozent: Math.round(share * CONFIG.units.percent) }, ev.id);
  } else if (share < cfg(state).digestate.highShare - cfg(state).digestate.highHysteresis && dg.highEvent) {
    dg.highEvent = undefined;
  }

  // Überlauf
  if (dg.m3 > dg.capacityM3 && !dg.overflowed) {
    dg.overflowed = true;
    const ev = logEvent(log, day, {
      type: 'digestate_overflow',
      severity: 'critical',
      causes: blackout && dg.blackoutEvent ? [dg.blackoutEvent, dg.highEvent] : [dg.highEvent],
      data: { m3: Math.round(dg.m3), capacityM3: dg.capacityM3, blackout: blackout ? 1 : 0 },
    });
    dg.overflowEvent = ev.id;
  }
  return { capturedCh4 };
}

function ownFieldDemand(state: GameState): number {
  let demand = 0;
  for (const f of state.fields) {
    if (f.status !== 'gefuehrt') continue;
    const cfg = CONFIG.fields.list.find((x) => x.id === f.id)!;
    for (const [i, w] of CONFIG.fields.digestateDemand.entries()) {
      if (!inWindow(state.day, w.window)) continue;
      if (!fieldMatchesDemand(f.crop, f.standing, w.crop)) continue;
      const key = String(i);
      const total = cfg.ha * w.m3PerHa;
      const left = total - (f.digestateApplied[key] ?? 0);
      const { start, end } = windowDays(w.window);
      const daysLeft = Math.max(1, end - Math.max(start, state.day) + 1);
      demand += Math.max(0, left) / Math.min(daysLeft, CONFIG.fields.digestateSpreadDays);
    }
  }
  return demand;
}

function fieldMatchesDemand(crop: string, standing: string, need: string): boolean {
  if (need === 'stoppel') return standing === 'leer';
  if (need === 'gruenroggen') return standing === 'gruenroggen';
  if (need === 'mais') return (crop === 'mais' && standing === 'leer');
  if (need === 'zweikultur') return crop === 'zweikultur' && standing === 'leer';
  return false;
}

function applyOwnFieldDigestate(state: GameState, amount: number): void {
  // Ausgebrachter Gärrest wird zuerst den eigenen Feldern zugeschrieben
  let left = amount;
  for (const f of state.fields) {
    if (f.status !== 'gefuehrt' || left <= 0) continue;
    const cfg = CONFIG.fields.list.find((x) => x.id === f.id)!;
    for (const [i, w] of CONFIG.fields.digestateDemand.entries()) {
      if (!inWindow(state.day, w.window) || !fieldMatchesDemand(f.crop, f.standing, w.crop)) continue;
      const key = String(i);
      const room = cfg.ha * w.m3PerHa - (f.digestateApplied[key] ?? 0);
      const put = Math.min(room, left);
      if (put > 0) {
        f.digestateApplied[key] = (f.digestateApplied[key] ?? 0) + put;
        left -= put;
      }
    }
  }
}

export function hasStaff(state: GameState, role: string): boolean {
  return state.staff.some((s) => s.role === role && state.day - s.hiredDay >= CONFIG.staff.onboardingDays);
}

export function ledger(state: GameState, key: string, eur: number): void {
  state.finance.ledger[key] = (state.finance.ledger[key] ?? 0) + eur;
}
