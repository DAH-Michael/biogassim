import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/scenario';
import { runToEnd } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import { yearSummary } from '../src/sim/rating';
import type { GameState, ScenarioOptions } from '../src/sim/types';

/**
 * Balancing-Ziele aus Abschnitt 11 und 12 als Regressionstests über mehrere Seeds.
 * Ändert sich das Balancing, zeigen diese Tests, ob die beabsichtigten Muster erhalten bleiben.
 */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
function runs(name: string, scenario: ScenarioOptions['id'] = 'altanlage'): GameState[] {
  return SEEDS.map((s) => runToEnd(createGame(s, { id: scenario }), STRATEGIES[name].strategy));
}
const successRate = (gs: GameState[]) => gs.filter((g) => !g.failure).length / gs.length;

describe('Balancing-Ziele', () => {
  it('ein naiver erster Versuch scheitert wahrscheinlich', () => {
    expect(successRate(runs('naiv'))).toBeLessThanOrEqual(0.25);
  });

  it('ein informierter zweiter oder dritter Versuch kann gelingen', () => {
    expect(successRate(runs('versuch3'))).toBeGreaterThanOrEqual(0.75);
  });

  it('reine Gülle scheitert oder bleibt wirtschaftlich schwach', () => {
    for (const g of runs('nur_guelle')) {
      if (!g.failure) expect(yearSummary(g).profitEur).toBeLessThan(0);
    }
  });

  it('eine sinnvolle Mais-Strategie unter dem Deckel funktioniert', () => {
    expect(successRate(runs('kein_personal'))).toBeGreaterThanOrEqual(0.75);
  });

  it('Mais ohne Rücksicht auf Deckel, Spurenelemente oder Lager stößt an Grenzen', () => {
    expect(successRate(runs('nur_mais'))).toBeLessThanOrEqual(0.25);
    expect(successRate(runs('mais_maximal'))).toBeLessThanOrEqual(0.25);
  });

  it('Wartung immer aufschieben endet im technischen Totalschaden', () => {
    expect(runs('wartung_aufschieben').filter((g) => g.failure?.kind === 'technik').length).toBeGreaterThanOrEqual(6);
  });

  it('Fachwissen hilft: Techniker senkt Gasverluste, Vermarkter bringt Erlös', () => {
    const base = runs('kein_personal');
    const tech = runs('mit_techniker');
    const avg = (gs: GameState[], f: (g: GameState) => number) => gs.reduce((a, g) => a + f(g), 0) / gs.length;
    expect(avg(tech, (g) => yearSummary(g).gasLossShare)).toBeLessThan(avg(base, (g) => yearSummary(g).gasLossShare));
    expect(avg(runs('mit_vermarkter'), (g) => yearSummary(g).profitEur)).toBeGreaterThan(avg(base, (g) => yearSummary(g).profitEur));
  });

  it('die höchste Stufe ist erreichbar, aber nicht selbstverständlich', () => {
    const best = runs('vorbildlich').filter((g) => yearSummary(g).tier === 3).length;
    const plain = runs('kein_personal').filter((g) => yearSummary(g).tier === 3).length;
    expect(best).toBeGreaterThan(0);
    expect(plain).toBe(0);
  });
});
