import { CONFIG } from './config';
import { addCause, decayCauses, logEvent, topCauses } from './eventlog';
import { round } from './biology';
import { chance, intRange, range } from './rng';
import { say } from './messages';
import { hasStaff, ledger } from './storage';
import { difficulty, hasFeature } from './difficulty';
import type { GameState } from './types';
import { cfg, plantSpec, type ScenarioId } from './plant';
import { heatNeedShare } from './biology';

/**
 * Technik: Gasspeicher, BHKW, Notfackel, Entschwefelung, Wartung.
 */

const C = CONFIG.chp;

const PL = CONFIG.plant;
const U = CONFIG.upgrading;
type WithScenario = { scenario: { id: ScenarioId } };

/** m³ Methan pro Tag, die das BHKW bei Volllast verwertet (0 ohne BHKW). */
export function chpCh4PerDay(state: WithScenario): number {
  return (plantSpec(state).chpKwEl / PL.chpEtaEl / PL.methaneKwhPerM3) * CONFIG.units.hoursPerDay;
}

/** Methan pro Tag bei Auslegungslast der ganzen Anlage (Altanlage: BHKW-Volllast, sonst mit der Größe skaliert). */
export function plantCh4PerDay(state: WithScenario): number {
  return ((PL.chpPowerKwEl / PL.chpEtaEl / PL.methaneKwhPerM3) * CONFIG.units.hoursPerDay) * plantSpec(state).scale;
}

/** Biogas pro Stunde bei Auslegungslast (für Speicherstunden und die Kennwertleiste). */
export function biogasPerHourAtFullLoad(state: WithScenario, ch4Share: number): number {
  return plantCh4PerDay(state) / ch4Share / CONFIG.units.hoursPerDay;
}

/** Wärme, die eine Referenzanlage dieser Größe bei Volllast liefert, kWh pro Tag (Bezug für den Heizbedarf). */
export function heatReferenceKwhPerDay(state: WithScenario): number {
  return plantCh4PerDay(state) * PL.methaneKwhPerM3 * PL.chpEtaTh;
}

export interface TechResult {
  kwhEl: number;
  kwhTh: number;
  ch4Used: number;
  /** eingespeistes Methan, m³ */
  ch4Injected: number;
  /** Strombedarf der Aufbereitung, kWh */
  upgradingKwh: number;
}

