import { CONFIG } from './config';
import { dayOfDate, inWindow, windowDays } from './calendar';
import { logEvent } from './eventlog';
import { round } from './biology';
import { chance, intRange, lognormalMean1, range } from './rng';
import { say } from './messages';
import { difficulty, hasFeature } from './difficulty';
import { hasStaff, ledger, type SiloDelivery } from './storage';
import type { GameState } from './types';

/**
 * Substratbeschaffung über Verträge und Märkte:
 * Mais- und Grünroggen-Lieferverträge, Nachkauf am Markt, Gülle, Reststoffe.
 */

const K = CONFIG.contracts;
const R = CONFIG.residues;

export function supplyOffer(offerId: string) {
  return [...K.maizeOffers, ...K.ryeOffers].find((o) => o.id === offerId);
}

export function isMaizeOffer(offerId: string): boolean {
  return K.maizeOffers.some((o) => o.id === offerId);
}

/** Ist ein Angebot heute abschließbar? */
export function offerOpen(state: GameState, offerId: string): boolean {
  if (isMaizeOffer(offerId)) return state.day <= dayOfDate(K.maizeOfferDeadline);
  return inWindow(state.day, K.ryeOfferWindow);
}

/** Preis inklusive Nachlass durch die Agrarberaterin. */
export function offerPrice(state: GameState, base: number): number {
  return hasStaff(state, 'agrar') ? base * (1 - K.advisorPriceDiscount) : base;
}

/** Aktueller Nachkaufpreis für Mais, €/t. */
export function spotPrice(state: GameState): number {
  let p: number = K.spot.basePriceEurPerT;
  if (!inWindow(state.day, CONFIG.fields.windows.maisHarvest)) p *= K.spot.offSeasonFactor;
  if (state.weather.drought) p *= K.spot.droughtFactor;
  return p;
}

export interface SupplyDayResult { deliveries: SiloDelivery[]; trafficTrips: number; trafficSource?: string }

export function supplyDay(state: GameState): SupplyDayResult {
  const day = state.day;
  const weather = state.weather.days[day];
  const res: SupplyDayResult = { deliveries: [], trafficTrips: 0 };

  // Lieferverträge
  for (const c of state.contracts) {
    if (c.delivered >= c.tonnes || day < c.startDay || weather.wet) continue;
    const t = Math.min(c.deliveryTPerDay, c.tonnes - c.delivered);
    c.delivered += t;
    res.deliveries.push({ kind: c.kind, t, quality: hasStaff(state, 'agrar') ? K.advisorContractQuality : CONFIG.fields.contractQuality, source: c.eventId, throughVillage: c.throughVillage, distanceKm: c.distanceKm, origin: c.offerId });
    const cost = t * (c.priceEurPerT + K.silageTransportEurPerTKm * c.distanceKm + K.silageHandlingEurPerT);
    state.finance.balance -= cost;
    ledger(state, 'substrat', t * c.priceEurPerT);
    ledger(state, 'transport', t * (K.silageTransportEurPerTKm * c.distanceKm + K.silageHandlingEurPerT));
    state.harvestTotals[c.kind].contract += t;
    if (c.throughVillage) {
      res.trafficTrips += Math.ceil(t / CONFIG.fields.trailerT) * 2;
      res.trafficSource = c.eventId;
    }
  }

  // Nachkauf
  for (const o of state.spotOrders) {
    if (o.arrivalDay !== day) continue;
    res.deliveries.push({ kind: 'mais', t: o.tonnes, quality: CONFIG.fields.spotQuality, source: o.eventId, throughVillage: true, distanceKm: K.spot.distanceKm, origin: 'spot' });
    state.harvestTotals.mais.spot += o.tonnes;
    res.trafficTrips += Math.ceil(o.tonnes / CONFIG.fields.trailerT) * 2;
    res.trafficSource = res.trafficSource ?? o.eventId;
  }
  state.spotOrders = state.spotOrders.filter((o) => o.arrivalDay > day);

  // Abschluss der Maisverträge
  if (day === dayOfDate(K.maizeOfferDeadline)) {
    const contracted = state.contracts.filter((c) => c.kind === 'mais').reduce((a, c) => a + c.tonnes, 0);
    const ev = logEvent(state.log, day, {
      type: 'maize_contracts_closed',
      playerDecision: true,
      causes: [],
      data: { contractedT: Math.round(contracted), offeredT: K.maizeOffers.reduce((a, o) => a + o.maxT, 0) },
    });
    state.supplyEvents.maizeContracts = ev.id;
  }
  if (day === windowDays(K.ryeOfferWindow).end) {
    const contracted = state.contracts.filter((c) => c.kind === 'gruenroggen').reduce((a, c) => a + c.tonnes, 0);
    const ev = logEvent(state.log, day, {
      type: 'rye_contracts_closed',
      playerDecision: true,
      causes: [],
      data: { contractedT: Math.round(contracted) },
    });
    state.supplyEvents.ryeContracts = ev.id;
  }

  // Ernte-Zusammenfassungen (Grundlage späterer Engpässe)
  const maizeEnd = windowDays(CONFIG.fields.windows.maisHarvest).end;
  if (day === maizeEnd + 1) {
    const h = state.harvestTotals.mais;
    const total = h.own + h.contract + h.spot;
    const droughtFirst = state.weather.drought;
    const ev = logEvent(state.log, day, {
      type: 'maize_harvest_summary',
      causes: droughtFirst
        ? [state.origin.drought, state.supplyEvents.maizeContracts, state.silo.overflowEvent]
        : [state.supplyEvents.maizeContracts, state.silo.overflowEvent, state.origin.drought],
      data: { totalT: Math.round(total), ownT: Math.round(h.own), contractT: Math.round(h.contract), spotT: Math.round(h.spot), siloT: Math.round(state.silo.mais.t), quality: round(state.silo.mais.quality, 2) },
    });
    state.silo.harvestSummaryEvent = ev.id;
    // Verluste durch schlechte Verdichtung werden sichtbar
    if (state.silo.mais.quality < CONFIG.silo.poorQualityEventThreshold) {
      const ev2 = logEvent(state.log, day, {
        type: 'silage_quality_poor',
        severity: 'warning',
        causes: [state.silo.poorCompactionEvent],
        data: { quality: round(state.silo.mais.quality, 2) },
      });
      state.silo.qualityEvent = ev2.id;
    }
    state.silo.poorCompactionEvent = undefined;
    state.silo.overflowEvent = undefined;
  }
  const ryeEnd = windowDays(CONFIG.fields.windows.roggenHarvest).end;
  if (day === ryeEnd + 1) {
    const h = state.harvestTotals.gruenroggen;
    const ev = logEvent(state.log, day, {
      type: 'rye_harvest_summary',
      causes: [state.supplyEvents.ryeContracts, state.origin.drought],
      data: { totalT: Math.round(h.own + h.contract), ownT: Math.round(h.own), contractT: Math.round(h.contract), siloT: Math.round(state.silo.gruenroggen.t) },
    });
    state.silo.ryeSummaryEvent = ev.id;
    state.silo.poorCompactionEvent = undefined;
  }

  // Reststoffmarkt
  state.residueOffers = state.residueOffers.filter((o) => o.expiresDay >= day);
  if (day >= state.nextOfferDay && hasFeature(state, 'reststoffe')) {
    const r = state.rng.market;
    const priceEurPerT = Math.round(range(r, R.priceEurPerT[0], R.priceEurPerT[1]));
    state.residueOffers.push({
      id: `r${day}`,
      tonnes: Math.round(range(r, R.lotT[0], R.lotT[1])),
      priceEurPerT,
      quality: lognormalMean1(r, R.qualitySigma * difficulty(state).residueSigmaFactor),
      contaminated: chance(r, R.contaminantChance * difficulty(state).contaminantFactor),
      expiresDay: day + R.offerValidDays,
    });
    state.nextOfferDay = day + intRange(r, Math.ceil(R.offerIntervalDays * R.offerIntervalSpread[0]), Math.ceil(R.offerIntervalDays * R.offerIntervalSpread[1]));
  }
  // Reststoffe kommen an
  for (const lot of state.residueTank) {
    if (lot.arrivalDay === day) {
      res.trafficTrips += Math.ceil(lot.tonnes / K.guelleTruckT) * 2;
      res.trafficSource = res.trafficSource ?? lot.eventId;
      state.residueDeliveredToday = lot.eventId;
    }
  }

  // Strommarktpreis
  const F = CONFIG.finance;
  const doyAngle = (2 * Math.PI * (state.day % CONFIG.units.daysPerYear)) / CONFIG.units.daysPerYear;
  const seasonal = F.marketEurPerKwh + F.marketSeasonalAmplitude * Math.cos(doyAngle);
  state.finance.marketPrice += (seasonal - state.finance.marketPrice) * F.marketReversion + F.marketNoise * (range(state.rng.market, -1, 1));
  return res;
}

