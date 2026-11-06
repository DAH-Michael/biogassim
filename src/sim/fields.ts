import { CONFIG } from './config';
import { dayOfDate, inWindow, windowDays } from './calendar';
import { logEvent } from './eventlog';
import { round } from './biology';
import { gaussian } from './rng';
import { say } from './messages';
import { hasFeature } from './difficulty';
import { hasStaff, ledger, type SiloDelivery } from './storage';
import type { FieldState, GameState } from './types';

/**
 * Eigene Felder: strategisch, nicht operativ. Der Spieler wählt Kultur und
 * Erntezeitpunkt, Säen und Ernten laufen automatisch.
 */

const F = CONFIG.fields;
const W = F.windows;

export function fieldConfig(id: string) {
  const cfg = F.list.find((f) => f.id === id);
  if (!cfg) throw new Error(`Unbekanntes Feld ${id}`);
  return cfg;
}

/** Erntefenster als Spieltage für die aktuell stehende Kultur. */
export function harvestWindowFor(field: FieldState): { start: number; end: number } | null {
  const win = field.standing === 'mais' ? windowDays(W.maisHarvest) : field.standing === 'gruenroggen' ? windowDays(W.roggenHarvest) : null;
  // Im Durchlauf gesäte Kulturen, deren Erntefenster vor der Saat liegt, reifen erst nach dem Durchlauf
  if (!win || (field.sownDay !== null && field.sownDay >= win.start)) return null;
  return win;
}

export function defaultHarvestDay(state: GameState, field: FieldState): number | null {
  const win = harvestWindowFor(field);
  if (!win) return null;
  if (hasStaff(state, 'agrar')) return field.standing === 'mais' ? state.harvestOptimum.mais : state.harvestOptimum.gruenroggen;
  return win.start + F.defaultHarvestOffsetDays;
}

export interface FieldDayResult { deliveries: SiloDelivery[]; trafficTrips: number; trafficSource?: string }

