import { createGame } from '../src/sim/scenario';
import { runToEnd, stepDay } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import type { Action, GameState } from '../src/sim/types';

export function newGame(seed = 1, unlocks: string[] = []): GameState {
  return createGame(seed, { id: 'altanlage' }, unlocks);
}

export function runDays(g: GameState, days: number, plan: (s: GameState) => Action[] = () => []): GameState {
  for (let i = 0; i < days && !g.failure && !g.finished; i++) stepDay(g, plan(g));
  return g;
}

export function runStrategy(name: string, seed = 1): GameState {
  return runToEnd(newGame(seed), STRATEGIES[name].strategy);
}

/** Ein ruhiger Betrieb: Wartung, Entschwefelung und Ausbringung laufen, damit Tests einzelne Effekte isolieren. */
export function calmPlan(s: GameState): Action[] {
  const a: Action[] = [];
  if (s.chp.status === 'betrieb' && s.chp.hoursSinceService > 1800) a.push({ type: 'orderService', kind: 'klein' });
  if (s.desulf.mediumDays < 5) a.push({ type: 'orderService', kind: 'entschwefelung' });
  if (s.digestate.spreadOrderM3 <= 0 && s.digestate.m3 > s.digestate.capacityM3 * 0.3) a.push({ type: 'orderSpreading', m3: 2000 });
  return a;
}