/** Verfügbare Gülle heute, nach Entfernung sortiert. */
export function guelleAvailability(state: GameState): { supplierId: string; tPerDay: number; distanceKm: number; throughVillage: boolean; eventId: string }[] {
  return state.guelleContracts
    .filter((c) => c.activeFromDay <= state.day)
    .map((c) => {
      const s = K.guelleSuppliers.find((x) => x.id === c.supplierId)!;
      return { supplierId: s.id, tPerDay: s.maxTPerDay * state.scenarioFactors.guelleSupply, distanceKm: s.distanceKm, throughVillage: s.throughVillage, eventId: c.eventId };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Holt die gewünschte Gülle bei den nächstgelegenen Lieferanten ab. */
export function takeGuelle(state: GameState, wantT: number): { t: number; trafficTrips: number; trafficSource?: string } {
  let left = wantT;
  let trips = 0;
  let source: string | undefined;
  for (const s of guelleAvailability(state)) {
    if (left <= 0) break;
    const t = Math.min(left, s.tPerDay);
    left -= t;
    const cost = t * (K.guelleTransportEurPerTKm * s.distanceKm * state.scenarioFactors.guelleDistance + K.guelleHandlingEurPerT);
    state.finance.balance -= cost;
    ledger(state, 'transport', cost);
    if (s.throughVillage) {
      trips += Math.ceil(t / K.guelleTruckT) * 2;
      source = source ?? s.eventId;
    }
    if (t > 0) state.today.guelle.push({ origin: s.supplierId, t, distanceKm: s.distanceKm, throughVillage: s.throughVillage });
  }
  return { t: wantT - left, trafficTrips: trips, trafficSource: source };
}

export function notifySupplyOffers(state: GameState): void {
  if (state.day === 0) say(state, 'landwirt', 'mais_angebot', {});
  if (state.day === windowDays(K.ryeOfferWindow).start) say(state, 'landwirt', 'roggen_angebot', {});
  if (state.day === dayOfDate(CONFIG.messages.stubbleDigestate)) say(state, 'landwirt', 'gaerrest_stoppel', {});
  if (state.day === dayOfDate(CONFIG.digestate.blackout.to) + 1) say(state, 'landwirt', 'gaerrest_fruehjahr', {});
}