export function techDay(state: GameState, ch4ProducedM3: number, ambientC: number): TechResult {
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

  if (state.upgrading) upgradingRestart(state, state.upgrading);

  // Entschwefelung
  const mix = state.bio.lastMix;
  let rawUnits = 0;
  for (const s of ['mais', 'gruenroggen', 'guelle', 'reststoff'] as const) rawUnits += mix[s] * CONFIG.substrates[s].h2s;
  const desulf = state.desulf;
  desulf.rawPpm = rawUnits * cfg(state).desulfurization.rawPpmPerUnit;
  const loadRel = (ch4ProducedM3 / plantCh4PerDay(state)) * rawUnits;
  if (desulf.mediumDays > 0) {
    if (difficulty(state).desulfConsumable && hasFeature(state, 'entschwefelung')) desulf.mediumDays = Math.max(0, desulf.mediumDays - loadRel);
    desulf.cleanPpm = desulf.rawPpm * cfg(state).desulfurization.withMediumResidual;
  } else {
    desulf.cleanPpm = desulf.rawPpm * (1 - cfg(state).desulfurization.biologicalRemoval);
  }
  if (desulf.mediumDays <= 0 && !desulf.emptyEvent) {
    const ev = logEvent(log, day, {
      type: 'desulf_empty',
      severity: 'warning',
      causes: [],
      data: { rawPpm: Math.round(desulf.rawPpm), cleanPpm: Math.round(desulf.rawPpm * (1 - cfg(state).desulfurization.biologicalRemoval)) },
    });
    desulf.emptyEvent = ev.id;
    say(state, 'betriebsleiter', 'entschwefelung_leer', {}, ev.id);
  }
  if (desulf.mediumDays > 0 && desulf.mediumDays < cfg(state).desulfurization.lowNoticeDays && !desulf.lowNoticeSent) {
    desulf.lowNoticeSent = true;
    say(state, 'betriebsleiter', 'entschwefelung_knapp', { tage: Math.round(desulf.mediumDays) });
  }

  // Gasspeicher füllen
  const biogas = ch4ProducedM3 / share;
  gas.producedToday = biogas;
  gas.storedM3 += biogas;

  // Heizkessel: deckt vorrangig den Wärmebedarf des Fermenters, den das BHKW gestern nicht gedeckt hat
  const heatRef = heatReferenceKwhPerDay(state);
  const needKwh = heatNeedShare(ambientC) * heatRef;
  const capCh4 = chpCh4PerDay(state);
  const chpRunning = capCh4 > 0 && chp.status === 'betrieb';
  const lastChpHeat = chpRunning ? chp.runShare * capCh4 * PL.methaneKwhPerM3 * PL.chpEtaTh : 0;
  state.boilerCh4Today = 0;
  let boilerKwh = 0;
  if (plantSpec(state).boiler && lastChpHeat < needKwh) {
    const wantCh4 = (needKwh - lastChpHeat) / (PL.methaneKwhPerM3 * U.boilerEta);
    const takeBiogas = Math.min(gas.storedM3, wantCh4 / share);
    gas.storedM3 -= takeBiogas;
    state.boilerCh4Today = takeBiogas * share;
    boilerKwh = state.boilerCh4Today * PL.methaneKwhPerM3 * U.boilerEta;
  }

  // Gasverteilung: erst das BHKW (EEG-Vergütung), der Rest in die Aufbereitung.
  // Speichermanagement: verwertet die Tagesproduktion und führt den Speicher langsam zum
  // Zielfüllstand zurück, damit Reserven für Stillstände bleiben
  const upg = state.upgrading;
  const upgRunning = !!upg && upg.status === 'betrieb';
  const capUpgBiogas = upg ? plantSpec(state).upgradingRawM3PerH * CONFIG.units.hoursPerDay : 0;
  const minStore = gas.capacityM3 * cfg(state).plant.gasStorageMinShare;
  const availableBiogas = Math.max(0, gas.storedM3 - minStore);
  const target = gas.capacityM3 * cfg(state).plant.gasStorageTargetShare;
  const wanted = Math.max(0, biogas + (gas.storedM3 - biogas - target) * cfg(state).plant.gasStorageRelax);
  const capBiogas = (chpRunning ? capCh4 / share : 0) + (upgRunning ? capUpgBiogas : 0);
  const useBiogas = Math.min(availableBiogas, capBiogas, wanted);
  const chpBiogas = chpRunning ? Math.min(useBiogas, capCh4 / share) : 0;
  const upgBiogas = upgRunning ? Math.min(useBiogas - chpBiogas, capUpgBiogas) : 0;
  gas.storedM3 -= chpBiogas + upgBiogas;
  const ch4Used = chpBiogas * share;
  chp.runShare = capCh4 > 0 ? ch4Used / capCh4 : 0;
  const upgRes = upg ? upgradingDay(state, upg, upgBiogas, capUpgBiogas, share) : { ch4Injected: 0, kwh: 0 };

  // Wärme für den Fermenter morgen: BHKW plus Kessel, bezogen auf die Referenzwärme
  const chpHeat = ch4Used * PL.methaneKwhPerM3 * PL.chpEtaTh;
  state.heatShare = heatRef > 0 ? (chpHeat + boilerKwh) / heatRef : 0;
  const hours = chp.runShare * CONFIG.units.hoursPerDay;
  if (capCh4 > 0) chpUnitDay(state, hours);

  // Speicher voll: Fackel
  gas.flaredToday = 0;
  if (gas.storedM3 > gas.capacityM3) {
    gas.flaredToday = gas.storedM3 - gas.capacityM3;
    gas.storedM3 = gas.capacityM3;
    state.totals.flaredM3 += gas.flaredToday;
    const lostEur = gas.flaredToday * share * valuePerCh4(state);
    const unitDown = capCh4 > 0 && chp.status !== 'betrieb' ? chp.downEvent : upg && upg.status !== 'betrieb' ? upg.downEvent : undefined;
    const cause = unitDown ?? state.feedTargetEvent ?? state.origin.feeding;
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
    addCause(state.finance.lossCauses, gas.flareEvent, lostEur);
  } else if (gas.flaring) {
    gas.flaring = false;
    gas.flareEvent = undefined;
  }

  const eta = cfg(state).plant.chpEtaEl * (hasStaff(state, 'techniker') ? 1 + CONFIG.staff.technicianEtaBonus : 1);
  const kwhEl = ch4Used * cfg(state).plant.methaneKwhPerM3 * eta;
  return { kwhEl, kwhTh: chpHeat, ch4Used, ch4Injected: upgRes.ch4Injected, upgradingKwh: upgRes.kwh };
}

