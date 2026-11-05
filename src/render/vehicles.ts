import { CONFIG } from '../sim/config';
import type { GameState } from '../sim/types';
import { CONTRACT_FIELDS, FIELD_ROUTES, FIELDS, ORIGINS, OUT_ROUTES, SPREAD_ROUTES, TARGETS, type Pt } from './layout';

/**
 * Fahrzeuge eines Spieltags, abgeleitet aus der tatsächlichen Logistik (state.today):
 * je Ladung ein Fahrzeug, mit einer Obergrenze für die Darstellung. Eingehend: Silage,
 * Gülle, Reststoffe. Ausgehend: Gärrest aufs Feld und an Abnahmebetriebe, Silage bei vollem Silo.
 * Längere Wege dauern sichtbar länger.
 */
export type VehicleKind = 'lkw_silage' | 'lkw_guelle' | 'lkw_rest' | 'lkw_gaerrest' | 'traktor' | 'guellefass';

export interface Trip {
  kind: VehicleKind;
  route: Pt[];
  start: number;
  /** Dauer der Hinfahrt als Anteil am Tag */
  duration: number;
}

const DISPLAY = {
  maxTripsPerSource: 10,
  /** Weltlänge, die ein Fahrzeug pro Tagesanteil zurücklegt */
  speed: 220,
  /** zusätzlicher unsichtbarer Weg pro km Entfernung (ferne Lieferanten kommen später) */
  offmapPerKm: 2.5,
  /** Fahrten verteilen sich über diesen Anteil des Tages */
  dayWindow: 0.8,
  /** Ladung je Fahrzeug, t oder m³ */
  tractorT: CONFIG.fields.trailerT,
  truckT: CONFIG.contracts.guelleTruckT,
  slurryTankerM3: 18,
};

function routeLength(r: Pt[]): number {
  let l = 0;
  for (let i = 1; i < r.length; i++) l += Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1]);
  return l;
}

/** Feld, auf dem ein Vertragslandwirt heute sichtbar erntet (oder null). */
export function contractField(state: GameState, origin: string): string | null {
  const key = CONTRACT_FIELDS[origin];
  if (!key) return null;
  if (key === 'n0') return key;
  const f = state.fields.find((x) => x.id === key);
  // Nur solange das Feld noch dem Landwirt gehört (verpachtet)
  return f && f.status === 'verpachtet' ? key : null;
}

export function planTrips(state: GameState): Trip[] {
  const trips: Trip[] = [];
  const t = state.today;
  const add = (kind: VehicleKind, route: Pt[], amount: number, perLoad: number, offmapKm: number, phase = 0) => {
    if (amount <= 0) return;
    const n = Math.min(DISPLAY.maxTripsPerSource, Math.max(1, Math.ceil(amount / perLoad)));
    const len = routeLength(route) + offmapKm * DISPLAY.offmapPerKm;
    const duration = Math.min(0.4, len / DISPLAY.speed);
    for (let i = 0; i < n; i++) trips.push({ kind, route, start: phase + (i / n) * (DISPLAY.dayWindow - duration * 0.5), duration });
  };

  // Silage: eigene Felder und Vertragsfelder mit Traktor, sonst Lkw vom Hof oder vom Kartenrand
  for (const d of t.deliveries) {
    if (d.origin in FIELDS && !(d.origin in CONTRACT_FIELDS) && state.fields.some((f) => f.id === d.origin)) {
      add('traktor', [...ORIGINS[d.origin].route, ...TARGETS.silo], d.t, DISPLAY.tractorT, 0);
      continue;
    }
    const field = contractField(state, d.origin);
    if (field) add('traktor', [...FIELD_ROUTES[field], ...TARGETS.silo], d.t, DISPLAY.tractorT, 0, 0.02);
    else add('lkw_silage', [...(ORIGINS[d.origin] ?? ORIGINS.spot).route, ...TARGETS.silo], d.t, DISPLAY.truckT, d.distanceKm, 0.04);
  }
  for (const g of t.guelle) add('lkw_guelle', [...(ORIGINS[g.origin] ?? ORIGINS.th_haase).route, ...TARGETS.pit], g.t, DISPLAY.truckT, g.distanceKm, 0.01);
  if (t.residueArrived) add('lkw_rest', [...ORIGINS.reststoff.route, ...TARGETS.feeder], DISPLAY.truckT * 2, DISPLAY.truckT, CONFIG.residues.distanceKm);

  // Ausgehend: Gärrest aufs Feld (Güllefass), an Abnahmebetriebe (Lkw), Silage bei vollem Silo
  if (t.spreadM3 > 0) {
    const half = t.spreadM3 / SPREAD_ROUTES.length;
    SPREAD_ROUTES.forEach((r, i) => add('guellefass', r, half, DISPLAY.slurryTankerM3, 0, 0.03 * i));
  }
  add('lkw_gaerrest', OUT_ROUTES.offtake, t.offtakeM3, DISPLAY.truckT, CONFIG.digestate.regionalDistanceKm, 0.05);
  add('lkw_silage', OUT_ROUTES.silageSale, t.siloSoldT, DISPLAY.truckT, 0, 0.06);
  return trips;
}

/** Position eines Fahrzeugs zum Tagesanteil f, oder null wenn nicht unterwegs. Hinweg beladen, Rückweg leer. */
export function tripPosition(trip: Trip, f: number): { x: number; y: number; dir: 'x' | 'y'; loaded: boolean; working: boolean } | null {
  const local = (f - trip.start) / trip.duration;
  if (local < 0 || local > 2.4) return null;
  let p: number;
  let working = false;
  if (local <= 1) p = local;
  else if (local <= 1.4) {
    // Abladen an der Anlage oder Ausbringen auf dem Feld
    p = 1;
    working = true;
  } else p = 1 - (local - 1.4);
  const loaded = local <= 1;
  const r = trip.route;
  const total = routeLength(r);
  let dist = Math.max(0, Math.min(1, p)) * total;
  for (let i = 1; i < r.length; i++) {
    const seg = Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1]);
    if (dist <= seg || i === r.length - 1) {
      const k = seg > 0 ? Math.min(1, dist / seg) : 0;
      const x = r[i - 1][0] + (r[i][0] - r[i - 1][0]) * k;
      const y = r[i - 1][1] + (r[i][1] - r[i - 1][1]) * k;
      const dir = Math.abs(r[i][0] - r[i - 1][0]) >= Math.abs(r[i][1] - r[i - 1][1]) ? 'x' : 'y';
      return { x, y, dir, loaded, working };
    }
    dist -= seg;
  }
  return null;
}
