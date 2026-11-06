import { CONFIG, SUBSTRATES } from './config';
import { windowDays } from './calendar';
import { logEvent } from './eventlog';
import { round, sumMap } from './biology';
import { intRange } from './rng';
import { fieldConfig } from './fields';
import { offerOpen, offerPrice, spotPrice, supplyOffer, isMaizeOffer } from './contracts';
import { performService } from './tech';
import { ledger } from './storage';
import type { Action, GameState } from './types';
import { buildAvailable, hasFeature, roleAvailable } from './difficulty';
import { cfg, hasChp } from './plant';
import { maintenanceContractFee } from './finance';

/** Ist die Entscheidung im Schwierigkeitsgrad des Durchlaufs vorgesehen? */
export function actionAvailable(state: GameState, a: Action): boolean {
  switch (a.type) {
    case 'buyResidue': return hasFeature(state, 'reststoffe');
    case 'leaseField': return hasFeature(state, 'felder');
    case 'setCrop': return hasFeature(state, 'felder') && (a.crop !== 'zweikultur' || hasFeature(state, 'felder_experten'));
    case 'setHarvestDay': return hasFeature(state, 'felder_experten');
    case 'orderService':
      if (a.kind === 'aufbereitung') return !!state.upgrading;
      if (a.kind === 'klein' || a.kind === 'gross') { if (!hasChp(state)) return false; }
      return a.kind === 'klein' || (a.kind === 'gross' ? hasFeature(state, 'instandsetzung') : hasFeature(state, 'entschwefelung'));
    case 'hire': return roleAvailable(state, a.role);
    case 'build': return buildAvailable(state, a.kind);
    default: return true;
  }
}

/**
 * Spielerentscheidungen. Jede gültige Entscheidung wird als Ereignis mit
 * playerDecision = true protokolliert und kann so Ursache späterer Folgen sein.
 * Ungültige Entscheidungen werden abgelehnt (Rückgabe mit Grund), ohne Ereignis.
 */
export type ActionResult = { ok: true; eventId: string } | { ok: false; reason: string };

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.failure || state.finished) return { ok: false, reason: 'beendet' };
  const res = apply(state, action);
  if (res.ok) state.actionLog.push({ day: state.day, action });
  return res;
}

function decision(state: GameState, type: string, data: Record<string, number | string>, causes: (string | undefined)[] = []): string {
  return logEvent(state.log, state.day, { type, playerDecision: true, causes, data }).id;
}

function massShare(feed: Record<string, number>, key: string): number {
  const total = Object.values(feed).reduce((a, b) => a + b, 0);
  return total > 0 ? feed[key] / total : 0;
}

