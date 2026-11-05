import { CONFIG } from '../sim/config';
import { dateOfDay, formatDate } from '../sim/calendar';
import { buildAnalysis } from './analysis';
import type { GameState } from '../sim/types';
import { Scene } from '../render/scene';
import { unproject } from '../render/iso';
import { FIELDS, PLANT, VILLAGE } from '../render/layout';
import { GameController } from './game';
import { MetricsBar } from './metrics';
import { PANELS, panelIcon, type PanelDef } from './panels';
import { Ticker } from './ticker';
import { h, svg } from './dom';
import { ICONS } from './icons';

/**
 * Oberfläche: Kopfzeile mit Kalender und Zeitsteuerung, Leiste mit Entscheidungsbereichen,
 * Spielfläche, Kennwertleiste, Meldungen. Bedienung mit Maus, Touch und Tastatur.
 */
const SEASONS: Record<number, string> = { 12: 'Winter', 1: 'Winter', 2: 'Winter', 3: 'Frühjahr', 4: 'Frühjahr', 5: 'Frühjahr', 6: 'Sommer', 7: 'Sommer', 8: 'Sommer', 9: 'Herbst', 10: 'Herbst', 11: 'Herbst' };

/** Antippbare Bereiche der Szene (Weltkoordinaten) und der zugehörige Entscheidungsbereich. */
interface Hit { panel: string; label: string; test: (x: number, y: number) => boolean }
const inCircle = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRect = (rx: number, ry: number, w: number, d: number) => (x: number, y: number) => x >= rx && x <= rx + w && y >= ry && y <= ry + d;
const HITS: Hit[] = [
  { panel: 'feed', label: 'Fermenter', test: inCircle(PLANT.fermenter.cx, PLANT.fermenter.cy, PLANT.fermenter.r) },
  { panel: 'feed', label: 'Nachgärer', test: inCircle(PLANT.post.cx, PLANT.post.cy, PLANT.post.r) },
  { panel: 'feed', label: 'Eintrag', test: inRect(PLANT.feeder.x, PLANT.feeder.y, PLANT.feeder.w, PLANT.feeder.d) },
  { panel: 'supply', label: 'Fahrsilo', test: inRect(PLANT.silo.x, PLANT.silo.y, PLANT.silo.w, PLANT.silo.d) },
  { panel: 'tech', label: 'BHKW', test: inRect(PLANT.chp.x - 0.5, PLANT.chp.y - 0.5, PLANT.chp.w + 1, PLANT.chp.d + 1) },
  { panel: 'tech', label: 'Entschwefelung', test: inCircle(PLANT.desulf.cx, PLANT.desulf.cy, PLANT.desulf.r + 0.4) },
  { panel: 'tech', label: 'Notfackel', test: inCircle(PLANT.flare.x, PLANT.flare.y, 0.9) },
  { panel: 'dig', label: 'Gärrestlager', test: inCircle(PLANT.storage.cx, PLANT.storage.cy, PLANT.storage.r) },
  ...Object.entries(FIELDS).map(([, f]) => ({ panel: 'fields', label: 'Feld', test: inRect(f.x, f.y, f.w, f.d) })),
  ...VILLAGE.houses.map(([x, y]) => ({ panel: 'build', label: 'Dorf', test: inRect(x - 0.3, y - 0.3, 2.4, 2.2) })),
];
/** Höhen, auf denen ein Klick getestet wird (für hohe Objekte). */
const HIT_HEIGHTS = [3, 2, 1, 0];

export class App {
  private game: GameController;
  private scene: Scene;
  private metrics = new MetricsBar();
  private ticker = new Ticker();
  private drawer: HTMLElement;
  private drawerTitle: HTMLElement;
  private drawerBody: HTMLElement;
  private rail: HTMLElement;
  private openPanel: PanelDef | null = null;
  private interacting = false;
  private dateEl: HTMLElement;
  private metaEl: HTMLElement;
  private timeButtons: HTMLButtonElement[] = [];
  private endOverlay: HTMLElement;
  private canvas: HTMLCanvasElement;

