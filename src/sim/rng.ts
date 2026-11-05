/**
 * Geseedeter Zufallsgenerator (mulberry32). Der Zustand ist eine einzige Zahl
 * und damit im Spielstand serialisierbar. Getrennte Ströme sorgen dafür, dass
 * zum Beispiel das Wetter bei gleichem Seed gleich bleibt, egal was der Spieler tut.
 */
export interface RngState { s: number }

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Leitet aus einem Seed und einem Namen einen unabhängigen Strom ab. */
export function deriveRng(seed: number, stream: string): RngState {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < stream.length; i++) {
    h = Math.imul(h ^ stream.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return { s: h >>> 0 };
}

/** Gleichverteilt in [0, 1). */
export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: RngState, min: number, max: number): number {
  return min + (max - min) * next(r);
}

export function intRange(r: RngState, min: number, max: number): number {
  return Math.floor(range(r, min, max + 1));
}

export function chance(r: RngState, p: number): boolean {
  return next(r) < p;
}

/** Standardnormalverteilt (Box-Muller). */
export function gaussian(r: RngState): number {
  const u = Math.max(next(r), Number.EPSILON);
  const v = next(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lognormal mit Mittelwert 1 und gegebener Streuung des Logarithmus. */
export function lognormalMean1(r: RngState, sigma: number): number {
  return Math.exp(sigma * gaussian(r) - (sigma * sigma) / 2);
}
