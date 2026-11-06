import { CONFIG } from '../sim/config';
import { formatDate } from '../sim/calendar';
import { causalClosure, findEvent, mainPath, type SimEvent } from '../sim/eventlog';
import { yearSummary } from '../sim/rating';
import { describeEvent, FAILURE_TITLES } from '../content/events.de';
import { BACKGROUND, eventIcon, outcomeSentence, tierName } from '../content/analysis.de';
import type { GameState } from '../sim/types';
import { buildTimeline } from './charts';
import { hasChp } from '../sim/plant';
import { REAL_WORLD_INTRO, realWorldItems } from '../content/realworld.de';
import { fmt, h } from './dom';
import { TIPS } from '../content/tooltips.de';

/**
 * Analyse nach dem Ende eines Durchlaufs, in drei aufklappbaren Ebenen:
 * 1. ein Satz und sofort „Neuer Versuch“,
 * 2. die Kausalkette rückwärts vom Scheitern zur eigentlichen Ursache,
 * 3. Verläufe der wichtigsten Werte mit Ereignismarken.
 * Bei Erfolg: Jahresbilanz mit Bewertung, wichtige Ereignisse und Verläufe.
 */
const LEVEL_NAMES = { vereinfacht: 'Vereinfacht', normal: 'Normal', real: 'Real' } as const;

export interface AnalysisOptions {
  onRestart: () => void;
  onMenu?: () => void;
  /** bester Kontostand eines beendeten Jahres in dieser Sitzung (nur im Speicher) */
  sessionBest?: number | null;
  /** Zusatzinhalt nach Ebene 1 (Speichercode, Freischaltungen; Meilenstein 5) */
  extra?: HTMLElement | null;
}

export function buildAnalysis(s: GameState, opts: AnalysisOptions): HTMLElement {
  const y = yearSummary(s);
  const failed = s.failure !== null;
  const restart = h('button', { type: 'button', class: 'btn btn--primary btn--large', 'data-tip': TIPS.restart, onclick: opts.onRestart }, 'Neuer Versuch');

  const head = h('header', { class: 'analysis__head' },
    h('p', { class: 'eyebrow' }, `${s.scenario.plantName ? `${s.scenario.plantName}: ` : ''}${failed ? 'Durchlauf beendet' : 'Jahresbilanz'}, Stufe ${LEVEL_NAMES[s.scenario.difficulty ?? 'normal']}`),
    h('h2', { id: 'end-title' }, failed ? FAILURE_TITLES[s.failure!.kind] : tierName(y.tier)),
    h('p', { class: 'analysis__sentence' }, outcomeSentence(s)),
    h('div', { class: 'row' }, restart, opts.onMenu ? h('button', { type: 'button', class: 'btn btn--large', 'data-tip': TIPS.toMenu, onclick: opts.onMenu }, 'Zum Startmenü') : null),
  );

  const parts: HTMLElement[] = [head, scoreCard(s, opts.sessionBest ?? null)];
  if (opts.extra) parts.push(opts.extra);
  parts.push(summaryBlock(s, failed));
  if (failed) parts.push(chainBlock(s));
  else parts.push(eventsBlock(s));
  if (!failed) parts.push(realWorldBlock(s));
  parts.push(h('details', { class: 'level' }, h('summary', {}, h('span', { class: 'level__title' }, 'Verläufe über das Jahr')), buildTimeline(s)));
  return h('div', { class: 'analysis' }, ...parts);
}

// ---------- Ergebnis zum Vergleichen ----------

const SCENARIO_NAMES: Record<string, string> = { altanlage: 'Altanlage', eigene_felder: 'Biomethananlage', schwieriger_standort: 'Verbundanlage' };

/**
 * Ergebnis des Durchlaufs, gut lesbar für einen Screenshot oder den Vergleich mit Kollegen.
 * Gewertet wird der Kontostand am Ende eines vollen Jahres. Gespeichert wird nichts.
 */
