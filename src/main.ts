import './styles/app.css';
import { CONFIG } from './sim/config';
import { createGame } from './sim/scenario';
import { stepDay } from './sim/step';
import { STRATEGIES } from './sim/strategies';
import { yearSummary } from './sim/rating';
import { Scene } from './render/scene';
import { paletteFromDocument } from './render/palette';
import { GameController } from './ui/game';
import { App } from './ui/app';
import { buildMenu } from './ui/menu';
import { saveCodeView } from './ui/savecodeView';
import { h } from './ui/dom';
import { newUnlocks, codeForKeys } from './meta/progression';
import { UNLOCKS } from './meta/unlocks.config';
import type { Action, GameState, ScenarioOptions } from './sim/types';
import { DebugPanel } from './ui/debug';
import { Tooltips } from './ui/tooltip';
import { UNLOCK_KEYS } from './sim/unlockKeys';

/**
 * Einstieg: Startmenü, Durchläufe, Metaprogression. Fortschritt wird ausschließlich
 * über den Speichercode weitergegeben; im Browser wird nichts gespeichert.
 *
 * URL-Parameter für Abnahme und Balancing (überspringen das Startmenü):
 * ?seed=42, ?demo=ausgewogen, ?tag=120, ?szenario=eigene_felder, ?waerme, ?speed=2, ?debug.
 */
const params = new URLSearchParams(location.search);
const demo = params.get('demo');
let strategyName = demo && STRATEGIES[demo] ? demo : '';
let plan: (s: GameState) => Action[] = strategyName ? STRATEGIES[strategyName].strategy : () => [];
const debug = params.has('debug');
const maxSpeed = debug ? CONFIG.time.debugMaxSpeed : Math.max(...CONFIG.time.speeds);
const testStart = ['seed', 'demo', 'tag', 'szenario', 'waerme', 'schwierigkeit'].some((k) => params.has(k));

/** Metaprogression dieser Sitzung (nur im Speicher). */
let unlocks: string[] = [];
let lastScenario: ScenarioOptions = { id: 'altanlage' };

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function newController(seed: number, scenario: ScenarioOptions, jump: number, speed: number): GameController {
  const state = createGame(seed, scenario, unlocks);
  // Erster Tag gerechnet, damit Logistik und Werte vorliegen; ?tag=N springt weiter
  while (state.day < Math.max(1, jump) && !state.failure) stepDay(state, plan(state));
  const g = new GameController(state, plan, maxSpeed);
  g.speed = Math.min(maxSpeed, speed);
  return g;
}

function urlScenario(): ScenarioOptions {
  const id = params.get('szenario');
  const lv = params.get('schwierigkeit');
  return {
    id: id === 'eigene_felder' || id === 'schwieriger_standort' ? id : 'altanlage',
    difficulty: lv === 'vereinfacht' || lv === 'real' ? lv : 'normal',
    heatLineAtStart: params.has('waerme'),
  };
}

const root = document.getElementById('app')!;
new Tooltips();
let game = testStart
  ? newController(Number(params.get('seed')) || newSeed(), urlScenario(), Math.min(CONFIG.time.runDays - 1, Number(params.get('tag')) || 0), Number(params.get('speed') ?? 1))
  : newController(newSeed(), lastScenario, 0, 0);

function startRun(scenario: ScenarioOptions): void {
  lastScenario = scenario;
  game = newController(newSeed(), scenario, 0, 1);
  app.attach(game);
  app.hideOverlay();
}

function showMenu(): void {
  game.setSpeed(0);
  app.showOverlay(buildMenu({
    unlocks,
    onUnlocks: (keys) => {
      unlocks = keys;
      showMenu();
    },
    onStart: startRun,
    difficulty: lastScenario.difficulty,
    tutorial: lastScenario.tutorial,
    plantName: lastScenario.plantName,
    onLevelPreview: (level) => app.previewRail(level),
  }));
}

