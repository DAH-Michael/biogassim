import { describe, expect, it } from 'vitest';
import { planTrips, tripPosition } from '../src/render/vehicles';
import { loadPalette, mix, hexToRgb } from '../src/render/palette';
import { fitView, project, unproject } from '../src/render/iso';
import { ORIGINS } from '../src/render/layout';
import { CONFIG } from '../src/sim/config';
import { newGame, runDays } from './helpers';

describe('Darstellung ohne DOM', () => {
  it('Projektion lässt sich für den Boden umkehren', () => {
    const v = fitView(1200, 800, 62, 46, 9, 10);
    const [sx, sy] = project(v, 20, 30, 0);
    const [x, y] = unproject(v, sx, sy);
    expect(x).toBeCloseTo(20, 6);
    expect(y).toBeCloseTo(30, 6);
  });

  it('jede Lieferherkunft der Simulation hat eine Route', () => {
    const ids = [...CONFIG.contracts.maizeOffers, ...CONFIG.contracts.ryeOffers, ...CONFIG.contracts.guelleSuppliers].map((o) => o.id);
    for (const id of [...ids, ...CONFIG.fields.list.map((f) => f.id), 'spot', 'reststoff']) expect(ORIGINS[id], id).toBeDefined();
  });

  it('Lieferungen und Gülle werden zu Fahrten, ferne Lieferanten brauchen länger', () => {
    const g = newGame(1);
    runDays(g, 1, () => [{ type: 'signSupply', offerId: 'lw_wendt', tonnes: 1500 }, { type: 'signSupply', offerId: 'ag_heidekamp', tonnes: 5000 }]);
    runDays(g, 60, (s) => (s.today.deliveries.length ? [] : []));
    // Einen Tag mit Lieferungen beider Höfe suchen
    let trips = planTrips(g);
    for (let i = 0; i < 30 && !(g.today.deliveries.some((d) => d.origin === 'lw_wendt') && g.today.deliveries.some((d) => d.origin === 'ag_heidekamp')); i++) {
      runDays(g, 1);
      trips = planTrips(g);
    }
    expect(trips.some((t) => t.kind === 'lkw_guelle')).toBe(true);
    const near = trips.find((t) => t.route[0] === ORIGINS.lw_wendt.route[0]);
    const far = trips.find((t) => t.route[0] === ORIGINS.ag_heidekamp.route[0]);
    if (near && far) expect(far.duration).toBeGreaterThan(near.duration);
  });

  it('Fahrzeuge fahren hin, laden ab und fahren zurück', () => {
    const trip = { kind: 'lkw_silage' as const, route: [[0, 0], [10, 0], [10, 5]] as [number, number][], start: 0, duration: 0.2 };
    expect(tripPosition(trip, 0)!.loaded).toBe(true);
    const mid = tripPosition(trip, 0.1)!;
    expect(mid.x).toBeGreaterThan(0);
    expect(tripPosition(trip, 0.22)!.working).toBe(true);
    expect(tripPosition(trip, 0.4)!.loaded).toBe(false);
    expect(tripPosition(trip, 0.9)).toBeNull();
  });

  it('Palette entsteht nur aus Designsystem-Farben', () => {
    const table: Record<string, string> = { dunkelgruen: '#006532', 'gelb-ink': '#6b6900', k80: '#575656' };
    const p = loadPalette((n) => table[n] ?? '#000000');
    expect(p.dunkelgruen).toEqual(hexToRgb('#006532'));
    expect(p.soil).not.toEqual(p.k80);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([127.5, 127.5, 127.5]);
  });
});
