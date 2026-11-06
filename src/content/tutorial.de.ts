import { CONFIG } from '../sim/config';
import { dayOfDate, inWindow } from '../sim/calendar';
import { maizeShare } from '../sim/finance';
import { hasFeature } from '../sim/difficulty';
import { siloStock } from '../sim/storage';
import type { GameState } from '../sim/types';

/**
 * Tutorial-Modus: Hinweise der DAH-Beraterin. Anders als der Rest des Spiels
 * erklären sie bewusst, was wichtig ist und wohin man schauen kann. Jeder Hinweis
 * erscheint höchstens einmal, wenn seine Lage eintritt. Gibt es länger keinen
 * Anlass, kommt ein allgemeiner Tipp.
 */
export interface Hint {
  id: string;
  /** Bereich, den der Knopf „Zeigen“ öffnet */
  panel?: string;
  when: (s: GameState) => boolean;
  text: (s: GameState) => string;
}

const n = (v: number) => Math.round(v).toLocaleString('de-DE');
const fill = (s: GameState) => s.digestate.m3 / s.digestate.capacityM3;
const blackout = (s: GameState) => inWindow(s.day, CONFIG.digestate.blackout);

export const HINTS: Hint[] = [
  {
    id: 'willkommen',
    when: (s) => s.day >= 1,
    text: () => 'Willkommen auf Ihrer Anlage! Ich begleite Sie durch das erste Jahr. Rechts sehen Sie die wichtigsten Messwerte, links die Bereiche, in denen Sie entscheiden. Die Zeit können Sie oben rechts jederzeit anhalten.',
  },
  {
    id: 'mais_vertraege',
    panel: 'supply',
    when: (s) => s.day >= 2 && !s.contracts.some((c) => c.kind === 'mais'),
    text: (s) => `Im September wird Mais geerntet, nur einmal im Jahr. Was Sie bis Ende August nicht vertraglich sichern, müssen Sie später teurer nachkaufen. Bei der jetzigen Fütterung brauchen Sie rund ${n(s.feedTarget.mais * 330)} t bis zur nächsten Ernte. Im Silo liegen ${n(s.silo.mais.t)} t.`,
  },
  {
    id: 'sperrfrist',
    panel: 'dig',
    when: (s) => s.day >= 5 && s.digestate.spreadOrderM3 <= 0 && s.digestate.spreadTotal <= 0,
    text: () => 'Ab dem 1. Oktober darf bis Ende Januar kein Gärrest auf Ackerland. In dieser Zeit muss das Lager alles aufnehmen. Jetzt nach der Getreideernte haben die Landwirte Platz auf den Stoppeln: Ein guter Moment, das Lager zu leeren.',
  },
  {
    id: 'personal',
    panel: 'staff',
    when: (s) => s.day >= 25 && hasFeature(s, 'personal') && s.staff.length === 0,
    text: () => 'Fachleute kosten Geld, nehmen Ihnen aber Arbeit und Risiko ab. Der Verfahrenstechniker hält das BHKW in Schuss, die Biologin erkennt Probleme im Fermenter früher.',
  },
  {
    id: 'wartung',
    panel: 'tech',
    when: (s) => s.chp.hoursSinceService >= CONFIG.chp.serviceIntervalH - CONFIG.chp.serviceNoticeHoursBefore && s.day >= 3,
    text: (s) => `Das BHKW läuft seit ${n(s.chp.hoursSinceService)} Stunden ohne Wartung. Alle ${n(CONFIG.chp.serviceIntervalH)} Stunden sind Öl, Zündkerzen und Filter dran. Aufschieben spart kurz Geld, aber der Motor verschleißt schneller und fällt öfter aus.`,
  },
  {
    id: 'entschwefelung',
    panel: 'tech',
    when: (s) => hasFeature(s, 'entschwefelung') && s.desulf.mediumDays < 10,
    text: () => 'Das Mittel in der Entschwefelung geht zur Neige. Ohne Entschwefelung bleibt Schwefelwasserstoff im Gas, und der greift den Motor an.',
  },
  {
    id: 'fos',
    panel: 'feed',
    when: (s) => s.measurement.fosTac >= 0.45,
    text: (s) => `Der FOS/TAC liegt bei ${s.measurement.fosTac.toFixed(2).replace('.', ',')}. Ab etwa 0,5 entstehen mehr Säuren, als die Mikroorganismen abbauen. Abrupte Änderungen machen es schlimmer; etwas weniger Futter oder mehr Gülle als Puffer hilft. Der Laborwert ist übrigens immer ein paar Tage alt.`,
  },
  {
    id: 'maisdeckel',
    panel: 'feed',
    when: (s) => s.day >= 20 && maizeShare(s) > CONFIG.maizeCap.maxShare - 0.03,
    text: (s) => `Ihr Maisanteil an der eingesetzten Masse liegt bei ${n(maizeShare(s) * 100)} Prozent. Über ${n(CONFIG.maizeCap.maxShare * 100)} Prozent zahlt der Netzbetreiber nur noch den Marktwert. Gülle zählt mit und senkt den Anteil.`,
  },
  {
    id: 'silo_knapp',
    panel: 'supply',
    when: (s) => s.day >= 3 && s.feedTarget.mais > 0 && siloStock(s) / Math.max(1, s.feedTarget.mais + s.feedTarget.gruenroggen) < 25 && !inWindow(s.day, CONFIG.fields.windows.maisHarvest),
    text: (s) => `Der Silovorrat reicht nur noch etwa ${n(siloStock(s) / Math.max(1, s.feedTarget.mais + s.feedTarget.gruenroggen))} Tage. Wenn das Futter ausgeht, ändert sich die Fütterung schlagartig. Mais lässt sich am Markt nachkaufen, außerhalb der Ernte aber teurer.`,
  },
  {
    id: 'lager_voll',
    panel: 'dig',
    when: (s) => fill(s) > 0.7 && !blackout(s),
    text: (s) => `Das Gärrestlager ist zu ${n(fill(s) * 100)} Prozent voll. Läuft es über, legt das Landratsamt die Anlage still. Ausbringen geht nur, wenn die Felder befahrbar sind und Landwirte Bedarf haben.`,
  },
  {
    id: 'lager_sperrfrist',
    panel: 'feed',
    when: (s) => fill(s) > 0.75 && blackout(s),
    text: () => 'Das Lager füllt sich, und bis Ende Januar darf nichts aufs Feld. Weniger Gülle verringert den Zufluss, erhöht aber den Maisanteil. Ein größeres Lager oder eine Abdeckung gegen Regenwasser helfen auf Dauer.',
  },
  {
    id: 'roggen',
    panel: 'supply',
    when: (s) => s.day >= dayOfDate(CONFIG.contracts.ryeOfferWindow.from) && !s.contracts.some((c) => c.kind === 'gruenroggen'),
    text: () => 'Jetzt bieten Landwirte Grünroggen für die Ernte im Mai an. Er füllt das Silo, bevor der Mais im Herbst kommt, und zählt nicht zum Maisdeckel.',
  },
  {
    id: 'felder',
    panel: 'fields',
    when: (s) => hasFeature(s, 'felder') && s.fields.some((f) => f.status === 'frei'),
    text: () => 'Ein Feld des Vorbesitzers ist frei geworden. Eigene Flächen liefern Substrat ohne Zwischenhändler und nehmen Gärrest auf. Grünroggen wird jetzt gesät und im Mai geerntet.',
  },
  {
    id: 'akzeptanz',
    panel: 'build',
    when: (s) => s.acceptance.value < 40,
    text: () => 'Im Dorf wächst der Ärger. Geruch kommt vor allem aus offenen Lagern und schlecht verdichteter Silage, Lärm vom Ernteverkehr. Eine Abdeckung oder Wärme für das Dorf verbessern die Stimmung dauerhaft.',
  },
  {
    id: 'fackel',
    panel: 'feed',
    when: (s) => s.gas.flaring && s.chp.status === 'betrieb',
    text: () => 'Die Fackel brennt, obwohl das BHKW läuft: Es entsteht mehr Gas, als der Motor verwerten kann. Dieses Gas bringt kein Geld. Etwas weniger Futter spart Substrat, ohne Strom zu verlieren.',
  },
  {
    id: 'winter',
    when: (s) => s.day >= dayOfDate([12, 1]),
    text: () => 'Im Winter braucht der Fermenter mehr Wärme. Die kommt aus der Abwärme des BHKW. Steht es länger, kühlt der Fermenter aus, und die Biologie wird langsamer.',
  },
  {
    id: 'fruehjahr',
    panel: 'dig',
    when: (s) => s.day >= dayOfDate([2, 1]),
    text: () => 'Die Sperrfrist ist vorbei. Im Frühjahr brauchen die Landwirte Dünger für die Aussaat. Jetzt lässt sich das Lager gut leeren.',
  },
  {
    id: 'konto',
    panel: 'money',
    when: (s) => s.finance.balance < -CONFIG.finance.creditLimitEur * 0.6,
    text: () => 'Ihr Konto ist tief im Minus. Im Herbst ist das normal, weil die Maisernte bezahlt wird und der Strom erst monatlich vergütet wird. Bleibt es länger über dem Kreditrahmen, kündigt die Bank.',
  },
];

/** Allgemeine Tipps, wenn länger kein Anlass bestand. */
export const GENERAL_TIPS: string[] = [
  'Tippen Sie auf Gebäude und Felder, um den passenden Bereich zu öffnen. Die Gashaube zeigt den Füllstand des Gasspeichers.',
  'Raumbelastung heißt: wie viel organische Masse pro Kubikmeter Fermenter und Tag hineinkommt. Bis etwa 3 ist der Prozess stabil.',
  'Gülle bringt wenig Gas, aber Puffer und Spurenelemente. Mais bringt viel Gas, aber auf Dauer fehlen der Biologie ohne Gülle wichtige Stoffe.',
  'Ändern Sie die Fütterung lieber in kleinen Schritten über einige Tage. Die Mikroorganismen brauchen Zeit, sich umzustellen.',
  'Nach einem Durchlauf erklärt die Analyse genau, wie es zu einem Problem kam. Es lohnt sich, sie zu lesen.',
];
export const GENERAL_TIP_EVERY_DAYS = 21;
