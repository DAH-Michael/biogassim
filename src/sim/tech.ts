import { CONFIG } from './config';
import { addCause, decayCauses, logEvent, topCauses } from './eventlog';
import { round } from './biology';
import { chance, intRange, range } from './rng';
import { say } from './messages';
import { hasStaff, ledger } from './storage';
import type { GameState } from './types';

/**
 * Technik: Gasspeicher, BHKW, Notfackel, Entschwefelung, Wartung.
 */

const C = CONFIG.chp;
const DS = CONFIG.desulfurization;
const PL = CONFIG.plant;

/** m³ Methan pro Tag bei Volllast. */
export function chpCh4PerDay(): number {
  return (PL.chpPowerKwEl / PL.chpEtaEl / PL.methaneKwhPerM3) * CONFIG.units.hoursPerDay;
}

/** Biogasmenge bei Volllast pro Stunde (für Speicherstunden). */
export function biogasPerHourAtFullLoad(ch4Share: number): number {
  return chpCh4PerDay() / ch4Share / CONFIG.units.hoursPerDay;
}

export interface TechResult {
  kwhEl: number;
  kwhTh: number;
  ch4Used: number;
}

export function techDay(state: GameState, ch4ProducedM3: number): TechResult {
  const chp = state.chp;
  const gas = state.gas;
  const log = state.log;
  const day = state.day;
  const share = state.bio.ch4Share;
  decayCauses(chp.wearCauses, CONFIG.biology.causeHalfLifeDays * 2);

  // Wieder in Betrieb?
  if (chp.status !== 'betrieb' && day >= chp.downUntilDay) {
    logEvent(log, day, { type: 'chp_restart', causes: [chp.downEvent], data: { status: chp.status } });
    chp.status = 'betrieb';
    chp.downEvent = undefined;
  }

  // Entschwefelung
  const mix = state.bio.lastMix;
  let rawUnits = 0;
  for (const s of ['mais', 'gruenroggen', 'guelle', 'reststoff'] as const) rawUnits += mix[s] * CONFIG.substrates[s].h2s;
  const desulf = state.desulf;
  desulf.rawPpm = rawUnits * DS.rawPpmPerUnit;
  const loadRel = (ch4ProducedM3 / chpCh4PerDay()) * rawUnits;
  if (desulf.mediumDays > 0) {
    desulf.mediumDays = Math.max(0, desulf.mediumDays - loadRel);
    desulf.cleanPpm = desulf.rawPpm * DS.withMediumResidual;
  } else {
    desulf.cleanPpm = desulf.rawPpm * (1 - DS.biologicalRemoval);
  }
  if (desulf.mediumDays <= 0 && !desulf.emptyEvent) {
    const ev = logEvent(log, day, {
      type: 'desulf_empty',
      severity: 'warning',
      causes: [],
      data: { rawPpm: Math.round(desulf.rawPpm), cleanPpm: Math.round(desulf.rawPpm * (1 - DS.biologicalRemoval)) },
    });
    desulf.emptyEvent = ev.id;
    say(state, 'betriebsleiter', 'entschwefelung_leer', {}, ev.id);
  }
  if (desulf.mediumDays > 0 && desulf.mediumDays < DS.lowNoticeDays && !desulf.lowNoticeSent) {
    desulf.lowNoticeSent = true;
    say(state, 'betriebsleiter', 'entschwefelung_knapp', { tage: Math.round(desulf.mediumDays) });
  }

  // Gasspeicher füllen
  const biogas = ch4ProducedM3 / share;
  gas.producedToday = biogas;
  gas.storedM3 += biogas;

  // BHKW
  let ch4Used = 0;
  const capCh4 = chpCh4PerDay();
  const minStore = gas.capacityM3 * PL.gasStorageMinShare;
  if (chp.status === 'betrieb') {
    const availableBiogas = Math.max(0, gas.storedM3 - minStore);
    const useBiogas = Math.min(availableBiogas, capCh4 / share);
    ch4Used = useBiogas * share;
    gas.storedM3 -= useBiogas;
  }
  chp.runShare = ch4Used / capCh4;
  const hours = chp.runShare * CONFIG.units.hoursPerDay;
  chp.operatingHours += hours;
  chp.hoursSinceService += hours;

  // Verschleiß
  const overdue = Math.max(0, chp.hoursSinceService - C.serviceIntervalH) / C.serviceIntervalH;
  const h2sMult = 1 + C.h2sWearPer100ppm * (desulf.cleanPpm / 100);
  const overdueMult = 1 + C.overdueWearFactor * overdue;
  let wear = (C.wearPerYear / C.wearReferenceHours) * hours * h2sMult * overdueMult;
  if (hasStaff(state, 'techniker')) wear *= CONFIG.staff.technicianWearFactor;
  chp.wear += wear;
  const baseWear = (C.wearPerYear / C.wearReferenceHours) * hours;
  if (overdue > 0) addCause(chp.wearCauses, chp.overdueEvent, baseWear * (overdueMult - 1));
  if (desulf.emptyEvent) addCause(chp.wearCauses, desulf.emptyEvent, baseWear * (h2sMult - 1));
  addCause(chp.wearCauses, state.origin.plant, baseWear * C.wearOriginWeight);

  // Wartung überfällig
  if (chp.hoursSinceService >= C.serviceIntervalH - C.serviceNoticeHoursBefore && !chp.serviceNoticeSent) {
    chp.serviceNoticeSent = true;
    say(state, 'betriebsleiter', 'wartung_faellig', { stunden: Math.round(chp.hoursSinceService) });
  }
  if (chp.hoursSinceService >= C.serviceIntervalH && !chp.overdueEvent) {
    const ev = logEvent(log, day, {
      type: 'service_overdue',
      severity: 'warning',
      playerDecision: true,
      causes: [],
      data: { hoursSinceService: Math.round(chp.hoursSinceService) },
    });
    chp.overdueEvent = ev.id;
  }

  // Techniker plant Wartung selbst
  if (hasStaff(state, 'techniker') || state.maintenanceContract) {
    if (chp.status === 'betrieb' && chp.hoursSinceService >= C.serviceIntervalH - CONFIG.staff.technicianServiceLeadH) {
      performService(state, 'klein', state.maintenanceContract ?? staffEvent(state, 'techniker'));
    }
    if (hasStaff(state, 'techniker') && desulf.mediumDays < CONFIG.staff.technicianRefillDays) {
      performService(state, 'entschwefelung', staffEvent(state, 'techniker'));
    }
  }

  // Störung
  if (chp.status === 'betrieb' && hours > 0) {
    let p = C.failureBasePerDay * (1 + C.failureOverdueFactor * overdue) * (1 + C.failureWearFactor * Math.max(0, chp.wear - C.failureWearThreshold)) * Math.sqrt(h2sMult);
    if (hasStaff(state, 'techniker')) p *= CONFIG.staff.technicianFailureFactor;
    if (state.maintenanceContract) p *= CONFIG.maintenanceContract.failureFactor;
    if (chance(state.rng.tech, p)) {
      let days = intRange(state.rng.tech, C.failureDowntimeDays[0], C.failureDowntimeDays[1]);
      if (hasStaff(state, 'techniker')) days = Math.max(1, Math.round(days * CONFIG.staff.technicianDowntimeFactor));
      let cost = Math.round(range(state.rng.tech, C.failureRepairEur[0], C.failureRepairEur[1]));
      if (state.maintenanceContract) cost *= 1 - CONFIG.maintenanceContract.repairCoverShare;
      chp.wear += C.failureWear;
      const ev = logEvent(log, day, {
        type: 'chp_failure',
        severity: 'warning',
        causes: topCauses(chp.wearCauses),
        data: { days, costEur: Math.round(cost), wear: round(chp.wear, 2) },
      });
      chp.status = 'stoerung';
      chp.downUntilDay = day + days;
      chp.downEvent = ev.id;
      state.finance.balance -= cost;
      ledger(state, 'reparatur', cost);
      addCause(state.finance.lossCauses, ev.id, cost);
      say(state, 'betriebsleiter', 'bhkw_stoerung', { tage: days }, ev.id);
    }
  }

  // Totalschaden
  if (chp.wear >= C.wearLimit && chp.status !== 'ersatz') {
    const ev = logEvent(log, day, {
      type: 'chp_destroyed',
      severity: 'critical',
      causes: topCauses(chp.wearCauses),
      data: { wear: round(chp.wear, 2), costEur: C.replacement.costEur },
    });
    const liquidity = state.finance.balance + CONFIG.finance.creditLimitEur;
    if (liquidity >= C.replacement.costEur) {
      state.finance.balance -= C.replacement.costEur;
      ledger(state, 'ersatzBhkw', C.replacement.costEur);
      addCause(state.finance.lossCauses, ev.id, C.replacement.costEur);
      chp.status = 'ersatz';
      chp.downUntilDay = day + C.replacement.downtimeDays;
      chp.downEvent = ev.id;
      chp.wear = 0;
      chp.hoursSinceService = 0;
      chp.overdueEvent = undefined;
      chp.wearCauses = {};
      logEvent(log, day, { type: 'chp_replaced', causes: [ev.id], data: { costEur: C.replacement.costEur } });
    } else {
      chp.destroyedEvent = ev.id;
      chp.status = 'ersatz';
      chp.downUntilDay = Number.POSITIVE_INFINITY;
      chp.downEvent = ev.id;
    }
  }

  // Speicher voll: Fackel
  gas.flaredToday = 0;
  if (gas.storedM3 > gas.capacityM3) {
    gas.flaredToday = gas.storedM3 - gas.capacityM3;
    gas.storedM3 = gas.capacityM3;
    state.totals.flaredM3 += gas.flaredToday;
    const lostKwh = gas.flaredToday * share * PL.methaneKwhPerM3 * PL.chpEtaEl;
    const cause = chp.status !== 'betrieb' ? chp.downEvent : state.feedTargetEvent ?? state.origin.feeding;
    // Neue Episode, wenn sich der Grund ändert (z. B. Störung behoben, aber weiterhin zu viel Gas)
    if (gas.flaring && gas.flareCause !== cause) gas.flaring = false;
    if (!gas.flaring) {
      gas.flareCause = cause;
      const ev = logEvent(log, day, {
        type: 'flare_on',
        severity: 'warning',
        causes: [cause],
        data: { flaredM3: Math.round(gas.flaredToday) },
      });
      gas.flareEvent = ev.id;
      gas.flaring = true;
    }
    addCause(state.finance.lossCauses, gas.flareEvent, lostKwh * CONFIG.finance.eegEurPerKwh);
  } else if (gas.flaring) {
    gas.flaring = false;
    gas.flareEvent = undefined;
  }

  const kwhEl = ch4Used * PL.methaneKwhPerM3 * PL.chpEtaEl;
  const kwhTh = ch4Used * PL.methaneKwhPerM3 * PL.chpEtaTh;
  return { kwhEl, kwhTh, ch4Used };
}

