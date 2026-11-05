import { CONFIG } from '../sim/config';
import { dayOfDate, formatDate, MONTH_NAMES } from '../sim/calendar';
import { maxCapacity } from '../sim/biology';
import { maizeShare } from '../sim/finance';
import { STRATEGIES } from '../sim/strategies';
import { UNLOCK_KEYS } from '../sim/unlockKeys';
import { topCauses } from '../sim/eventlog';
import { describeEvent } from '../content/events.de';
import type { GameState } from '../sim/types';
import { fmt, h } from './dom';

/**
 * Debug-Panel (nur mit ?debug): alle internen Werte, Zeitraffer bis 50x,
 * Sprung zu einem Datum, Seed, Testspieler und Freischaltungen. Für das Balancing.
 */
export interface DebugHooks {
  getState: () => GameState;
  getSpeed: () => number;
  setSpeed: (v: number) => void;
  jumpTo: (day: number) => void;
  restart: (seed: number, strategy: string) => void;
  unlockAll: () => void;
  resetUnlocks: () => void;
  getUnlocks: () => string[];
  strategy: () => string;
}

const n2 = (v: number) => fmt.dec(v, 2);
const n1 = (v: number) => fmt.dec(v, 1);

function values(s: GameState): [string, [string, string][]][] {
  const b = s.bio;
  const c = s.chp;
  const causeTitle = (id: string) => {
    const e = s.log.events.find((x) => x.id === id);
    return e ? `${describeEvent(e).title} (${formatDate(e.day)})` : id;
  };
  return [
    ['Allgemein', [
      ['Seed', String(s.seed)], ['Spieltag', `${s.day} (${formatDate(Math.max(0, s.day - 1))})`], ['Dürrejahr', s.weather.drought ? 'ja' : 'nein'],
      ['Szenario', s.scenario.id], ['Ereignisse', fmt.int(s.log.events.length)],
    ]],
    ['Biologie (wahr)', [
      ['FOS/TAC wahr', n2(b.fosTac)], ['FOS/TAC gemessen', n2(s.measurement.fosTac)], ['Säurestau m³ CH4', fmt.int(b.acids)],
      ['Kapazität m³ CH4/d', `${fmt.int(b.capacity)} von ${fmt.int(maxCapacity())}`], ['Säureangebot m³ CH4/d', fmt.int(b.demandSmoothed)],
      ['Raumbelastung', n2(b.olr)], ['Verweilzeit d', Number.isFinite(b.hrtDays) ? n1(b.hrtDays) : '∞'], ['Puffer', n2(b.buffer)],
      ['Hemmung', n2(b.inhibition)], ['Anpassung', n2(b.adaptation)], ['Spurenelemente', `${n2(b.traceElements)} (Faktor ${n2(b.traceFactor)})`],
      ['Temperatur', `${n1(b.tempC)} °C (Faktor ${n2(b.tempFactor)})`], ['CH4-Anteil', fmt.pct(b.ch4Share)], ['gekippt', b.tipped ? `seit ${formatDate(b.tippedDay ?? 0)}` : 'nein'],
      ['Ursachen Belastung', topCauses(b.stressCauses).map(causeTitle).join('; ') || '–'],
    ]],
    ['Technik', [
      ['BHKW', `${c.status}${c.status !== 'betrieb' ? ` bis ${Number.isFinite(c.downUntilDay) ? formatDate(c.downUntilDay) : '∞'}` : ''}`],
      ['Verschleiß', fmt.pct(c.wear)], ['Stunden seit Wartung', fmt.int(c.hoursSinceService)], ['Laufanteil', fmt.pct(c.runShare)],
      ['H2S roh/rein ppm', `${fmt.int(s.desulf.rawPpm)} / ${fmt.int(s.desulf.cleanPpm)}`], ['Entschwefelung Tage', n1(s.desulf.mediumDays)],
      ['Gasspeicher m³', `${fmt.int(s.gas.storedM3)} von ${fmt.int(s.gas.capacityM3)}`], ['Fackel heute m³', fmt.int(s.gas.flaredToday)],
      ['Ursachen Verschleiß', topCauses(c.wearCauses).map(causeTitle).join('; ') || '–'],
    ]],
    ['Lager', [
      ['Silo Mais t / Qualität', `${fmt.int(s.silo.mais.t)} / ${n2(s.silo.mais.quality)}`], ['Silo Roggen t / Qualität', `${fmt.int(s.silo.gruenroggen.t)} / ${n2(s.silo.gruenroggen.quality)}`],
      ['Verdichtung heute', n2(s.silo.compactionToday)], ['Gärrest m³', `${fmt.int(s.digestate.m3)} von ${fmt.int(s.digestate.capacityM3)}`],
      ['Restgas Lager m³ CH4', fmt.int(s.digestate.residualCh4)], ['Ausgebracht vor Sperrfrist', `${fmt.int(s.digestate.spreadBeforeBlackout)} von ${fmt.int(s.digestate.demandBeforeBlackout)}`],
    ]],
    ['Dorf und Geld', [
      ['Akzeptanz', n1(s.acceptance.value)], ['Belastung heute', n2(s.acceptance.nuisance)], ['davon Geruch', n2(s.acceptance.smell)],
      ['Fahrten durchs Dorf', fmt.int(s.acceptance.trafficTrips)], ['Beschwerden', fmt.int(s.acceptance.complaints.length)], ['Tage kritisch', fmt.int(s.acceptance.daysCritical)],
      ['Kontostand', fmt.eur(s.finance.balance)], ['Tage über Rahmen', fmt.int(s.finance.daysOverLimit)], ['Marktpreis €/kWh', fmt.dec(s.finance.marketPrice, 3)],
      ['Maisanteil', fmt.pct(maizeShare(s))], ['Ursachen Verluste €', topCauses(s.finance.lossCauses).map(causeTitle).join('; ') || '–'],
    ]],
  ];
}