function apply(state: GameState, a: Action): ActionResult {
  const day = state.day;
  if (!actionAvailable(state, a)) return { ok: false, reason: 'stufe' };
  switch (a.type) {
    case 'setFeeding': {
      const next = { ...state.feedTarget };
      for (const s of SUBSTRATES) {
        const v = a.feed[s];
        if (v !== undefined) next[s] = Math.max(0, Math.min(cfg(state).feeding.maxPerSubstrate[s], v));
      }
      const prev = state.feedTarget;
      const id = decision(state, 'feeding_changed', {
        mais: round(next.mais, 1), gruenroggen: round(next.gruenroggen, 1), guelle: round(next.guelle, 1), reststoff: round(next.reststoff, 1),
        prevTotal: round(sumMap(prev), 1), total: round(sumMap(next), 1),
      });
      if (massShare(prev, 'guelle') - massShare(next, 'guelle') >= cfg(state).feeding.lowBufferShareDrop) state.lowBufferEvent = id;
      if (massShare(next, 'mais') > CONFIG.maizeCap.maxShare && massShare(prev, 'mais') <= CONFIG.maizeCap.maxShare) state.highMaizeEvent = id;
      else if (massShare(next, 'mais') > CONFIG.maizeCap.maxShare && !state.highMaizeEvent) state.highMaizeEvent = id;
      state.feedTarget = next;
      state.feedTargetEvent = id;
      state.feedChangedDay = day;
      return { ok: true, eventId: id };
    }
    case 'signSupply': {
      const offer = supplyOffer(state, a.offerId);
      if (!offer) return { ok: false, reason: 'unbekannt' };
      if (!offerOpen(state, a.offerId)) return { ok: false, reason: 'abgelaufen' };
      if (state.contracts.some((c) => c.offerId === a.offerId)) return { ok: false, reason: 'bereits' };
      const tonnes = Math.max(0, Math.min(offer.maxT, Math.round(a.tonnes)));
      if (tonnes <= 0) return { ok: false, reason: 'menge' };
      const kind = isMaizeOffer(state, a.offerId) ? 'mais' : 'gruenroggen';
      const win = kind === 'mais' ? CONFIG.fields.windows.maisHarvest : CONFIG.fields.windows.roggenHarvest;
      const { start } = windowDays(win);
      const price = offerPrice(state, offer.priceEurPerT);
      const id = decision(state, 'supply_signed', { offer: offer.id, kind, tonnes, price: round(price, 2), distanceKm: offer.distanceKm });
      state.contracts.push({
        offerId: offer.id,
        kind,
        tonnes,
        delivered: 0,
        priceEurPerT: price,
        distanceKm: offer.distanceKm,
        throughVillage: offer.throughVillage,
        deliveryTPerDay: offer.deliveryTPerDay,
        startDay: start + intRange(state.rng.market, cfg(state).contracts.deliveryStartOffsetDays[0], cfg(state).contracts.deliveryStartOffsetDays[1]),
        eventId: id,
      });
      if (offer.distanceKm <= cfg(state).acceptance.localContractKm) state.acceptance.value += cfg(state).acceptance.localContractBonus;
      return { ok: true, eventId: id };
    }
    case 'buySpot': {
      const tonnes = Math.max(0, Math.min(cfg(state).contracts.spot.maxTPerOrder, Math.round(a.tonnes)));
      if (tonnes <= 0) return { ok: false, reason: 'menge' };
      const price = spotPrice(state);
      const transport = cfg(state).contracts.silageTransportEurPerTKm * cfg(state).contracts.spot.distanceKm + cfg(state).contracts.silageHandlingEurPerT;
      const id = decision(state, 'spot_bought', { tonnes, price: round(price, 2) }, [state.origin.drought]);
      state.spotOrders.push({ tonnes, arrivalDay: day + cfg(state).contracts.spot.deliveryDays, eventId: id, priceEurPerT: price });
      state.finance.balance -= tonnes * (price + transport);
      ledger(state, 'substrat', tonnes * price);
      ledger(state, 'transport', tonnes * transport);
      const extra = tonnes * Math.max(0, price - cfg(state).contracts.spot.basePriceEurPerT);
      if (extra > 0) state.finance.lossCauses[id] = (state.finance.lossCauses[id] ?? 0) + extra;
      return { ok: true, eventId: id };
    }
    case 'signGuelle': {
      const s = cfg(state).contracts.guelleSuppliers.find((x) => x.id === a.supplierId);
      if (!s) return { ok: false, reason: 'unbekannt' };
      if (state.guelleContracts.some((c) => c.supplierId === a.supplierId)) return { ok: false, reason: 'bereits' };
      const id = decision(state, 'guelle_signed', { supplier: s.id, tPerDay: s.maxTPerDay, distanceKm: s.distanceKm });
      state.guelleContracts.push({ supplierId: s.id, activeFromDay: day + cfg(state).contracts.guelleActivationDays, eventId: id });
      if (s.distanceKm <= cfg(state).acceptance.localContractKm) state.acceptance.value += cfg(state).acceptance.localContractBonus;
      return { ok: true, eventId: id };
    }
    case 'cancelGuelle': {
      if (!state.guelleContracts.some((c) => c.supplierId === a.supplierId)) return { ok: false, reason: 'unbekannt' };
      const id = decision(state, 'guelle_cancelled', { supplier: a.supplierId });
      state.guelleContracts = state.guelleContracts.filter((c) => c.supplierId !== a.supplierId);
      return { ok: true, eventId: id };
    }
    case 'buyResidue': {
      const offer = state.residueOffers.find((o) => o.id === a.offerId);
      if (!offer) return { ok: false, reason: 'abgelaufen' };
      const inTank = state.residueTank.reduce((acc, l) => acc + l.tonnes, 0);
      if (inTank + offer.tonnes > cfg(state).plant.residueTankT) return { ok: false, reason: 'voll' };
      const id = decision(state, 'residue_bought', { tonnes: offer.tonnes, price: offer.priceEurPerT });
      const transport = offer.tonnes * cfg(state).residues.transportEurPerTKm * cfg(state).residues.distanceKm;
      state.finance.balance -= offer.tonnes * offer.priceEurPerT + transport;
      ledger(state, 'substrat', offer.tonnes * offer.priceEurPerT);
      ledger(state, 'transport', transport);
      state.residueTank.push({ id: offer.id, tonnes: offer.tonnes, quality: offer.quality, contaminated: offer.contaminated, arrivalDay: day + cfg(state).residues.deliveryDays, eventId: id, started: false });
      state.residueOffers = state.residueOffers.filter((o) => o.id !== offer.id);
      return { ok: true, eventId: id };
    }
    case 'leaseField': {
      const f = state.fields.find((x) => x.id === a.fieldId);
      if (!f || f.status !== 'frei') return { ok: false, reason: 'nicht_frei' };
      const spec = fieldConfig(f.id);
      const cost = spec.ha * CONFIG.fields.leaseEurPerHa;
      const id = decision(state, 'field_leased', { field: f.id, ha: spec.ha, costEur: cost });
      state.finance.balance -= cost;
      ledger(state, 'pacht', cost);
      f.status = 'gefuehrt';
      f.crop = 'brache';
      f.standing = 'leer';
      f.decisionEvent = id;
      return { ok: true, eventId: id };
    }
    case 'setCrop': {
      const f = state.fields.find((x) => x.id === a.fieldId);
      if (!f || f.status !== 'gefuehrt') return { ok: false, reason: 'nicht_gefuehrt' };
      const id = decision(state, 'crop_set', { field: f.id, crop: a.crop });
      f.crop = a.crop;
      f.decisionEvent = id;
      return { ok: true, eventId: id };
    }
    case 'setHarvestDay': {
      const f = state.fields.find((x) => x.id === a.fieldId);
      if (!f || f.status !== 'gefuehrt' || f.standing === 'leer' || f.standing === 'zweitmais') return { ok: false, reason: 'keine_ernte' };
      if (a.day < day) return { ok: false, reason: 'vergangen' };
      const id = decision(state, 'harvest_day_set', { field: f.id, day: a.day });
      f.harvestDay = a.day;
      f.decisionEvent = id;
      return { ok: true, eventId: id };
    }
    case 'orderService': {
      if ((a.kind === 'klein' || a.kind === 'gross') && state.chp.status === 'ersatz') return { ok: false, reason: 'ersatz' };
      const id = decision(state, 'service_ordered', { kind: a.kind });
      performService(state, a.kind, id);
      return { ok: true, eventId: id };
    }
    case 'hire': {
      if (state.staff.some((s) => s.role === a.role)) return { ok: false, reason: 'bereits' };
      const id = decision(state, 'staff_hired', { role: a.role, salary: CONFIG.staff.roles[a.role].salaryEurPerMonth });
      state.staff.push({ role: a.role, hiredDay: day, eventId: id });
      return { ok: true, eventId: id };
    }
    case 'fire': {
      const s = state.staff.find((x) => x.role === a.role);
      if (!s) return { ok: false, reason: 'unbekannt' };
      const sev = CONFIG.staff.roles[a.role].salaryEurPerMonth * CONFIG.staff.severanceMonths;
      const id = decision(state, 'staff_fired', { role: a.role, costEur: sev }, [s.eventId]);
      state.finance.balance -= sev;
      ledger(state, 'personal', sev);
      state.staff = state.staff.filter((x) => x.role !== a.role);
      return { ok: true, eventId: id };
    }
    case 'orderSpreading': {
      const m3 = Math.max(0, Math.round(a.m3));
      if (m3 <= 0) return { ok: false, reason: 'menge' };
      const id = decision(state, 'spreading_ordered', { m3 });
      state.digestate.spreadOrderM3 += m3;
      state.digestate.spreadOrderEvent = id;
      return { ok: true, eventId: id };
    }
    case 'build': {
      if (state.built[a.kind] || state.builds.some((b) => b.kind === a.kind)) return { ok: false, reason: 'bereits' };
      const spec = cfg(state).builds[a.kind];
      let cost: number = spec.costEur;
      if (a.kind === 'cover' && state.unlocks.includes('abdeckung_guenstig')) cost = cfg(state).builds.cover.costEurUnlocked;
      const id = decision(state, 'build_ordered', { kind: a.kind, costEur: cost, days: spec.days });
      const down = cost * cfg(state).builds.downPaymentShare;
      state.finance.balance -= down;
      ledger(state, 'ausbau', down);
      state.finance.lossCauses[id] = (state.finance.lossCauses[id] ?? 0) + cost;
      state.builds.push({ kind: a.kind, doneDay: day + spec.days, eventId: id, costEur: cost });
      return { ok: true, eventId: id };
    }
    case 'citizenDialog': {
      if (!state.unlocks.includes('buergerdialog')) return { ok: false, reason: 'gesperrt' };
      if (day - state.acceptance.lastDialogDay < cfg(state).acceptance.dialogCooldownDays) return { ok: false, reason: 'zu_frueh' };
      const id = decision(state, 'citizen_dialog', { costEur: cfg(state).acceptance.dialogCostEur });
      state.finance.balance -= cfg(state).acceptance.dialogCostEur;
      ledger(state, 'betrieb', cfg(state).acceptance.dialogCostEur);
      state.acceptance.lastDialogDay = day;
      state.acceptance.value = Math.min(100, state.acceptance.value + cfg(state).acceptance.dialogImmediate);
      state.acceptance.baselineBonus = cfg(state).acceptance.dialogBaselineBonus;
      return { ok: true, eventId: id };
    }
    case 'signOfftake': {
      if (!state.unlocks.includes('abnahmevertraege')) return { ok: false, reason: 'gesperrt' };
      if (state.digestate.offtake) return { ok: false, reason: 'bereits' };
      const id = decision(state, 'offtake_signed', { m3PerDay: cfg(state).digestate.offtake.m3PerDay });
      state.digestate.offtake = true;
      state.digestate.offtakeEvent = id;
      return { ok: true, eventId: id };
    }
    case 'signMaintenanceContract': {
      if (!state.unlocks.includes('wartungsvertrag')) return { ok: false, reason: 'gesperrt' };
      if (state.maintenanceContract) return { ok: false, reason: 'bereits' };
      state.maintenanceContract = decision(state, 'maintenance_contract', { eurPerMonth: maintenanceContractFee(state) });
      return { ok: true, eventId: state.maintenanceContract };
    }
  }
}
