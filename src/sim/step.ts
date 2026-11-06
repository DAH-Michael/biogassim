import { CONFIG } from './config';
import { logEvent } from './eventlog';
import { applyAction, type ActionResult } from './actions';
import { biologyDay } from './biology';
import { fieldsDay } from './fields';
import { notifySupplyOffers, supplyDay } from './contracts';
import { feedingDay } from './feeding';
import { digestateDay, siloDay, siloStock } from './storage';
import { plantCh4PerDay, techDay } from './tech';
import { cfg, hasChp, plantScale } from './plant';
import { scaleMap } from './biology';
import { acceptanceDay } from './acceptance';
import { financeDay, settleMonth, villageHeatDemandKwh } from './finance';
import { measurementDay } from './measurement';
import { checkFailure } from './failure';
import { difficulty } from './difficulty';
import { say } from './messages';
import type { Action, GameState } from './types';

/**
 * Ein Tick = ein Spieltag. Reihenfolge:
 * Entscheidungen, Fertigstellungen, Felder und Lieferungen, Silo, Fütterung,
 * Biologie, Gas und BHKW, Gärrestlager, Akzeptanz, Finanzen, Messung,
 * Scheitern, Verlauf. Deterministisch bei gleichem Seed und gleichen Entscheidungen.
 */
export function stepDay(state: GameState, actions: Action[] = []): ActionResult[] {
  if (state.failure || state.finished) return [];
  const results = actions.map((a) => applyAction(state, a));
  const day = state.day;
  const weather = state.weather.days[day];
  const playerChangedToday = state.feedChangedDay === day;
  state.residueDeliveredToday = undefined;
  state.today = { deliveries: [], guelle: [], residueArrived: false, harvesting: [], sowing: [], spreadM3: 0, offtakeM3: 0, siloSoldT: 0 };

  // Ausbauten fertig
  for (const b of state.builds.filter((x) => x.doneDay === day)) {
    const rest = b.costEur * (1 - cfg(state).builds.downPaymentShare);
    state.finance.balance -= rest;
    state.finance.ledger.ausbau = (state.finance.ledger.ausbau ?? 0) + rest;
    const ev = logEvent(state.log, day, { type: 'build_done', causes: [b.eventId], data: { kind: b.kind } });
    state.built[b.kind] = ev.id;
    switch (b.kind) {
      case 'digestateStorage': state.digestate.capacityM3 += cfg(state).builds.digestateStorage.addM3; break;
      case 'gasStorage': state.gas.capacityM3 += cfg(state).builds.gasStorage.addM3; break;
      case 'cover': state.digestate.covered = true; break;
      case 'heatLine': state.heatLineActive = true; break;
      case 'secondSilo': state.silo.capacityT += cfg(state).silo.secondSiloT; break;
    }
  }
  state.builds = state.builds.filter((x) => x.doneDay > day);

  notifySupplyOffers(state);

  // Felder, Lieferungen, Silo
  const fr = fieldsDay(state);
  const sr = supplyDay(state);
  siloDay(state, [...fr.deliveries, ...sr.deliveries]);
  for (const d of [...fr.deliveries, ...sr.deliveries]) {
    state.today.deliveries.push({ origin: d.origin ?? 'spot', kind: d.kind, t: d.t, distanceKm: d.distanceKm, throughVillage: d.throughVillage });
  }
  for (const d of fr.deliveries) if (d.origin && !state.today.harvesting.includes(d.origin)) state.today.harvesting.push(d.origin);
  state.today.residueArrived = state.residueDeliveredToday !== undefined;

  // Fütterung und Biologie
  const feed = feedingDay(state, playerChangedToday);
  state.fedToday = feed.fed;
  // Die Biologie rechnet pro Referenzeinheit (Fermenter der Altanlage); größere Anlagen
  // bestehen aus entsprechend vielen gleichartigen Einheiten
  const k = plantScale(state);
  const bioOut = biologyDay(state, {
    fed: scaleMap(feed.fed, 1 / k),
    ch4PerT: feed.ch4PerT,
    heatShare: state.heatShare,
    ambientC: weather.tempC,
    traceDosing: state.rampFeed !== null,
    shiftStressFactor: difficulty(state).shiftStressFactor,
    growthFactor: difficulty(state).growthFactor,
    traceElementsActive: difficulty(state).traceElements,
  }, feed.changeCause, feed.residueEvent);

  // Gärrestlager (aufgefangenes Restgas geht in den Gasspeicher)
  const lostBefore = state.totals.ch4LostStorageM3;
  const dg = digestateDay(state, bioOut.digestateT * k, bioOut.residualCh4 * k, weather.tempC);
  const ch4 = bioOut.ch4M3 * k + dg.capturedCh4;
  state.totals.ch4ProducedM3 += ch4;

  // Gas und BHKW
  const tech = techDay(state, ch4, weather.tempC);
  state.today.spreadM3 = state.digestate.spreadToday - state.digestate.offtakeToday;
  state.today.offtakeM3 = state.digestate.offtakeToday;

  // Akzeptanz
  const heatOutage = state.heatLineActive && hasChp(state) && state.chp.status !== 'betrieb' && villageHeatDemandKwh(state) / CONFIG.units.hoursPerDay > cfg(state).finance.heatOutageNoticeKw;
  acceptanceDay(state, {
    trafficTrips: fr.trafficTrips + sr.trafficTrips + feed.trafficTrips,
    trafficSource: fr.trafficSource ?? sr.trafficSource ?? feed.trafficSource,
    heatOutage,
    residualLostCh4: state.totals.ch4LostStorageM3 - lostBefore,
  });

  // Finanzen
  financeDay(state, { kwhEl: tech.kwhEl, kwhTh: tech.kwhTh, ch4Injected: tech.ch4Injected, upgradingKwh: tech.upgradingKwh, ch4Used: tech.ch4Used + tech.ch4Injected, shortfallCause: shortfallCause(state, ch4) });

  measurementDay(state);
  worldNotices(state);
  checkFailure(state);
  recordHistory(state, tech.kwhEl, ch4, tech.ch4Injected * CONFIG.plant.methaneKwhPerM3);

  state.day++;
  if (!state.failure && state.day >= CONFIG.time.runDays) {
    settleMonth(state);
    state.finished = true;
    logEvent(state.log, state.day, { type: 'year_completed', causes: [], data: { balance: Math.round(state.finance.balance) } });
  }
  return results;
}

