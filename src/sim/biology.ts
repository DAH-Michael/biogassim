import { CONFIG, SUBSTRATES, type SubstrateId } from './config';
import { addCause, decayCauses, logEvent, topCauses } from './eventlog';
import type { BiologyState, GameState, SubstrateMap } from './types';

/**
 * Fermenterbiologie, vereinfachtes Zweistufenmodell.
 *
 * 1. Hydrolyse und Säurebildung: Substrat wird je nach Abbaukonstante zu
 *    "Säuren" (gemessen als Methanpotenzial) umgesetzt. Folgt der Fütterung schnell.
 * 2. Methanbildung: Die Methanbildner haben eine Kapazität, die nur langsam
 *    wächst (Wochen). Liegt das Säureangebot über der wirksamen Kapazität,
 *    staut sich Säure, FOS/TAC steigt, die Methanbildung wird gehemmt, und das
 *    kann sich bis zum Umkippen selbst verstärken.
 *
 * Wirksame Kapazität = Kapazität · Temperatur · Hemmung · Anpassung · Spurenelemente.
 * Die Verzögerungen entstehen aus dem Modell, nicht aus künstlichen Wartezeiten.
 */

const B = CONFIG.biology;
const P = CONFIG.plant;

export function zeroMap(): SubstrateMap {
  return { mais: 0, gruenroggen: 0, guelle: 0, reststoff: 0 };
}

export function sumMap(m: SubstrateMap): number {
  return SUBSTRATES.reduce((a, s) => a + m[s], 0);
}

/** m³ CH4 pro kg oTS für Mais, Bezugsgröße der Kapazität. */
const MAIZE_CH4_PER_KG_OTS =
  CONFIG.substrates.mais.ch4PerT / (CONFIG.substrates.mais.ts * CONFIG.substrates.mais.ots * CONFIG.units.kgPerTonne);

export function maxCapacity(): number {
  return P.fermenterVolumeM3 * B.capacityMaxOlr * MAIZE_CH4_PER_KG_OTS;
}

/** Aktivität der Methanbildner in Abhängigkeit von der Temperatur (0 bis 1). */
export function tempFactor(t: number): number {
  const [lo, hi] = B.optimumC;
  if (t >= lo && t <= hi) return 1;
  if (t < lo) {
    if (t >= B.lowLimitC) return B.lowLimitFactor + (1 - B.lowLimitFactor) * ((t - B.lowLimitC) / (lo - B.lowLimitC));
    return Math.max(B.minTempFactor, B.lowLimitFactor - (B.lowLimitC - t) * B.belowLowSlopePerC);
  }
  if (t >= B.highLimitC) return B.highLimitFactor;
  return 1 - (1 - B.highLimitFactor) * ((t - hi) / (B.highLimitC - hi));
}

/** Hemmung durch Säurestau (1 = keine Hemmung). */
export function inhibition(fosTac: number): number {
  if (fosTac <= B.inhibitionStart) return 1;
  if (fosTac >= B.inhibitionFull) return B.inhibitionFloor;
  return 1 - (1 - B.inhibitionFloor) * ((fosTac - B.inhibitionStart) / (B.inhibitionFull - B.inhibitionStart));
}

/** Anteile nach Methanpotenzial. */
export function ch4Mix(fed: SubstrateMap, ch4PerT: SubstrateMap): SubstrateMap {
  const m = zeroMap();
  let total = 0;
  for (const s of SUBSTRATES) {
    m[s] = fed[s] * ch4PerT[s];
    total += m[s];
  }
  if (total <= 0) return m;
  for (const s of SUBSTRATES) m[s] /= total;
  return m;
}

export function mixDistance(a: SubstrateMap, b: SubstrateMap): number {
  return SUBSTRATES.reduce((acc, s) => acc + Math.abs(a[s] - b[s]), 0) / 2;
}

export function organicLoadingRate(fed: SubstrateMap): number {
  let kgOts = 0;
  for (const s of SUBSTRATES) {
    const c = CONFIG.substrates[s];
    kgOts += fed[s] * c.ts * c.ots * CONFIG.units.kgPerTonne;
  }
  return kgOts / P.fermenterVolumeM3;
}