function scoreCard(s: GameState, best: number | null): HTMLElement {
  const y = yearSummary(s);
  const failed = s.failure !== null;
  const chips = [
    `Stufe ${LEVEL_NAMES[s.scenario.difficulty ?? 'normal']}`,
    SCENARIO_NAMES[s.scenario.id] ?? s.scenario.id,
    s.scenario.tutorial ? 'mit Beraterin' : null,
    failed ? null : `Bewertung ${tierName(y.tier)}`,
    `gespielt am ${new Date().toLocaleDateString('de-DE')}`,
  ].filter(Boolean) as string[];
  const isBest = !failed && best !== null && Math.round(s.finance.balance) >= Math.round(best);
  return h('section', { class: `score${failed ? ' score--failed' : ''}`, 'aria-label': 'Ergebnis' },
    s.scenario.plantName ? h('p', { class: 'score__name' }, s.scenario.plantName) : null,
    h('div', { class: 'score__main' },
      h('p', { class: 'score__label' }, failed ? `Kontostand beim Scheitern am ${formatDate(s.failure!.day)}` : 'Kontostand am 31. Juli'),
      h('p', { class: 'score__value' }, fmt.eur(s.finance.balance)),
      h('p', { class: 'score__note' }, failed
        ? 'Das Jahr wurde nicht beendet und zählt nicht als Ergebnis.'
        : isBest && best !== null ? 'Ihr bestes Ergebnis in dieser Sitzung.' : best !== null ? `Ihr bestes Ergebnis in dieser Sitzung: ${fmt.eur(best)}` : 'Ihr Ergebnis zum Vergleichen mit Kolleginnen und Kollegen.'),
    ),
    h('ul', { class: 'score__chips' }, ...chips.map((c) => h('li', {}, c))),
  );
}

// ---------- Kennzahlen ----------

function summaryBlock(s: GameState, failed: boolean): HTMLElement {
  const y = yearSummary(s);
  const rows: [string, string][] = [
    ...(hasChp(s) ? [['Strom erzeugt', `${fmt.int(y.kwhEl / 1000)} MWh`] as [string, string]] : []),
    ...(s.upgrading ? [['Biomethan eingespeist', `${fmt.int(y.kwhGas / 1000)} MWh`] as [string, string]] : []),
    ['Gewinn', fmt.eur(y.profitEur)],
    ['Akzeptanz im Mittel', `${fmt.int(y.acceptanceAvg)} von 100`],
    ['Gasverluste und Emissionen', `${fmt.dec(y.gasLossShare * 100, 1)} % (Fackel ${fmt.int(y.flaredM3)} m³ Biogas, Lager ${fmt.int(y.ch4LostStorageM3)} m³ Methan${s.upgrading ? `, Schlupf der Aufbereitung ${fmt.int(s.totals.ch4SlipM3)} m³ Methan` : ''})`],
    ['Maisanteil an der Masse', fmt.pct(y.maizeShare)],
    ['Tage mit gestörter Biologie', fmt.pct(y.bioErrorShare)],
  ];
  if (!failed) rows.push(['Vorrat bis zur nächsten Ernte', `${fmt.int(y.supplyDays)} Tage`]);
  return h('details', { class: 'level', open: !failed },
    h('summary', {}, h('span', { class: 'level__title' }, failed ? `Kennzahlen bis zum ${formatDate(s.failure!.day)}` : 'Kennzahlen des Jahres')),
    h('dl', { class: 'figures' }, ...rows.map(([k, v]) => h('div', { class: 'figure' }, h('dt', {}, k), h('dd', {}, v)))),
    failed ? null : h('p', { class: 'muted' }, `Bewertung aus Gewinn, Akzeptanz, Gasverlusten, Biologie, Vorrat und Maisdeckel: ${y.points} von ${CONFIG.rating.maxPoints} Punkten.`),
  );
}

// ---------- Kausalkette ----------

function chainItem(s: GameState, e: SimEvent, role: 'scheitern' | 'ausloeser' | 'ursache' | null, gapDays: number | null): HTMLElement {
  const t = describeEvent(e);
  const kind = eventIcon(e.type, e.playerDecision);
  const badges: HTMLElement[] = [];
  if (role === 'ausloeser') badges.push(h('span', { class: 'badge badge--trigger' }, 'Auslöser'));
  if (role === 'ursache') badges.push(h('span', { class: 'badge badge--root' }, 'Ursache'));
  if (kind === 'decision') badges.push(h('span', { class: 'badge badge--decision' }, 'Ihre Entscheidung'));
  if (kind === 'origin') badges.push(h('span', { class: 'badge badge--origin' }, 'Ausgangslage'));
  const bg = BACKGROUND[e.type];
  return h('li', { class: `chain__item chain__item--${role ?? 'step'} chain__item--${kind}` },
    gapDays !== null && gapDays > 0 ? h('p', { class: 'chain__gap' }, gapDays === 1 ? '1 Tag davor' : `${fmt.int(gapDays)} Tage davor`) : null,
    h('div', { class: 'chain__card' },
      h('div', { class: 'chain__meta' }, h('span', { class: 'chain__date' }, formatDate(e.day)), ...badges),
      h('h4', {}, t.title),
      t.text ? h('p', {}, t.text) : null,
      bg ? h('details', { class: 'chain__bg' }, h('summary', {}, 'Hintergrund'), h('p', {}, bg)) : null,
    ),
  );
}