  constructor(root: HTMLElement, game: GameController, private makeScene: (c: HTMLCanvasElement) => Scene, private restart: () => void, private toMenu: () => void = () => undefined) {
    this.game = game;
    this.dateEl = h('span', { class: 'calendar__date' });
    this.metaEl = h('span', { class: 'calendar__meta' });
    const speeds: [number, keyof typeof ICONS, string][] = [[0, 'pause', 'Pause (Leertaste)'], [1, 'play', 'Normale Geschwindigkeit (1)'], [2, 'fast', 'Doppelte Geschwindigkeit (2)']];
    const time = h('div', { class: 'time', role: 'group', 'aria-label': 'Zeit' });
    for (const [v, icon, label] of speeds) {
      const b = h('button', { type: 'button', class: 'time__btn', 'aria-label': label, title: label, onclick: () => this.game.setSpeed(v) }, svg(ICONS[icon])) as HTMLButtonElement;
      b.dataset.speed = String(v);
      this.timeButtons.push(b);
      time.append(b);
    }
    const header = h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, 'Biogas-Anlage'),
      h('div', { class: 'calendar', 'aria-live': 'polite' }, this.dateEl, this.metaEl),
      time,
    );

    this.rail = h('nav', { class: 'rail', 'aria-label': 'Entscheidungen' },
      ...PANELS.map((p) => h('button', {
        type: 'button', class: 'rail__btn', 'data-panel': p.id, 'aria-expanded': 'false', 'aria-controls': 'drawer',
        title: `${p.title} (${p.key.toUpperCase()})`, onclick: () => this.toggle(p.id),
      }, panelIcon(p.icon), h('span', { class: 'rail__label' }, p.title))),
    );

    this.drawerTitle = h('h2', { id: 'drawer-title', class: 'drawer__title' });
    this.drawerBody = h('div', { class: 'drawer__body' });
    this.drawer = h('section', { id: 'drawer', class: 'drawer', 'aria-labelledby': 'drawer-title', hidden: true },
      h('div', { class: 'drawer__head' }, this.drawerTitle, h('button', { type: 'button', class: 'drawer__close', 'aria-label': 'Schließen (Esc)', onclick: () => this.close() }, svg(ICONS.close))),
      this.drawerBody,
    );
    this.drawerBody.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).matches('input[type=range]')) this.interacting = true;
    });
    window.addEventListener('pointerup', () => {
      if (this.interacting) {
        this.interacting = false;
        this.refreshPanel();
      }
    });

    this.canvas = h('canvas', { id: 'scene', 'aria-label': 'Ansicht der Biogasanlage mit Feldern und Dorf. Objekte lassen sich antippen.' }) as HTMLCanvasElement;
    this.endOverlay = h('div', { class: 'end', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'end-title' });
    const stage = h('main', { class: 'stage' }, this.canvas, this.drawer, this.ticker.el, this.endOverlay);
    root.replaceChildren(header, h('div', { class: 'body' }, this.rail, stage, this.metrics.el));

    this.scene = makeScene(this.canvas);
    new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      this.scene.resize(r.width, r.height);
    }).observe(stage);

    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.canvas.style.cursor = this.hitAt(e) ? 'pointer' : 'default';
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.attach(game);
  }

  /** Neuen Durchlauf anhängen (Neustart). */
  attach(game: GameController): void {
    this.game = game;
    this.hideOverlay();
    this.ticker.clear(0);
    game.on((s, reason) => {
      if (reason !== 'speed') {
        this.scene.update(s);
        this.metrics.update(s);
        this.ticker.sync(s);
        this.updateCalendar(s);
        this.refreshPanel();
        if (game.over) this.showEnd(s);
      }
      this.updateTime();
    });
    this.scene.update(game.state);
    this.metrics.update(game.state);
    this.updateCalendar(game.state);
    this.updateTime();
    this.refreshPanel();
    if (game.over) this.showEnd(game.state);
  }

  frame(dt: number, f: number, t: number): void {
    this.ticker.tick(dt, this.game.speed > 0);
    this.scene.render(f, t);
  }

  get sceneRef(): Scene {
    return this.scene;
  }

  // ---------- Kopfzeile ----------

  private updateCalendar(s: GameState): void {
    const day = Math.max(0, Math.min(s.day - 1, CONFIG.time.runDays - 1));
    const w = s.weather.days[day];
    const weather = w.frost ? (w.rainMm > 0 ? 'Schnee' : 'Frost') : w.rainMm > CONFIG.weather.wetDayMm ? 'Starkregen' : w.rainMm > 0 ? 'Regen' : 'trocken';
    this.dateEl.textContent = formatDate(day);
    this.metaEl.textContent = `${SEASONS[dateOfDay(day).month]}, ${Math.round(w.tempC)} °C, ${weather}`;
  }

  private updateTime(): void {
    for (const b of this.timeButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === Math.min(2, this.game.speed)));
  }

  // ---------- Entscheidungsbereiche ----------

  toggle(id: string): void {
    if (this.openPanel?.id === id) this.close();
    else this.open(id);
  }

  open(id: string): void {
    const p = PANELS.find((x) => x.id === id);
    if (!p) return;
    this.openPanel = p;
    this.drawer.hidden = false;
    this.drawerTitle.textContent = p.title;
    this.rail.querySelectorAll('.rail__btn').forEach((b) => b.setAttribute('aria-expanded', String((b as HTMLElement).dataset.panel === id)));
    this.refreshPanel(true);
  }

  close(): void {
    const id = this.openPanel?.id;
    this.openPanel = null;
    this.drawer.hidden = true;
    this.rail.querySelectorAll('.rail__btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (id) (this.rail.querySelector(`[data-panel="${id}"]`) as HTMLElement | null)?.focus();
  }

  private refreshPanel(focusFirst = false): void {
    const p = this.openPanel;
    if (!p || this.interacting) return;
    const active = document.activeElement as HTMLElement | null;
    // Während in ein Zahlenfeld getippt wird, nicht neu aufbauen
    if (active && this.drawerBody.contains(active) && active instanceof HTMLInputElement && active.type === 'number') return;
    const focusKey = active && this.drawerBody.contains(active) ? active.dataset.focus : undefined;
    const scroll = this.drawerBody.scrollTop;
    this.drawerBody.replaceChildren(p.render({ state: this.game.state, act: (a) => this.game.act(a) }));
    this.drawerBody.scrollTop = scroll;
    if (focusKey) (this.drawerBody.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus();
    else if (focusFirst) (this.drawerBody.querySelector('input, select, button') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  // ---------- Szene antippen ----------

  private hitAt(e: MouseEvent): Hit | null {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const v = this.scene.currentView;
    for (const z of HIT_HEIGHTS) {
      const [x, y] = unproject(v, sx, sy + z * v.scale);
      const hit = HITS.find((hh) => hh.test(x, y));
      if (hit) return hit;
    }
    return null;
  }

  private onCanvasClick(e: MouseEvent): void {
    const hit = this.hitAt(e);
    if (hit) this.open(hit.panel);
  }

  // ---------- Tastatur ----------

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    // Tastenkürzel gelten überall außer beim Tippen in Text- und Zahlenfelder und in Auswahllisten
    const typing = (t instanceof HTMLInputElement && t.type !== 'range') || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
    if (e.key === 'Escape') {
      if (this.openPanel) this.close();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    // Solange Startmenü oder Analyse offen sind, gelten die Spieltasten nicht
    if (!this.endOverlay.hidden) return;
    if (e.key === ' ') {
      if (t instanceof HTMLButtonElement) return;
      this.game.setSpeed(this.game.speed === 0 ? 1 : 0);
      e.preventDefault();
      return;
    }
    if (e.key === '1') this.game.setSpeed(1);
    if (e.key === '2') this.game.setSpeed(2);
    if (e.key === '0') this.game.setSpeed(0);
    const p = PANELS.find((x) => x.key === e.key.toLowerCase());
    if (p) this.toggle(p.id);
  }

  // ---------- Ende: Analyse ----------

  private showEnd(s: GameState): void {
    this.close();
    this.ticker.clear(s.messages.length);
    const view = buildAnalysis(s, { onRestart: () => this.restart(), onMenu: () => this.toMenu(), extra: this.endExtra?.(s) ?? null });
    this.showOverlay(view);
  }

  /** Startmenü oder Analyse über der Spielfläche zeigen. */
  showOverlay(content: HTMLElement): void {
    this.close();
    this.endOverlay.replaceChildren(h('div', { class: 'end__card' }, content));
    this.endOverlay.hidden = false;
    this.endOverlay.scrollTop = 0;
    // Leiste und Zeitsteuerung sind hinter Startmenü und Analyse nicht bedienbar
    this.setBackgroundInert(true);
    (this.endOverlay.querySelector('.btn--primary') as HTMLElement | null)?.focus();
  }

  hideOverlay(): void {
    this.endOverlay.hidden = true;
    this.setBackgroundInert(false);
  }

  private setBackgroundInert(on: boolean): void {
    for (const el of [this.rail, this.timeButtons[0]?.parentElement]) {
      if (!el) continue;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    }
  }

  /** Zusatzinhalt für das Ende (Speichercode, Freischaltungen), von außen gesetzt. */
  endExtra?: (s: GameState) => HTMLElement | null;
}