export function staffEvent(state: GameState, role: string): string | undefined {
  return state.staff.find((s) => s.role === role)?.eventId;
}

/** Wartung ausführen. `cause` ist die Entscheidung (Spieler, Techniker, Vertrag). */
export function performService(state: GameState, kind: 'klein' | 'gross' | 'entschwefelung', cause: string | undefined): void {
  const chp = state.chp;
  if (kind === 'entschwefelung') {
    state.desulf.mediumDays = DS.mediumCapacityDays;
    state.desulf.emptyEvent = undefined;
    state.desulf.lowNoticeSent = false;
    state.finance.balance -= DS.refillCostEur;
    ledger(state, 'wartung', DS.refillCostEur);
    logEvent(state.log, state.day, { type: 'desulf_refilled', causes: [cause], data: { costEur: DS.refillCostEur } });
    return;
  }
  if (chp.status === 'ersatz') return;
  const cfg = kind === 'klein' ? C.smallService : C.majorService;
  let days: number = cfg.downtimeDays;
  if (hasStaff(state, 'techniker')) days = Math.max(1, Math.round(days * CONFIG.staff.technicianDowntimeFactor));
  const cost = kind === 'klein' && state.maintenanceContract ? 0 : cfg.costEur;
  const ev = logEvent(state.log, state.day, {
    type: kind === 'klein' ? 'service_small' : 'service_major',
    causes: [cause],
    data: { costEur: cost, days },
  });
  state.finance.balance -= cost;
  ledger(state, 'wartung', cost);
  chp.wear = Math.max(0, chp.wear - cfg.wearReduction);
  chp.hoursSinceService = 0;
  chp.serviceNoticeSent = false;
  chp.overdueEvent = undefined;
  if (chp.status === 'betrieb') {
    chp.status = 'wartung';
    chp.downUntilDay = state.day + days;
    chp.downEvent = ev.id;
  } else {
    chp.downUntilDay = Math.max(chp.downUntilDay, state.day + days);
  }
}