export function createBiology(): BiologyState {
  return {
    pools: zeroMap(),
    acids: 0,
    capacity: maxCapacity() * B.initialCapacityShare,
    demandSmoothed: 0,
    postPool: 0,
    buffer: B.bufferBase,
    traceElements: CONFIG.feeding.startTraceElements,
    adaptedMix: { mais: 1, gruenroggen: 0, guelle: 0, reststoff: 0 },
    tempC: B.setpointC,
    fosTac: B.fosTacNormal,
    olr: 0,
    hrtDays: 0,
    inhibition: 1,
    adaptation: 1,
    traceFactor: 1,
    tempFactor: 1,
    ch4Share: CONFIG.substrates.mais.ch4Share,
    daysAboveTip: 0,
    tipped: false,
    tippedDay: null,
    daysBelowWarning: 0,
    stressCauses: {},
    fosLevel: 0,
    olrHistory: [],
    lastMix: { mais: 1, gruenroggen: 0, guelle: 0, reststoff: 0 },
  };
}

export interface BioInput {
  fed: SubstrateMap;
  /** wirksames Methanpotenzial je t (Qualität, Partie), m³ CH4/t */
  ch4PerT: SubstrateMap;
  /** Anteil der Heizleistung, die heute zur Verfügung stand (0 bis 1) */
  heatShare: number;
  ambientC: number;
  traceDosing: boolean;
}

export interface BioOutput {
  ch4M3: number;
  /** Methanpotenzial, das mit dem Gärrest ins Lager geht */
  residualCh4: number;
  /** Masse, die als Gärrest ins Lager geht, t */
  digestateT: number;
  mix: SubstrateMap;
  mismatch: number;
}

