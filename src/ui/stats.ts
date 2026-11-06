import { CONFIG } from '../sim/config';
import { formatDate } from '../sim/calendar';
import { yearSummary } from '../sim/rating';
import type { GameState } from '../sim/types';
import { buildTimeline } from './charts';
import { fmt, h } from './dom';

/**
 * Statistik während des Durchlaufs: Kennzahlen bis heute und die Verläufe seit dem 1. August.
 * Zeigt nur, was auch der Betreiber wissen kann (Laborwerte statt wahrem FOS/TAC).
 * Das Spiel ist pausiert, solange die Ansicht offen ist.
 */
export interface StatsOptions {
  plantName: string | null;
  onClose: () => void;
  /** Kennwert, zu dessen Grafik gesprungen wird */
  focus?: string;
}

export function buildStats(s: GameState, o: StatsOptions): HTMLElement {
  const y = yearSummary(s);
  const day = Math.max(0, Math.min(s.day - 1, CONFIG.time.runDays - 1));
  const delta = s.finance.balance - CONFIG.finance.startBalanceEur;
  const rows: [string, string][] = [
    ['Tage gespielt', `${fmt.int(s.history.day.length)} von ${fmt.int(CONFIG.time.runDays)}`],
    ['Strom erzeugt', `${fmt.int(y.kwhEl / 1000)} MWh`],
    ['Kontostand seit Übernahme', `${delta >= 0 ? '+' : ''}${fmt.eur(delta)}`],
    ['Akzeptanz im Mittel', `${fmt.int(y.acceptanceAvg)} von 100`],
    ['Gasverluste und Emissionen', `${fmt.dec(y.gasLossShare * 100, 1)} %`],
    ['Maisanteil an der Masse', `${fmt.pct(y.maizeShare)} (Deckel ${fmt.pct(CONFIG.maizeCap.maxShare)})`],
  ];
  const close = h('button', { type: 'button', class: 'btn btn--primary', 'data-tip': 'Ansicht schließen und weiterspielen. Die Zeit läuft im vorherigen Tempo weiter.', onclick: o.onClose }, 'Zurück zum Spiel');
  const view = h('div', { class: 'analysis stats' },
    h('header', { class: 'analysis__head' },
      h('p', { class: 'eyebrow' }, `${o.plantName ?? 'Ihre Anlage'}, Stand ${formatDate(day)}`),
      h('h2', { id: 'stats-title' }, 'Statistik'),
      h('p', { class: 'analysis__sentence' }, 'Kennzahlen und Verläufe seit der Übernahme am 1. August. Beim FOS/TAC sehen Sie, was das Labor gemessen hat.'),
      h('div', { class: 'row' }, close),
    ),
    h('dl', { class: 'figures' }, ...rows.map(([k, v]) => h('div', { class: 'figure' }, h('dt', {}, k), h('dd', {}, v)))),
    buildTimeline(s, { live: true }),
  );
  if (o.focus) {
    requestAnimationFrame(() => {
      const target = view.querySelector(`[data-series="${CSS.escape(o.focus!)}"]`) as HTMLElement | null;
      if (!target) return;
      target.classList.add('chart-wrap--focus');
      target.scrollIntoView({ block: 'center' });
    });
  }
  return view;
}
