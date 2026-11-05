import { CONFIG } from '../sim/config';
import { dateOfDay, formatDate, MONTH_NAMES, windowDays } from '../sim/calendar';
import { mainPath, type SimEvent } from '../sim/eventlog';
import { describeEvent } from '../content/events.de';
import type { GameState } from '../sim/types';
import { fmt, h } from './dom';

/**
 * Verläufe über das Jahr als kleine Einzeldiagramme mit gemeinsamer Zeitachse.
 * Jede Grafik hat eine Achse und eine Größe. Darüber liegt eine Ereignisleiste;
 * Formen unterscheiden Entscheidungen (Kreis), Warnungen (Dreieck) und kritische
 * Ereignisse (Quadrat). Hover, Fokus oder Antippen zeigen Details.
 */
const NS = 'http://www.w3.org/2000/svg';
const W = 800;
const PAD_L = 64;
const PAD_R = 16;
const CHART_H = 112;
const PAD_T = 12;
const PAD_B = 22;
const STRIP_LANE = 16;
const STRIP_LANES = 4;
const MARKER_GAP = 13;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

interface SeriesDef {
  title: string;
  values: (s: GameState) => number[];
  format: (v: number) => string;
  /** Zusätzliche Punkte (z. B. Laborwerte) */
  dots?: (s: GameState) => { day: number; value: number }[];
  dotsLabel?: string;
  lineLabel?: string;
  ref?: { value: number; label: string };
  band?: { from: number; to: number; label: string };
  min?: number;
  /** Mindestspanne der Achse, damit kleine Schwankungen nicht übertrieben wirken */
  minSpan?: number;
}

function blackoutBand() {
  const w = windowDays(CONFIG.digestate.blackout);
  return { from: w.start, to: w.end, label: 'Sperrfrist' };
}

const SERIES: SeriesDef[] = [
  { title: 'Gasproduktion', values: (s) => s.history.gasM3, format: (v) => `${fmt.int(v)} m³/Tag`, min: 0 },
  {
    title: 'FOS/TAC', values: (s) => s.history.fosTacTrue, format: (v) => fmt.dec(v, 2), min: 0,
    lineLabel: 'im Fermenter', dots: (s) => s.measurement.history, dotsLabel: 'Laborwert',
    ref: { value: CONFIG.biology.fosTacWarning, label: 'Warnschwelle' },
  },
  { title: 'Fermentertemperatur', values: (s) => s.history.tempC, format: (v) => `${fmt.dec(v, 1)} °C`, minSpan: 15 },
  { title: 'Silovorrat', values: (s) => s.history.siloT, format: (v) => `${fmt.int(v)} t`, min: 0 },
  {
    title: 'Gärrestlager', values: (s) => s.history.digestateShare, format: (v) => fmt.pct(v), min: 0,
    ref: { value: 1, label: 'voll' }, band: blackoutBand(),
  },
  { title: 'Kontostand', values: (s) => s.history.balance, format: (v) => fmt.eur(v), ref: { value: -CONFIG.finance.creditLimitEur, label: 'Kreditrahmen' } },
  { title: 'Akzeptanz', values: (s) => s.history.acceptance, format: (v) => `${fmt.int(v)} von 100`, min: 0, ref: { value: CONFIG.acceptance.criticalLevel, label: 'kritisch' } },
];
const xOf = (day: number, days: number) => PAD_L + (day / Math.max(1, days - 1)) * (W - PAD_L - PAD_R);

