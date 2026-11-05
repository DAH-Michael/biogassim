import { CONFIG } from '../sim/config';
import type { GameState } from '../sim/types';
import { FIELDS, ORIGINS, SPREAD_ROUTES, TARGETS, type Pt } from './layout';

/**
 * Fahrzeuge eines Spieltags. Aus der Logistik des Tages (state.today) wird ein
 * Fahrplan erzeugt: Jede Fahrt startet zu einem Zeitpunkt im Tag, fährt die Route
 * hin und zurück. Längere Wege dauern sichtbar länger.
 */
export type VehicleKind = 'lkw_silage' | 'lkw_guelle' | 'lkw_rest' | 'traktor' | 'guellefass';

export interface Trip {
  kind: VehicleKind;
  route: Pt[];
  start: number;
  /** Dauer der Hinfahrt als Anteil am Tag */
  duration: number;
  /** Arbeit auf dem Feld am Ende der Route (Gärrest) */
  fieldWork?: { x: number; y: number; w: number; d: number };
}

const DISPLAY = {
  maxTripsPerOrigin: 6,
  /** Weltlänge, die ein Fahrzeug pro Tagesanteil zurücklegt */
  speed: 220,
  /** zusätzlicher unsichtbarer Weg pro km Entfernung (ferne Lieferanten kommen später) */
  offmapPerKm: 2.5,
  dayWindow: 0.75,
  spreadM3PerTrip: 25,
};

function routeLength(r: Pt[]): number {
  let l = 0;
  for (let i = 1; i < r.length; i++) l += Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1]);
  return l;
}

export function planTrips(state: GameState): Trip[] {
  const trips: Trip[] = [];
  const add = (kind: VehicleKind, origin: string, count: number, target: Pt[], distanceKm: number) => {
    const o = ORIGINS[origin] ?? ORIGINS.spot;
    const route = [...o.route, ...target];
    const n = Math.min(DISPLAY.maxTripsPerOrigin, Math.max(1, count));
    const len = routeLength(route) + distanceKm * DISPLAY.offmapPerKm;
    const duration = Math.min(0.45, len / DISPLAY.speed);
    for (let i = 0; i < n; i++) {
      trips.push({ kind, route, start: (i / n) * DISPLAY.dayWindow + ((origin.length * 0.037) % 0.08), duration });
    }
  };
  const t = state.today;
  for (const d of t.deliveries) {
    const isField = d.origin in FIELDS;
    add(isField ? 'traktor' : 'lkw_silage', d.origin, Math.ceil(d.t / CONFIG.fields.trailerT), TARGETS.silo, isField ? 0 : d.distanceKm);
  }
  for (const g of t.guelle) add('lkw_guelle', g.origin, Math.ceil(g.t / CONFIG.contracts.guelleTruckT), TARGETS.pit, g.distanceKm);
  if (t.residueArrived) add('lkw_rest', 'reststoff', 2, TARGETS.feeder, CONFIG.residues.distanceKm);
  if (t.spreadM3 > 0) {
    const n = Math.min(DISPLAY.maxTripsPerOrigin, Math.ceil(t.spreadM3 / DISPLAY.spreadM3PerTrip / 4));
    for (let i = 0; i < n; i++) {
      const route = SPREAD_ROUTES[i % SPREAD_ROUTES.length];
      trips.push({ kind: 'guellefass', route, start: (i / n) * DISPLAY.dayWindow, duration: Math.min(0.3, routeLength(route) / DISPLAY.speed) });
    }
  }
  return trips;
}

/** Position eines Fahrzeugs zum Tagesanteil f, oder null wenn nicht unterwegs. */
export function tripPosition(trip: Trip, f: number): { x: number; y: number; dir: 'x' | 'y'; loaded: boolean; working: boolean } | null {
  const local = (f - trip.start) / trip.duration;
  if (local < 0 || local > 2.4) return null;
  let p: number;
  let loaded: boolean;
  let working = false;
  if (local <= 1) {
    p = local;
    loaded = trip.kind !== 'guellefass';
  } else if (local <= 1.4) {
    // Abladen oder Ausbringen am Ziel
    p = 1;
    loaded = false;
    working = true;
  } else {
    p = 1 - (local - 1.4);
    loaded = trip.kind === 'guellefass';
  }
  if (trip.kind === 'guellefass') {
    // Güllefass fährt beladen hin und leer zurück
    loaded = local <= 1;
  }
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
