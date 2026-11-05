import { CONFIG } from '../sim/config';
import { formatDate } from '../sim/calendar';
import { measuredTrend } from '../sim/measurement';
import { siloStock } from '../sim/storage';
import type { GameState } from '../sim/types';
import { fmt, h, svg } from './dom';
import { ICONS } from './icons';

/**
 * Kennwertleiste: nur Name, Wert und Trendpfeil. Keine Erklärungen.
 * Der FOS/TAC zeigt den letzten Laborwert; einen Trend gibt es erst mit eigenem Labor.
 */
interface Metric {
  id: string;
  name: string;
  value: (s: GameState) => string;
  /** Zahl für den Trend, aus dem Verlauf */
  series?: (s: GameState, i: number) => number;
  /** Zusatz unter dem Wert (z. B. Datum der Probe) */
  note?: (s: GameState) => string | null;
  trend?: (s: GameState) => number | null;
}

const TREND_DAYS = 7;
const TREND_TOLERANCE = 0.02;

const METRICS: Metric[] = [
  { id: 'gas', name: 'Gasproduktion', value: (s) => `${fmt.int(s.gas.producedToday)} m³/Tag`, series: (s, i) => s.history.gasM3[i] },
  {
    id: 'fos',
    name: 'FOS/TAC',
    value: (s) => fmt.dec(s.measurement.fosTac, 2),
    note: (s) => (s.unlocks.includes('labor') ? null : `Probe vom ${formatDate(s.measurement.fosTacDay)}`),
    trend: (s) => (s.unlocks.includes('labor') ? measuredTrend(s) * TREND_DAYS : null),
  },
  { id: 'temp', name: 'Fermenter', value: (s) => `${fmt.dec(s.bio.tempC, 1)} °C`, series: (s, i) => s.history.tempC[i] },
  { id: 'store', name: 'Gasspeicher', value: (s) => fmt.pct(s.gas.storedM3 / s.gas.capacityM3), series: (s, i) => s.history.gasStorageShare[i] },
  { id: 'silo', name: 'Silovorrat', value: (s) => `${fmt.int(siloStock(s))} t`, series: (s, i) => s.history.siloT[i] },
  { id: 'dig', name: 'Gärrestlager', value: (s) => fmt.pct(s.digestate.m3 / s.digestate.capacityM3), series: (s, i) => s.history.digestateShare[i] },
  { id: 'money', name: 'Kontostand', value: (s) => fmt.eur(s.finance.balance), series: (s, i) => s.history.balance[i] },
  { id: 'acc', name: 'Akzeptanz', value: (s) => `${fmt.int(s.acceptance.value)} von 100`, series: (s, i) => s.history.acceptance[i] },
];

function seriesTrend(s: GameState, m: Metric): number | null {
  if (!m.series) return null;
  const n = s.history.day.length;
  if (n < 2) return null;
  const a = m.series(s, Math.max(0, n - 1 - TREND_DAYS));
  const b = m.series(s, n - 1);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return (b - a) / scale;
}

export class MetricsBar {
  readonly el: HTMLElement;
  private cells = new Map<string, { value: HTMLElement; note: HTMLElement; trend: HTMLElement }>();

  constructor() {
    this.el = h('aside', { class: 'metrics', 'aria-label': 'Kennwerte' });
    const list = h('dl', { class: 'metrics__list' });
    for (const m of METRICS) {
      const value = h('span', { class: 'metric__value' });
      const trend = h('span', { class: 'metric__trend' });
      const note = h('span', { class: 'metric__note' });
      list.append(h('div', { class: 'metric', 'data-metric': m.id }, h('dt', { class: 'metric__name' }, m.name), h('dd', { class: 'metric__data' }, value, trend, note)));
      this.cells.set(m.id, { value, note, trend });
    }
    this.el.append(list);
  }

  update(s: GameState): void {
    for (const m of METRICS) {
      const c = this.cells.get(m.id)!;
      c.value.textContent = m.value(s);
      const note = m.note?.(s) ?? null;
      c.note.textContent = note ?? '';
      c.note.hidden = !note;
      const t = m.trend ? m.trend(s) : seriesTrend(s, m);
      c.trend.replaceChildren();
      if (t !== null) {
        const dir = Math.abs(t) < (m.id === 'fos' ? CONFIG.biology.measurement.lab.noise : TREND_TOLERANCE) ? 'flat' : t > 0 ? 'up' : 'down';
        const label = dir === 'flat' ? 'gleichbleibend' : dir === 'up' ? 'steigend' : 'fallend';
        c.trend.append(svg(ICONS[dir], label));
        c.trend.dataset.dir = dir;
      }
    }
  }
}