export class DebugPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private speedOut: HTMLElement;
  private speedInput: HTMLInputElement;

  constructor(private hooks: DebugHooks) {
    this.speedOut = h('output', {}, '');
    this.speedInput = h('input', { type: 'range', min: 0, max: CONFIG.time.debugMaxSpeed, step: 1, value: hooks.getSpeed(), 'aria-label': 'Zeitraffer' }) as HTMLInputElement;
    this.speedInput.addEventListener('input', () => hooks.setSpeed(Number(this.speedInput.value)));

    const monthSel = h('select', { class: 'input', 'aria-label': 'Monat' }, ...[8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7].map((m) => h('option', { value: m }, MONTH_NAMES[m - 1]))) as HTMLSelectElement;
    const daySel = h('input', { type: 'number', class: 'input', min: 1, max: 31, value: 1, 'aria-label': 'Tag im Monat' }) as HTMLInputElement;
    const jump = h('button', { type: 'button', class: 'btn', onclick: () => {
      const d = Math.max(1, Math.min(31, Number(daySel.value) || 1));
      hooks.jumpTo(dayOfDate([Number(monthSel.value), d]));
    } }, 'Springen');

    const seedIn = h('input', { type: 'number', class: 'input', value: hooks.getState().seed, 'aria-label': 'Seed' }) as HTMLInputElement;
    const stratSel = h('select', { class: 'input', 'aria-label': 'Testspieler' },
      h('option', { value: '' }, 'selbst spielen'),
      ...Object.keys(STRATEGIES).map((k) => h('option', { value: k, selected: k === hooks.strategy() }, k))) as HTMLSelectElement;
    const restart = h('button', { type: 'button', class: 'btn', onclick: () => hooks.restart(Number(seedIn.value) >>> 0, stratSel.value) }, 'Neu starten');

    this.body = h('div', { class: 'debug__values' });
    const close = h('button', { type: 'button', class: 'btn', onclick: () => this.toggle(false) }, 'Schließen');
    this.el = h('aside', { class: 'debug', 'aria-label': 'Debug', hidden: true },
      h('div', { class: 'debug__head' }, h('strong', {}, 'Debug'), close),
      h('div', { class: 'debug__controls' },
        h('label', {}, 'Zeitraffer ', this.speedOut), this.speedInput,
        h('div', { class: 'row' }, monthSel, daySel, jump),
        h('div', { class: 'row' }, seedIn, stratSel, restart),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { hooks.unlockAll(); this.update(); } }, 'Alles freischalten'),
          h('button', { type: 'button', class: 'btn', onclick: () => { hooks.resetUnlocks(); this.update(); } }, 'Zurücksetzen')),
        h('p', { class: 'muted debug__unlocks' }),
      ),
      this.body,
    );
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return;
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey) this.toggle();
    });
  }

  toggle(force?: boolean): void {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    if (!this.el.hidden) this.update();
  }

  update(): void {
    if (this.el.hidden) return;
    const s = this.hooks.getState();
    this.speedOut.textContent = `${this.hooks.getSpeed()}x`;
    if (document.activeElement !== this.speedInput) this.speedInput.value = String(this.hooks.getSpeed());
    const u = this.hooks.getUnlocks();
    (this.el.querySelector('.debug__unlocks') as HTMLElement).textContent = `Freigeschaltet: ${u.length ? u.join(', ') : 'nichts'} (${u.length} von ${UNLOCK_KEYS.length})`;
    this.body.replaceChildren(...values(s).map(([title, rows]) => h('section', {},
      h('h4', {}, title),
      h('dl', {}, ...rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
    )));
  }
}
