import './styles/app.css';
import { CONFIG } from './sim/config';
import { createGame } from './sim/scenario';
import { stepDay } from './sim/step';
import { STRATEGIES } from './sim/strategies';
import { dateOfDay, formatDate } from './sim/calendar';
import { Scene } from './render/scene';
import { paletteFromDocument } from './render/palette';
import type { Action, GameState } from './sim/types';

/**
 * Einstieg. Meilenstein 2: Darstellung mit einfacher Zeitsteuerung.
 * URL-Parameter für die Abnahme: ?seed=42, ?demo=ausgewogen (Testspieler spielt), ?speed=10.
 */
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || crypto.getRandomValues(new Uint32Array(1))[0];
const demo = params.get('demo');
const plan: (s: GameState) => Action[] = demo && STRATEGIES[demo] ? STRATEGIES[demo].strategy : () => [];
const maxSpeed = params.has('debug') ? CONFIG.time.debugMaxSpeed : Math.max(...CONFIG.time.speeds);
let speed = Math.min(maxSpeed, Number(params.get('speed')) || 1);

const scenarioId = params.get('szenario');
const state = createGame(seed, {
  id: scenarioId === 'eigene_felder' || scenarioId === 'schwieriger_standort' ? scenarioId : 'altanlage',
  heatLineAtStart: params.has('waerme'),
});
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new Scene(canvas, paletteFromDocument());

function resize() {
  const r = canvas.parentElement!.getBoundingClientRect();
  scene.resize(r.width, r.height);
}
new ResizeObserver(resize).observe(canvas.parentElement!);
resize();

const SEASONS: [number, string][] = [[3, 'Winter'], [6, 'Frühjahr'], [9, 'Sommer'], [12, 'Herbst']];
function season(month: number): string {
  if (month === 12) return 'Winter';
  return SEASONS.find(([m]) => month < m)?.[1] ?? 'Herbst';
}

function updateHud() {
  // Angezeigt wird der zuletzt gerechnete Tag, wie in der Szene
  const day = Math.max(0, Math.min(state.day - 1, CONFIG.time.runDays - 1));
  const w = state.weather.days[day];
  const weather = w.frost ? (w.rainMm > 0 ? 'Schnee' : 'Frost') : w.rainMm > CONFIG.weather.wetDayMm ? 'Starkregen' : w.rainMm > 0 ? 'Regen' : 'trocken';
  document.getElementById('date')!.textContent = formatDate(day);
  document.getElementById('season')!.textContent = `${season(dateOfDay(day).month)}, ${Math.round(w.tempC)} °C, ${weather}${state.weather.drought ? ', Dürrejahr' : ''}`;
  document.querySelectorAll<HTMLButtonElement>('.time__btn').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed || (speed > 2 && b.dataset.speed === '2'))));
}

function step() {
  if (state.failure || state.finished) return;
  stepDay(state, plan(state));
  scene.update(state);
  updateHud();
}

// Startbild: erster Tag gerechnet, damit Logistik und Werte vorliegen.
// ?tag=N springt zu Spieltag N (für Abnahme und Balancing).
const jump = Math.min(CONFIG.time.runDays - 1, Number(params.get('tag')) || 0);
while (state.day < jump && !state.failure) stepDay(state, plan(state));
step();

document.querySelectorAll<HTMLButtonElement>('.time__btn').forEach((b) =>
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    updateHud();
  }),
);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === ' ') { speed = speed === 0 ? 1 : 0; e.preventDefault(); }
  if (e.key === '1') speed = 1;
  if (e.key === '2') speed = 2;
  updateHud();
});

const secondsPerDay = CONFIG.time.realSecondsPerDayAt1x;
let acc = 0;
let last = performance.now();
// Adaptive Qualität: dauerhaft langsame Bilder senken die Pixeldichte
let slowFrames = 0;
const SLOW_FRAME_S = 1 / 30;
const SLOW_FRAMES_LIMIT = 90;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  slowFrames = dt > SLOW_FRAME_S ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  if (slowFrames > SLOW_FRAMES_LIMIT) {
    scene.reduceQuality();
    slowFrames = 0;
  }
  acc += dt * speed;
  let guard = 0;
  while (acc >= secondsPerDay && guard++ < CONFIG.time.debugMaxSpeed) {
    acc -= secondsPerDay;
    step();
  }
  scene.render(acc / secondsPerDay, reduced ? 0 : now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
updateHud();
