import { CONFIG, SUBSTRATES } from './config';
import { logEvent } from './eventlog';
import { round, sumMap, zeroMap } from './biology';
import { range } from './rng';
import { say } from './messages';
import { hasStaff, ledger, silageCh4Factor } from './storage';
import { takeGuelle } from './contracts';
import type { GameState, SubstrateMap } from './types';

/**
 * Fütterung: Sollwerte des Spielers, begrenzt durch Vorräte und Lieferungen.
 * Ermittelt außerdem, welches Ereignis eine heutige Änderung verursacht hat.
 */

export interface FeedResult {
  fed: SubstrateMap;
  ch4PerT: SubstrateMap;
  changeCause?: string;
  residueEvent?: string;
  trafficTrips: number;
  trafficSource?: string;
}

export function feedingDay(state: GameState, playerChangedToday: boolean): FeedResult {
  const day = state.day;
  const log = state.log;

  // Biologin: sanfter Übergang zur neuen Fütterung
  let want: SubstrateMap = { ...state.feedTarget };
  if (hasStaff(state, 'biologin')) {
    if (!state.rampFeed) state.rampFeed = { ...state.feedTarget };
    const scale = Math.max(sumMap(state.feedTarget), sumMap(state.rampFeed));
    const step = CONFIG.staff.biologistRampPerDay * scale;
    for (const s of SUBSTRATES) {
      const diff = state.feedTarget[s] - state.rampFeed[s];
      state.rampFeed[s] += Math.max(-step, Math.min(step, diff));
    }
    want = { ...state.rampFeed };
  } else {
    state.rampFeed = null;
  }

  // Störstoffe: halbe Feststoffzufuhr
  let changeCause: string | undefined = playerChangedToday ? state.feedTargetEvent : undefined;
  if (day < state.contaminationUntilDay) {
    for (const s of ['mais', 'gruenroggen', 'reststoff'] as const) want[s] *= CONFIG.residues.contaminantFeedFactor;
    if (day === state.contaminationStartDay) changeCause = state.contaminationEvent;
  }

  const fed = zeroMap();
  const ch4PerT = zeroMap();
  for (const s of SUBSTRATES) ch4PerT[s] = CONFIG.substrates[s].ch4PerT;

  // Silage
  for (const kind of ['mais', 'gruenroggen'] as const) {
    const stock = state.silo[kind];
    fed[kind] = Math.min(want[kind], stock.t);
    ch4PerT[kind] = CONFIG.substrates[kind].ch4PerT * silageCh4Factor(stock.quality);
    stock.t -= fed[kind];
    const empty = state.silo.emptyEvent ?? (state.silo.emptyEvent = {});
    if (want[kind] > 0 && fed[kind] < want[kind] - CONFIG.feeding.shortageToleranceT) {
      if (!empty[kind]) {
        const summary = kind === 'mais' ? state.silo.harvestSummaryEvent : state.silo.ryeSummaryEvent;
        const supply = kind === 'mais' ? state.supplyEvents.maizeContracts : state.supplyEvents.ryeContracts;
        const ev = logEvent(log, day, {
          type: 'silo_empty',
          severity: 'warning',
          causes: [summary ?? supply ?? state.origin.silo, state.feedTargetEvent ?? state.origin.feeding, summary ? undefined : state.origin.silo],
          data: { kind, wantT: round(want[kind], 1), fedT: round(fed[kind], 1) },
        });
        empty[kind] = ev.id;
        changeCause = changeCause ?? ev.id;
        say(state, 'betriebsleiter', 'silo_leer', { kind }, ev.id);
      }
    } else if (empty[kind] && stock.t > want[kind] * CONFIG.feeding.refillDays) {
      empty[kind] = undefined;
    }
  }

  // Reststoffe aus dem Vorlagebehälter, älteste Partie zuerst
  let residueEvent: string | undefined;
  let needRest = want.reststoff;
  let qualitySum = 0;
  for (const lot of state.residueTank) {
    if (needRest <= 0) break;
    if (lot.arrivalDay > day || lot.tonnes <= 0) continue;
    if (!lot.started) {
      lot.started = true;
      const ev = logEvent(log, day, { type: 'residue_lot_started', causes: [lot.eventId], data: { tonnes: lot.tonnes } });
      changeCause = changeCause ?? ev.id;
      if (lot.contaminated) {
        const days = CONFIG.residues.contaminantDays;
        const cost = Math.round(range(state.rng.tech, CONFIG.residues.contaminantRepairEur[0], CONFIG.residues.contaminantRepairEur[1]));
        const cev = logEvent(log, day, {
          type: 'contaminants',
          severity: 'warning',
          causes: [lot.eventId],
          data: { costEur: cost, days },
        });
        state.contaminationEvent = cev.id;
        state.contaminationStartDay = day + 1;
        state.contaminationUntilDay = day + 1 + days;
        state.finance.balance -= cost;
        ledger(state, 'reparatur', cost);
        state.finance.lossCauses[cev.id] = (state.finance.lossCauses[cev.id] ?? 0) + cost;
        say(state, 'betriebsleiter', 'stoerstoffe', {}, cev.id);
      }
    }
    const t = Math.min(needRest, lot.tonnes);
    lot.tonnes -= t;
    needRest -= t;
    fed.reststoff += t;
    qualitySum += t * lot.quality;
    residueEvent = lot.eventId;
  }
  state.residueTank = state.residueTank.filter((l) => l.tonnes > 0 || l.arrivalDay > day);
  if (fed.reststoff > 0) ch4PerT.reststoff = CONFIG.substrates.reststoff.ch4PerT * (qualitySum / fed.reststoff);
  if (want.reststoff > 0 && fed.reststoff < want.reststoff - CONFIG.feeding.shortageToleranceT && state.lastFed.reststoff > fed.reststoff + CONFIG.feeding.shortageToleranceT) {
    // Reststoffe gehen aus: die Mischung ändert sich ohne Zutun
    const ev = logEvent(log, day, { type: 'residue_out', causes: [state.feedTargetEvent], data: { wantT: round(want.reststoff, 1) } });
    changeCause = changeCause ?? ev.id;
  }

  // Gülle
  const g = takeGuelle(state, want.guelle);
  fed.guelle = g.t;

  // Spurenelemente durch die Biologin
  if (hasStaff(state, 'biologin')) {
    let tOts = 0;
    for (const s of SUBSTRATES) tOts += fed[s] * CONFIG.substrates[s].ts * CONFIG.substrates[s].ots;
    const cost = tOts * CONFIG.staff.traceDosingEurPerTots;
    state.finance.balance -= cost;
    ledger(state, 'betrieb', cost);
  }

  for (const s of SUBSTRATES) state.inputTotals[s] += fed[s];
  state.lastFed = { ...fed };
  return { fed, ch4PerT, changeCause, residueEvent, trafficTrips: g.trafficTrips, trafficSource: g.trafficSource };
}