/** Ein Tag Biologie ohne Ereignisse (auch für die Vorlaufsimulation). */
export function bioCore(bio: BiologyState, inp: BioInput): BioOutput {
  const V = P.fermenterVolumeM3;
  const Vn = P.postDigesterVolumeM3;
  const fed = inp.fed;
  const massIn = sumMap(fed);
  const qVol = massIn * P.inputVolumeM3PerT;
  const dil = Math.min(1, qVol / V);

  // Temperatur
  const H = CONFIG.heat;
  const need = H.needShareAt15C + H.needSharePerDegree * Math.max(0, H.needReferenceC - inp.ambientC);
  if (inp.heatShare >= need) {
    if (bio.tempC < B.setpointC) bio.tempC = Math.min(B.setpointC, bio.tempC + H.heatUpPerDayC);
    else bio.tempC = Math.max(B.setpointC, bio.tempC - H.heatUpPerDayC);
  } else {
    const deficit = 1 - inp.heatShare / need;
    const dT = bio.tempC - inp.ambientC;
    bio.tempC -= (H.wallLossPerDay * dT + H.inputCoolingFactor * dil * dT) * deficit;
  }
  const fT = tempFactor(bio.tempC);
  // Hydrolyse ist weniger temperaturempfindlich, wird bei starker Versäuerung aber ebenfalls gebremst
  const acidBrake = Math.max(B.hydrolysisInhibitionFloor, inhibition(bio.fosTac));
  const fTh = (1 - B.hydrolysisTempSensitivity * (1 - fT)) * acidBrake;

  // Hydrolyse und Säurebildung
  let acidProd = 0;
  let toPost = 0;
  for (const s of SUBSTRATES) {
    bio.pools[s] += fed[s] * inp.ch4PerT[s];
    const hyd = bio.pools[s] * Math.min(1, CONFIG.substrates[s].kHyd * fTh);
    bio.pools[s] -= hyd;
    acidProd += hyd;
    const wash = bio.pools[s] * dil;
    bio.pools[s] -= wash;
    toPost += wash;
  }
  bio.acids += acidProd;

  // Anpassung an die Substratzusammensetzung
  const mix = massIn > 0 ? ch4Mix(fed, inp.ch4PerT) : { ...bio.lastMix };
  const mismatch = mixDistance(bio.adaptedMix, mix);
  bio.adaptation = 1 - B.shiftStress * mismatch;
  for (const s of SUBSTRATES) bio.adaptedMix[s] += (mix[s] - bio.adaptedMix[s]) / B.adaptationTauDays;

  // Spurenelemente
  if (massIn > 0) {
    let teIn = 0;
    for (const s of SUBSTRATES) teIn += fed[s] * CONFIG.substrates[s].traceElements;
    const target = teIn / massIn;
    bio.traceElements += (target - bio.traceElements) * Math.min(1, dil * B.traceElementsDilution);
  }
  if (inp.traceDosing) bio.traceElements = Math.max(bio.traceElements, B.traceElementsNeeded);
  bio.traceFactor = B.traceElementsFloor + (1 - B.traceElementsFloor) * Math.min(1, bio.traceElements / B.traceElementsNeeded);

  // Methanbildung
  bio.inhibition = inhibition(bio.fosTac);
  bio.tempFactor = fT;
  const cEff = bio.capacity * fT * bio.inhibition * bio.adaptation * bio.traceFactor;
  // Säureumsetzung in Teilschritten integriert (die Tagesmengen sind groß gegenüber dem Säurevorrat)
  const ka = B.acidHalfSaturationPerM3 * V;
  bio.acids -= acidProd;
  let conv = 0;
  const n = B.acidSubsteps;
  for (let i = 0; i < n; i++) {
    bio.acids += acidProd / n;
    const c = Math.min(bio.acids, ((cEff / n) * bio.acids) / (bio.acids + ka));
    bio.acids -= c;
    conv += c;
  }
  const acidWash = bio.acids * dil;
  bio.acids -= acidWash;
  toPost += acidWash;

  // Kapazität der Methanbildner passt sich langsam an
  const cMax = maxCapacity();
  bio.demandSmoothed += (acidProd - bio.demandSmoothed) * B.demandSmoothing;
  const target = Math.min(cMax, bio.demandSmoothed * B.capacityHeadroom);
  if (bio.capacity < target) {
    bio.capacity += Math.min(target - bio.capacity, bio.capacity * B.growthMaxPerDay * fT * bio.inhibition * bio.traceFactor);
  } else {
    bio.capacity -= (bio.capacity - target) * B.decayPerDay;
  }
  if (bio.fosTac > B.fosTacCritical) bio.capacity *= 1 - B.acidKillPerDay * Math.min(1, bio.fosTac - B.fosTacCritical);
  bio.capacity = Math.max(bio.capacity, cMax * B.capacityFloorShare);

  // Nachgärer
  bio.postPool += toPost;
  const fTn = tempFactor(bio.tempC - B.postDigesterTempOffsetC);
  const postDeg = bio.postPool * Math.min(1, B.postDigesterK * fTn);
  bio.postPool -= postDeg;
  const postOut = bio.postPool * Math.min(1, qVol / Vn);
  bio.postPool -= postOut;

  // Puffer
  if (massIn > 0) {
    let bufIn = 0;
    for (const s of SUBSTRATES) bufIn += fed[s] * CONFIG.substrates[s].buffer;
    const bufTarget = B.bufferBase + B.bufferFromInput * (bufIn / massIn);
    bio.buffer += (bufTarget - bio.buffer) * dil;
  }

  // Kennwerte
  bio.fosTac = Math.min(B.fosTacMax, (B.fosBase + (B.fosPerAcid * bio.acids) / V) / bio.buffer);
  bio.olr = organicLoadingRate(fed);
  bio.hrtDays = qVol > 0 ? V / qVol : Infinity;
  let shareNum = 0;
  let shareDen = 0;
  for (const s of SUBSTRATES) {
    const pot = fed[s] * inp.ch4PerT[s];
    shareNum += pot * CONFIG.substrates[s].ch4Share;
    shareDen += pot;
  }
  if (shareDen > 0) bio.ch4Share += (shareNum / shareDen - bio.ch4Share) * B.demandSmoothing;

  // Gärrestmasse: Input abzüglich der Masse des gebildeten Biogases
  const ch4 = conv + postDeg;
  const biogasT = (ch4 / bio.ch4Share) * CONFIG.units.biogasDensityTPerM3;
  const digestateT = Math.max(0, massIn - biogasT);

  bio.lastMix = mix;
  return { ch4M3: ch4, residualCh4: postOut, digestateT, mix, mismatch };
}