function chainBlock(s: GameState): HTMLElement {
  const path = mainPath(s.log, s.failure!.eventId);
  const items = path.map((e, i) => {
    const role = i === 0 ? 'scheitern' : i === path.length - 1 && path.length > 1 ? 'ursache' : i === 1 ? 'ausloeser' : null;
    const gap = i === 0 ? null : path[i - 1].day - e.day;
    return chainItem(s, e, role, gap);
  });
  // Auslöser und Ursache identisch: beide Abzeichen zeigen
  if (path.length === 2) items[1].querySelector('.chain__meta')!.insertBefore(h('span', { class: 'badge badge--trigger' }, 'Auslöser'), items[1].querySelector('.badge'));
  const others = causalClosure(s.log, s.failure!.eventId).filter((e) => !path.includes(e)).reverse();
  const root = path[path.length - 1];
  return h('details', { class: 'level', open: true },
    h('summary', {}, h('span', { class: 'level__title' }, 'Wie es dazu kam')),
    h('p', { class: 'muted' }, `Vom Ende rückwärts bis zur eigentlichen Ursache am ${formatDate(root.day)}.`),
    h('ol', { class: 'chain' }, ...items),
    others.length
      ? h('details', { class: 'chain__others' },
        h('summary', {}, `Weitere beteiligte Ereignisse (${others.length})`),
        h('ul', {}, ...others.map((e) => {
          const t = describeEvent(e);
          return h('li', {}, h('span', { class: 'chain__date' }, formatDate(e.day)), ' ', t.title, e.playerDecision ? h('span', { class: 'badge badge--decision' }, 'Ihre Entscheidung') : null, t.text ? h('span', { class: 'muted' }, ` ${t.text}`) : null);
        })))
      : null,
  );
}

// ---------- Wichtige Ereignisse bei Erfolg ----------

function eventsBlock(s: GameState): HTMLElement {
  const important = s.log.events.filter((e) => e.severity === 'warning' || e.severity === 'critical');
  const items = important.map((e) => {
    const t = describeEvent(e);
    const path = mainPath(s.log, e.id);
    const root = path.length > 1 ? path[path.length - 1] : null;
    const rootText = root ? describeEvent(root).title : null;
    const bg = BACKGROUND[e.type];
    return h('li', { class: 'chain__item' },
      h('div', { class: 'chain__card' },
        h('div', { class: 'chain__meta' }, h('span', { class: 'chain__date' }, formatDate(e.day))),
        h('h4', {}, t.title),
        t.text ? h('p', {}, t.text) : null,
        rootText ? h('p', { class: 'muted' }, `Zurückzuführen auf: ${rootText} (${formatDate(root!.day)})${root!.playerDecision ? ', Ihre Entscheidung' : ''}`) : null,
        bg ? h('details', { class: 'chain__bg' }, h('summary', {}, 'Hintergrund'), h('p', {}, bg)) : null,
      ),
    );
  });
  return h('details', { class: 'level' },
    h('summary', {}, h('span', { class: 'level__title' }, `Schwierige Momente des Jahres (${important.length})`)),
    items.length ? h('ol', { class: 'chain chain--plain' }, ...items) : h('p', {}, 'Keine Warnungen im ganzen Jahr.'),
  );
}

// ---------- Was im echten Betrieb noch dazugehört ----------

function realWorldBlock(s: GameState): HTMLElement {
  const items = realWorldItems(s, hasChp(s));
  return h('details', { class: 'level', open: true },
    h('summary', {}, h('span', { class: 'level__title' }, 'Was im echten Betrieb noch dazugehört')),
    h('p', { class: 'muted' }, REAL_WORLD_INTRO),
    h('ul', { class: 'realworld' }, ...items.map((i) => h('li', { class: 'realworld__item' }, h('strong', {}, i.title), h('span', {}, i.text)))),
  );
}

export { findEvent };