/** Welches Ereignis begrenzt heute die Erzeugung? */
function shortfallCause(state: GameState, ch4: number): string | undefined {
  if (hasChp(state) && state.chp.status !== 'betrieb') return state.chp.downEvent;
  if (state.upgrading && state.upgrading.status !== 'betrieb') return state.upgrading.downEvent;
  if (state.bio.tipped) return state.bio.tippedEvent;
  if (state.bio.fosLevel > 0) return state.bio.fosLevelEvent;
  const empty = state.silo.emptyEvent;
  if (empty?.mais) return empty.mais;
  if (empty?.gruenroggen) return empty.gruenroggen;
  if (state.contaminationUntilDay > state.day) return state.contaminationEvent;
  if (ch4 < plantCh4PerDay(state)) return state.feedTargetEvent ?? state.origin.feeding;
  return undefined;
}

/** Beiläufige Meldungen, die keine eigene Kausalität haben. */
function worldNotices(state: GameState): void {
  const daily = state.feedTarget.mais + state.feedTarget.gruenroggen;
  if (daily > 0) {
    const reach = siloStock(state) / daily;
    if (reach < cfg(state).silo.lowStockNoticeDays && !state.silo.lowNoticeSent && siloStock(state) > 0) {
      state.silo.lowNoticeSent = true;
      say(state, 'betriebsleiter', 'silo_knapp', { tage: Math.round(reach) });
    } else if (reach > cfg(state).silo.lowStockNoticeDays * 2) {
      state.silo.lowNoticeSent = false;
    }
  }
  // Betriebsleiter bemerkt Prozessprobleme am Geruch und am Gas, aber spät
  const bio = state.bio;
  if (bio.fosTac > CONFIG.biology.fosTacCritical && !state.noticeFlags.bioSmell) {
    state.noticeFlags.bioSmell = true;
    say(state, 'betriebsleiter', 'fermenter_unruhig', {});
  } else if (bio.fosTac < CONFIG.biology.fosTacNormal) {
    state.noticeFlags.bioSmell = false;
  }
  // Biologin merkt es früher
  if (state.staff.some((s) => s.role === 'biologin') && bio.fosTac > CONFIG.biology.fosTacWarning - CONFIG.biology.biologistNoticeMargin && !state.noticeFlags.bioEarly) {
    state.noticeFlags.bioEarly = true;
    say(state, 'biologin', 'fos_steigt', {});
  } else if (bio.fosTac < CONFIG.biology.fosTacNormal) {
    state.noticeFlags.bioEarly = false;
  }
}

function recordHistory(state: GameState, kwhEl: number, ch4: number, gasKwh: number): void {
  const h = state.history;
  h.day.push(state.day);
  h.gasM3.push(ch4 / state.bio.ch4Share);
  h.fosTacTrue.push(state.bio.fosTac);
  h.fosTacMeasured.push(state.measurement.fosTac);
  h.tempC.push(state.bio.tempC);
  h.olr.push(state.bio.olr);
  h.gasStorageShare.push(state.gas.storedM3 / state.gas.capacityM3);
  h.siloT.push(siloStock(state));
  h.digestateShare.push(state.digestate.m3 / state.digestate.capacityM3);
  h.balance.push(state.finance.balance);
  h.acceptance.push(state.acceptance.value);
  h.powerKwh.push(kwhEl);
  h.gasKwh.push(gasKwh);
  h.flaredM3.push(state.gas.flaredToday);
  h.chpWear.push(state.chp.wear);
}

/** Simuliert bis zum Ende oder Scheitern; `plan` liefert Entscheidungen je Tag. */
export function runToEnd(state: GameState, plan: (s: GameState) => Action[] = () => []): GameState {
  while (!state.failure && !state.finished) stepDay(state, plan(state));
  return state;
}
