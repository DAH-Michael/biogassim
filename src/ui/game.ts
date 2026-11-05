import { CONFIG } from '../sim/config';
import { applyAction, type ActionResult } from '../sim/actions';
import { stepDay } from '../sim/step';
import type { Action, GameState } from '../sim/types';

/**
 * Steuert einen Durchlauf: Zeit, Schritte, Entscheidungen. Benachrichtigt die
 * Oberfläche nach jedem Spieltag und nach jeder Entscheidung.
 */
export type Listener = (state: GameState, reason: 'day' | 'action' | 'speed') => void;

export class GameController {
  speed = 1;
  private acc = 0;
  private listeners: Listener[] = [];
  readonly secondsPerDay = CONFIG.time.realSecondsPerDayAt1x;

  constructor(public state: GameState, private plan: (s: GameState) => Action[] = () => [], public maxSpeed: number = Math.max(...CONFIG.time.speeds)) {}

  on(l: Listener): void {
    this.listeners.push(l);
  }

  private emit(reason: 'day' | 'action' | 'speed'): void {
    for (const l of this.listeners) l(this.state, reason);
  }

  get over(): boolean {
    return this.state.failure !== null || this.state.finished;
  }

  setSpeed(v: number): void {
    this.speed = Math.max(0, Math.min(this.maxSpeed, v));
    this.emit('speed');
  }

  /** Entscheidung sofort anwenden, auch pausiert. */
  act(action: Action): ActionResult {
    const r = applyAction(this.state, action);
    if (r.ok) this.emit('action');
    return r;
  }

  step(): void {
    if (this.over) return;
    stepDay(this.state, this.plan(this.state));
    this.emit('day');
    if (this.over) this.setSpeed(0);
  }

  /** Fortschritt in Echtzeit. Gibt den Anteil des laufenden Tages zurück. */
  advance(dtSeconds: number): number {
    this.acc += dtSeconds * this.speed;
    let guard = 0;
    while (this.acc >= this.secondsPerDay && guard++ < CONFIG.time.debugMaxSpeed && !this.over) {
      this.acc -= this.secondsPerDay;
      this.step();
    }
    if (this.over) this.acc = 0;
    return this.acc / this.secondsPerDay;
  }
}
