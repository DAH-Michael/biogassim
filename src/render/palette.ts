/**
 * Farbpalette der Spielfläche. Alle Grundfarben kommen aus dem DAH Designsystem
 * (CSS-Variablen aus src/styles/tokens.css). Fehlende Farben werden ausschließlich
 * durch Mischen von Designsystem-Farben abgeleitet, dokumentiert in docs/farbableitung.md.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb([r, g, b]: Rgb, a = 1): string {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: Rgb, f: number): Rgb {
  return f >= 0 ? mix(c, [255, 255, 255], f) : mix(c, [0, 0, 0], -f);
}

/** Designsystem-Farben, die die Spielfläche nutzt. */
const DS_NAMES = [
  'blau', 'dunkelgruen', 'hellgruen', 'gelb',
  'blau-70', 'blau-50', 'blau-30', 'blau-15',
  'dunkelgruen-70', 'dunkelgruen-50', 'dunkelgruen-30', 'dunkelgruen-15',
  'hellgruen-70', 'hellgruen-50', 'hellgruen-30', 'hellgruen-15',
  'gelb-70', 'gelb-50', 'gelb-30', 'gelb-15',
  'cream', 'ink', 'ink-forest', 'gelb-ink', 'hellgruen-ink', 'white', 'bg-muted',
  'k10', 'k20', 'k40', 'k60', 'k80', 'k100',
  'success', 'warning', 'danger', 'warning-soft',
] as const;
export type DsName = (typeof DS_NAMES)[number];

export type Palette = Record<DsName, Rgb> & Derived;

interface Derived {
  /** Ackerboden: k80 mit gelb-ink, aufgehellt */
  soil: Rgb;
  /** Gärrest: ink mit gelb-ink */
  digestate: Rgb;
  /** Gülle in der Vorgrube */
  slurry: Rgb;
  /** Asphalt: k40 */
  road: Rgb;
  /** Silage am Anschnitt: gelb-50 mit hellgruen-ink */
  silage: Rgb;
  /** Grünroggensilage: hellgruen-70 mit hellgruen-ink */
  silageRye: Rgb;
  /** Silofolie: k80 */
  foil: Rgb;
  /** Beton: k20 */
  concrete: Rgb;
  /** Dach: dunkelgruen-70 mit k60 */
  roof: Rgb;
}

/** Liest die Farben aus den CSS-Variablen; ohne DOM (Tests) aus der übergebenen Tabelle. */
export function loadPalette(read: (name: string) => string): Palette {
  const p = {} as Record<string, Rgb>;
  for (const n of DS_NAMES) {
    let v = read(n).trim();
    const alias = v.match(/^var\(--(.+)\)$/);
    if (alias) v = read(alias[1]).trim();
    p[n] = hexToRgb(v || '#ff00ff');
  }
  const ds = p as Record<DsName, Rgb>;
  const derived: Derived = {
    soil: shade(mix(ds.k80, ds['gelb-ink'], 0.5), 0.25),
    digestate: mix(ds.ink, ds['gelb-ink'], 0.45),
    slurry: mix(ds.k80, ds['gelb-ink'], 0.4),
    road: ds.k40,
    silage: mix(ds['gelb-50'], ds['hellgruen-ink'], 0.25),
    silageRye: mix(ds['hellgruen-70'], ds['hellgruen-ink'], 0.3),
    foil: ds.k80,
    concrete: ds.k20,
    roof: mix(ds['dunkelgruen-70'], ds.k60, 0.35),
  };
  return { ...ds, ...derived };
}

export function paletteFromDocument(): Palette {
  const style = getComputedStyle(document.documentElement);
  return loadPalette((n) => style.getPropertyValue(`--${n}`));
}