/** Freischaltungen am Ende eines Durchlaufs, einmal je Durchlauf berechnet. */
const gainedByRun = new WeakMap<GameState, string[]>();
/** Bester Kontostand eines beendeten Jahres in dieser Sitzung, nur im Speicher. */
let bestBalance: number | null = null;
function endExtra(s: GameState): HTMLElement {
  let gained = gainedByRun.get(s);
  if (!gained) {
    if (s.finished && !s.failure) bestBalance = bestBalance === null ? s.finance.balance : Math.max(bestBalance, s.finance.balance);
    const failureType = s.failure ? s.log.events.find((e) => e.id === s.failure!.eventId)?.type ?? null : null;
    gained = newUnlocks(unlocks, { failureType, tier: s.failure ? null : yearSummary(s).tier });
    unlocks = [...unlocks, ...gained];
    gainedByRun.set(s, gained);
  }
  const defs = UNLOCKS.filter((u) => gained!.includes(u.key));
  return h('section', { class: 'progress' },
    defs.length
      ? h('div', { class: 'progress__new' },
        h('h3', {}, defs.length === 1 ? 'Neu freigeschaltet' : `${defs.length} neu freigeschaltet`),
        h('ul', { class: 'unlocks' }, ...defs.map((u) => h('li', {}, h('strong', {}, u.title), h('span', {}, u.text)))))
      : null,
    h('div', { class: 'progress__code' },
      h('h3', {}, 'Ihr Speichercode'),
      h('p', { class: 'muted' }, 'Mit diesem Code geht es beim nächsten Besuch mit Ihren Freischaltungen weiter. Gespeichert wird sonst nichts.'),
      saveCodeView(codeForKeys(unlocks))),
  );
}

const app = new App(root, game, (c) => new Scene(c, paletteFromDocument()), () => startRun(lastScenario), showMenu);
app.endExtra = endExtra;
app.sessionBest = () => bestBalance;
if (!testStart) showMenu();

// Debug-Modus: Panel (Taste D) und Lesezugriff für automatische Prüfungen
let debugPanel: DebugPanel | null = null;
if (debug) {
  (window as unknown as { biogas: unknown }).biogas = { get state() { return game.state; }, get unlocks() { return unlocks; }, setSpeed: (v: number) => game.setSpeed(v) };
  debugPanel = new DebugPanel({
    getState: () => game.state,
    getSpeed: () => game.speed,
    setSpeed: (v) => game.setSpeed(v),
    strategy: () => strategyName,
    getUnlocks: () => unlocks,
    unlockAll: () => { unlocks = [...UNLOCK_KEYS]; },
    resetUnlocks: () => { unlocks = []; },
    jumpTo: (target) => {
      const cur = game.state;
      if (target >= cur.day) {
        while (game.state.day < target && !game.over) stepDay(game.state, plan(game.state));
        app.refresh();
        return;
      }
      // Zurück: gleicher Seed, alle bisherigen Entscheidungen bis zum Zieltag erneut anwenden
      const st = createGame(cur.seed, cur.scenario, cur.unlocks);
      const byDay = new Map<number, Action[]>();
      for (const x of cur.actionLog) byDay.set(x.day, [...(byDay.get(x.day) ?? []), x.action]);
      while (st.day < Math.max(1, target) && !st.failure) stepDay(st, byDay.get(st.day) ?? []);
      game = new GameController(st, plan, maxSpeed);
      game.speed = 0;
      app.attach(game);
    },
    restart: (seed, strat) => {
      strategyName = strat && STRATEGIES[strat] ? strat : '';
      plan = strategyName ? STRATEGIES[strategyName].strategy : () => [];
      lastScenario = game.state.scenario;
      game = newController(seed || newSeed(), lastScenario, 0, 1);
      app.attach(game);
    },
  });
  document.body.append(debugPanel.el);
  debugPanel.toggle(true);
}

// Adaptive Qualität: dauerhaft langsame Bilder senken die Pixeldichte
const SLOW_FRAME_S = 1 / 30;
const SLOW_FRAMES_LIMIT = 90;
let slowFrames = 0;
let debugFrame = 0;
const DEBUG_EVERY = 15;
let last = performance.now();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  slowFrames = dt > SLOW_FRAME_S ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  if (slowFrames > SLOW_FRAMES_LIMIT) {
    app.sceneRef.reduceQuality();
    slowFrames = 0;
  }
  const f = game.advance(dt);
  app.frame(dt, f, reduced ? 0 : now / 1000);
  if (debugPanel && (debugFrame = (debugFrame + 1) % DEBUG_EVERY) === 0) debugPanel.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
