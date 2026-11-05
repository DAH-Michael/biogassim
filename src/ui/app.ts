import { CONFIG } from '../sim/config';
import { dateOfDay, formatDate } from '../sim/calendar';
import { buildAnalysis } from './analysis';
import type { GameState } from '../sim/types';
import { Scene, type HoverShape } from '../render/scene';
import { unproject } from '../render/iso';
import { FIELDS, NEIGHBOR_FIELDS, PLANT, VILLAGE } from '../render/layout';
import { GameController } from './game';
import { MetricsBar } from './metrics';
import { PANELS, panelIcon, type PanelDef } from './panels';
import { Ticker } from './ticker';
import { h, svg } from './dom';
import { ICONS } from './icons';
import { Advisor } from './advisor';
import logoUrl from '../assets/logos/dah-logo-horizontal-farbig.svg?url';
import { TIPS } from '../content/tooltips.de';

/**
 * Oberfläche: Kopfzeile mit Kalender und Zeitsteuerung, Leiste mit Entscheidungsbereichen,
 * Spielfläche, Kennwertleiste, Meldungen. Bedienung mit Maus, Touch und Tastatur.
 */
const SEASONS: Record<number, string> = { 12: 'Winter', 1: 'Winter', 2: 'Winter', 3: 'Frühjahr', 4: 'Frühjahr', 5: 'Frühjahr', 6: 'Sommer', 7: 'Sommer', 8: 'Sommer', 9: 'Herbst', 10: 'Herbst', 11: 'Herbst' };

