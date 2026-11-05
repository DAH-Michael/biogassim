import './styles/app.css';
import { CONFIG } from './sim/config';
import { createGame } from './sim/scenario';
import { stepDay } from './sim/step';
import { STRATEGIES } from './sim/strategies';
import { Scene } from './render/scene';
import { paletteFromDocument } from './render/palette';
import { GameController } from './ui/game';
import { App } from './ui/app';
import type { Action, GameState, ScenarioOptions } from './sim/types';

/**
 * Einstieg. URL-Parameter für Abnahme und Balancing:
 * ?seed=42, ?demo=ausgewogen (Testspieler entscheidet), ?tag=120 (Sprung), ?szenario=eigene_felder, ?waerme, ?speed=2, ?debug.
 */
const params = new URLSearchParams(location.search);
const demo = params.get('demo');
const plan: (s: GameState) => Action[] = demo && STRATEGIES[demo] ? STRATEGIES[demo].strategy : () => [];
const debug = params.has('debug');
const maxSpeed = debug ? CONFIG.time.debugMaxSpeed : Math.max(...CONFIG.time.speeds);

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function newController(seed: number, jump: number): GameController {
  const id = params.get('szenario');
  const scenario: ScenarioOptions = {
    id: id === 'eigene_felder' || id === 'schwieriger_standort' ? id : 'altanlage',
    heatLineAtStart: params.has('waerme'),
  };
  const state = createGame(seed, scenario);
  // Erster Tag gerechnet, damit Logistik und Werte vorliegen; ?tag=N springt weiter
  while (state.day < Math.max(1, jump) && !state.failure) stepDay(state, plan(state));
  const g = new GameController(state, plan, maxSpeed);
  g.speed = Math.min(maxSpeed, Number(params.get('speed') ?? 1));
  return g;
}

const root = document.getElementById('app')!;
let game = newController(Number(params.get('seed')) || newSeed(), Math.min(CONFIG.time.runDays - 1, Number(params.get('tag')) || 0));
const app = new App(root, game, (c) => new Scene(c, paletteFromDocument()), () => {
  game = newController(newSeed(), 0);
  app.attach(game);
});

// Debug: Lesezugriff auf den Spielstand für automatische Prüfungen (nur mit ?debug)
if (debug) (window as unknown as { biogas: unknown }).biogas = { get state() { return game.state; } };

// Adaptive Qualität: dauerhaft langsame Bilder senken die Pixeldichte
const SLOW_FRAME_S = 1 / 30;
const SLOW_FRAMES_LIMIT = 90;
let slowFrames = 0;
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
