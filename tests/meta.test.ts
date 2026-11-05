import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/config';
import { createGame } from '../src/sim/scenario';
import { applyAction } from '../src/sim/actions';
import { runDays } from './helpers';
import { UNLOCKS } from '../src/meta/unlocks.config';
import { UNLOCK_KEYS } from '../src/sim/unlockKeys';

describe('Freischaltungen wirken im Spiel', () => {
  it('jede Freischaltung hat einen Auslöser und einen Schlüssel', () => {
    expect(new Set(UNLOCKS.map((u) => u.key))).toEqual(new Set(UNLOCK_KEYS));
  });

  it('eigenes Labor misst täglich', () => {
    const g = createGame(1, { id: 'altanlage' }, ['labor']);
    runDays(g, 10);
    expect(g.measurement.history.length).toBeGreaterThanOrEqual(9);
    const without = createGame(1, { id: 'altanlage' }, []);
    runDays(without, 10);
    expect(without.measurement.history.length).toBeLessThan(4);
  });

  it('größeres Gärrestlager und Wärmeleitung ab Start', () => {
    const g = createGame(1, { id: 'altanlage', largerStorage: true, heatLineAtStart: true }, ['grosses_lager', 'waermeleitung_start']);
    expect(g.digestate.capacityM3).toBe(CONFIG.plant.digestateCapacityM3 + CONFIG.builds.digestateStorage.addM3);
    expect(g.heatLineActive).toBe(true);
  });

  it('Werkzeuge sind ohne Freischaltung gesperrt, mit Freischaltung nutzbar', () => {
    const locked = createGame(1);
    expect(applyAction(locked, { type: 'citizenDialog' }).ok).toBe(false);
    expect(applyAction(locked, { type: 'signOfftake' }).ok).toBe(false);
    expect(applyAction(locked, { type: 'signMaintenanceContract' }).ok).toBe(false);
    const open = createGame(1, { id: 'altanlage' }, ['buergerdialog', 'abnahmevertraege', 'wartungsvertrag']);
    expect(applyAction(open, { type: 'citizenDialog' }).ok).toBe(true);
    expect(applyAction(open, { type: 'signOfftake' }).ok).toBe(true);
    expect(applyAction(open, { type: 'signMaintenanceContract' }).ok).toBe(true);
  });

  it('Abdeckung ist mit Freischaltung günstiger', () => {
    const a = createGame(1);
    const b = createGame(1, { id: 'altanlage' }, ['abdeckung_guenstig']);
    applyAction(a, { type: 'build', kind: 'cover' });
    applyAction(b, { type: 'build', kind: 'cover' });
    expect(b.finance.balance).toBeGreaterThan(a.finance.balance);
  });

  it('Abnahmeverträge nehmen Gärrest auch in der Sperrfrist ab', () => {
    const g = createGame(1, { id: 'altanlage' }, ['abnahmevertraege']);
    applyAction(g, { type: 'signOfftake' });
    runDays(g, 120);
    expect(g.failure).toBeNull();
  });
});
