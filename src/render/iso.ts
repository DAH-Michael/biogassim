/**
 * Isometrische Projektion. Weltkoordinaten: x nach Osten, y nach Süden, z nach oben,
 * Einheit etwa 10 m. Auf dem Bildschirm liegt größeres x + y weiter unten (näher).
 */
export interface View {
  scale: number;
  ox: number;
  oy: number;
}

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

export function project(v: View, x: number, y: number, z = 0): [number, number] {
  return [v.ox + (x - y) * COS * v.scale, v.oy + ((x + y) * SIN - z) * v.scale];
}

/** Passt die Welt (Breite W, Tiefe H, maximale Höhe Z) in die Zeichenfläche ein. */
export function fitView(width: number, height: number, W: number, H: number, Z: number, pad: number): View {
  const minX = -H * COS;
  const maxX = W * COS;
  const minY = -Z;
  const maxY = (W + H) * SIN;
  const scale = Math.min((width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxY - minY));
  const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
  return { scale, ox, oy };
}

/** Bildschirmpunkt zurück auf den Boden (z = 0), z. B. für Antippen. */
export function unproject(v: View, sx: number, sy: number): [number, number] {
  const a = (sx - v.ox) / (COS * v.scale);
  const b = (sy - v.oy) / (SIN * v.scale);
  return [(a + b) / 2, (b - a) / 2];
}