/** BHKW: Betriebsstunden, Verschleiß, Wartung, Störungen, Netzausfall, Totalschaden. */
function chpUnitDay(state: GameState, hours: number): void {
  const chp = state.chp;
  const desulf = state.desulf;
  const log = state.log;
  const day = state.day;
  chp.operatingHours += hours;
  chp.hoursSinceService += hours;

  // Verschleiß
  const overdue = Math.max(0, chp.hoursSinceService - C.serviceIntervalH) / C.serviceIntervalH;
  // Ohne Entschwefelung als Funktion (Stufe Vereinfacht) gibt es auch keinen Schwefel-Verschleiß
  const h2sMult = hasFeature(state, 'entschwefelung') ? 1 + C.h2sWearPer100ppm * (desulf.cleanPpm / 100) : 1;
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
    if (state.maintenanceContract) p *= cfg(state).maintenanceContract.failureFactor;
    p *= difficulty(state).chpFailureFactor;
    if (chance(state.rng.tech, p)) {
      let days = intRange(state.rng.tech, C.failureDowntimeDays[0], C.failureDowntimeDays[1]);
      if (hasStaff(state, 'techniker')) days = Math.max(1, Math.round(days * CONFIG.staff.technicianDowntimeFactor));
      let cost = Math.round(range(state.rng.tech, C.failureRepairEur[0], C.failureRepairEur[1]));
      if (state.maintenanceContract) cost *= 1 - cfg(state).maintenanceContract.repairCoverShare;
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

  // Netzausfall (Stufe Real): das BHKW darf nicht einspeisen und schaltet ab
  if (chp.status === 'betrieb' && chance(state.rng.tech, difficulty(state).gridOutagePerDay)) {
    const ev = logEvent(log, day, { type: 'grid_outage', severity: 'warning', causes: [], data: { days: CONFIG.realEvents.gridOutageDays } });
    chp.status = 'stoerung';
    chp.downUntilDay = day + CONFIG.realEvents.gridOutageDays;
    chp.downEvent = ev.id;
    say(state, 'netzbetreiber', 'netzausfall', {}, ev.id);
  }

  // Totalschaden
  if (chp.wear >= C.wearLimit && chp.status !== 'ersatz') {
    const ev = logEvent(log, day, {
      type: 'chp_destroyed',
      severity: 'critical',
      causes: topCauses(chp.wearCauses),
      data: { wear: round(chp.wear, 2), costEur: C.replacement.costEur },
    });
    const liquidity = state.finance.balance + cfg(state).finance.creditLimitEur;
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
}

/** Wert eines m³ Methan, das verloren geht (für die Zuordnung entgangener Erlöse). */
export function valuePerCh4(state: GameState): number {
  if (state.upgrading) return CONFIG.plant.methaneKwhPerM3 * U.biomethaneEurPerKwh * (1 - U.methaneSlip) - (U.powerKwhPerRawM3 / state.bio.ch4Share) * PL.gridPurchaseEurPerKwh;
  return PL.methaneKwhPerM3 * PL.chpEtaEl * cfg(state).finance.eegEurPerKwh;
}

function upgradingRestart(state: GameState, upg: NonNullable<GameState['upgrading']>): void {
  if (upg.status !== 'betrieb' && state.day >= upg.downUntilDay) {
    logEvent(state.log, state.day, { type: 'upgrading_restart', causes: [upg.downEvent], data: { status: upg.status } });
    upg.status = 'betrieb';
    upg.downEvent = undefined;
  }
}

/** Gasaufbereitung: Einspeisung, Methanschlupf, Strombedarf, Wartung, Störungen, Einspeisestopp. */
function upgradingDay(state: GameState, upg: NonNullable<GameState['upgrading']>, biogasM3: number, capBiogasM3: number, share: number): { ch4Injected: number; kwh: number } {
  const log = state.log;
  const day = state.day;
  upg.runShare = capBiogasM3 > 0 ? biogasM3 / capBiogasM3 : 0;
  const hours = upg.runShare * CONFIG.units.hoursPerDay;
  upg.operatingHours += hours;
  upg.hoursSinceService += hours;
  const ch4 = biogasM3 * share;
  const slip = ch4 * U.methaneSlip;
  state.totals.ch4SlipM3 += slip;
  upg.injectedCh4Today = ch4 - slip;
  const kwh = biogasM3 * U.powerKwhPerRawM3;

  // Wartung
  if (upg.hoursSinceService >= U.serviceIntervalH - U.serviceNoticeHoursBefore && !upg.serviceNoticeSent) {
    upg.serviceNoticeSent = true;
    say(state, 'betriebsleiter', 'aufbereitung_wartung', { stunden: Math.round(upg.hoursSinceService) });
  }
  if (upg.hoursSinceService >= U.serviceIntervalH && !upg.overdueEvent) {
    upg.overdueEvent = logEvent(log, day, { type: 'upgrading_service_overdue', severity: 'warning', playerDecision: true, causes: [], data: { hoursSinceService: Math.round(upg.hoursSinceService) } }).id;
  }
  if ((hasStaff(state, 'techniker') || state.maintenanceContract) && upg.status === 'betrieb' && upg.hoursSinceService >= U.serviceIntervalH - CONFIG.staff.technicianServiceLeadH) {
    performService(state, 'aufbereitung', state.maintenanceContract ?? staffEvent(state, 'techniker'));
  }

  // Störung: überfällige Wartung und Schwefel im Gas belasten Verdichter und Membranen
  if (upg.status === 'betrieb' && hours > 0) {
    const overdue = Math.max(0, upg.hoursSinceService - U.serviceIntervalH) / U.serviceIntervalH;
    const h2s = hasFeature(state, 'entschwefelung') ? state.desulf.cleanPpm / 100 : 0;
    let p = U.failureBasePerDay * (1 + U.failureOverdueFactor * overdue) * (1 + U.h2sFailurePer100ppm * h2s) * difficulty(state).chpFailureFactor;
    if (hasStaff(state, 'techniker')) p *= CONFIG.staff.technicianFailureFactor;
    if (state.maintenanceContract) p *= CONFIG.maintenanceContract.failureFactor;
    if (chance(state.rng.tech, p)) {
      let days = intRange(state.rng.tech, U.failureDowntimeDays[0], U.failureDowntimeDays[1]);
      if (hasStaff(state, 'techniker')) days = Math.max(1, Math.round(days * CONFIG.staff.technicianDowntimeFactor));
      let cost = Math.round(range(state.rng.tech, U.failureRepairEur[0], U.failureRepairEur[1]));
      if (state.maintenanceContract) cost *= 1 - CONFIG.maintenanceContract.repairCoverShare;
      const causes = [upg.overdueEvent, h2s > 1 ? state.desulf.emptyEvent : undefined, state.origin.plant].filter(Boolean) as string[];
      const ev = logEvent(log, day, { type: 'upgrading_failure', severity: 'warning', causes, data: { days, costEur: Math.round(cost) } });
      upg.status = 'stoerung';
      upg.downUntilDay = day + days;
      upg.downEvent = ev.id;
      state.finance.balance -= cost;
      ledger(state, 'reparatur', cost);
      addCause(state.finance.lossCauses, ev.id, cost);
      say(state, 'betriebsleiter', 'aufbereitung_stoerung', { tage: days }, ev.id);
    }
  }

  // Einspeisestopp durch den Gasnetzbetreiber (Stufe Real)
  if (upg.status === 'betrieb' && chance(state.rng.tech, difficulty(state).gridOutagePerDay)) {
    const ev = logEvent(log, day, { type: 'gas_grid_stop', severity: 'warning', causes: [], data: { days: U.gridStopDays } });
    upg.status = 'einspeisestopp';
    upg.downUntilDay = day + U.gridStopDays;
    upg.downEvent = ev.id;
    say(state, 'netzbetreiber', 'einspeisestopp', { tage: U.gridStopDays }, ev.id);
  }
  return { ch4Injected: upg.injectedCh4Today, kwh };
}

export function staffEvent(state: GameState, role: string): string | undefined {
  return state.staff.find((s) => s.role === role)?.eventId;
}

/** Wartung ausführen. `cause` ist die Entscheidung (Spieler, Techniker, Vertrag). */
export function performService(state: GameState, kind: 'klein' | 'gross' | 'entschwefelung' | 'aufbereitung', cause: string | undefined): void {
  const chp = state.chp;
  if (kind === 'aufbereitung') {
    const upg = state.upgrading;
    if (!upg) return;
    let cost: number = state.maintenanceContract ? 0 : U.serviceCostEur;
    if (hasStaff(state, 'techniker')) cost *= CONFIG.staff.technicianServiceCostFactor;
    const ev = logEvent(state.log, state.day, { type: 'service_upgrading', causes: [cause], data: { costEur: cost, days: U.serviceDowntimeDays } });
    state.finance.balance -= cost;
    ledger(state, 'wartung', cost);
    upg.hoursSinceService = 0;
    upg.serviceNoticeSent = false;
    upg.overdueEvent = undefined;
    if (upg.status === 'betrieb') {
      upg.status = 'wartung';
      upg.downUntilDay = state.day + U.serviceDowntimeDays;
      upg.downEvent = ev.id;
    } else upg.downUntilDay = Math.max(upg.downUntilDay, state.day + U.serviceDowntimeDays);
    return;
  }
  if (kind === 'entschwefelung') {
    state.desulf.mediumDays = cfg(state).desulfurization.mediumCapacityDays;
    state.desulf.emptyEvent = undefined;
    state.desulf.lowNoticeSent = false;
    state.finance.balance -= cfg(state).desulfurization.refillCostEur;
    ledger(state, 'wartung', cfg(state).desulfurization.refillCostEur);
    logEvent(state.log, state.day, { type: 'desulf_refilled', causes: [cause], data: { costEur: cfg(state).desulfurization.refillCostEur } });
    return;
  }
  if (chp.status === 'ersatz') return;
  const spec = kind === 'klein' ? C.smallService : C.majorService;
  let days: number = spec.downtimeDays;
  if (hasStaff(state, 'techniker')) days = Math.max(1, Math.round(days * CONFIG.staff.technicianDowntimeFactor));
  let cost = kind === 'klein' && state.maintenanceContract ? 0 : spec.costEur;
  if (kind === 'klein' && hasStaff(state, 'techniker')) cost *= CONFIG.staff.technicianServiceCostFactor;
  const ev = logEvent(state.log, state.day, {
    type: kind === 'klein' ? 'service_small' : 'service_major',
    causes: [cause],
    data: { costEur: cost, days },
  });
  state.finance.balance -= cost;
  ledger(state, 'wartung', cost);
  chp.wear = Math.max(0, chp.wear - spec.wearReduction);
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