export function fieldsDay(state: GameState): FieldDayResult {
  const day = state.day;
  const weather = state.weather.days[day];
  const result: FieldDayResult = { deliveries: [], trafficTrips: 0 };
  for (const field of state.fields) {
    const cfg = fieldConfig(field.id);

    // Vorpächter gibt die Fläche nach seiner Ernte frei
    if (field.status === 'verpachtet' && day === dayOfDate(F.leaseAvailableFrom)) {
      field.status = 'frei';
      field.standing = 'leer';
      field.growth = 0;
      if (hasFeature(state, 'felder')) say(state, 'landwirt', 'feld_frei', { feld: cfg.name, ha: cfg.ha });
    }
    if (field.status !== 'gefuehrt') continue;

    // Säen
    if (field.standing === 'leer' && !weather.wet && !weather.frost) {
      const sowRye = (field.crop === 'gruenroggen' || field.crop === 'zweikultur') && inWindow(day, W.roggenSow) && !field.ryeDone;
      const sowMaize = field.crop === 'mais' && inWindow(day, W.maisSow);
      const sowSecond = field.crop === 'zweikultur' && field.ryeDone && day <= dayOfDate(W.zweitmaisSowBy) && day > dayOfDate(W.roggenHarvest.from);
      if (sowRye || sowMaize || sowSecond) {
        field.standing = sowRye ? 'gruenroggen' : sowMaize ? 'mais' : 'zweitmais';
        field.sownDay = day;
        field.growth = 0;
        field.harvestedHa = 0;
        state.today.sowing.push(field.id);
        const cost = cfg.ha * (sowRye ? F.cultivationEurPerHa.gruenroggen : F.cultivationEurPerHa.mais);
        state.finance.balance -= cost;
        ledger(state, 'anbau', cost);
        logEvent(state.log, day, {
          type: 'field_sown',
          causes: [field.decisionEvent],
          data: { field: field.id, crop: field.standing, ha: cfg.ha, costEur: Math.round(cost) },
        });
      }
    }

    // Wachstum (für die Darstellung)
    if (field.standing !== 'leer' && field.sownDay !== null) {
      const win = harvestWindowFor(field);
      const target = win ? win.start + F.defaultHarvestOffsetDays : field.sownDay + F.displayGrowthDays;
      const span = Math.max(1, target - field.sownDay);
      field.growth = Math.min(1, (day - field.sownDay) / span);
    }

    // Ernte
    const win = harvestWindowFor(field);
    if (!win || day < win.start) continue;
    const planned = field.harvestDay ?? defaultHarvestDay(state, field)!;
    const lastDay = Math.min(win.end, CONFIG.time.runDays - 1);
    const mustFinish = day >= lastDay;
    if (day < planned && !mustFinish) continue;
    if (weather.wet && !mustFinish) continue;
    const remaining = cfg.ha - field.harvestedHa;
    if (remaining <= 0) continue;
    const ha = mustFinish ? remaining : Math.min(remaining, F.harvestHaPerDay);
    const kind = field.standing === 'gruenroggen' ? 'gruenroggen' : 'mais';
    const optimum = kind === 'mais' ? state.harvestOptimum.mais : state.harvestOptimum.gruenroggen;
    const offset = day - optimum;
    let yieldPerHa: number = kind === 'gruenroggen' ? F.yieldTPerHa.gruenroggen : field.standing === 'zweitmais' ? F.yieldTPerHa.maisNachRoggen : F.yieldTPerHa.mais;
    if (state.weather.drought) yieldPerHa *= CONFIG.weather.droughtYieldFactor[kind];
    yieldPerHa *= 1 + F.yieldNoise * gaussian(state.rng.fields);
    if (hasStaff(state, 'agrar')) yieldPerHa *= 1 + CONFIG.staff.advisorYieldBonus;
    yieldPerHa *= Math.max(0, 1 - F.yieldLossPerDayFromOptimum * Math.abs(offset));
    if (mustFinish && remaining > F.harvestHaPerDay) yieldPerHa *= 1 - F.lateHarvestLoss;
    const quality = Math.max(0, F.baseQuality - (offset < 0 ? -offset * F.qualityLossPerDayEarly : offset * F.qualityLossPerDayLate));
    const t = ha * yieldPerHa;
    field.harvestedHa += ha;
    if (!field.harvesting) {
      field.harvesting = true;
      field.harvestStartEvent = logEvent(state.log, day, {
        type: 'field_harvest_start',
        causes: [field.decisionEvent],
        data: { field: field.id, crop: kind, offsetToOptimum: offset },
      }).id;
    }
    result.deliveries.push({ kind, t, quality, source: field.harvestStartEvent, throughVillage: cfg.throughVillage, distanceKm: cfg.distanceKm, origin: field.id });
    const transport = t * (CONFIG.contracts.silageTransportEurPerTKm * cfg.distanceKm + CONFIG.contracts.silageHandlingEurPerT);
    state.finance.balance -= transport;
    ledger(state, 'transport', transport);
    if (cfg.throughVillage) {
      result.trafficTrips += Math.ceil(t / F.trailerT) * 2;
      result.trafficSource = field.harvestStartEvent;
    }
    state.harvestTotals[kind].own += t;
    field.harvestedT += t;
    if (field.harvestedHa >= cfg.ha - CONFIG.units.epsilon) {
      logEvent(state.log, day, {
        type: 'field_harvest_done',
        causes: [field.harvestStartEvent],
        data: { field: field.id, crop: kind, t: Math.round(field.harvestedT), quality: round(quality, 2) },
      });
      field.harvesting = false;
      field.harvestStartEvent = undefined;
      if (kind === 'gruenroggen') field.ryeDone = true;
      field.standing = 'leer';
      field.growth = 0;
      field.sownDay = null;
      field.harvestDay = null;
      field.harvestedHa = 0;
      field.harvestedT = 0;
    }
  }
  return result;
}
