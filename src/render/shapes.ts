import { project, type View } from './iso';
import { rgb, shade, type Rgb } from './palette';

/**
 * Grundformen in isometrischer Ansicht: Flächen, Quader, Zylinder, Kuppeln,
 * Symbole. Alles flach und mit wenigen Farben.
 */
export type P3 = [number, number, number];

export class Draw {
  constructor(public ctx: CanvasRenderingContext2D, public v: View) {}

  path(points: P3[]): void {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y, z], i) => {
      const [sx, sy] = project(this.v, x, y, z);
      if (i === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    });
    c.closePath();
  }

  poly(points: P3[], fill: Rgb | null, stroke?: Rgb, lineWidth = 1, alpha = 1): void {
    this.path(points);
    if (fill) {
      this.ctx.fillStyle = rgb(fill, alpha);
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = rgb(stroke, alpha);
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  line(a: P3, b: P3, color: Rgb, width: number, alpha = 1, dash?: number[]): void {
    const c = this.ctx;
    const [ax, ay] = project(this.v, ...a);
    const [bx, by] = project(this.v, ...b);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.strokeStyle = rgb(color, alpha);
    c.lineWidth = width;
    c.setLineDash(dash ?? []);
    c.stroke();
    c.setLineDash([]);
  }

  /** Parallele Linien in x-Richtung als ein Pfad (Feldstruktur). */
  rows(x: number, y: number, w: number, d: number, offset: number, gap: number, z: number, color: Rgb, width: number, alpha = 1, dash?: number[]): void {
    const c = this.ctx;
    c.beginPath();
    for (let yy = y + offset; yy < y + d; yy += gap) {
      const [ax, ay] = project(this.v, x, yy, z);
      const [bx, by] = project(this.v, x + w, yy, z);
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
    }
    c.strokeStyle = rgb(color, alpha);
    c.lineWidth = width;
    c.setLineDash(dash ?? []);
    c.stroke();
    c.setLineDash([]);
  }

  /** Rechteck auf dem Boden (oder in Höhe z). */
  rect(x: number, y: number, w: number, d: number, z: number, fill: Rgb, stroke?: Rgb, alpha = 1): void {
    this.poly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], fill, stroke, 1, alpha);
  }

  /** Quader mit drei sichtbaren Flächen. */
  box(x: number, y: number, w: number, d: number, h: number, color: Rgb, z = 0, top?: Rgb): void {
    const z1 = z + h;
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z1], [x, y + d, z1]], shade(color, -0.12));
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z1], [x + w, y, z1]], shade(color, -0.25));
    this.poly([[x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1]], top ?? color);
  }

  /** Satteldach über einem Quader (First in x-Richtung). */
  gableRoof(x: number, y: number, w: number, d: number, z: number, rise: number, color: Rgb): void {
    const ridge = y + d / 2;
    this.poly([[x, ridge, z + rise], [x + w, ridge, z + rise], [x + w, y + d, z], [x, y + d, z]], shade(color, -0.05));
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, ridge, z + rise]], shade(color, -0.3));
    this.poly([[x, y, z], [x + w, y, z], [x + w, ridge, z + rise], [x, ridge, z + rise]], shade(color, 0.12));
  }

  ellipsePoints(cx: number, cy: number, r: number, z: number, from = 0, to = Math.PI * 2, n = 32): P3[] {
    const pts: P3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
    return pts;
  }

  disc(cx: number, cy: number, r: number, z: number, fill: Rgb | null, stroke?: Rgb, alpha = 1, lineWidth = 1): void {
    this.poly(this.ellipsePoints(cx, cy, r, z), fill, stroke, lineWidth, alpha);
  }

  /** Zylinder: Mantel (vordere Hälfte) und Deckel. */
  cylinder(cx: number, cy: number, r: number, h: number, side: Rgb, top: Rgb | null, z = 0): void {
    const front = this.ellipsePoints(cx, cy, r, z, -Math.PI / 4, (Math.PI * 3) / 4);
    const upper = this.ellipsePoints(cx, cy, r, z + h, -Math.PI / 4, (Math.PI * 3) / 4).reverse();
    this.path([...front, ...upper]);
    const c = this.ctx;
    const [x0, y0] = project(this.v, cx - r * Math.SQRT1_2, cy + r * Math.SQRT1_2, z);
    const [x1, y1] = project(this.v, cx + r * Math.SQRT1_2, cy - r * Math.SQRT1_2, z);
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgb(shade(side, -0.05)));
    g.addColorStop(1, rgb(shade(side, -0.3)));
    c.fillStyle = g;
    c.fill();
    if (top) this.disc(cx, cy, r, z + h, top);
  }

  /** Kuppel aus gestapelten Ringen (Gashaube). */
  dome(cx: number, cy: number, r: number, z: number, height: number, color: Rgb, rings = 10): void {
    for (let i = 0; i <= rings; i++) {
      const phi = (i / rings) * (Math.PI / 2);
      const rr = r * Math.cos(phi);
      const zz = z + height * Math.sin(phi);
      this.disc(cx, cy, Math.max(rr, 0.05), zz, shade(color, -0.18 + 0.2 * (i / rings)));
    }
  }

  /** Warndreieck (Symbol, nicht nur Farbe). */
  warning(x: number, y: number, z: number, size: number, fill: Rgb, ink: Rgb): void {
    const [sx, sy] = project(this.v, x, y, z);
    const s = size * this.v.scale;
    const c = this.ctx;
    c.beginPath();
    c.moveTo(sx, sy - s);
    c.lineTo(sx + s * 0.95, sy + s * 0.7);
    c.lineTo(sx - s * 0.95, sy + s * 0.7);
    c.closePath();
    c.fillStyle = rgb(fill);
    c.fill();
    c.strokeStyle = rgb(ink);
    c.lineWidth = Math.max(1, s * 0.12);
    c.stroke();
    c.fillStyle = rgb(ink);
    c.fillRect(sx - s * 0.07, sy - s * 0.45, s * 0.14, s * 0.6);
    c.fillRect(sx - s * 0.07, sy + s * 0.25, s * 0.14, s * 0.14);
  }

  /** Schraubenschlüssel-Symbol (Wartung), stark vereinfacht. */
  wrench(x: number, y: number, z: number, size: number, color: Rgb, t: number): void {
    const [sx, sy] = project(this.v, x, y, z);
    const s = size * this.v.scale;
    const c = this.ctx;
    c.save();
    c.translate(sx, sy);
    c.rotate(-0.6 + 0.25 * Math.sin(t * 4));
    c.strokeStyle = rgb(color);
    c.lineWidth = s * 0.28;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-s * 0.7, 0);
    c.lineTo(s * 0.4, 0);
    c.stroke();
    c.beginPath();
    c.arc(s * 0.6, 0, s * 0.32, -2.3, 2.3);
    c.stroke();
    c.restore();
  }

  /** Geruchssymbol: drei aufsteigende Wellenlinien. */
  smell(x: number, y: number, z: number, size: number, color: Rgb, t: number, alpha = 1): void {
    const c = this.ctx;
    const s = size * this.v.scale;
    c.strokeStyle = rgb(color, alpha);
    c.lineWidth = Math.max(1, s * 0.12);
    c.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const [sx, sy] = project(this.v, x, y, z);
      const ox = sx + k * s * 0.45;
      const rise = ((t * 0.6 + k * 0.3) % 1) * s * 0.4;
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const yy = sy - i * (s / 12) - rise;
        const xx = ox + Math.sin(i * 0.9 + t * 3) * s * 0.12;
        if (i === 0) c.moveTo(xx, yy);
        else c.lineTo(xx, yy);
      }
      c.stroke();
    }
  }

  /** Schallsymbol: Bögen, die im Takt pulsieren (Laufgeräusch). */
  sound(x: number, y: number, z: number, size: number, color: Rgb, t: number): void {
    const [sx, sy] = project(this.v, x, y, z);
    const s = size * this.v.scale;
    const c = this.ctx;
    c.lineWidth = Math.max(1, s * 0.1);
    for (let i = 1; i <= 3; i++) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i));
      c.strokeStyle = rgb(color, a);
      c.beginPath();
      c.arc(sx, sy, s * 0.3 * i, -0.6, 0.6);
      c.stroke();
    }
  }

  puff(x: number, y: number, z: number, r: number, color: Rgb, alpha: number): void {
    const [sx, sy] = project(this.v, x, y, z);
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, r * this.v.scale, 0, Math.PI * 2);
    this.ctx.fillStyle = rgb(color, alpha);
    this.ctx.fill();
  }
}
