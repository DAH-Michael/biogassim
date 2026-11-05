import { CONFIG } from '../sim/config';
import { formatDate } from '../sim/calendar';
import { measuredTrend } from '../sim/measurement';
import { siloStock } from '../sim/storage';
import { biogasPerHourAtFullLoad } from '../sim/tech';
import type { GameState } from '../sim/types';
import { METRIC_LEVEL_LABEL, METRIC_OPEN_HINT, METRIC_TIPS } from '../content/metrics.de';
import { fmt, h, svg } from './dom';
import { ICONS } from './icons';

/**
 * Kennwertleiste: je Kennwert eine Karte mit eigenem Symbol, Wert und Trendpfeil.
 * Droht ein Wert in einen kritischen Bereich zu laufen, färbt sich die Karte
 * (Warnung gelb, kritisch rot) und zeigt zusätzlich ein Warnsymbol, damit der
 * Zustand nicht nur über Farbe erkennbar ist. Hover zeigt Erklärung und Zustand,
 * Klick öffnet den Verlauf.
 */
export type MetricLevel = 'ok' | 'warn' | 'crit';
interface Status { level: MetricLevel; reason?: string }

interface Metric {
  id: string;
  name: string;
  icon: keyof typeof ICONS;
  value: (s: GameState) => string;
  /** Zahl für den Trend, aus dem Verlauf */
  series?: (s: GameState, i: number) => number;
  /** Zusatz unter dem Wert (z. B. Datum der Probe) */
  note?: (s: GameState) => string | null;
  trend?: (s: GameState) => number | null;
  status: (s: GameState) => Status;
}

const TREND_DAYS = 7;
const TREND_TOLERANCE = 0.02;
const MW = CONFIG.metricWarnings;
const OK: Status = { level: 'ok' };

/** Tagesbedarf an Biogas für Volllast. */
function fullLoadBiogas(s: GameState): number {
  return biogasPerHourAtFullLoad(s.bio.ch4Share) * CONFIG.units.hoursPerDay;
}

/** Reichweite des Silos in Tagen bei der eingestellten Fütterung, null ohne Silagefütterung. */
export function siloDays(s: GameState): number | null {
  const daily = s.feedTarget.mais + s.feedTarget.gruenroggen;
  if (daily <= 0) return null;
  const pending = s.spotOrders.reduce((a, o) => a + o.tonnes, 0);
  return (siloStock(s) + pending) / daily;
}

