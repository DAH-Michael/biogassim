import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { newGame, runDays, runStrategy } from './helpers';

describe('Scheiterbedingungen', () => {
  it('Insolvenz nach anhaltender Überschreitung des Kreditrahmens', () => {
    const g = newGame(1);
    g.finance.balance = -CONFIG.finance.creditLimitEur - 200000;
    runDays(g, CONFIG.finance.insolvencyDays + 2);
    expect(g.failure?.kind).toBe('insolvenz');
    const ev = g.log.events.find((e) => e.id === g.failure!.eventId)!;
    expect(ev.severity).toBe('failure');
    expect(ev.type).toBe('failure_insolvency');
  });

  it('Insolvenz tritt nicht schon am ersten Tag über dem Rahmen ein', () => {
    const g = newGame(1);
    g.finance.balance = -CONFIG.finance.creditLimitEur - 1000;
    runDays(g, 3);
    expect(g.failure).toBeNull();
  });

  it('Technischer Totalschaden, wenn das Geld für den Ersatz fehlt', () => {
    const g = newGame(1);
    g.chp.wear = CONFIG.chp.wearLimit;
    g.finance.balance = -CONFIG.finance.creditLimitEur + 1000;
    runDays(g, 2);
    expect(g.failure?.kind).toBe('technik');
  });

  it('bei genug Liquidität wird das BHKW ersetzt statt zu scheitern', () => {
    const g = newGame(1);
    g.chp.wear = CONFIG.chp.wearLimit;
    g.finance.balance = CONFIG.chp.replacement.costEur;
    runDays(g, 2);
    expect(g.failure).toBeNull();
    expect(g.chp.status).toBe('ersatz');
    expect(g.log.events.some((e) => e.type === 'chp_replaced')).toBe(true);
  });

  it('Biologischer Totalausfall, wenn der gekippte Fermenter nicht rechtzeitig erholt ist', () => {
    const g = newGame(1);
    g.bio.acids = 20000;
    runDays(g, 1, () => [{ type: 'setFeeding', feed: { mais: 45 } }]);
    runDays(g, CONFIG.biology.recoveryDeadlineDays + 20);
    expect(g.failure?.kind).toBe('biologie');
  });

  it('Behördliche Stilllegung bei dauerhaft kritischer Akzeptanz und Beschwerden', () => {
    const g = runStrategy('dauerfackel', 1);
    expect(g.failure?.kind).toBe('behoerde');
    expect(g.log.events.find((e) => e.id === g.failure!.eventId)!.type).toBe('failure_acceptance');
  });

  it('mindestens vier unterschiedliche Scheiterursachen sind über Strategien erreichbar', () => {
    const kinds = new Set<string>();
    for (const name of ['naiv', 'nur_mais', 'wartung_aufschieben', 'ueberfuettern', 'dauerfackel']) {
      for (let seed = 1; seed <= 4; seed++) {
        const g = runStrategy(name, seed);
        if (g.failure) kinds.add(g.log.events.find((e) => e.id === g.failure!.eventId)!.type);
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('ein informierter Durchlauf schafft das Jahr', () => {
    const g = runStrategy('kein_personal', 1);
    expect(g.failure).toBeNull();
    expect(g.finished).toBe(true);
  });
});
