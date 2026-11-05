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

describe('Funktionsumfang je Stufe', () => {
  const g = (d: 'vereinfacht' | 'normal' | 'real') => createGame(1, { id: 'altanlage', difficulty: d });

  it('Vereinfacht: keine Entschwefelung, kein Personal, keine Reststoffe, keine Felder, keine Instandsetzung', async () => {
    const { applyAction } = await import('../src/sim/actions');
    const s = g('vereinfacht');
    expect(applyAction(s, { type: 'orderService', kind: 'entschwefelung' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'orderService', kind: 'gross' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'hire', role: 'biologin' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'build', kind: 'gasStorage' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'orderService', kind: 'klein' }).ok).toBe(true);
    expect(applyAction(s, { type: 'build', kind: 'cover' }).ok).toBe(true);
    runDays(s, 30);
    expect(s.residueOffers).toHaveLength(0);
  });

  it('Normal: Biologin und Techniker ja, Agrarberaterin und Vermarkter nein, keine Zweikultur', async () => {
    const { applyAction } = await import('../src/sim/actions');
    const s = g('normal');
    expect(applyAction(s, { type: 'hire', role: 'techniker' }).ok).toBe(true);
    expect(applyAction(s, { type: 'hire', role: 'vermarkter' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'hire', role: 'agrar' })).toEqual({ ok: false, reason: 'stufe' });
    expect(applyAction(s, { type: 'orderService', kind: 'entschwefelung' }).ok).toBe(true);
  });

  it('Real: voller Funktionsumfang', async () => {
    const { actionAvailable } = await import('../src/sim/actions');
    const s = g('real');
    for (const role of ['biologin', 'techniker', 'agrar', 'vermarkter'] as const) expect(actionAvailable(s, { type: 'hire', role })).toBe(true);
    expect(actionAvailable(s, { type: 'setCrop', fieldId: 'f1', crop: 'zweikultur' })).toBe(true);
    expect(actionAvailable(s, { type: 'setHarvestDay', fieldId: 'f1', day: 40 })).toBe(true);
    expect(actionAvailable(s, { type: 'build', kind: 'secondSilo' })).toBe(true);
  });
});
