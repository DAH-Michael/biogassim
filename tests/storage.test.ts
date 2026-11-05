import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { dayOfDate, inWindow } from '../src/sim/calendar';
import { siloDay } from '../src/sim/storage';
import { newGame, runDays } from './helpers';

describe('Fahrsilo', () => {
  it('zu schnelle Anlieferung verdichtet schlechter und senkt die Qualität', () => {
    const a = newGame(1);
    const b = newGame(1);
    const t = CONFIG.silo.compactionCapacityTPerDay;
    siloDay(a, [{ kind: 'mais', t, quality: 0.9, throughVillage: false, distanceKm: 1 }]);
    siloDay(b, [{ kind: 'mais', t: t * 3, quality: 0.9, throughVillage: false, distanceKm: 1 }]);
    expect(b.silo.compactionToday).toBeLessThan(a.silo.compactionToday);
    expect(b.silo.mais.quality).toBeLessThan(a.silo.mais.quality);
    expect(b.log.events.some((e) => e.type === 'silo_compaction_poor')).toBe(true);
  });

  it('schlechte Qualität erhöht die Lagerverluste', () => {
    const good = newGame(1);
    const bad = newGame(1);
    bad.silo.mais.quality = 0.4;
    for (let i = 0; i < 100; i++) {
      siloDay(good, []);
      siloDay(bad, []);
    }
    expect(bad.silo.mais.t).toBeLessThan(good.silo.mais.t);
  });

  it('volles Silo: Überschuss wird abgegeben und protokolliert', () => {
    const g = newGame(1);
    const room = g.silo.capacityT - g.silo.mais.t;
    siloDay(g, [{ kind: 'mais', t: room + 500, quality: 0.9, source: g.origin.fields, throughVillage: false, distanceKm: 1 }]);
    expect(g.silo.mais.t).toBeLessThanOrEqual(g.silo.capacityT);
    expect(g.log.events.some((e) => e.type === 'silo_overflow')).toBe(true);
  });

  it('leeres Silo verändert die Fütterung und wird mit Ursache protokolliert', () => {
    const g = newGame(1);
    runDays(g, 80);
    const ev = g.log.events.find((e) => e.type === 'silo_empty');
    expect(ev).toBeDefined();
    expect(ev!.causes.length).toBeGreaterThan(0);
    expect(g.fedToday.mais).toBeLessThan(g.feedTarget.mais);
  });
});

describe('Gärrestlager und Sperrfrist', () => {
  it('Sperrfrist liegt vom 1. Oktober bis 31. Januar, auch über den Jahreswechsel', () => {
    const w = CONFIG.digestate.blackout;
    expect(inWindow(dayOfDate([9, 30]), w)).toBe(false);
    expect(inWindow(dayOfDate([10, 1]), w)).toBe(true);
    expect(inWindow(dayOfDate([12, 31]), w)).toBe(true);
    expect(inWindow(dayOfDate([1, 1]), w)).toBe(true);
    expect(inWindow(dayOfDate([1, 31]), w)).toBe(true);
    expect(inWindow(dayOfDate([2, 1]), w)).toBe(false);
  });

  it('in der Sperrfrist wird trotz Auftrag nichts ausgebracht', () => {
    const g = newGame(1);
    runDays(g, dayOfDate([10, 5]));
    const before = g.digestate.spreadTotal;
    runDays(g, 1, () => [{ type: 'orderSpreading', m3: 2000 }]);
    runDays(g, 30);
    expect(g.digestate.spreadTotal).toBe(before);
    expect(g.digestate.spreadOrderM3).toBeGreaterThan(0);
  });

  it('außerhalb der Sperrfrist wird bei Nachfrage ausgebracht', () => {
    const g = newGame(1);
    runDays(g, 1, () => [{ type: 'orderSpreading', m3: 3000 }]);
    runDays(g, 30);
    expect(g.digestate.spreadTotal).toBeGreaterThan(1000);
  });

  it('das Lager füllt sich kontinuierlich, Regen fließt nur ins offene Lager', () => {
    const open = newGame(3);
    const covered = newGame(3);
    covered.digestate.covered = true;
    const start = open.digestate.m3;
    runDays(open, 60);
    runDays(covered, 60);
    expect(open.digestate.m3).toBeGreaterThan(start);
    const rainDays = open.weather.days.slice(0, 60).filter((d) => d.rainMm > 0).length;
    if (rainDays > 0) expect(open.digestate.m3).toBeGreaterThan(covered.digestate.m3);
  });

  it('volles Lager in der Sperrfrist läuft über und führt zur Stilllegung', () => {
    const g = newGame(1);
    runDays(g, CONFIG.time.runDays);
    expect(g.failure?.kind).toBe('behoerde');
    const overflow = g.log.events.find((e) => e.type === 'digestate_overflow')!;
    expect(inWindow(overflow.day, CONFIG.digestate.blackout)).toBe(true);
  });

  it('abgedecktes Lager fängt Restgas auf statt es zu verlieren', () => {
    const open = newGame(2);
    const covered = newGame(2);
    covered.digestate.covered = true;
    runDays(open, 40);
    runDays(covered, 40);
    expect(covered.totals.ch4LostStorageM3).toBe(0);
    expect(open.totals.ch4LostStorageM3).toBeGreaterThan(0);
  });
});

describe('Felder', () => {
  it('im Frühjahr gesäter Mais wird im Durchlauf nicht geerntet und nur einmal bezahlt', async () => {
    const { createGame } = await import('../src/sim/scenario');
    const g = createGame(1, { id: 'eigene_felder' });
    runDays(g, CONFIG.time.runDays - 1);
    const sown = g.log.events.filter((e) => e.type === 'field_sown');
    const perField = new Map<string, number>();
    for (const e of sown) perField.set(String(e.data.field), (perField.get(String(e.data.field)) ?? 0) + 1);
    for (const n of perField.values()) expect(n).toBeLessThanOrEqual(2);
    expect(g.log.events.filter((e) => e.type === 'field_harvest_done').length).toBe(CONFIG.fields.list.length);
  });
});