function niceTicks(min: number, max: number, n = 3): number[] {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/** Ereignisse, die in der Leiste erscheinen. */
function timelineEvents(s: GameState): { ev: SimEvent; kind: 'decision' | 'warning' | 'critical'; chain: boolean }[] {
  const chain = new Set(s.failure ? mainPath(s.log, s.failure.eventId).map((e) => e.id) : []);
  const skip = new Set(['month_settled', 'chp_restart', 'fos_tac_normal', 'year_completed', 'service_ordered']);
  return s.log.events
    .filter((e) => !skip.has(e.type) && !e.type.startsWith('origin_') && (e.playerDecision || e.severity !== 'info' || chain.has(e.id)))
    .map((ev) => ({ ev, kind: ev.playerDecision ? 'decision' as const : ev.severity === 'warning' ? 'warning' as const : ev.severity === 'info' ? 'warning' as const : 'critical' as const, chain: chain.has(ev.id) }));
}

export function buildTimeline(s: GameState): HTMLElement {
  const days = Math.max(2, s.history.day.length);
  const wrap = h('div', { class: 'timeline' });
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const guides: SVGLineElement[] = [];

  const showTip = (x: number, y: number, title: string, body: string) => {
    tip.replaceChildren(h('strong', {}, title), h('span', {}, body));
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - r.left + 12), r.width - 260);
    tip.style.left = `${left}px`;
    tip.style.top = `${y - r.top + 12}px`;
  };
  const hideTip = () => {
    tip.hidden = true;
  };
  const setGuide = (day: number | null) => {
    for (const g of guides) {
      if (day === null) g.setAttribute('visibility', 'hidden');
      else {
        const x = xOf(day, days);
        g.setAttribute('x1', String(x));
        g.setAttribute('x2', String(x));
        g.setAttribute('visibility', 'visible');
      }
    }
  };

  // Ereignisleiste
  // Marken auf Spuren verteilen, damit dicht liegende Ereignisse sich nicht überdecken
  const items = timelineEvents(s);
  const laneEnd: number[] = [];
  const placed = items.map((it) => {
    const x = xOf(Math.min(it.ev.day, days - 1), days);
    let lane = laneEnd.findIndex((end) => x - end >= MARKER_GAP);
    if (lane < 0) lane = laneEnd.length < STRIP_LANES ? laneEnd.length : laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = x;
    return { ...it, x, lane };
  });
  const lanes = Math.max(1, Math.min(STRIP_LANES, laneEnd.length));
  const stripH = lanes * STRIP_LANE + 8;
  const strip = el('svg', { viewBox: `0 0 ${W} ${stripH}`, class: 'timeline__strip', role: 'list', 'aria-label': 'Ereignisse und Entscheidungen' });
  for (let l = 0; l < lanes; l++) strip.append(el('line', { x1: PAD_L, x2: W - PAD_R, y1: 4 + STRIP_LANE * (l + 0.5), y2: 4 + STRIP_LANE * (l + 0.5), class: 'grid' }));
  const label = el('text', { x: 0, y: stripH / 2 + 4, class: 'chart__axis-label' });
  label.textContent = 'Ereignisse';
  strip.append(label);
  for (const { ev, kind, chain, x, lane } of placed) {
    const y = 4 + STRIP_LANE * (lane + 0.5);
    const r = chain ? 6 : 4.5;
    let shape: SVGElement;
    if (kind === 'decision') shape = el('circle', { cx: x, cy: y, r });
    else if (kind === 'warning') shape = el('path', { d: `M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z` });
    else shape = el('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r });
    shape.setAttribute('class', `marker marker--${kind}${chain ? ' marker--chain' : ''}`);
    const t = describeEvent(ev);
    const g = el('g', { tabindex: 0, role: 'listitem', 'aria-label': `${formatDate(ev.day)}: ${t.title}${ev.playerDecision ? ', Ihre Entscheidung' : ''}` });
    // größere Trefferfläche
    g.append(el('circle', { cx: x, cy: y, r: 12, class: 'marker__hit' }), shape);
    const show = (e: { clientX: number; clientY: number }) => {
      showTip(e.clientX, e.clientY, `${formatDate(ev.day)}: ${t.title}`, t.text);
      setGuide(ev.day);
    };
    g.addEventListener('pointerenter', show);
    g.addEventListener('pointerdown', show);
    g.addEventListener('pointerleave', () => { hideTip(); setGuide(null); });
    g.addEventListener('focus', () => {
      const b = g.getBoundingClientRect();
      show({ clientX: b.left + b.width / 2, clientY: b.bottom });
    });
    g.addEventListener('blur', () => { hideTip(); setGuide(null); });
    strip.append(g);
  }
  wrap.append(h('div', { class: 'timeline__legend' },
    h('span', { class: 'legend-item' }, legendShape('decision'), 'Ihre Entscheidung'),
    h('span', { class: 'legend-item' }, legendShape('warning'), 'Warnung'),
    h('span', { class: 'legend-item' }, legendShape('critical'), 'kritisch'),
    s.failure ? h('span', { class: 'legend-item' }, legendShape('chain'), 'Teil der Kausalkette') : null,
  ), strip);

  // Einzeldiagramme
  for (const def of SERIES) {
    const vals = def.values(s);
    if (!vals.length) continue;
    const dots = def.dots?.(s) ?? [];
    let min = Math.min(...vals, ...dots.map((d) => d.value));
    let max = Math.max(...vals, ...dots.map((d) => d.value));
    if (def.min !== undefined) min = Math.min(min, def.min);
    // Grenzwerte liegen immer im sichtbaren Bereich, damit der Abstand dazu lesbar ist
    if (def.ref) {
      min = Math.min(min, def.ref.value);
      max = Math.max(max, def.ref.value);
    }
    if (def.minSpan && max - min < def.minSpan) min = max - def.minSpan;
    if (max - min < 1e-9) max = min + 1;
    const ticks = niceTicks(min, max);
    min = Math.min(min, ticks[0]);
    max = Math.max(max, ticks[ticks.length - 1]);
    const yOf = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (CHART_H - PAD_T - PAD_B);

    const svgEl = el('svg', { viewBox: `0 0 ${W} ${CHART_H}`, class: 'chart', role: 'img', 'aria-label': `${def.title} über das Jahr` });
    if (def.band) {
      const x1 = xOf(def.band.from, days);
      const x2 = xOf(Math.min(def.band.to, days - 1), days);
      if (def.band.from < days) {
        svgEl.append(el('rect', { x: x1, y: PAD_T, width: Math.max(0, x2 - x1), height: CHART_H - PAD_T - PAD_B, class: 'chart__band' }));
        const bl = el('text', { x: x1 + 4, y: PAD_T + 11, class: 'chart__ref-label' });
        bl.textContent = def.band.label;
        svgEl.append(bl);
      }
    }
    for (const t of ticks) {
      svgEl.append(el('line', { x1: PAD_L, x2: W - PAD_R, y1: yOf(t), y2: yOf(t), class: 'grid' }));
      const tl = el('text', { x: PAD_L - 6, y: yOf(t) + 4, class: 'chart__tick', 'text-anchor': 'end' });
      tl.textContent = def.format(t).replace(' von 100', '');
      svgEl.append(tl);
    }
    // Monatsachse
    for (let d = 0; d < days; d++) {
      if (dateOfDay(d).dayOfMonth !== 1) continue;
      const x = xOf(d, days);
      svgEl.append(el('line', { x1: x, x2: x, y1: CHART_H - PAD_B, y2: CHART_H - PAD_B + 4, class: 'axis' }));
      const ml = el('text', { x: x + 2, y: CHART_H - 6, class: 'chart__tick' });
      ml.textContent = MONTH_NAMES[dateOfDay(d).month - 1].slice(0, 3);
      svgEl.append(ml);
    }
    if (def.ref) {
      const y = yOf(def.ref.value);
      svgEl.append(el('line', { x1: PAD_L, x2: W - PAD_R, y1: y, y2: y, class: 'chart__ref' }));
      const rl = el('text', { x: W - PAD_R - 4, y: y - 4, class: 'chart__ref-label', 'text-anchor': 'end' });
      rl.textContent = def.ref.label;
      svgEl.append(rl);
    }
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${xOf(i, days).toFixed(1)},${yOf(v).toFixed(1)}`).join('');
    svgEl.append(el('path', { d, class: 'chart__line' }));
    for (const p of dots) if (p.day < days) svgEl.append(el('circle', { cx: xOf(p.day, days), cy: yOf(p.value), r: 3, class: 'chart__dot' }));
    const guide = el('line', { y1: PAD_T, y2: CHART_H - PAD_B, class: 'chart__guide', visibility: 'hidden' });
    guides.push(guide);
    svgEl.append(guide);
    const hover = el('circle', { r: 4, class: 'chart__hover', visibility: 'hidden' });
    svgEl.append(hover);

    svgEl.addEventListener('pointermove', (e) => {
      const r = svgEl.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      const day = Math.round(((vx - PAD_L) / (W - PAD_L - PAD_R)) * (days - 1));
      if (day < 0 || day >= vals.length) return;
      hover.setAttribute('cx', String(xOf(day, days)));
      hover.setAttribute('cy', String(yOf(vals[day])));
      hover.setAttribute('visibility', 'visible');
      setGuide(day);
      showTip(e.clientX, e.clientY, formatDate(day), `${def.title}: ${def.format(vals[day])}`);
    });
    svgEl.addEventListener('pointerleave', () => {
      hover.setAttribute('visibility', 'hidden');
      setGuide(null);
      hideTip();
    });

    const head = h('div', { class: 'chart__head' }, h('h4', {}, def.title));
    if (def.dots) {
      head.append(h('span', { class: 'legend-item' }, h('span', { class: 'swatch swatch--line' }), def.lineLabel ?? ''), h('span', { class: 'legend-item' }, h('span', { class: 'swatch swatch--dot' }), def.dotsLabel ?? ''));
    }
    wrap.append(h('div', { class: 'chart-wrap' }, head, svgEl));
  }
  wrap.append(tip, tableView(s));
  return wrap;
}

function legendShape(kind: 'decision' | 'warning' | 'critical' | 'chain'): SVGElement {
  const s = el('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' });
  if (kind === 'decision') s.append(el('circle', { cx: 8, cy: 8, r: 5, class: 'marker marker--decision' }));
  else if (kind === 'warning') s.append(el('path', { d: 'M8,2 L14,13 L2,13 Z', class: 'marker marker--warning' }));
  else if (kind === 'critical') s.append(el('rect', { x: 3, y: 3, width: 10, height: 10, class: 'marker marker--critical' }));
  else s.append(el('circle', { cx: 8, cy: 8, r: 5, class: 'marker marker--decision marker--chain' }));
  return s;
}

/** Tabellenansicht: Werte am Monatsende. */
function tableView(s: GameState): HTMLElement {
  const days = s.history.day.length;
  const rows: HTMLElement[] = [];
  for (let i = 0; i < days; i++) {
    const last = i === days - 1 || dateOfDay(i + 1).month !== dateOfDay(i).month;
    if (!last) continue;
    rows.push(h('tr', {}, h('th', { scope: 'row' }, formatDate(i)), ...SERIES.map((d) => h('td', {}, d.format(d.values(s)[i])))));
  }
  return h('details', { class: 'table-view' },
    h('summary', {}, 'Als Tabelle'),
    h('div', { class: 'table-scroll' },
      h('table', {}, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Tag'), ...SERIES.map((d) => h('th', { scope: 'col' }, d.title)))), h('tbody', {}, ...rows))),
  );
}
