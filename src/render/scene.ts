import { CONFIG } from '../sim/config';
import { hasFeature } from '../sim/difficulty';
import { dateOfDay, inWindow } from '../sim/calendar';
import type { FieldState, GameState } from '../sim/types';
import { fitView, project, type View } from './iso';
import { mix, rgb, shade, type Palette, type Rgb } from './palette';
import { Draw } from './shapes';
import { CONTRACT_FIELDS, FIELD_ROUTES, FIELDS, NEIGHBOR_FIELDS, NORTH_ROAD_X, ORIGINS, PLANT, ROAD_Y, VILLAGE, WORLD, type Pt } from './layout';
import { contractField, planTrips, tripPosition, type Trip } from './vehicles';
import { cfg, hasChp, plantScale } from '../sim/plant';
import { biogasPerHourAtFullLoad } from '../sim/tech';

type Rect = { x: number; y: number; w: number; d: number };
interface FieldView { standing: string; growth: number; harvested: number; own: boolean; harvesting: boolean; sowing: boolean }

/**
 * Szene: zeichnet ausschließlich den aktuellen Zustand und interpoliert zwischen
 * zwei Spieltagen. Jedes Objekt zeigt einen Zustand der Simulation an:
 *
 * Gashaube = Gasspeicher, Fackel = Verfackelung, Fahrsilo = Vorrat und Qualität,
 * Walzschlepper = Verdichtung, Fermenter = Prozessruhe, BHKW = Betrieb oder Störung,
 * Gärrestlager = Füllstand und Abdeckung, Fahrzeuge = Lieferungen und Wege,
 * Felder = Kultur und Wachstum, Häuser = Wärme und Geruch, Himmel und Boden = Wetter
 * und Jahreszeit.
 */

interface Snap {
  gasShare: number;
  maisT: number;
  ryeT: number;
  digShare: number;
  mediumShare: number;
  tempC: number;
}

