import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { createGame } from '../src/sim/scenario';
import { runToEnd } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import { runDays } from './helpers';

const run = (name: string, seed: number, difficulty: 'vereinfacht' | 'normal' | 'real') =>
  runToEnd(createGame(seed, { id: 'altanlage', difficulty }), STRATEGIES[name].strategy);

describe('Schwierigkeitsgrade', () => {
  it('Vereinfacht: kein Spurenelementmangel und tägliche Laborwerte', () => {
    const g = run('nur_mais', 1, 'vereinfacht');
    expect(g.log.events.some((e) => e.type === 'trace_deficit')).toBe(false);
    const m = createGame(1, { id: 'altanlage', difficulty: 'vereinfacht' });
    runDays(m, 10);
    expect(m.measurement.history.length).toBeGreaterThanOrEqual(9);
  });

  it('Vereinfacht: keine zufälligen BHKW-Störungen und kein Verbrauch der Entschwefelung', () => {
    const g = run('kein_personal', 2, 'vereinfacht');
    expect(g.log.events.some((e) => e.type === 'chp_failure')).toBe(false);
    const d = createGame(1, { id: 'altanlage', difficulty: 'vereinfacht' });
    runDays(d, 60);
    expect(d.desulf.mediumDays).toBe(CONFIG.desulfurization.startMediumDays);
  });

  it('Real: Netzausfälle und Rührwerksstörungen kommen vor, normal nicht', () => {
    const types = new Set<string>();
    const normalTypes = new Set<string>();
    for (let s = 1; s <= 6; s++) {
      run('kein_personal', s, 'real').log.events.forEach((e) => types.add(e.type));
      run('kein_personal', s, 'normal').log.events.forEach((e) => normalTypes.add(e.type));
    }
    expect(types.has('grid_outage')).toBe(true);
    expect(types.has('stirrer_failure')).toBe(true);
    expect(normalTypes.has('grid_outage')).toBe(false);
  });

  it('Real: Laborwert kommt später als in Normal', () => {
    expect(CONFIG.biology.measurement.slow.delayDays).toBeGreaterThan(CONFIG.biology.measurement.external.delayDays);
  });

  it('der naive Versuch scheitert in jeder Stufe am Gärrestlager', () => {
    for (const lv of ['vereinfacht', 'normal', 'real'] as const) {
      const g = run('naiv', 3, lv);
      expect(g.failure?.kind).toBe('behoerde');
    }
  });

  it('Normal ist der Standard', () => {
    const a = runToEnd(createGame(4), STRATEGIES.kein_personal.strategy);
    const b = run('kein_personal', 4, 'normal');
    expect(a.finance.balance).toBe(b.finance.balance);
  });
});
