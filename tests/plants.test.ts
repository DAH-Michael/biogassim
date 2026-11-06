import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { createGame } from '../src/sim/scenario';
import { runToEnd, stepDay } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import { cfg, hasChp, plantScale } from '../src/sim/plant';
import { realWorldItems } from '../src/content/realworld.de';
import type { GameState, ScenarioOptions } from '../src/sim/types';

/**
 * Anlagen der Szenarien: Altanlage mit BHKW, Biomethananlage mit Gasaufbereitung,
 * Verbundanlage mit beidem. Größere Anlagen skalieren Mengen, nicht die Biologie.
 */
const run = (id: ScenarioOptions['id'], strategy: string, seed = 1): GameState => runToEnd(createGame(seed, { id, difficulty: 'normal' }), STRATEGIES[strategy].strategy);

describe('Anlagen je Szenario', () => {
  it('die Anlagen werden von Szenario zu Szenario größer', () => {
    const k = (['altanlage', 'eigene_felder', 'schwieriger_standort'] as const).map((id) => plantScale({ scenario: { id } }));
    expect(k[0]).toBe(1);
    expect(k[1]).toBeGreaterThan(k[0]);
    expect(k[2]).toBeGreaterThan(k[1]);
  });

  it('Mengen wachsen mit der Größe, die Wärmeleitung ins Dorf nicht', () => {
    const big = cfg({ scenario: { id: 'eigene_felder' } });
    const k = plantScale({ scenario: { id: 'eigene_felder' } });
    expect(big.plant.digestateCapacityM3).toBeCloseTo(CONFIG.plant.digestateCapacityM3 * k);
    expect(big.contracts.maizeOffers[0].maxT).toBe(Math.round(CONFIG.contracts.maizeOffers[0].maxT * k));
    expect(big.builds.heatLine.costEur).toBe(CONFIG.builds.heatLine.costEur);
    expect(big.builds.digestateStorage.costEur).toBeLessThan(CONFIG.builds.digestateStorage.costEur * k);
  });

  it('gleiche Fütterung je Größeneinheit ergibt die gleiche Biologie', () => {
    const a = createGame(4, { id: 'altanlage' });
    const b = createGame(4, { id: 'eigene_felder' });
    for (let i = 0; i < 30; i++) {
      stepDay(a);
      stepDay(b);
    }
    // Gleiche Raumbelastung; Unterschiede nur durch Wärme und Lieferungen
    expect(b.bio.olr).toBeCloseTo(a.bio.olr, 1);
    expect(b.history.gasM3.at(-1)! / a.history.gasM3.at(-1)!).toBeGreaterThan(plantScale(b) * 0.85);
  });

  it('die Biomethananlage speist Biomethan ein und erzeugt keinen Strom', () => {
    const g = run('eigene_felder', 'ausgewogen');
    expect(hasChp(g)).toBe(false);
    expect(g.upgrading).not.toBeNull();
    expect(g.totals.kwhGas).toBeGreaterThan(0);
    expect(g.totals.kwhEl).toBe(0);
    expect(g.log.events.some((e) => e.type.startsWith('chp_') || e.type === 'service_overdue')).toBe(false);
    expect(g.finance.ledger.erloesBiomethan).toBeGreaterThan(0);
    // Ohne BHKW heizt der Kessel; der Fermenter bleibt warm
    expect(Math.min(...g.history.tempC)).toBeGreaterThan(CONFIG.biology.coldEventC);
  });

  it('die Verbundanlage erzeugt Strom und Biomethan', () => {
    const g = run('schwieriger_standort', 'standort_angepasst');
    expect(g.totals.kwhEl).toBeGreaterThan(0);
    expect(g.totals.kwhGas).toBeGreaterThan(0);
  });

  it('beide neuen Anlagen sind mit vernünftiger Führung wirtschaftlich', () => {
    for (const [id, strat] of [['eigene_felder', 'ausgewogen'], ['schwieriger_standort', 'standort_angepasst']] as const) {
      const gs = [1, 2, 3, 4].map((s) => run(id, strat, s));
      expect(gs.every((g) => !g.failure)).toBe(true);
      const profit = gs.reduce((a, g) => a + g.finance.balance - cfg(g).finance.startBalanceEur, 0) / gs.length;
      expect(profit).toBeGreaterThan(0);
    }
  });

  it('der Methanschlupf zählt zu den Gasverlusten', () => {
    const g = run('eigene_felder', 'ausgewogen');
    expect(g.totals.ch4SlipM3).toBeGreaterThan(0);
  });

  it('Hinweise zum echten Betrieb passen zur Anlage', () => {
    const chp = createGame(1, { id: 'altanlage' });
    const upg = createGame(1, { id: 'eigene_felder' });
    expect(realWorldItems(chp, true).some((i) => i.only === 'upgrading')).toBe(false);
    expect(realWorldItems(upg, false).some((i) => i.only === 'chp')).toBe(false);
    expect(realWorldItems(upg, false).some((i) => i.title === 'Nachhaltigkeitszertifizierung')).toBe(true);
  });
});
