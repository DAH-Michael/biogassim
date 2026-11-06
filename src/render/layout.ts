/**
 * Lageplan der Spielwelt (Darstellung). Weltkoordinaten in Einheiten von etwa 10 m.
 * x nach Osten, y nach Süden. Die Simulation kennt diese Positionen nicht.
 */
export type Pt = [number, number];

export const WORLD = { w: 62, h: 46, maxZ: 9 };

/** Hofstraße durch die Anlage (y = 22) und Hauptstraße durch das Dorf nach Osten. */
export const ROAD_Y = 22;
export const GATE_WEST: Pt = [18, ROAD_Y];
export const GATE_EAST: Pt = [37, ROAD_Y];
export const NORTH_ROAD_X = 39;

export const PLANT = {
  yard: { x: 17.5, y: 13.5, w: 20, d: 16 },
  silo: { x: 18.5, y: 14.5, w: 9, d: 6, wall: 1.6 },
  silo2: { x: 18.5, y: 9.5, w: 9, d: 4.5, wall: 1.6 },
  siloApron: [23, 21] as Pt,
  feeder: { x: 27.8, y: 16.6, w: 1.8, d: 1.8, h: 1.6 },
  fermenter: { cx: 31.5, cy: 17.5, r: 3, h: 3.4 },
  post: { cx: 31.5, cy: 25, r: 3, h: 2.8 },
  storage: { cx: 23.5, cy: 25.8, r: 3.6, h: 2.2 },
  storage2: { cx: 15.5, cy: 26.5, r: 3.0, h: 2.2 },
  chp: { x: 34.6, y: 18.3, w: 2.6, d: 2.4, h: 1.8 },
  desulf: { cx: 35.8, cy: 24, r: 0.7, h: 2.2 },
  flare: { x: 36.6, y: 27.6, h: 3.6 },
  pit: { cx: 28.3, cy: 21.6, r: 0.9 },
  gasStorage2: { cx: 35.6, cy: 27.6, r: 1.2 },
  /** Erweiterung nach Norden für größere Anlagen: zweiter Fermenter, bei der Verbundanlage ein zweiter Nachgärer */
  yard2: { x: 28.5, y: 7.5, w: 9, d: 6 },
  fermenter2: { cx: 31.3, cy: 10.5, r: 2.6, h: 3.2 },
  post2: { cx: 35.5, cy: 10.6, r: 1.8, h: 2.6 },
  /** Gasaufbereitung (Container mit Membranmodulen) und Einspeisestation */
  upgrading: { x: 34.7, y: 14.2, w: 2.6, d: 1.6, h: 1.5 },
  injection: { x: 36.1, y: 16.4, w: 1.2, d: 1.0, h: 0.9 },
};

export const VILLAGE = {
  houses: [
    [41, 18], [44.2, 17.6], [47.4, 18.2], [50.6, 17.6], [53.8, 18.1], [57, 17.7],
    [42.2, 24.8], [45.6, 25.4], [49, 24.9], [52.4, 25.5], [55.8, 24.9],
  ] as Pt[],
  heatLineFrom: [37.2, 20.6] as Pt,
  heatLineTo: [56.5, 20.6] as Pt,
};

/** Eigene Felder (Simulation f1 bis f3) und Nachbarflächen der Abnehmer. */
export const FIELDS: Record<string, { x: number; y: number; w: number; d: number; access: Pt[] }> = {
  f1: { x: 4, y: 30, w: 11, d: 10, access: [[11, 30], [11, ROAD_Y]] },
  f2: { x: 44, y: 30, w: 15, d: 12, access: [[51, 30], [51, ROAD_Y]] },
  f3: { x: 41, y: 1.5, w: 18, d: 11.5, access: [[41, 7], [NORTH_ROAD_X, 7], [NORTH_ROAD_X, ROAD_Y]] },
};
export const NEIGHBOR_FIELDS = [
  { x: 1, y: 1.5, w: 12, d: 8 },
  { x: 21, y: 32, w: 16, d: 11 },
];

/** Herkunftsorte. Nahe Höfe liegen sichtbar im Westen, ferne Lieferanten kommen über den Kartenrand. */
export interface Origin { route: Pt[]; farm?: Pt }
const west = (farm: Pt): Origin => ({ farm, route: [farm, [farm[0], ROAD_Y], GATE_WEST] });
const east: Origin = { route: [[WORLD.w, ROAD_Y], GATE_EAST] };
const north: Origin = { route: [[NORTH_ROAD_X, 0], [NORTH_ROAD_X, ROAD_Y], GATE_EAST] };

export const ORIGINS: Record<string, Origin> = {
  lw_wendt: west([3, 14]),
  lw_brandt: west([15, 10]),
  lw_brandt_r: west([15, 10]),
  th_haase: west([5, 27]),
  lw_lindner: east,
  th_koenig: east,
  ag_heidekamp: north,
  ag_heidekamp_r: north,
  th_seidel: north,
  spot: north,
  reststoff: east,
  f1: { route: [[9, 33], ...FIELDS.f1.access, GATE_WEST] },
  f2: { route: [[51, 34], ...FIELDS.f2.access, GATE_EAST] },
  f3: { route: [[48, 6], ...FIELDS.f3.access, GATE_EAST] },
};

/**
 * Felder, auf denen Vertragslandwirte sichtbar ernten. n0 ist die Nachbarfläche von Hof Brandt.
 * Eigene Felder des Spielers werden nur genutzt, solange sie noch an den Landwirt verpachtet sind.
 */
export const FIELD_ROUTES: Record<string, Pt[]> = {
  f1: ORIGINS.f1.route,
  f2: ORIGINS.f2.route,
  f3: ORIGINS.f3.route,
  n0: [[7, 5.5], [7, 10.5], [15, 10.5], [15, ROAD_Y], GATE_WEST],
};
export const CONTRACT_FIELDS: Record<string, string> = {
  lw_wendt: 'f1',
  lw_brandt: 'n0',
  lw_brandt_r: 'n0',
  lw_lindner: 'f2',
  ag_heidekamp: 'f3',
  ag_heidekamp_r: 'f3',
};

/** Ausgehende Wege: Gärrest zu Abnahmebetrieben, Silage an Händler. */
export const OUT_ROUTES = {
  offtake: [[PLANT.storage.cx, ROAD_Y], GATE_EAST, [WORLD.w, ROAD_Y]] as Pt[],
  silageSale: [[PLANT.siloApron[0], ROAD_Y], GATE_EAST, [NORTH_ROAD_X, ROAD_Y], [NORTH_ROAD_X, 0]] as Pt[],
};

/** Zufahrt zum Ziel innerhalb der Anlage. */
export const TARGETS: Record<'silo' | 'pit' | 'feeder', Pt[]> = {
  silo: [[PLANT.siloApron[0], ROAD_Y], PLANT.siloApron],
  pit: [[PLANT.pit.cx, ROAD_Y]],
  feeder: [[PLANT.feeder.x + 0.9, ROAD_Y], [PLANT.feeder.x + 0.9, PLANT.feeder.y + 2.4]],
};

/** Wege der Gärrestausbringung zu den Nachbarflächen. */
export const SPREAD_ROUTES: Pt[][] = [
  [[PLANT.storage.cx, ROAD_Y], [28, ROAD_Y], [28, 36]],
  [[PLANT.storage.cx, ROAD_Y], GATE_EAST, [WORLD.w - 1, ROAD_Y]],
];
