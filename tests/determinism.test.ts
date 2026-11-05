import { describe, expect, it } from 'vitest';
import { runStrategy, newGame, runDays } from './helpers';

describe('Determinismus', () => {
  it('gleicher Seed und gleiche Entscheidungen ergeben den gleichen Durchlauf', () => {
    const a = runStrategy('ausgewogen', 7);
    const b = runStrategy('ausgewogen', 7);
    expect(a.finance.balance).toBe(b.finance.balance);
    expect(a.log.events.length).toBe(b.log.events.length);
    expect(a.history.fosTacTrue).toEqual(b.history.fosTacTrue);
  });

  it('Wetter hängt nur vom Seed ab, nicht von Entscheidungen', () => {
    const a = newGame(5);
    const b = newGame(5);
    runDays(a, 50);
    runDays(b, 50, () => [{ type: 'setFeeding', feed: { mais: 10 } }]);
    expect(a.weather).toEqual(b.weather);
  });

  it('Aktionsprotokoll erlaubt eine exakte Wiederholung', () => {
    const a = runStrategy('ausgewogen', 3);
    const b = newGame(3);
    const byDay = new Map<number, typeof a.actionLog>();
    for (const x of a.actionLog) byDay.set(x.day, [...(byDay.get(x.day) ?? []), x]);
    runDays(b, 400, (s) => (byDay.get(s.day) ?? []).map((x) => x.action));
    expect(b.finance.balance).toBe(a.finance.balance);
  });

  it('unterschiedliche Seeds ergeben unterschiedliche Jahre', () => {
    expect(runStrategy('ausgewogen', 1).finance.balance).not.toBe(runStrategy('ausgewogen', 2).finance.balance);
  });
});