export const METRICS: Metric[] = [
  {
    id: 'gas', name: 'Gasproduktion', icon: 'flame',
    value: (s) => `${fmt.int(s.gas.producedToday)} m³/Tag`, series: (s, i) => s.history.gasM3[i],
    status: (s) => {
      const share = s.gas.producedToday / fullLoadBiogas(s);
      const reason = `Heute ${fmt.pct(share)} des Bedarfs für Volllast.`;
      if (share < MW.gasShareCrit) return { level: 'crit', reason };
      if (share < MW.gasShareWarn) return { level: 'warn', reason };
      return { level: 'ok', reason };
    },
  },
  {
    id: 'fos', name: 'FOS/TAC', icon: 'flask',
    value: (s) => fmt.dec(s.measurement.fosTac, 2),
    note: (s) => (s.unlocks.includes('labor') ? null : `Probe vom ${formatDate(s.measurement.fosTacDay)}`),
    trend: (s) => (s.unlocks.includes('labor') ? measuredTrend(s) * TREND_DAYS : null),
    status: (s) => {
      const v = s.measurement.fosTac;
      if (v >= CONFIG.biology.fosTacWarning) return { level: 'crit', reason: `Laborwert ${fmt.dec(v, 2)} liegt über der Warnschwelle ${fmt.dec(CONFIG.biology.fosTacWarning, 2)}.` };
      if (v >= MW.fosTacWarn) return { level: 'warn', reason: `Laborwert ${fmt.dec(v, 2)} nähert sich der Warnschwelle ${fmt.dec(CONFIG.biology.fosTacWarning, 2)}.` };
      return OK;
    },
  },
  {
    id: 'temp', name: 'Fermenter', icon: 'thermo',
    value: (s) => `${fmt.dec(s.bio.tempC, 1)} °C`, series: (s, i) => s.history.tempC[i],
    status: (s) => {
      if (s.bio.tempC < MW.tempCritC) return { level: 'crit', reason: 'Der Fermenter ist deutlich zu kalt, die Biologie arbeitet langsamer.' };
      if (s.bio.tempC < MW.tempWarnC) return { level: 'warn', reason: 'Der Fermenter kühlt aus. Die Abwärme des BHKW reicht nicht.' };
      return OK;
    },
  },
  {
    id: 'store', name: 'Gasspeicher', icon: 'dome',
    value: (s) => fmt.pct(s.gas.storedM3 / s.gas.capacityM3), series: (s, i) => s.history.gasStorageShare[i],
    status: (s) => {
      const share = s.gas.storedM3 / s.gas.capacityM3;
      if (s.gas.flaring) return { level: 'crit', reason: 'Der Speicher ist voll, die Fackel brennt.' };
      if (share >= MW.storeHighWarn) return { level: 'warn', reason: 'Fast voll. Kann das BHKW nicht mehr abnehmen, brennt bald die Fackel.' };
      if (share <= MW.storeLowWarn) return { level: 'warn', reason: 'Fast leer. Das BHKW muss drosseln.' };
      return OK;
    },
  },
  {
    id: 'silo', name: 'Silovorrat', icon: 'silo',
    value: (s) => `${fmt.int(siloStock(s))} t`, series: (s, i) => s.history.siloT[i],
    note: (s) => {
      const d = siloDays(s);
      return d === null ? null : d < 1 ? 'leer' : `reicht ${fmt.int(d)} Tage`;
    },
    status: (s) => {
      const d = siloDays(s);
      if (d === null) return { level: 'ok', reason: 'Derzeit wird keine Silage gefüttert.' };
      const reason = d < 1 ? 'Das Silo ist leer. Der Fermenter bekommt keine Silage mehr.' : `Reicht bei der jetzigen Fütterung noch ${fmt.int(d)} Tage.`;
      if (d < MW.siloDaysCrit) return { level: 'crit', reason };
      if (d < MW.siloDaysWarn) return { level: 'warn', reason };
      return { level: 'ok', reason };
    },
  },
  {
    id: 'dig', name: 'Gärrestlager', icon: 'tank',
    value: (s) => fmt.pct(s.digestate.m3 / s.digestate.capacityM3), series: (s, i) => s.history.digestateShare[i],
    status: (s) => {
      const share = s.digestate.m3 / s.digestate.capacityM3;
      if (share >= CONFIG.digestate.highShare) return { level: 'crit', reason: 'Das Lager ist fast voll. Ausbringen oder weniger füttern.' };
      if (share >= MW.digestateWarn) return { level: 'warn', reason: 'Das Lager füllt sich. Rechtzeitig Ausbringung planen, besonders vor der Sperrfrist.' };
      return OK;
    },
  },
  {
    id: 'money', name: 'Kontostand', icon: 'euro',
    value: (s) => fmt.eur(s.finance.balance), series: (s, i) => s.history.balance[i],
    status: (s) => {
      const b = s.finance.balance;
      const F = CONFIG.finance;
      if (b < -F.creditLimitEur * F.bankNoticeShare) return { level: 'crit', reason: `Der Kreditrahmen von ${fmt.eur(F.creditLimitEur)} ist fast ausgeschöpft.` };
      if (b < MW.balanceWarnEur) return { level: 'warn', reason: 'Das Konto ist im Minus, es fallen Zinsen an.' };
      return OK;
    },
  },
  {
    id: 'acc', name: 'Akzeptanz', icon: 'heart',
    value: (s) => `${fmt.int(s.acceptance.value)} von 100`, series: (s, i) => s.history.acceptance[i],
    status: (s) => {
      const v = s.acceptance.value;
      if (v < CONFIG.acceptance.warningLevel) return { level: 'crit', reason: 'Das Dorf ist verärgert. Beschwerden und Auflagen drohen.' };
      if (v < MW.acceptanceWarn) return { level: 'warn', reason: 'Die Stimmung im Dorf kippt.' };
      return OK;
    },
  },
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

interface Cell { root: HTMLElement; value: HTMLElement; note: HTMLElement; trend: HTMLElement; flag: HTMLElement }

export class MetricsBar {
  readonly el: HTMLElement;
  private cells = new Map<string, Cell>();

  constructor(onOpen?: (id: string) => void) {
    this.el = h('aside', { class: 'metrics', 'aria-label': 'Kennwerte' });
    const list = h('ul', { class: 'metrics__list' });
    for (const m of METRICS) {
      const value = h('span', { class: 'metric__value' });
      const trend = h('span', { class: 'metric__trend' });
      const note = h('span', { class: 'metric__note' });
      const flag = h('span', { class: 'metric__flag' }, svg(ICONS.alert));
      const root = h('button', { type: 'button', class: 'metric', 'data-metric': m.id, 'data-level': 'ok', onclick: () => onOpen?.(m.id) },
        h('span', { class: 'metric__icon', 'aria-hidden': 'true' }, svg(ICONS[m.icon])),
        h('span', { class: 'metric__body' },
          h('span', { class: 'metric__head' }, h('span', { class: 'metric__name' }, m.name), flag),
          h('span', { class: 'metric__data' }, value, trend),
          note,
        ),
      );
      list.append(h('li', {}, root));
      this.cells.set(m.id, { root, value, note, trend, flag });
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
      const st = m.status(s);
      c.root.dataset.level = st.level;
      c.flag.hidden = st.level === 'ok';
      c.flag.setAttribute('aria-label', METRIC_LEVEL_LABEL[st.level]);
      c.flag.setAttribute('role', st.level === 'ok' ? 'presentation' : 'img');
      const status = st.level === 'ok' ? st.reason : `${METRIC_LEVEL_LABEL[st.level]}: ${st.reason}`;
      c.root.dataset.tip = [METRIC_TIPS[m.id], status, METRIC_OPEN_HINT].filter(Boolean).join('\n\n');
    }
  }

  /** aktuelle Warnstufe eines Kennwerts (für Tests und Beraterin) */
  level(id: string): MetricLevel {
    return (this.cells.get(id)?.root.dataset.level as MetricLevel | undefined) ?? 'ok';
  }
}
