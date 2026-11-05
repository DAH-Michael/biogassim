import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { bioCore, createBiology, inhibition, tempFactor, warmUpBiology, zeroMap } from '../src/sim/biology';
import { newGame, runDays, calmPlan } from './helpers';
import type { SubstrateMap } from '../src/sim/types';

const ch4PerT = (): SubstrateMap => ({
  mais: CONFIG.substrates.mais.ch4PerT, gruenroggen: CONFIG.substrates.gruenroggen.ch4PerT,
  guelle: CONFIG.substrates.guelle.ch4PerT, reststoff: CONFIG.substrates.reststoff.ch4PerT,
});

function steadyBio(fed: SubstrateMap) {
  const b = createBiology();
  warmUpBiology(b, fed, 15, CONFIG.feeding.startTraceElements);
  return b;
}

describe('Fermenterbiologie', () => {
  it('Ausgangsfütterung läuft stabil im unauffälligen FOS/TAC-Bereich', () => {
    const b = steadyBio({ ...CONFIG.feeding.start });
    for (let i = 0; i < 60; i++) bioCore(b, { fed: { ...CONFIG.feeding.start }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
    expect(b.fosTac).toBeGreaterThan(0.2);
    expect(b.fosTac).toBeLessThan(CONFIG.biology.fosTacNormal);
    expect(b.olr).toBeLessThanOrEqual(CONFIG.biology.olrStable + 0.05);
  });

  it('Gasertrag der Startfütterung lastet das 500-kW-BHKW nahezu aus', () => {
    const b = steadyBio({ ...CONFIG.feeding.start });
    const out = bioCore(b, { fed: { ...CONFIG.feeding.start }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
    const fullLoad = (CONFIG.plant.chpPowerKwEl / CONFIG.plant.chpEtaEl / CONFIG.plant.methaneKwhPerM3) * 24;
    expect(out.ch4M3 / fullLoad).toBeGreaterThan(0.9);
    expect(out.ch4M3 / fullLoad).toBeLessThan(1.1);
  });

  it('Überlastung führt verzögert zur Versäuerung, nicht sofort', () => {
    const start = { ...CONFIG.feeding.start };
    const b = steadyBio(start);
    const over = { ...start, mais: start.mais * 1.6 };
    const fos: number[] = [];
    for (let i = 0; i < 40; i++) {
      bioCore(b, { fed: over, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
      fos.push(b.fosTac);
    }
    expect(fos[1]).toBeLessThan(CONFIG.biology.fosTacWarning);
    const firstWarning = fos.findIndex((f) => f >= CONFIG.biology.fosTacWarning);
    expect(firstWarning).toBeGreaterThan(3);
    expect(firstWarning).toBeLessThan(30);
  });

  it('langsame Steigerung verkraftet die Biologie, der gleiche Sprung auf einmal nicht', () => {
    const start = { ...CONFIG.feeding.start };
    const target = start.mais * 1.35;
    const slow = steadyBio(start);
    const fast = steadyBio(start);
    let maxSlow = 0;
    let maxFast = 0;
    for (let i = 0; i < 90; i++) {
      const m = Math.min(target, start.mais + (target - start.mais) * (i / 60));
      bioCore(slow, { fed: { ...start, mais: m }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
      bioCore(fast, { fed: { ...start, mais: target }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
      maxSlow = Math.max(maxSlow, slow.fosTac);
      maxFast = Math.max(maxFast, fast.fosTac);
    }
    expect(maxSlow).toBeLessThan(CONFIG.biology.fosTacWarning);
    expect(maxFast).toBeGreaterThan(maxSlow);
  });

  it('abrupter Substratwechsel belastet auch bei gleichem Methanangebot', () => {
    const start = { ...CONFIG.feeding.start };
    const b = steadyBio(start);
    // gleiches Methanpotenzial, aber mit Reststoffen statt Mais
    const swapT = (start.mais * CONFIG.substrates.mais.ch4PerT * 0.5) / CONFIG.substrates.reststoff.ch4PerT;
    const fed = { ...start, mais: start.mais * 0.5, reststoff: swapT };
    let minAdapt = 1;
    for (let i = 0; i < 20; i++) {
      bioCore(b, { fed, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
      minAdapt = Math.min(minAdapt, b.adaptation);
    }
    expect(minAdapt).toBeLessThan(0.9);
    // nach einigen Wochen hat sich die Biologie angepasst
    for (let i = 0; i < 120; i++) bioCore(b, { fed, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
    expect(b.adaptation).toBeGreaterThan(0.97);
  });

  it('ohne Wärme kühlt der Fermenter aus und die Methanbildung verlangsamt sich', () => {
    const start = { ...CONFIG.feeding.start };
    const b = steadyBio(start);
    for (let i = 0; i < 10; i++) bioCore(b, { fed: start, ch4PerT: ch4PerT(), heatShare: 0, ambientC: 0, traceDosing: false });
    expect(b.tempC).toBeLessThan(CONFIG.biology.optimumC[0]);
    expect(tempFactor(b.tempC)).toBeLessThan(1);
  });

  it('Temperatur- und Hemmfunktionen haben die richtige Form', () => {
    expect(tempFactor(40)).toBe(1);
    expect(tempFactor(30)).toBeLessThan(1);
    expect(tempFactor(20)).toBeLessThan(tempFactor(30));
    expect(inhibition(0.3)).toBe(1);
    expect(inhibition(0.7)).toBeLessThan(1);
    expect(inhibition(1.2)).toBe(CONFIG.biology.inhibitionFloor);
  });

  it('kurze Verweilzeit lässt mehr Restgas in den Gärrest', () => {
    const b1 = steadyBio({ ...CONFIG.feeding.start });
    const b2 = steadyBio({ ...CONFIG.feeding.start, guelle: 110 });
    const o1 = bioCore(b1, { fed: { ...CONFIG.feeding.start }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
    const o2 = bioCore(b2, { fed: { ...CONFIG.feeding.start, guelle: 110 }, ch4PerT: ch4PerT(), heatShare: 1, ambientC: 15, traceDosing: false });
    expect(b2.hrtDays).toBeLessThan(b1.hrtDays);
    expect(o2.residualCh4 / (o2.ch4M3 + o2.residualCh4)).toBeGreaterThan(o1.residualCh4 / (o1.ch4M3 + o1.residualCh4));
  });

  it('Gülle puffert: gleicher Mais mit Gülle hat niedrigeren FOS/TAC als ohne', () => {
    const withG = steadyBio({ ...zeroMap(), mais: 28, guelle: 40 });
    const without = steadyBio({ ...zeroMap(), mais: 28 });
    expect(withG.fosTac).toBeLessThan(without.fosTac);
  });

  it('reiner Mais ohne Gülle führt über Monate zu Spurenelementmangel', () => {
    const g = newGame(1);
    runDays(g, 1, () => [{ type: 'setFeeding', feed: { mais: 28, guelle: 0 } }]);
    runDays(g, 250, (s) => {
      const a = calmPlan(s);
      if (s.silo.mais.t < 300) a.push({ type: 'buySpot', tonnes: 300 });
      return a;
    });
    expect(g.log.events.some((e) => e.type === 'trace_deficit')).toBe(true);
    expect(g.bio.traceFactor).toBeLessThan(1);
  });
});
