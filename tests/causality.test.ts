import { describe, expect, it } from 'vitest';
import { causalClosure, findEvent, mainPath, triggerAndRoot } from '../src/sim/eventlog';
import { runStrategy, newGame, runDays } from './helpers';
import type { GameState } from '../src/sim/types';

function chainTypes(g: GameState): string[] {
  return mainPath(g.log, g.failure!.eventId).map((e) => e.type);
}

describe('Kausalketten', () => {
  it('jede Ursache verweist auf ein früheres oder gleichzeitiges Ereignis', () => {
    for (const name of ['naiv', 'nur_mais', 'ausgewogen', 'wartung_aufschieben', 'dauerfackel']) {
      const g = runStrategy(name, 2);
      for (const e of g.log.events) {
        for (const c of e.causes) {
          const ce = findEvent(g.log, c);
          expect(ce, `${e.type} verweist auf unbekanntes ${c}`).toBeDefined();
          expect(ce!.day).toBeLessThanOrEqual(e.day);
          expect(Number(c.slice(1))).toBeLessThan(Number(e.id.slice(1)));
        }
      }
    }
  });

  it('jedes Scheitern hat eine Kette mit Auslöser und davon verschiedener Ursache', () => {
    for (const name of ['naiv', 'nur_mais', 'wartung_aufschieben', 'ueberfuettern', 'dauerfackel', 'nur_guelle']) {
      const g = runStrategy(name, 1);
      expect(g.failure, name).not.toBeNull();
      const { trigger, root } = triggerAndRoot(g.log, g.failure!.eventId);
      expect(trigger, name).toBeDefined();
      expect(root, name).toBeDefined();
      expect(root!.causes).toHaveLength(0);
      expect(root!.day).toBeLessThan(g.failure!.day);
    }
  });

  it('übergelaufenes Lager ohne Ausbringung führt zurück auf die Ausbringung vor der Sperrfrist', () => {
    const g = newGame(1);
    runDays(g, 365);
    const types = chainTypes(g);
    expect(types).toContain('digestate_overflow');
    expect(types).toContain('blackout_start_high');
    expect(types[types.length - 1]).toBe('spreading_before_blackout');
  });

  it('reiner Mais: Versäuerung führt über den Spurenelementmangel auf die Fütterungsentscheidung', () => {
    const g = runStrategy('nur_mais', 1);
    expect(g.failure?.kind).toBe('biologie');
    const path = mainPath(g.log, g.failure!.eventId);
    expect(path.map((e) => e.type)).toContain('trace_deficit');
    const root = path[path.length - 1];
    expect(root.type).toBe('feeding_changed');
    expect(root.playerDecision).toBe(true);
  });

  it('Überfütterung: FOS/TAC-Anstieg verweist auf den Belastungssprung und die Entscheidung', () => {
    const g = runStrategy('ueberfuettern', 1);
    expect(g.failure?.kind).toBe('biologie');
    const closure = causalClosure(g.log, g.failure!.eventId).map((e) => e.type);
    expect(closure).toContain('load_jump');
    expect(closure).toContain('feeding_changed');
  });

  it('aufgeschobene Wartung: Totalschaden geht auf Wartungsstau oder Entschwefelung zurück', () => {
    const g = runStrategy('wartung_aufschieben', 1);
    expect(g.failure?.kind).toBe('technik');
    const closure = causalClosure(g.log, g.failure!.eventId).map((e) => e.type);
    expect(closure.some((t) => t === 'service_overdue' || t === 'desulf_empty')).toBe(true);
  });

  it('Spielerentscheidungen sind als solche markiert', () => {
    const g = newGame(1);
    runDays(g, 1, () => [{ type: 'setFeeding', feed: { mais: 20 } }, { type: 'hire', role: 'biologin' }]);
    const decisions = g.log.events.filter((e) => e.playerDecision);
    expect(decisions.map((e) => e.type)).toEqual(expect.arrayContaining(['feeding_changed', 'staff_hired']));
  });
});