/** Vorlaufsimulation: bringt die Biologie in den stationären Zustand der Ausgangsfütterung. */
export function warmUpBiology(bio: BiologyState, fed: SubstrateMap, ambientC: number, traceElements: number): void {
  const ch4PerT = zeroMap();
  for (const s of SUBSTRATES) ch4PerT[s] = CONFIG.substrates[s].ch4PerT;
  bio.adaptedMix = ch4Mix(fed, ch4PerT);
  bio.lastMix = { ...bio.adaptedMix };
  bio.traceElements = traceElements;
  for (let i = 0; i < CONFIG.time.biologyWarmupDays; i++) {
    bioCore(bio, { fed, ch4PerT, heatShare: 1, ambientC, traceDosing: false });
    bio.traceElements = traceElements;
    // In der ersten Phase wird die Kapazität im Gleichgewicht gehalten (eingefahrene Anlage)
    if (i < CONFIG.time.biologyWarmupDays * B.warmupPinnedShare) {
      bio.capacity = Math.max(bio.capacity, Math.min(maxCapacity(), bio.demandSmoothed * B.capacityHeadroom));
      bio.acids = 0;
      bio.fosTac = B.fosBase / bio.buffer;
    }
  }
  bio.olrHistory = [];
}

/**
 * Ein Biologie-Tag im Spiel: Kern plus Ursachenregister und Ereignisse.
 * `changeCause` ist das Ereignis, das eine heutige Änderung der Fütterung
 * verursacht hat (Spielerentscheidung, leeres Silo, neue Reststoffpartie).
 */