function snap(s: GameState): Snap {
  return {
    gasShare: s.gas.storedM3 / s.gas.capacityM3,
    maisT: s.silo.mais.t,
    ryeT: s.silo.gruenroggen.t,
    digShare: s.digestate.m3 / s.digestate.capacityM3,
    mediumShare: s.desulf.mediumDays / CONFIG.desulfurization.mediumCapacityDays,
    tempC: s.bio.tempC,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Anteil des Tages, über den Wetter und Jahreszeit überblendet werden */
const WEATHER_FADE = 0.6;
const CLOUDS = 8;
const CLOUD_PUFFS: [number, number, number][] = [[0, 0, 0.55], [0.6, -0.15, 0.7], [1.25, 0, 0.55], [0.6, 0.2, 0.6], [1.7, 0.15, 0.4]];

/** Bewölkung eines Tages: bei Regen dicht, sonst locker und von Tag zu Tag verschieden. */
function cloudiness(w: { rainMm: number; frost: boolean }, day: number): number {
  if (w.rainMm > 0) return Math.min(1, 0.65 + w.rainMm / 25);
  const hash = Math.abs(Math.sin((day + 1) * 12.9898) * 43758.5453) % 1;
  return 0.05 + hash * 0.4;
}

export type HoverShape =
  | { kind: 'circle'; cx: number; cy: number; r: number; h: number; label: string }
  | { kind: 'rect'; x: number; y: number; w: number; d: number; h: number; label: string };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private view: View = { scale: 1, ox: 0, oy: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Obergrenze der Pixeldichte; wird bei schwacher Leistung gesenkt */
  private maxDpr = 2;
  private state: GameState | null = null;
  private prev: Snap | null = null;
  private cur: Snap | null = null;
  private trips: Trip[] = [];
  private hasBg = false;
  /** Statussymbole, die über allem gezeichnet werden */
  private overlays: (() => void)[] = [];
  /** Zwischenpuffer für Boden, Straßen und Felder: ändert sich nur einmal pro Spieltag */
  private bg: HTMLCanvasElement = document.createElement('canvas');
  private bgDirty = true;
  /** Hintergrund des Vortags für den weichen Übergang von Wetter und Jahreszeit */
  private bgPrev: HTMLCanvasElement = document.createElement('canvas');
  private bgPrevValid = false;
  private dayChanged = false;
  /** hervorgehobenes Objekt unter dem Mauszeiger */
  private hover: HoverShape | null = null;

  constructor(private canvas: HTMLCanvasElement, private pal: Palette) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D nicht verfügbar');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.width = cssWidth;
    this.height = cssHeight;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const fit = fitView(cssWidth, cssHeight, WORLD.w, WORLD.h, WORLD.maxZ, 0);
    // Die leeren Spitzen der Raute dürfen angeschnitten werden: etwas näher heranzoomen
    const zoom = 1.18;
    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    this.baseView = { scale: fit.scale * zoom, ox: cx + (fit.ox - cx) * zoom, oy: cy + (fit.oy - cy) * zoom };
    this.applyZoom();
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    this.bgPrev.width = this.canvas.width;
    this.bgPrev.height = this.canvas.height;
    this.bgPrevValid = false;
    this.bgDirty = true;
  }

  private baseView: View = { scale: 1, ox: 0, oy: 0 };
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  static readonly MAX_ZOOM = 3;

  private applyZoom(): void {
    const b = this.baseView;
    const cx = this.width / 2;
    const cy = this.height / 2;
    // Verschiebung begrenzen, damit die Anlage nicht aus dem Bild rutscht
    const limX = (this.width * (this.zoom - 1)) / 2;
    const limY = (this.height * (this.zoom - 1)) / 2;
    this.panX = Math.max(-limX, Math.min(limX, this.panX));
    this.panY = Math.max(-limY, Math.min(limY, this.panY));
    this.view = { scale: b.scale * this.zoom, ox: cx + (b.ox - cx) * this.zoom + this.panX, oy: cy + (b.oy - cy) * this.zoom + this.panY };
    this.bgDirty = true;
    this.bgPrevValid = false;
  }

  /** Zoomen um einen Bildschirmpunkt (Standard: Mitte). */
  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const z = Math.max(1, Math.min(Scene.MAX_ZOOM, this.zoom * factor));
    const k = z / this.zoom;
    const cx = this.width / 2;
    const cy = this.height / 2;
    // Punkt unter dem Zeiger bleibt an seinem Platz
    this.panX = (this.panX - (sx - cx)) * k + (sx - cx);
    this.panY = (this.panY - (sy - cy)) * k + (sy - cy);
    this.zoom = z;
    this.applyZoom();
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.applyZoom();
  }

  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyZoom();
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  /** Senkt die Pixeldichte (adaptive Qualität). Gibt true zurück, wenn sich etwas geändert hat. */
  reduceQuality(): boolean {
    if (this.maxDpr <= 1) return false;
    this.maxDpr = 1;
    this.resize(this.width, this.height);
    return true;
  }

  get currentView(): View {
    return this.view;
  }

  /** Nach jedem Simulationstag aufrufen. */
  update(state: GameState): void {
    this.state = state;
    const s = snap(state);
    this.prev = this.cur ?? s;
    this.cur = s;
    this.trips = planTrips(state);
    this.bgDirty = true;
    this.dayChanged = true;
  }

  setHover(h: HoverShape | null): void {
    this.hover = h;
  }

  /** Ein Bild. `f` ist der Fortschritt im laufenden Spieltag (0 bis 1), `t` die Echtzeit in Sekunden. */
  render(f: number, t: number): void {
    const st = this.state;
    if (!st || !this.cur || !this.prev) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const d = new Draw(c, this.view);
    const k = clamp01(f);
    const s: Snap = {
      gasShare: lerp(this.prev.gasShare, this.cur.gasShare, k),
      maisT: lerp(this.prev.maisT, this.cur.maisT, k),
      ryeT: lerp(this.prev.ryeT, this.cur.ryeT, k),
      digShare: lerp(this.prev.digShare, this.cur.digShare, k),
      mediumShare: lerp(this.prev.mediumShare, this.cur.mediumShare, k),
      tempC: lerp(this.prev.tempC, this.cur.tempC, k),
    };
    const dayIdx = Math.max(0, Math.min(st.day - 1, CONFIG.time.runDays - 1));
    const weather = st.weather.days[dayIdx];

    if (this.bgDirty) {
      // Neuer Tag: alten Hintergrund aufheben und weich überblenden
      if (this.dayChanged) {
        const pctx = this.bgPrev.getContext('2d')!;
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.clearRect(0, 0, this.bgPrev.width, this.bgPrev.height);
        pctx.drawImage(this.bg, 0, 0);
        this.bgPrevValid = this.bgPrevValid || this.hasBg;
      }
      this.dayChanged = false;
      this.hasBg = true;
      const bctx = this.bg.getContext('2d')!;
      bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bd = new Draw(bctx, this.view);
      this.drawSky(bctx, st, dayIdx);
      this.drawGround(bd, st, dayIdx);
      this.drawRoads(bd);
      for (const [key, rect] of this.fieldRects()) this.drawFieldStatic(bd, rect, this.fieldView(key, st, dayIdx));
      this.drawNeighborField(bd, NEIGHBOR_FIELDS[1], st, dayIdx);
      this.bgDirty = false;
    }
    const fade = smooth(clamp01(k / WEATHER_FADE));
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bgPrevValid && fade < 1) {
      c.drawImage(this.bgPrev, 0, 0);
      c.globalAlpha = fade;
      c.drawImage(this.bg, 0, 0);
      c.globalAlpha = 1;
    } else c.drawImage(this.bg, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const [key, rect] of this.fieldRects()) this.drawFieldWork(d, rect, this.fieldView(key, st, dayIdx), t);
    this.drawHeatLine(d, st, t);

    // Objekte von hinten nach vorne
    const items: { depth: number; draw: () => void }[] = [];
    const P = PLANT;
    items.push({ depth: P.yard.x, draw: () => this.drawYard(d) });
    for (const o of Object.values(ORIGINS)) if (o.farm) items.push({ depth: o.farm[0] + o.farm[1], draw: () => this.drawFarm(d, o.farm!) });
    items.push({ depth: P.silo.x + P.silo.w + P.silo.y + P.silo.d, draw: () => this.drawSilo(d, st, s, t) });
    if (st.built.secondSilo) items.push({ depth: P.silo2.x + P.silo2.w + P.silo2.y + P.silo2.d, draw: () => this.drawSilo2(d) });
    items.push({ depth: P.feeder.x + P.feeder.y + 3, draw: () => this.drawFeeder(d, st, t) });
    items.push({ depth: P.fermenter.cx + P.fermenter.cy, draw: () => this.drawFermenter(d, st, t) });
    items.push({ depth: P.post.cx + P.post.cy, draw: () => this.drawPostDigester(d, s) });
    items.push({ depth: P.storage.cx + P.storage.cy, draw: () => this.drawStorage(d, st, s, t, P.storage) });
    if (st.built.digestateStorage) items.push({ depth: P.storage2.cx + P.storage2.cy, draw: () => this.drawStorage(d, st, s, t, P.storage2) });
    items.push({ depth: P.pit.cx + P.pit.cy, draw: () => this.drawPit(d, st) });
    if (hasChp(st)) items.push({ depth: P.chp.x + P.chp.w + P.chp.y + P.chp.d, draw: () => this.drawChp(d, st, t) });
    const scaleK = plantScale(st);
    if (scaleK > 1) {
      items.push({ depth: P.yard2.x - 0.5, draw: () => d.rect(P.yard2.x, P.yard2.y, P.yard2.w, P.yard2.d, 0, mix(this.pal.concrete, this.pal.k10, 0.4), this.pal.k40) });
      items.push({ depth: P.fermenter2.cx + P.fermenter2.cy, draw: () => this.drawTank(d, P.fermenter2, false, s) });
    }
    if (scaleK > 2) items.push({ depth: P.post2.cx + P.post2.cy, draw: () => this.drawTank(d, P.post2, true, s) });
    if (st.upgrading) {
      items.push({ depth: P.upgrading.x + P.upgrading.w + P.upgrading.y + P.upgrading.d, draw: () => this.drawUpgrading(d, st, t) });
      items.push({ depth: P.injection.x + P.injection.w + P.injection.y + P.injection.d, draw: () => this.drawInjection(d, st, t) });
    }
    if (hasFeature(st, 'entschwefelung')) items.push({ depth: P.desulf.cx + P.desulf.cy, draw: () => this.drawDesulf(d, s) });
    if (st.built.gasStorage) items.push({ depth: P.gasStorage2.cx + P.gasStorage2.cy, draw: () => this.drawGasStorage2(d, s) });
    items.push({ depth: P.flare.x + P.flare.y, draw: () => this.drawFlare(d, st, t) });
    VILLAGE.houses.forEach(([x, y], i) => items.push({ depth: x + y + 2, draw: () => this.drawHouse(d, x, y, i, st, t) }));
    for (const trip of this.trips) {
      const pos = tripPosition(trip, k);
      if (pos) items.push({ depth: pos.x + pos.y + 0.5, draw: () => this.drawVehicle(d, trip, pos, t) });
    }
    items.sort((a, b) => a.depth - b.depth);
    this.overlays = [];
    for (const it of items) it.draw();

    const prevW = st.weather.days[Math.max(0, dayIdx - 1)];
    const rainMm = this.bgPrevValid ? lerp(prevW.rainMm, weather.rainMm, fade) : weather.rainMm;
    const clouds = lerp(cloudiness(prevW, dayIdx - 1), cloudiness(weather, dayIdx), this.bgPrevValid ? fade : 1);
    this.drawClouds(c, clouds, rainMm > 0.5, t);
    this.drawWeather(c, { rainMm, frost: weather.frost }, t);
    // Statussymbole bleiben über Wolken und Regen sichtbar
    for (const o of this.overlays) o();
    if (this.hover) this.drawHover(d, this.hover);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---------- Himmel, Boden, Jahreszeit, Wetter ----------

  private seasonGround(st: GameState, day: number): Rgb {
    const p = this.pal;
    const m = dateOfDay(day).month;
    const doy = dateOfDay(day).doy;
    // Grün im Frühjahr und Sommer, gelblich im Herbst, fahl im Winter
    const winter = mix(p['hellgruen-15'], p.k10, 0.6);
    const spring = p['hellgruen-30'];
    const summer = p['hellgruen-50'];
    const autumn = mix(p['hellgruen-30'], p['gelb-30'], 0.55);
    const anchors: [number, Rgb][] = [[15, winter], [105, spring], [190, summer], [280, autumn], [350, winter], [380, winter]];
    let col = winter;
    for (let i = 0; i < anchors.length - 1; i++) {
      const [d0, c0] = anchors[i];
      const [d1, c1] = anchors[i + 1];
      if (doy >= d0 && doy <= d1) col = mix(c0, c1, (doy - d0) / (d1 - d0));
    }
    if (doy < 15) col = winter;
    if (st.weather.drought && m >= 6 && m <= 9) col = mix(col, p['gelb-30'], 0.45);
    const w = st.weather.days[day];
    if (w.frost) col = mix(col, p.white, 0.5);
    else if (w.rainMm > 0) col = shade(col, -0.06);
    return col;
  }

  private drawSky(c: CanvasRenderingContext2D, st: GameState, day: number): void {
    const p = this.pal;
    const w = st.weather.days[day];
    const m = dateOfDay(day).month;
    const winter = m <= 2 || m === 12;
    let top: Rgb = winter ? mix(p['blau-15'], p.k10, 0.5) : p['blau-15'];
    if (w.rainMm > 0) top = mix(top, p.k20, 0.6);
    if (st.weather.drought && m >= 6 && m <= 9) top = mix(top, p['gelb-15'], 0.4);
    c.fillStyle = rgb(top);
    c.fillRect(0, 0, this.width, this.height);
  }

  private drawGround(d: Draw, st: GameState, day: number): void {
    d.rect(0, 0, WORLD.w, WORLD.h, 0, this.seasonGround(st, day));
  }

  private drawRoads(d: Draw): void {
    const p = this.pal;
    const road = p.road;
    const lane = 1.2;
    const seg = (a: Pt, b: Pt) => {
      const x0 = Math.min(a[0], b[0]) - lane / 2;
      const y0 = Math.min(a[1], b[1]) - lane / 2;
      d.rect(x0, y0, Math.abs(a[0] - b[0]) + lane, Math.abs(a[1] - b[1]) + lane, 0, road);
    };
    seg([0, ROAD_Y], [WORLD.w, ROAD_Y]);
    seg([NORTH_ROAD_X, 0], [NORTH_ROAD_X, ROAD_Y]);
    for (const route of [...Object.values(ORIGINS).map((o) => o.route), FIELD_ROUTES.n0.slice(1)]) {
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        if (a[0] === b[0] || a[1] === b[1]) seg(a, b);
      }
    }
    // Mittellinie Hauptstraße
    d.line([0, ROAD_Y, 0], [WORLD.w, ROAD_Y, 0], p.white, Math.max(1, this.view.scale * 0.08), 0.7, [this.view.scale * 0.6, this.view.scale * 0.6]);
  }

  private drawYard(d: Draw): void {
    const y = PLANT.yard;
    d.rect(y.x, y.y, y.w, y.d, 0, mix(this.pal.concrete, this.pal.k10, 0.4), this.pal.k40);
  }

  private drawFarm(d: Draw, [x, y]: Pt): void {
    const p = this.pal;
    d.box(x - 1, y - 1, 2, 1.6, 1.1, p.white);
    d.gableRoof(x - 1, y - 1, 2, 1.6, 1.1, 0.7, p.roof);
    d.box(x + 1.3, y - 1.2, 2.4, 2, 1.4, p.k20);
    d.gableRoof(x + 1.3, y - 1.2, 2.4, 2, 1.4, 0.6, p.k60);
  }

  // ---------- Felder ----------

  private cropColor(crop: string, growth: number, drought: boolean): Rgb {
    const p = this.pal;
    let c: Rgb;
    if (crop === 'mais' || crop === 'zweitmais') {
      c = growth < 0.85 ? mix(p['hellgruen-50'], p['dunkelgruen-70'], growth / 0.85) : mix(p['dunkelgruen-70'], p['gelb-50'], (growth - 0.85) / 0.15 * 0.6);
    } else if (crop === 'gruenroggen') {
      c = mix(p['hellgruen-30'], p.hellgruen, growth);
    } else {
      c = p.soil;
    }
    return drought && crop !== 'leer' ? mix(c, p['gelb-50'], 0.35) : c;
  }

  private fieldRects(): [string, Rect][] {
    return [...Object.entries(FIELDS), ['n0', NEIGHBOR_FIELDS[0]]];
  }

  /**
   * Was auf einem Feld zu sehen ist. Eigene Felder folgen der Simulation; Felder der
   * Vertragslandwirte zeigen den Erntefortschritt nach den tatsächlichen Lieferungen.
   */
  private fieldView(key: string, st: GameState, day: number): FieldView {
    const date = dateOfDay(day);
    const m = date.month;
    const delivering = st.today.deliveries.some((d) => contractField(st, d.origin) === key);
    const progress = (kind: 'mais' | 'gruenroggen') => {
      const cs = st.contracts.filter((c) => c.kind === kind && CONTRACT_FIELDS[c.offerId] === key);
      const tonnes = cs.reduce((a, c) => a + c.tonnes, 0);
      return tonnes > 0 ? cs.reduce((a, c) => a + c.delivered, 0) / tonnes : null;
    };
    const field = st.fields.find((x) => x.id === key);
    if (field && field.status !== 'verpachtet') {
      const cfg = CONFIG.fields.list.find((x) => x.id === key)!;
      return {
        standing: field.standing, growth: field.growth, harvested: field.harvestedHa / cfg.ha, own: field.status === 'gefuehrt',
        harvesting: st.today.harvesting.includes(key), sowing: st.today.sowing.includes(key),
      };
    }
    // Felder der Landwirte: Mais im Sommer, bei Hof Brandt Grünroggen im Winter (Zweikultur)
    const tenantMaizeDone = inWindow(day, { from: [9, 21], to: [9, 30] }) || (m >= 10 && m <= 12);
    if (key === 'n0' && (m >= 10 || m <= 5)) {
      if (m === 10 && date.dayOfMonth < 15) return { standing: 'stoppel', growth: 0, harvested: 0, own: false, harvesting: false, sowing: false };
      const share = progress('gruenroggen');
      const growth = m >= 10 ? 0.1 : m <= 3 ? 0.2 + m * 0.05 : Math.min(1, 0.4 + (m - 3) * 0.3);
      const dateDone = m === 5 && date.dayOfMonth > 20;
      if (share === 1 || (share === null && dateDone)) return { standing: 'leer', growth: 0, harvested: 0, own: false, harvesting: false, sowing: false };
      return { standing: 'gruenroggen', growth, harvested: share ?? 0, own: false, harvesting: delivering, sowing: false };
    }
    const share = progress('mais');
    const growth = m === 6 ? 0.3 : m === 7 ? 0.6 : m === 8 ? 0.9 : 0.97;
    if (share === 1 || (share === null && tenantMaizeDone) || (m >= 1 && m <= 5 && key !== 'n0')) {
      return { standing: m >= 1 && m <= 5 ? 'leer' : 'stoppel', growth: 0, harvested: 0, own: false, harvesting: false, sowing: false };
    }
    return { standing: 'mais', growth, harvested: share ?? 0, own: false, harvesting: delivering, sowing: false };
  }

  private drawFieldStatic(d: Draw, r: Rect, v: FieldView): void {
    const p = this.pal;
    const drought = this.state?.weather.drought ?? false;
    const split = r.x + r.w * v.harvested;
    // Abgeerntet (Stoppel) links, stehend rechts
    if (v.harvested > 0) this.fieldPatch(d, r.x, r.y, split - r.x, r.d, 'stoppel', 0, drought);
    this.fieldPatch(d, split, r.y, r.x + r.w - split, r.d, v.standing, v.growth, drought);
    // Rahmen: eigene Felder dunkelgrün, fremde grau
    d.poly([[r.x, r.y, 0], [r.x + r.w, r.y, 0], [r.x + r.w, r.y + r.d, 0], [r.x, r.y + r.d, 0]], null, v.own ? p.dunkelgruen : p.k40, v.own ? 2 : 1);
    // Markierung: Fahne für eigene Felder, Pfosten für fremde
    const [fx, fy] = [r.x + 0.6, r.y + 0.6];
    d.line([fx, fy, 0], [fx, fy, 1.6], p.k60, Math.max(1, this.view.scale * 0.08));
    if (v.own) d.poly([[fx, fy, 1.6], [fx + 1.1, fy, 1.35], [fx, fy, 1.1]], p.dunkelgruen);
  }

  /** Feldarbeit: Häcksler mit Abfahrer bei der Ernte, Drillmaschine bei der Saat. */
  private drawFieldWork(d: Draw, r: Rect, v: FieldView, t: number): void {
    if (!v.harvesting && !v.sowing) return;
    const p = this.pal;
    const split = r.x + r.w * v.harvested;
    const lanes = 5;
    const phase = (t * 0.25) % 1;
    const laneIdx = Math.floor(phase * lanes);
    const along = (phase * lanes) % 1;
    const yy = r.y + (laneIdx + 0.5) * (r.d / lanes);
    const x0 = v.harvesting ? split : r.x;
    const span = Math.max(0.5, (v.harvesting ? r.x + r.w - split : r.w) - 1);
    const xx = x0 + 0.5 + (laneIdx % 2 === 0 ? along : 1 - along) * span;
    if (v.harvesting) {
      // Häcksler, daneben Traktor mit Anhänger, in den gehäckselt wird
      this.machine(d, xx, yy, p.hellgruen, 1.6, 1.1, 1.2);
      d.box(xx - 0.9, yy + 0.9, 1.6, 0.9, 0.7, p.silage);
      this.machine(d, xx + 1.2, yy + 1.35, p.dunkelgruen, 0.9, 0.8, 0.9);
      for (let i = 0; i < 3; i++) d.puff(xx - 0.2 + i * 0.1, yy + 0.5 + i * 0.15, 1.3 + i * 0.2, 0.12 + i * 0.05, p.silage, 0.7 - i * 0.2);
    } else {
      this.machine(d, xx, yy, p.dunkelgruen, 1.0, 0.8, 0.9);
      d.box(xx - 1.5, yy - 0.6, 0.6, 1.8, 0.4, p.k60);
    }
  }

  private fieldPatch(d: Draw, x: number, y: number, w: number, dd: number, crop: string, growth: number, drought: boolean): void {
    if (w <= 0.01) return;
    const p = this.pal;
    const base = crop === 'stoppel' ? mix(p['gelb-30'], p.soil, 0.35) : this.cropColor(crop, growth, drought);
    d.rect(x, y, w, dd, 0, base);
    const scale = this.view.scale;
    // Struktur: Mais in Reihen, Grünroggen fein, Stoppel kurz, Boden in Furchen
    if (crop === 'mais' || crop === 'zweitmais') {
      const h = 0.15 + growth * 1.1;
      d.rows(x, y, w, dd, 0.5, 0.9, 0, shade(base, -0.25), Math.max(1, scale * 0.12 * (0.4 + growth)));
      d.rows(x, y, w, dd, 0.5, 0.9, h, shade(base, 0.12), Math.max(1, scale * 0.1 * (0.4 + growth)), 0.8);
    } else if (crop === 'gruenroggen') {
      d.rows(x, y, w, dd, 0.35, 0.5, 0.05 + growth * 0.4, shade(base, -0.15), Math.max(1, scale * 0.05), 0.8);
    } else if (crop === 'stoppel') {
      d.rows(x, y, w, dd, 0.4, 0.8, 0, shade(base, -0.2), Math.max(1, scale * 0.04), 0.7, [scale * 0.15, scale * 0.25]);
    } else {
      d.rows(x, y, w, dd, 0.4, 0.7, 0, shade(base, -0.15), Math.max(1, scale * 0.06), 0.8);
    }
  }

  private drawNeighborField(d: Draw, r: Rect, st: GameState, day: number): void {
    const m = dateOfDay(day).month;
    // Getreidefläche eines Gärrest-Abnehmers: Wintergetreide, im Juli geerntet, danach Stoppel bis zur Herbstsaat
    const crop = m === 8 || m === 9 ? 'stoppel' : 'gruenroggen';
    const growth = m >= 9 ? 0.12 : m <= 3 ? 0.25 : Math.min(1, (m - 3) / 4);
    this.fieldPatch(d, r.x, r.y, r.w, r.d, crop, growth, st.weather.drought);
    d.poly([[r.x, r.y, 0], [r.x + r.w, r.y, 0], [r.x + r.w, r.y + r.d, 0], [r.x, r.y + r.d, 0]], null, this.pal.k40, 1);
  }

  // ---------- Anlage ----------

  private drawSilo(d: Draw, st: GameState, s: Snap, t: number): void {
    const p = this.pal;
    const S = PLANT.silo;
    const half = S.w / 2;
    const cap = cfg(st).plant.siloCapacityT / 2;
    // Stapelhöhe bleibt unter der Wandkrone, damit nichts durch die Wände ragt
    const pileH = (fill: number) => 0.15 + fill * (S.wall - 0.3);
    const activeKind = st.silo.deliveredToday > 0 ? (st.today.deliveries.some((x) => x.kind === 'gruenroggen') ? 1 : 0) : -1;

    const drawChamber = (k: number, x: number, tonnes: number, color: Rgb, quality: number) => {
      const fill = clamp01(tonnes / cap);
      const h = pileH(fill);
      if (fill > 0.002) {
        // Befüllt von der Rückwand her, Anschnitt vorne zeigt die Silage, oben Folie
        const depth = S.d * (0.3 + 0.7 * fill);
        d.box(x + 0.2, S.y, half - 0.4, depth, h, color, 0, p.foil);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) d.disc(x + 0.9 + i * 1.3, S.y + 0.6 + j * Math.max(0.4, depth - 1.2), 0.16, h + 0.01, p.k100);
        // Schimmel und Nacherwärmung bei schlechter Qualität: helle Flecken am Anschnitt
        const spots = Math.round(clamp01((CONFIG.acceptance.silageGoodQuality - quality) * 6) * 8);
        for (let i = 0; i < spots; i++) {
          const sx = x + 0.5 + ((i * 0.83) % (half - 1.2));
          const sz = 0.1 + ((i * 0.37) % 1) * Math.max(0.1, h - 0.25);
          d.disc(sx, S.y + depth + 0.01, 0.14, sz, p.white, p.k60);
        }
      }
      // Walzschlepper verdichtet, solange angeliefert wird
      if (activeKind === k) {
        const along = (Math.sin(t * 1.4) + 1) / 2;
        const mx = x + 0.9 + along * (half - 2.0);
        this.machine(d, mx, S.y + 1.4, p.dunkelgruen, 1.2, 0.9, 0.9, h);
        for (let i = 0; i < 3; i++) d.puff(mx - 0.4 - i * 0.4, S.y + 2.2, h + 0.4 + i * 0.25, 0.22 + i * 0.1, p['gelb-30'], 0.5 - i * 0.12);
      }
    };

    // Zeichenreihenfolge von hinten nach vorne: Boden, Rückwand, linke Wand, linke Kammer,
    // Mittelwand, rechte Kammer, rechte Wand
    d.rect(S.x, S.y, S.w, S.d, 0, p.concrete, p.k40);
    d.box(S.x - 0.3, S.y - 0.3, S.w + 0.6, 0.3, S.wall, p.concrete);
    d.box(S.x - 0.3, S.y, 0.3, S.d, S.wall, p.concrete);
    drawChamber(0, S.x, s.maisT, p.silage, st.silo.mais.quality);
    d.box(S.x + half - 0.15, S.y, 0.3, S.d, S.wall, p.concrete);
    drawChamber(1, S.x + half, s.ryeT, p.silageRye, st.silo.gruenroggen.quality);
    d.box(S.x + S.w, S.y, 0.3, S.d, S.wall, p.concrete);
  }

  private drawSilo2(d: Draw): void {
    const p = this.pal;
    const S = PLANT.silo2;
    d.rect(S.x, S.y, S.w, S.d, 0, p.concrete, p.k40);
    d.box(S.x - 0.3, S.y - 0.3, 0.3, S.d + 0.3, S.wall, p.concrete);
    d.box(S.x + S.w, S.y - 0.3, 0.3, S.d + 0.3, S.wall, p.concrete);
    d.box(S.x, S.y - 0.3, S.w, 0.3, S.wall, p.concrete);
  }

  private drawFeeder(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const F = PLANT.feeder;
    d.box(F.x, F.y, F.w, F.d, F.h, p.k20, 0, p.dunkelgruen);
    const solids = st.fedToday.mais + st.fedToday.gruenroggen + st.fedToday.reststoff;
    // Schnecke dreht, wenn Feststoffe eingetragen werden
    if (solids > 0) {
      const a = t * 3;
      const [cx, cy] = [F.x + F.w / 2, F.y + F.d / 2];
      d.line([cx + Math.cos(a) * 0.6, cy + Math.sin(a) * 0.6, F.h + 0.02], [cx - Math.cos(a) * 0.6, cy - Math.sin(a) * 0.6, F.h + 0.02], p.gelb, Math.max(1.5, this.view.scale * 0.15));
    }
  }

  private drawFermenter(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const F = PLANT.fermenter;
    d.cylinder(F.cx, F.cy, F.r, F.h, p.white, null);
    // grünes Band
    d.cylinder(F.cx, F.cy, F.r + 0.01, 0.35, p.dunkelgruen, null, F.h - 0.6);
    d.disc(F.cx, F.cy, F.r, F.h, shade(p['dunkelgruen-70'], -0.1));
    // Rührwerk: ruhig und gleichmäßig bei stabilem Prozess, ruckelnd bei Störung, still wenn umgekippt
    const bio = st.bio;
    const disturbance = clamp01(Math.max((bio.fosTac - CONFIG.biology.fosTacNormal) / 0.3, (1 - bio.adaptation) * 3, (1 - bio.tempFactor) * 2));
    let angle: number;
    if (bio.tipped) angle = 0.4;
    else angle = t * 0.8 + disturbance * (Math.sin(t * 9) * 0.9 + Math.sin(t * 23) * 0.5);
    for (let i = 0; i < 2; i++) {
      const a = angle + i * Math.PI;
      d.line([F.cx, F.cy, F.h + 0.05], [F.cx + Math.cos(a) * F.r * 0.75, F.cy + Math.sin(a) * F.r * 0.75, F.h + 0.05], p.white, Math.max(1.5, this.view.scale * 0.14));
    }
    d.disc(F.cx, F.cy, 0.35, F.h + 0.06, p.white);
    // Gasblasen: gleichmäßig und dicht im Normalbetrieb, unregelmäßig bei Störung, keine wenn gekippt
    const gasRel = clamp01(st.gas.producedToday / (biogasPerHourAtFullLoad(st, bio.ch4Share) * 24));
    const n = bio.tipped ? 0 : Math.round(3 + gasRel * 5);
    for (let i = 0; i < n; i++) {
      const jitter = disturbance * Math.sin(t * 5 + i * 7) * 0.6;
      const ph = ((t * (0.5 + jitter * 0.3) + i * 0.37) % 1);
      const ang = i * 2.1 + jitter;
      const rr = F.r * (0.3 + ((i * 0.29) % 0.5));
      d.puff(F.cx + Math.cos(ang) * rr, F.cy + Math.sin(ang) * rr, F.h + 0.1 + ph * 0.5, 0.12, p.white, 1 - ph);
    }
  }

  private drawPostDigester(d: Draw, s: Snap): void {
    const p = this.pal;
    const N = PLANT.post;
    d.cylinder(N.cx, N.cy, N.r, N.h, p.white, null);
    d.cylinder(N.cx, N.cy, N.r + 0.01, 0.35, p.dunkelgruen, null, N.h - 0.6);
    // Gashaube: bläht sich mit dem Füllstand auf
    const height = N.r * (0.15 + 0.85 * clamp01(s.gasShare));
    d.dome(N.cx, N.cy, N.r, N.h, height, p.k10);
  }

  private drawGasStorage2(d: Draw, s: Snap): void {
    const G = PLANT.gasStorage2;
    d.dome(G.cx, G.cy, G.r, 0, G.r * (0.2 + 0.8 * clamp01(s.gasShare)), this.pal.k10, 8);
  }

  private drawStorage(d: Draw, st: GameState, s: Snap, t: number, L: { cx: number; cy: number; r: number; h: number }): void {
    const p = this.pal;
    const dg = st.digestate;
    // Wand hinten
    d.cylinder(L.cx, L.cy, L.r, L.h, p.concrete, null);
    const fill = clamp01(s.digShare);
    if (dg.covered) {
      // Abdeckung: flache Membran, Füllstand nur am Pegel
      d.dome(L.cx, L.cy, L.r, L.h, 0.6, p.k10, 5);
    } else {
      const z = 0.1 + fill * (L.h - 0.15);
      d.disc(L.cx, L.cy, L.r - 0.12, z, p.digestate);
      // leichte Bewegung der Oberfläche
      d.disc(L.cx + Math.sin(t * 0.7) * 0.4, L.cy + Math.cos(t * 0.5) * 0.4, L.r * 0.5, z + 0.01, shade(p.digestate, 0.12), undefined, 0.5);
      d.poly(d.ellipsePoints(L.cx, L.cy, L.r, L.h), null, shade(p.concrete, -0.2), 2);
    }
    // Pegel an der Wand (auch bei Abdeckung sichtbar): Strich mit Höhe = Füllstand
    const px = L.cx + L.r * Math.SQRT1_2;
    const py = L.cy + L.r * Math.SQRT1_2;
    d.line([px, py, 0.05], [px, py, L.h], p.k60, Math.max(2, this.view.scale * 0.25));
    d.line([px, py, 0.05], [px, py, 0.05 + fill * (L.h - 0.05)], p.digestate, Math.max(2, this.view.scale * 0.25));
    // Übergelaufen: Lache um das Lager
    if (dg.overflowed) d.disc(L.cx + 1, L.cy + 1.5, L.r + 1.8, 0.01, p.digestate, undefined, 0.75);
  }

  private drawPit(d: Draw, st: GameState): void {
    const p = this.pal;
    const V = PLANT.pit;
    d.cylinder(V.cx, V.cy, V.r, 0.5, p.concrete, null);
    const level = clamp01(st.fedToday.guelle / cfg(st).feeding.start.guelle);
    d.disc(V.cx, V.cy, V.r - 0.1, 0.1 + 0.35 * level, p.slurry);
  }

  private drawChp(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const B = PLANT.chp;
    const chp = st.chp;
    const running = chp.status === 'betrieb' && chp.runShare > 0.02;
    d.box(B.x, B.y, B.w, B.d, B.h, p.white, 0, p.roof);
    // Kamin
    const kx = B.x + B.w - 0.5;
    const ky = B.y + 0.5;
    d.cylinder(kx, ky, 0.22, B.h + 2.2, p.k40, p.k60);
    // Abgasfahne: Wölkchen steigen, solange das BHKW läuft
    if (running) {
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.35 * (0.6 + chp.runShare) + i / 6) % 1;
        d.puff(kx + ph * 1.6, ky - ph * 0.6, B.h + 2.3 + ph * 2.2, 0.25 + ph * 0.6, p.k10, (1 - ph) * 0.8 * (0.4 + chp.runShare * 0.6));
      }
      d.sound(B.x + B.w + 0.6, B.y + B.d + 0.3, 1.0, 0.9, p.k60, t);
    }
    if (chp.status === 'stoerung' || (chp.status === 'ersatz' && chp.downUntilDay === Number.POSITIVE_INFINITY)) {
      this.overlays.push(() => d.warning(B.x + B.w / 2, B.y + B.d / 2, B.h + 2.4, 1.0, p.warning, p.ink));
    } else if (chp.status === 'wartung') {
      this.overlays.push(() => d.wrench(B.x + B.w / 2, B.y + B.d / 2, B.h + 2.2, 0.9, p.k80, t));
    } else if (chp.status === 'ersatz') {
      // Austausch: Kranarm über dem Gebäude
      d.line([B.x - 0.5, B.y + B.d, 0], [B.x - 0.5, B.y + B.d, B.h + 3], p.gelb, Math.max(2, this.view.scale * 0.15));
      d.line([B.x - 0.5, B.y + B.d, B.h + 3], [B.x + B.w, B.y + B.d / 2, B.h + 3], p.gelb, Math.max(2, this.view.scale * 0.15));
    }
  }

  /** Weiterer Fermenter oder Nachgärer einer größeren Anlage (ohne eigene Animation). */
  private drawTank(d: Draw, T: { cx: number; cy: number; r: number; h: number }, dome: boolean, s: Snap): void {
    const p = this.pal;
    d.cylinder(T.cx, T.cy, T.r, T.h, p.white, null);
    d.cylinder(T.cx, T.cy, T.r + 0.01, 0.3, p.dunkelgruen, null, T.h - 0.55);
    if (dome) d.dome(T.cx, T.cy, T.r, T.h, T.r * (0.15 + 0.85 * clamp01(s.gasShare)), p.k10);
    else d.disc(T.cx, T.cy, T.r, T.h, shade(p['dunkelgruen-70'], -0.1));
  }

  /** Gasaufbereitung: Container mit Membranmodulen; läuft sie, blinkt eine Lampe und rauscht der Verdichter. */
  private drawUpgrading(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const B = PLANT.upgrading;
    const upg = st.upgrading!;
    // Membranmodule: drei schlanke Säulen hinter dem Container (zuerst zeichnen, sie liegen weiter hinten)
    for (let i = 0; i < 3; i++) d.cylinder(B.x + 0.45 + i * 0.6, B.y - 0.35, 0.18, B.h + 0.9, p.k20, p.k40);
    d.box(B.x, B.y, B.w, B.d, B.h, p.white, 0, p.roof);
    const running = upg.status === 'betrieb' && upg.runShare > 0.02;
    if (running) {
      d.sound(B.x + B.w + 0.4, B.y + B.d + 0.2, 0.8, 0.6, p.k60, t);
      // Abgas (CO₂) als feine Fahne aus dem Abgasrohr
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.4 + i / 4) % 1;
        d.puff(B.x + 0.45 + ph * 0.8, B.y - 0.35 - ph * 0.3, B.h + 1.0 + ph * 1.4, 0.15 + ph * 0.35, p.k10, (1 - ph) * 0.6);
      }
    }
    if (upg.status === 'stoerung') this.overlays.push(() => d.warning(B.x + B.w / 2, B.y + B.d / 2, B.h + 2.0, 0.9, p.warning, p.ink));
    else if (upg.status === 'wartung') this.overlays.push(() => d.wrench(B.x + B.w / 2, B.y + B.d / 2, B.h + 1.8, 0.8, p.k80, t));
  }

  /** Einspeisestation mit gelber Gasleitung (Kennfarbe für Gas) zum Netz. */
  private drawInjection(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const E = PLANT.injection;
    const upg = st.upgrading!;
    d.box(E.x, E.y, E.w, E.d, E.h, p.k10, 0, p.k40);
    // Leitung zur Grundstücksgrenze
    d.line([E.x + E.w, E.y + E.d / 2, 0.3], [PLANT.yard.x + PLANT.yard.w, E.y + E.d / 2, 0.3], p.gelb, Math.max(2, this.view.scale * 0.18));
    d.line([PLANT.upgrading.x + PLANT.upgrading.w / 2, PLANT.upgrading.y + PLANT.upgrading.d, 0.3], [E.x + E.w / 2, E.y, 0.3], p.gelb, Math.max(2, this.view.scale * 0.18));
    // Einspeisestopp: Warnzeichen an der Station; Einspeisung: wandernder Punkt auf der Leitung
    if (upg.status === 'einspeisestopp') this.overlays.push(() => d.warning(E.x + E.w / 2, E.y + E.d / 2, E.h + 1.6, 0.8, p.warning, p.ink));
    else if (upg.status === 'betrieb' && upg.runShare > 0.02) {
      const ph = (t * 0.6) % 1;
      const x0 = E.x + E.w;
      const x1 = PLANT.yard.x + PLANT.yard.w;
      d.disc(x0 + (x1 - x0) * ph, E.y + E.d / 2, 0.14, 0.32, p['gelb-ink']);
    }
  }

  private drawDesulf(d: Draw, s: Snap): void {
    const p = this.pal;
    const E = PLANT.desulf;
    d.cylinder(E.cx, E.cy, E.r, E.h, p.k20, p.k40);
    // Vorrat an Verbrauchsmittel als Band
    const h = clamp01(s.mediumShare) * (E.h - 0.2);
    if (h > 0.02) d.cylinder(E.cx, E.cy, E.r + 0.02, h, p['hellgruen-ink'], null, 0.1);
  }

  private drawFlare(d: Draw, st: GameState, t: number): void {
    const p = this.pal;
    const F = PLANT.flare;
    d.box(F.x - 0.4, F.y - 0.4, 0.8, 0.8, 0.2, p.concrete);
    d.cylinder(F.x, F.y, 0.15, F.h, p.k60, p.k80);
    if (st.gas.flaredToday > 0) {
      const strength = clamp01(st.gas.flaredToday / 2000);
      const [sx, sy] = project(this.view, F.x, F.y, F.h);
      const c = this.ctx;
      // Flamme klein halten: sichtbar, aber im Maßstab der Anlage
      const sc = this.view.scale * (0.28 + strength * 0.22);
      const layers: [Rgb, number][] = [[p.danger, 1.6], [p.warning, 1.2], [p.gelb, 0.75]];
      for (const [col, size] of layers) {
        const flick = 1 + 0.15 * Math.sin(t * 17 + size * 3) + 0.1 * Math.sin(t * 29);
        c.beginPath();
        c.moveTo(sx - sc * 0.35 * size, sy);
        c.quadraticCurveTo(sx - sc * 0.3 * size, sy - sc * 1.2 * size * flick, sx + Math.sin(t * 5) * sc * 0.15, sy - sc * 1.9 * size * flick);
        c.quadraticCurveTo(sx + sc * 0.3 * size, sy - sc * 1.2 * size * flick, sx + sc * 0.35 * size, sy);
        c.closePath();
        c.fillStyle = rgb(col, 0.9);
        c.fill();
      }
    }
  }

  // ---------- Dorf und Wärme ----------

  private drawHeatLine(d: Draw, st: GameState, t: number): void {
    if (!st.heatLineActive && !st.builds.some((b) => b.kind === 'heatLine')) return;
    const p = this.pal;
    const [a, b] = [VILLAGE.heatLineFrom, VILLAGE.heatLineTo];
    const active = st.heatLineActive && st.chp.status === 'betrieb' && st.chp.runShare > 0.05;
    const w = Math.max(2, this.view.scale * 0.22);
    d.line([a[0], a[1], 0.02], [b[0], b[1], 0.02], active ? p.warning : p.k60, w, active ? 0.85 : 0.6, st.heatLineActive ? undefined : [w * 2, w * 2]);
    if (active) {
      // wandernde Lichtpunkte
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.3 + i / 6) % 1;
        d.puff(a[0] + (b[0] - a[0]) * ph, a[1], 0.05, 0.22, p.gelb, 0.9);
      }
      for (const [hx, hy] of VILLAGE.houses) d.line([hx + 0.9, a[1], 0.02], [hx + 0.9, hy + (hy < a[1] ? 1.6 : 0), 0.02], p.warning, w * 0.6, 0.7);
    }
  }

  private drawHouse(d: Draw, x: number, y: number, i: number, st: GameState, t: number): void {
    const p = this.pal;
    d.box(x, y, 1.8, 1.6, 1.1, p.white);
    d.gableRoof(x, y, 1.8, 1.6, 1.1, 0.8, p.roof);
    // Fenster: hell erleuchtet bei Wärmeversorgung, dunkel ohne
    const warm = st.heatLineActive && st.chp.status === 'betrieb' && st.chp.runShare > 0.05;
    const win = warm ? p.gelb : p.k40;
    for (let k = 0; k < 2; k++) d.rect(x + 0.35 + k * 0.75, y + 1.6, 0.4, 0.001, 0.35, win);
    d.poly([[x + 0.35, y + 1.6, 0.35], [x + 0.75, y + 1.6, 0.35], [x + 0.75, y + 1.6, 0.75], [x + 0.35, y + 1.6, 0.75]], win);
    d.poly([[x + 1.1, y + 1.6, 0.35], [x + 1.5, y + 1.6, 0.35], [x + 1.5, y + 1.6, 0.75], [x + 1.1, y + 1.6, 0.75]], win);
    // Geruch: je stärker die Belastung, desto mehr Häuser zeigen das Symbol
    const smell = st.acceptance.smell;
    const houses = Math.round(clamp01((smell - 0.12) / 0.4) * VILLAGE.houses.length);
    const order = (i * 7) % VILLAGE.houses.length;
    if (smell > 0.12 && order < houses) d.smell(x + 0.9, y + 0.8, 2.3, 0.9, p.k60, t + i, 0.85);
  }

  // ---------- Fahrzeuge ----------

  private machine(d: Draw, x: number, y: number, color: Rgb, w: number, dd: number, h: number, z = 0): void {
    d.box(x - w / 2, y - dd / 2, w, dd, h * 0.55, color, z);
    d.box(x - w / 2 + w * 0.5, y - dd / 2 + 0.1, w * 0.45, dd - 0.2, h * 0.45, this.pal.white, z + h * 0.55);
  }

  private drawVehicle(d: Draw, trip: Trip, pos: { x: number; y: number; dir: 'x' | 'y'; loaded: boolean; working: boolean }, t: number): void {
    const p = this.pal;
    const along = pos.dir === 'x';
    const L = trip.kind === 'traktor' || trip.kind === 'guellefass' ? 2.2 : 2.8;
    const W = 0.9;
    const w = along ? L : W;
    const dd = along ? W : L;
    const x = pos.x - w / 2;
    const y = pos.y - dd / 2 + (along ? -0.25 : 0);
    const cab = trip.kind === 'traktor' || trip.kind === 'guellefass' ? p.dunkelgruen : p.white;
    let load: Rgb = p.k20;
    if (trip.kind === 'lkw_silage' || trip.kind === 'traktor') load = trip.kind === 'traktor' ? p.silage : p.silage;
    if (trip.kind === 'lkw_guelle') load = p.slurry;
    if (trip.kind === 'guellefass' || trip.kind === 'lkw_gaerrest') load = p.digestate;
    if (trip.kind === 'lkw_rest') load = p['gelb-50'];
    // Aufbau: Mulde oder Tank; beladen voll gefüllt
    const bodyH = trip.kind === 'lkw_guelle' || trip.kind === 'guellefass' || trip.kind === 'lkw_gaerrest' ? 0.8 : 0.6;
    d.box(x, y, w, dd, 0.25, p.k60);
    if (along) {
      d.box(x, y, w * 0.72, dd, bodyH, pos.loaded ? load : p.k20, 0.25);
      d.box(x + w * 0.74, y, w * 0.26, dd, 0.75, cab, 0.25);
    } else {
      d.box(x, y, w, dd * 0.72, bodyH, pos.loaded ? load : p.k20, 0.25);
      d.box(x, y + dd * 0.74, w, dd * 0.26, 0.75, cab, 0.25);
    }
    // Schleppschlauch beim Ausbringen
    if (trip.kind === 'guellefass' && pos.working) {
      const bx = pos.x - (along ? w / 2 : 0);
      const by = pos.y - (along ? 0 : dd / 2);
      const spread = 1.6;
      d.line([bx, by - spread, 0.5], [bx, by + spread, 0.5], p.k80, Math.max(1.5, this.view.scale * 0.1));
      for (let i = -3; i <= 3; i++) d.line([bx, by + (i * spread) / 3, 0.5], [bx - 0.2, by + (i * spread) / 3, 0.02], p.k80, 1);
      d.rect(bx - 1.2 - (Math.sin(t) + 1) * 0.3, by - spread, 1.0, spread * 2, 0.01, p.digestate, undefined, 0.5);
    }
  }

  // ---------- Wetter ----------

  /** Ziehende Wolken mit Schatten auf dem Boden; Anzahl nach Bewölkung, grau bei Regen. */
  private drawClouds(c: CanvasRenderingContext2D, amount: number, rainy: boolean, t: number): void {
    const n = CLOUDS;
    const W = this.width;
    const H = this.height;
    const col = rainy ? this.pal.k20 : this.pal.white;
    for (let i = 0; i < n; i++) {
      const a = clamp01(amount * n - i);
      if (a <= 0) continue;
      const speed = 0.006 * (1 + (i % 3) * 0.35);
      const x = (((i * 0.37 + t * speed) % 1.4) - 0.2) * W;
      const y = (0.06 + ((i * 0.29) % 0.55)) * H;
      const size = Math.min(W, H) * (0.07 + (i % 4) * 0.015);
      // Schatten auf dem Boden
      c.fillStyle = rgb(this.pal.ink, 0.07 * a);
      c.beginPath();
      c.ellipse(x + size * 0.6, y + H * 0.22, size * 1.5, size * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      // Wolke aus überlappenden Kreisen
      c.fillStyle = rgb(col, (rainy ? 0.75 : 0.6) * a);
      c.beginPath();
      for (const [dx, dy, rr] of CLOUD_PUFFS) {
        c.moveTo(x + dx * size + rr * size, y + dy * size);
        c.arc(x + dx * size, y + dy * size, rr * size, 0, Math.PI * 2);
      }
      c.fill();
    }
  }

  /** Umriss und Beschriftung des Objekts unter dem Mauszeiger. */
  private drawHover(d: Draw, hv: HoverShape): void {
    const p = this.pal;
    const c = this.ctx;
    c.save();
    const strokeAll = (color: Rgb, width: number, alpha: number) => {
      c.strokeStyle = rgb(color, alpha);
      c.lineWidth = width;
      c.lineJoin = 'round';
      if (hv.kind === 'circle') {
        d.path(d.ellipsePoints(hv.cx, hv.cy, hv.r + 0.15, hv.h));
        c.stroke();
        d.path(d.ellipsePoints(hv.cx, hv.cy, hv.r + 0.15, 0.02, -Math.PI / 4, (Math.PI * 3) / 4));
        c.stroke();
        for (const ang of [-Math.PI / 4, (Math.PI * 3) / 4]) {
          const x = hv.cx + (hv.r + 0.15) * Math.cos(ang);
          const y = hv.cy + (hv.r + 0.15) * Math.sin(ang);
          const [ax, ay] = project(this.view, x, y, 0.02);
          const [bx, by] = project(this.view, x, y, hv.h);
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(bx, by);
          c.stroke();
        }
      } else {
        const { x, y, w, d: dd, h } = hv;
        const pts: [number, number, number][][] = [
          [[x, y, h], [x + w, y, h], [x + w, y + dd, h], [x, y + dd, h], [x, y, h]],
          [[x, y + dd, 0], [x + w, y + dd, 0], [x + w, y, 0]],
          [[x, y + dd, 0], [x, y + dd, h]], [[x + w, y + dd, 0], [x + w, y + dd, h]], [[x + w, y, 0], [x + w, y, h]],
        ];
        for (const line of pts) {
          c.beginPath();
          line.forEach(([px, py, pz], i) => {
            const [sx, sy] = project(this.view, px, py, pz);
            if (i === 0) c.moveTo(sx, sy);
            else c.lineTo(sx, sy);
          });
          c.stroke();
        }
      }
    };
    strokeAll(p.white, 6, 0.9);
    strokeAll(p.dunkelgruen, 2.5, 1);
    // Beschriftung über dem Objekt
    const [lx, ly] = hv.kind === 'circle' ? project(this.view, hv.cx, hv.cy, hv.h + hv.r * 0.6 + 0.6) : project(this.view, hv.x + hv.w / 2, hv.y + hv.d / 2, hv.h + 1);
    c.font = '600 13px Inter, system-ui, sans-serif';
    const text = hv.label;
    const tw = c.measureText(text).width;
    const padX = 10;
    const bw = tw + padX * 2;
    const bh = 26;
    const bx = Math.max(4, Math.min(this.width - bw - 4, lx - bw / 2));
    const by = Math.max(4, ly - bh - 6);
    c.fillStyle = rgb(p.white, 0.96);
    c.strokeStyle = rgb(p.dunkelgruen);
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(bx, by, bw, bh, 13);
    c.fill();
    c.stroke();
    c.fillStyle = rgb(p.ink);
    c.textBaseline = 'middle';
    c.fillText(text, bx + padX, by + bh / 2 + 1);
    c.restore();
  }

  private drawWeather(c: CanvasRenderingContext2D, w: { rainMm: number; frost: boolean }, t: number): void {
    if (w.rainMm <= 0) return;
    const n = Math.min(260, Math.round(40 + w.rainMm * 12));
    if (w.frost) {
      // Schnee: langsam fallende Flocken
      c.fillStyle = rgb(this.pal.white, 0.9);
      for (let i = 0; i < n; i++) {
        const seed = (i * 9301 + 49297) % 233280;
        const x0 = (seed / 233280) * this.width;
        const y = ((t * (30 + (i % 5) * 8) + i * 37) % (this.height + 20)) - 10;
        const x = (x0 + Math.sin(t + i) * 12 + this.width) % this.width;
        c.beginPath();
        c.arc(x, y, 1.5 + (i % 3) * 0.6, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }
    c.strokeStyle = rgb(this.pal['blau-70'], 0.55);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const seed = (i * 9301 + 49297) % 233280;
      const x0 = (seed / 233280) * this.width;
      const speed = 300 + (i % 7) * 40;
      const y = ((t * speed + i * 53) % (this.height + 40)) - 20;
      const x = (x0 + y * 0.18) % this.width;
      c.moveTo(x, y);
      c.lineTo(x - 3, y + 11);
    }
    c.stroke();
  }
}
