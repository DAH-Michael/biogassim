import { CONFIG } from './config';
import { addCause, decayCauses, logEvent, topCauses, type CauseTracker } from './eventlog';
import { round } from './biology';
import { chance } from './rng';
import { say } from './messages';
import { plantCh4PerDay } from './tech';
import type { GameState } from './types';
import { cfg } from './plant';

/**
 * Akzeptanz im Dorf. Sinkt durch Geruch, Verkehr, Fackel und Wärmeausfall,
 * erholt sich langsam zu einem Ruhewert, der durch Wärmeversorgung und
 * Bürgerdialog steigt.
 */


export interface AcceptanceInput {
  trafficTrips: number;
  trafficSource?: string;
  heatOutage: boolean;
  residualLostCh4: number;
}

type Topic = 'geruch' | 'verkehr' | 'fackel' | 'waerme';

export function acceptanceDay(state: GameState, inp: AcceptanceInput): void {
  const acc = state.acceptance;
  const day = state.day;
  const log = state.log;
  decayCauses(acc.causes, cfg(state).acceptance.causeHalfLifeDays);

  const today: CauseTracker = {};
  const topicLoss: Record<Topic, number> = { geruch: 0, verkehr: 0, fackel: 0, waerme: 0 };
  const add = (topic: Topic, loss: number, source: string | undefined) => {
    if (loss <= 0) return;
    topicLoss[topic] += loss;
    addCause(today, source, loss);
    addCause(acc.causes, source, loss);
  };

  // Geruch
  const dg = state.digestate;
  const fill = dg.m3 / dg.capacityM3;
  if (!dg.covered) add('geruch', cfg(state).acceptance.smell.openDigestate * clamp01(fill), dg.highEvent ?? state.origin.openStorage);
  const residualRel = inp.residualLostCh4 / (plantCh4PerDay(state) * cfg(state).acceptance.residualGasReference);
  add('geruch', cfg(state).acceptance.smell.residualGas * clamp01(residualRel), state.origin.openStorage);
  const siloQ = siloQuality(state);
  if (siloQ !== null) add('geruch', cfg(state).acceptance.smell.silageLoss * clamp01((cfg(state).acceptance.silageGoodQuality - siloQ) * cfg(state).acceptance.silageLossScale), state.silo.qualityEvent ?? state.silo.poorCompactionEvent ?? state.origin.silo);
  const bio = state.bio;
  if (bio.fosTac > CONFIG.biology.fosTacWarning) {
    add('geruch', cfg(state).acceptance.smell.processUpset * clamp01((bio.fosTac - CONFIG.biology.fosTacNormal) / CONFIG.biology.fosTacNormal), bio.tippedEvent ?? bio.fosLevelEvent);
  }
  if (state.residueDeliveredToday) add('geruch', cfg(state).acceptance.smell.residueDelivery, state.residueDeliveredToday);
  if (dg.spreadToday > 0) add('geruch', cfg(state).acceptance.smell.spreading * clamp01(dg.spreadToday / cfg(state).digestate.spreadCapacityM3PerDay), dg.spreadOrderEvent);

  // Verkehr
  acc.trafficTrips = inp.trafficTrips;
  state.totals.trafficTrips += inp.trafficTrips;
  const tolerance = cfg(state).acceptance.trafficTolerance * state.scenarioFactors.trafficTolerance;
  add('verkehr', Math.max(0, inp.trafficTrips - tolerance) * cfg(state).acceptance.trafficPerTrip, inp.trafficSource);

  // Fackel
  if (state.gas.flaredToday > 0) add('fackel', cfg(state).acceptance.flarePerDay, state.gas.flareEvent);

  // Wärmeausfall
  if (inp.heatOutage) add('waerme', cfg(state).acceptance.heatOutagePerDay, state.chp.downEvent);

  const loss = topicLoss.geruch + topicLoss.verkehr + topicLoss.fackel + topicLoss.waerme;
  acc.smell = topicLoss.geruch;
  acc.nuisance = loss;
  const baseline = cfg(state).acceptance.baseline + acc.baselineBonus + (state.heatLineActive ? cfg(state).acceptance.heatBaselineBonus : 0) + state.scenarioFactors.acceptanceBaseline;
  acc.value = Math.max(0, Math.min(100, acc.value + cfg(state).acceptance.recoveryPerDay * (baseline - acc.value) - loss));

  // Beschwerden
  if (loss > cfg(state).acceptance.complaintThreshold && day - acc.lastComplaintDay >= cfg(state).acceptance.complaintCooldownDays) {
    if (chance(state.rng.village, (loss - cfg(state).acceptance.complaintThreshold) * cfg(state).acceptance.complaintChancePerPoint)) {
      const topic = (Object.entries(topicLoss) as [Topic, number][]).sort((a, b) => b[1] - a[1])[0][0];
      const ev = logEvent(log, day, {
        type: 'complaint',
        severity: 'warning',
        causes: topCauses(today),
        data: { topic, acceptance: round(acc.value, 0) },
      });
      acc.complaints.push(day);
      acc.complaintEvents.push(ev.id);
      acc.lastComplaintDay = day;
      say(state, 'nachbar', `beschwerde_${topic}`, {}, ev.id);
      const recent = recentComplaints(state);
      if (recent.length >= cfg(state).acceptance.authorityNoticeComplaints && !acc.authorityNotified) {
        acc.authorityNotified = true;
        const nev = logEvent(log, day, {
          type: 'authority_notice',
          severity: 'warning',
          causes: recent.slice().reverse(),
          data: { complaints: recent.length },
        });
        acc.authorityEvent = nev.id;
        say(state, 'behoerde', 'anhoerung', {}, nev.id);
      }
    }
  }

  // Stufen
  const level: 0 | 1 | 2 = acc.value < cfg(state).acceptance.criticalLevel ? 2 : acc.value < cfg(state).acceptance.warningLevel ? 1 : 0;
  if (level > acc.level) {
    const ev = logEvent(log, day, {
      type: level === 2 ? 'acceptance_critical' : 'acceptance_low',
      severity: level === 2 ? 'critical' : 'warning',
      causes: level === 2 && acc.levelEvent ? [acc.levelEvent, ...topCauses(acc.causes)] : topCauses(acc.causes),
      data: { acceptance: round(acc.value, 0) },
    });
    acc.level = level;
    acc.levelEvent = ev.id;
  } else if (level < acc.level && acc.value > (level === 0 ? cfg(state).acceptance.warningLevel : cfg(state).acceptance.criticalLevel) + cfg(state).acceptance.levelHysteresis) {
    acc.level = level;
    if (level === 0) acc.levelEvent = undefined;
  }
  acc.daysCritical = level === 2 ? acc.daysCritical + 1 : 0;
}

export function recentComplaints(state: GameState): string[] {
  const acc = state.acceptance;
  const out: string[] = [];
  acc.complaints.forEach((d, i) => {
    if (state.day - d <= cfg(state).acceptance.shutdownComplaintWindowDays) out.push(acc.complaintEvents[i]);
  });
  return out;
}

function siloQuality(state: GameState): number | null {
  const m = state.silo.mais;
  const g = state.silo.gruenroggen;
  const t = m.t + g.t;
  if (t <= 0) return null;
  return (m.quality * m.t + g.quality * g.t) / t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
