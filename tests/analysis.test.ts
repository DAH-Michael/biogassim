import { describe, expect, it } from 'vitest';
import { describeEvent } from '../src/content/events.de';
import { BACKGROUND, outcomeSentence } from '../src/content/analysis.de';
import { MESSAGES } from '../src/content/messages.de';
import { STRATEGIES } from '../src/sim/strategies';
import { formatDate } from '../src/sim/calendar';
import { runStrategy } from './helpers';

const RUNS = Object.keys(STRATEGIES).flatMap((name) => [1, 2].map((seed) => runStrategy(name, seed)));

describe('Analyse-Inhalte', () => {
  it('jeder Ereignistyp, der vorkommt, hat einen eigenen Text', () => {
    const missing = new Set<string>();
    for (const g of RUNS) for (const e of g.log.events) if (describeEvent(e).title === e.type) missing.add(e.type);
    expect([...missing]).toEqual([]);
  });

  it('jede Meldung, die vorkommt, hat einen Text', () => {
    const missing = new Set<string>();
    for (const g of RUNS) for (const m of g.messages) if (!MESSAGES[m.key]) missing.add(m.key);
    expect([...missing]).toEqual([]);
  });

  it('der Satz der ersten Ebene nennt Ereignis und Datum', () => {
    for (const g of RUNS.filter((x) => x.failure)) {
      const sentence = outcomeSentence(g);
      expect(sentence).toContain(formatDate(g.failure!.day));
      expect(sentence).not.toContain('endete der Betrieb');
    }
  });

  it('Texte beschreiben, sie belehren nicht', () => {
    const preachy = /(sollten Sie|hätten Sie|Sie müssen|Tipp:|achten Sie|vergessen Sie nicht|besser wäre)/i;
    for (const t of Object.values(BACKGROUND)) expect(t).not.toMatch(preachy);
    for (const g of RUNS) for (const e of g.log.events) expect(describeEvent(e).text).not.toMatch(preachy);
    for (const f of Object.values(MESSAGES)) expect(f({})).not.toMatch(preachy);
  });

  it('Texte enthalten keine Gedankenstriche', () => {
    for (const t of Object.values(BACKGROUND)) expect(t).not.toMatch(/ [–—] /);
  });
});