export function biologyDay(state: GameState, inp: BioInput, changeCause: string | undefined, residueEvent: string | undefined): BioOutput {
  const bio = state.bio;
  const log = state.log;
  const day = state.day;
  const prevMix = { ...bio.lastMix };
  const out = bioCore(bio, inp);

  decayCauses(bio.stressCauses, B.causeHalfLifeDays);

  // Abrupter Substratwechsel
  const shift = sumMap(inp.fed) > 0 ? mixDistance(prevMix, out.mix) : 0;
  if (shift >= B.shiftEventThreshold) {
    const ev = logEvent(log, day, {
      type: 'substrate_shift',
      severity: 'info',
      causes: [changeCause ?? state.feedTargetEvent ?? state.origin.feeding],
      data: { shift: round(shift, 2), maisShare: round(out.mix.mais, 2), guelleShare: round(out.mix.guelle, 2), reststoffShare: round(out.mix.reststoff, 2) },
    });
    bio.lastShiftEvent = ev.id;
  }
  if (out.mismatch > B.shiftEventThreshold / 2) addCause(bio.stressCauses, bio.lastShiftEvent ?? changeCause, (1 - bio.adaptation) * B.causeWeights.shift);

  // Belastungssprung
  bio.olrHistory.push(bio.olr);
  if (bio.olrHistory.length > B.loadJumpWindowDays) bio.olrHistory.shift();
  const minOlr = Math.min(...bio.olrHistory);
  if (bio.olr - minOlr >= B.loadJumpThreshold && !(bio.lastLoadJumpDay !== undefined && day - bio.lastLoadJumpDay < B.loadJumpWindowDays)) {
    const ev = logEvent(log, day, {
      type: 'load_jump',
      severity: 'info',
      causes: [changeCause ?? state.feedTargetEvent ?? state.origin.feeding],
      data: { from: round(minOlr, 2), to: round(bio.olr, 2) },
    });
    bio.lastLoadJumpDay = day;
    bio.lastLoadJumpEvent = ev.id;
    addCause(bio.stressCauses, ev.id, (bio.olr - minOlr));
  }
  // Dauerhafte Überlast
  if (bio.olr > B.olrStable) addCause(bio.stressCauses, bio.lastLoadJumpEvent && day - (bio.lastLoadJumpDay ?? 0) < B.causeHalfLifeDays * 2 ? bio.lastLoadJumpEvent : state.feedTargetEvent ?? state.origin.feeding, (bio.olr - B.olrStable) * B.causeWeights.overload);

  // Spurenelementmangel
  if (bio.traceFactor < B.traceDeficitEventFactor && !bio.traceEvent) {
    const ev = logEvent(log, day, {
      type: 'trace_deficit',
      severity: 'warning',
      causes: [state.lowBufferEvent ?? state.origin.feeding],
      data: { traceIndex: round(bio.traceElements, 2) },
    });
    bio.traceEvent = ev.id;
  } else if (bio.traceFactor >= 1 && bio.traceEvent) {
    bio.traceEvent = undefined;
  }
  if (bio.traceEvent) addCause(bio.stressCauses, bio.traceEvent, (1 - bio.traceFactor) * B.causeWeights.trace);

  // Wenig Puffer (kaum Gülle): Säuren schlagen stärker auf den FOS/TAC durch
  if (bio.buffer < B.bufferReference) addCause(bio.stressCauses, state.lowBufferEvent ?? state.origin.feeding, (B.bufferReference - bio.buffer) * B.causeWeights.buffer);

  // Auskühlen
  if (bio.tempC < B.coldEventC && !bio.coldEvent) {
    const ev = logEvent(log, day, {
      type: 'fermenter_cold',
      severity: 'warning',
      // Ohne BHKW fehlt die Abwärme; läuft es, reicht die Gasmenge nicht zum Heizen
      causes: [state.chp.downEvent ?? state.feedTargetEvent ?? state.origin.feeding],
      data: { tempC: round(bio.tempC, 1) },
    });
    bio.coldEvent = ev.id;
  } else if (bio.tempC >= B.optimumC[0] && bio.coldEvent) {
    bio.coldEvent = undefined;
  }
  if (bio.coldEvent) addCause(bio.stressCauses, bio.coldEvent, (1 - bio.tempFactor) * B.causeWeights.cold);

  // Reststoffe bauen schnell ab und belasten
  if (residueEvent && inp.fed.reststoff > 0) addCause(bio.stressCauses, residueEvent, out.mix.reststoff * B.causeWeights.residue);

  // FOS/TAC-Stufen
  const level: 0 | 1 | 2 = bio.fosTac >= B.fosTacCritical ? 2 : bio.fosTac >= B.fosTacWarning ? 1 : 0;
  if (level > bio.fosLevel) {
    const ev = logEvent(log, day, {
      type: level === 2 ? 'fos_tac_critical' : 'fos_tac_warning',
      severity: level === 2 ? 'critical' : 'warning',
      causes: level === 2 && bio.fosLevelEvent ? [bio.fosLevelEvent, ...topCauses(bio.stressCauses)] : topCauses(bio.stressCauses),
      data: { fosTac: round(bio.fosTac, 2), olr: round(bio.olr, 2), tempC: round(bio.tempC, 1) },
    });
    bio.fosLevel = level;
    bio.fosLevelEvent = ev.id;
  } else if (level === 0 && bio.fosLevel > 0 && bio.fosTac < B.fosTacNormal) {
    logEvent(log, day, { type: 'fos_tac_normal', causes: [bio.fosLevelEvent], data: { fosTac: round(bio.fosTac, 2) } });
    bio.fosLevel = 0;
    bio.fosLevelEvent = undefined;
  }
  if (bio.fosTac >= B.fosTacWarning) state.totals.bioErrorDays++;

  // Umkippen und Erholung
  bio.daysAboveTip = bio.fosTac >= B.fosTacTipped ? bio.daysAboveTip + 1 : 0;
  if (!bio.tipped && bio.daysAboveTip >= B.tipDays) {
    const ev = logEvent(log, day, {
      type: 'fermenter_tipped',
      severity: 'critical',
      causes: [bio.fosLevelEvent, ...topCauses(bio.stressCauses)],
      data: { fosTac: round(bio.fosTac, 2), gasShare: round(out.ch4M3 / Math.max(1, bio.demandSmoothed), 2) },
    });
    bio.tipped = true;
    bio.tippedDay = day;
    bio.tippedEvent = ev.id;
    bio.daysBelowWarning = 0;
  }
  if (bio.tipped) {
    bio.daysBelowWarning = bio.fosTac < B.fosTacWarning ? bio.daysBelowWarning + 1 : 0;
    if (bio.daysBelowWarning >= B.recoveryDays) {
      logEvent(log, day, { type: 'fermenter_recovered', causes: [bio.tippedEvent], data: { days: day - (bio.tippedDay ?? day) } });
      bio.tipped = false;
      bio.tippedDay = null;
      bio.tippedEvent = undefined;
    }
  }
  return out;
}

export function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export type { SubstrateId };