/** Antippbare Bereiche der Szene (Weltkoordinaten), der zugehörige Entscheidungsbereich und die Hervorhebung. */
interface Hit { panel: string; label: string; test: (x: number, y: number) => boolean; shape: HoverShape }
const circle = (panel: string, name: string, cx: number, cy: number, r: number, h: number, pad = 0): Hit => ({
  panel, label: name, test: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= (r + pad) ** 2, shape: { kind: 'circle', cx, cy, r, h, label: name },
});
const rect = (panel: string, name: string, rx: number, ry: number, w: number, d: number, h: number): Hit => ({
  panel, label: name, test: (x, y) => x >= rx && x <= rx + w && y >= ry && y <= ry + d, shape: { kind: 'rect', x: rx, y: ry, w, d, h, label: name },
});
const P = PLANT;
const HITS: Hit[] = [
  circle('feed', 'Fermenter, öffnet Fütterung', P.fermenter.cx, P.fermenter.cy, P.fermenter.r, P.fermenter.h),
  circle('feed', 'Nachgärer mit Gasspeicher, öffnet Fütterung', P.post.cx, P.post.cy, P.post.r, P.post.h + P.post.r * 0.6),
  rect('feed', 'Feststoffeintrag, öffnet Fütterung', P.feeder.x, P.feeder.y, P.feeder.w, P.feeder.d, P.feeder.h),
  circle('feed', 'Vorgrube für Gülle, öffnet Fütterung', P.pit.cx, P.pit.cy, P.pit.r, 0.5, 0.3),
  rect('supply', 'Fahrsilo, öffnet Beschaffung', P.silo.x - 0.3, P.silo.y - 0.3, P.silo.w + 0.6, P.silo.d + 0.3, P.silo.wall),
  rect('tech', 'BHKW, öffnet Technik', P.chp.x, P.chp.y, P.chp.w, P.chp.d, P.chp.h),
  circle('tech', 'Entschwefelung, öffnet Technik', P.desulf.cx, P.desulf.cy, P.desulf.r, P.desulf.h, 0.4),
  circle('tech', 'Notfackel, öffnet Technik', P.flare.x, P.flare.y, 0.5, P.flare.h, 0.4),
  circle('dig', 'Gärrestlager, öffnet Gärrest', P.storage.cx, P.storage.cy, P.storage.r, P.storage.h),
  ...Object.entries(FIELDS).map(([, f]) => rect('fields', 'Feld, öffnet Felder', f.x, f.y, f.w, f.d, 0)),
  // Felder der Landwirte: Mais- und Grünroggenverträge, Gärrestabnahme
  rect('supply', 'Feld von Hof Brandt, öffnet Beschaffung', NEIGHBOR_FIELDS[0].x, NEIGHBOR_FIELDS[0].y, NEIGHBOR_FIELDS[0].w, NEIGHBOR_FIELDS[0].d, 0),
  rect('dig', 'Feld eines Gärrestabnehmers, öffnet Gärrest', NEIGHBOR_FIELDS[1].x, NEIGHBOR_FIELDS[1].y, NEIGHBOR_FIELDS[1].w, NEIGHBOR_FIELDS[1].d, 0),
  ...VILLAGE.houses.map(([x, y]) => rect('build', 'Dorf, öffnet Ausbau und Dorf', x, y, 1.8, 1.6, 1.9)),
];
/** Höhen, auf denen ein Klick getestet wird (für hohe Objekte). */
const HIT_HEIGHTS = [3, 2, 1, 0];
const ZOOM_STEP = 1.15;
/** Bewegung in Pixeln, ab der aus einem Tippen ein Verschieben wird */
const DRAG_THRESHOLD = 6;

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
  private advisor: Advisor;

  constructor(root: HTMLElement, game: GameController, private makeScene: (c: HTMLCanvasElement) => Scene, private restart: () => void, private toMenu: () => void = () => undefined) {
    this.game = game;
    this.dateEl = h('span', { class: 'calendar__date' });
    this.metaEl = h('span', { class: 'calendar__meta' });
    const speeds: [number, keyof typeof ICONS, string, string][] = [
      [0, 'pause', 'Pause', TIPS.pause],
      [1, 'play', 'Normale Geschwindigkeit', TIPS.speed1],
      [2, 'fast', 'Doppelte Geschwindigkeit', TIPS.speed2],
      [4, 'faster', 'Vierfache Geschwindigkeit', TIPS.speed4],
    ];
    const time = h('div', { class: 'time', role: 'group', 'aria-label': 'Zeit' });
    for (const [v, icon, label, tip] of speeds) {
      const b = h('button', { type: 'button', class: 'time__btn', 'aria-label': label, 'data-tip': tip, onclick: () => this.game.setSpeed(v) }, svg(ICONS[icon])) as HTMLButtonElement;
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
        'data-tip': TIPS.rail[p.id], onclick: () => this.toggle(p.id),
      }, panelIcon(p.icon), h('span', { class: 'rail__label' }, p.title))),
    );

    this.drawerTitle = h('h2', { id: 'drawer-title', class: 'drawer__title' });
    this.drawerBody = h('div', { class: 'drawer__body' });
    this.drawer = h('section', { id: 'drawer', class: 'drawer', 'aria-labelledby': 'drawer-title', hidden: true },
      h('div', { class: 'drawer__head' }, this.drawerTitle, h('button', { type: 'button', class: 'drawer__close', 'aria-label': 'Schließen', 'data-tip': TIPS.closePanel, onclick: () => this.close() }, svg(ICONS.close))),
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
    this.advisor = new Advisor({
      getSpeed: () => this.game.speed,
      setSpeed: (v) => this.game.setSpeed(v),
      openPanel: (id) => this.open(id),
    });
    const stage = h('main', { class: 'stage' }, this.canvas, this.drawer, this.ticker.el, this.advisor.el, this.endOverlay);
    // Absender unten rechts im Weißraum der Kennwertleiste
    this.metrics.el.append(h('a', { class: 'powered', href: 'https://www.dah-gruppe.de', target: '_blank', rel: 'noopener', 'data-tip': 'Zur Website der DAH Gruppe (öffnet in neuem Fenster).' },
      h('span', { class: 'powered__label' }, 'powered by'),
      h('img', { src: logoUrl, alt: 'DAH Gruppe', class: 'powered__logo', width: 140, height: 48 })));
    root.replaceChildren(header, h('div', { class: 'body' }, this.rail, stage, this.metrics.el));

    this.scene = makeScene(this.canvas);
    new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      this.scene.resize(r.width, r.height);
    }).observe(stage);

    this.setupZoom(stage);
    this.canvas.addEventListener('mouseleave', () => this.scene.setHover(null));
    this.canvas.addEventListener('click', (e) => {
      if (this.dragged) return;
      this.onCanvasClick(e);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.pointers.size) return;
      const hit = this.hitAt(e);
      this.canvas.style.cursor = hit ? 'pointer' : this.scene.zoomLevel > 1 ? 'grab' : 'default';
      this.scene.setHover(hit ? hit.shape : null);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.attach(game);
  }

  /** Neuen Durchlauf anhängen (Neustart). */
  private attached = new WeakSet<GameController>();

  attach(game: GameController): void {
    this.game = game;
    this.hideOverlay();
    this.ticker.clear(0);
    if (this.attached.has(game)) {
      this.refresh();
      return;
    }
    this.attached.add(game);
    this.advisor.reset(!!game.state.scenario.tutorial);
    game.on((s, reason) => {
      if (game !== this.game) return;
      if (reason !== 'speed') {
        this.advisor.currentDay = s.day;
        this.advisor.check(s);
      }
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
    this.updateRail(game.state);
    this.scene.update(game.state);
    this.metrics.update(game.state);
    this.updateCalendar(game.state);
    this.updateTime();
    this.refreshPanel();
    if (game.over) this.showEnd(game.state);
    else this.advisor.check(game.state);
  }

  /** Alles neu zeichnen, z. B. nach einem Sprung im Debug-Modus. */
  refresh(): void {
    const s = this.game.state;
    this.updateRail(s);
    this.ticker.clear(s.messages.length);
    this.scene.update(s);
    this.metrics.update(s);
    this.updateCalendar(s);
    this.updateTime();
    this.refreshPanel();
    if (this.game.over) this.showEnd(s);
    else this.hideOverlay();
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
    for (const b of this.timeButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === this.game.speed));
  }

  // ---------- Entscheidungsbereiche ----------

  /** Bereiche, die es in der Stufe des Durchlaufs nicht gibt, verschwinden aus der Leiste. */
  private updateRail(s: GameState): void {
    for (const p of PANELS) {
      const btn = this.rail.querySelector(`[data-panel="${p.id}"]`) as HTMLElement | null;
      if (btn) btn.hidden = p.available ? !p.available(s) : false;
    }
    if (this.openPanel && !this.panelAvailable(this.openPanel.id)) this.close();
  }

  private panelAvailable(id: string): boolean {
    const p = PANELS.find((x) => x.id === id);
    return !!p && (!p.available || p.available(this.game.state));
  }

  toggle(id: string): void {
    if (this.openPanel?.id === id) this.close();
    else this.open(id);
  }

  open(id: string): void {
    const p = PANELS.find((x) => x.id === id);
    if (!p || !this.panelAvailable(id)) return;
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

  // ---------- Zoom und Verschieben ----------

  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;
  private pinchDist = 0;

  private setupZoom(stage: HTMLElement): void {
    const c = this.canvas;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.scene.zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, p.x, p.y);
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, local(e));
      this.dragged = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (this.pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (this.dragged || Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          if (this.scene.zoomLevel > 1) this.scene.panBy(dx, dy);
          this.dragged = true;
          this.pointers.set(e.pointerId, p);
        }
      } else if (this.pointers.size === 2) {
        this.pointers.set(e.pointerId, p);
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.scene.zoomBy(dist / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinchDist = dist;
        this.dragged = true;
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    const btn = (label: string, icon: string, fn: () => void, tip: string) =>
      h('button', { type: 'button', class: 'zoom__btn', 'aria-label': label, 'data-tip': tip, onclick: fn }, svg(icon));
    stage.append(h('div', { class: 'zoom', role: 'group', 'aria-label': 'Ansicht' },
      btn('Heranzoomen', ICONS.plus, () => this.scene.zoomBy(ZOOM_STEP * ZOOM_STEP), TIPS.zoomIn),
      btn('Herauszoomen', ICONS.minus, () => this.scene.zoomBy(1 / (ZOOM_STEP * ZOOM_STEP)), TIPS.zoomOut),
      btn('Ganze Anlage zeigen', ICONS.fit, () => this.scene.resetZoom(), TIPS.zoomFit),
    ));
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
      if (hit && this.panelAvailable(hit.panel)) return hit;
      // Felder ohne eigenen Bereich (Stufe Vereinfacht): dort liefern die Landwirte, also Beschaffung
      if (hit && hit.panel === 'fields') return { ...hit, panel: 'supply', label: 'Feld eines Landwirts, öffnet Beschaffung', shape: { ...hit.shape, label: 'Feld eines Landwirts, öffnet Beschaffung' } };
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
    if (e.key === '+') this.scene.zoomBy(ZOOM_STEP * ZOOM_STEP);
    if (e.key === '-') this.scene.zoomBy(1 / (ZOOM_STEP * ZOOM_STEP));
    if (e.key === '1') this.game.setSpeed(1);
    if (e.key === '2') this.game.setSpeed(2);
    if (e.key === '3') this.game.setSpeed(4);
    if (e.key === '0') this.game.setSpeed(0);
    const p = PANELS.find((x) => x.key === e.key.toLowerCase());
    if (p) this.toggle(p.id);
  }

  // ---------- Ende: Analyse ----------

  private showEnd(s: GameState): void {
    this.close();
    this.advisor.reset(false);
    this.ticker.clear(s.messages.length);
    const extra = this.endExtra?.(s) ?? null;
    const view = buildAnalysis(s, { onRestart: () => this.restart(), onMenu: () => this.toMenu(), extra, sessionBest: this.sessionBest?.() ?? null });
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

  /** Bester Kontostand der Sitzung, von außen gesetzt. */
  sessionBest?: () => number | null;

  /** Zusatzinhalt für das Ende (Speichercode, Freischaltungen), von außen gesetzt. */
  endExtra?: (s: GameState) => HTMLElement | null;
}
