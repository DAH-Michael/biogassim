import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Prüft, dass außerhalb von config.ts keine Balancing-Zahlen in der Simulation stehen. */
describe('Konfiguration', () => {
  it('Simulationsdateien enthalten keine hart codierten Zahlen außer 0, 1, 2, 10 und 100', () => {
    const dir = join(__dirname, '../src/sim');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'config.ts' && f !== 'rng.ts');
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/'[^']*'|`[^`]*`|"[^"]*"/g, "''");
      for (const m of src.matchAll(/(?<![\w.])(\d+\.?\d*)(?![\w])/g)) {
        if (!['0', '1', '2', '10', '100'].includes(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('jeder Wert in config.ts mit Balancing-Bezug trägt den Prüfvermerk oder eine Einheitenangabe', () => {
    const src = readFileSync(join(__dirname, '../src/sim/config.ts'), 'utf8');
    expect((src.match(/Richtwert, fachlich prüfen/g) ?? []).length).toBeGreaterThan(80);
  });
});
