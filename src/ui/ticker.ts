import type { GameState, WorldMessage } from '../sim/types';
import { formatDate } from '../sim/calendar';
import { messageText, SENDERS } from '../content/messages.de';
import { h, svg } from './dom';
import { ICONS } from './icons';
import { TIPS } from '../content/tooltips.de';
import { flip, reducedMotion } from './motion';

/**
 * Meldungen aus der Welt als Stapel unten in der Mitte: Eine neue Meldung erscheint an der
 * gewohnten Stelle und schiebt die vorigen nach oben. Höchstens drei sind sichtbar; jede
 * verschwindet nach einer Weile laufender Spielzeit von selbst oder per Klick.
 */
const SHOW_SECONDS = 12;
const MAX_VISIBLE = 3;
const LEAVE_MS = 300;

interface Item { msg: WorldMessage; el: HTMLElement; age: number; leaving: boolean }

export class Ticker {
  readonly el: HTMLElement;
  private items: Item[] = [];
  private seen = 0;

  constructor() {
    this.el = h('div', { class: 'tickers', role: 'status', 'aria-live': 'polite' });
  }

  /** Neue Meldungen aus dem Spielzustand übernehmen. */
  sync(state: GameState): void {
    const fresh = state.messages.slice(this.seen);
    this.seen = state.messages.length;
    // Kommen viele auf einmal (z. B. nach einem Sprung), nur die letzten zeigen
    for (const m of fresh.slice(-MAX_VISIBLE)) this.add(m);
  }

  /** Alle Meldungen verwerfen (Ende des Durchlaufs, Neustart). */
  clear(seen = this.seen): void {
    this.items = [];
    this.seen = seen;
    this.el.replaceChildren();
  }

  /** Echtzeit-Fortschritt; Meldungen altern nur, wenn das Spiel läuft. */
  tick(dt: number, running: boolean): void {
    if (!running) return;
    for (const it of this.items) {
      it.age += dt;
      if (it.age > SHOW_SECONDS && !it.leaving) this.remove(it);
    }
  }

  private add(msg: WorldMessage): void {
    const close = h('button', { type: 'button', class: 'ticker__close', 'aria-label': 'Meldung schließen', 'data-tip': TIPS.closeMessage }, svg(ICONS.close));
    const el = h('div', { class: 'ticker is-entering', 'data-sender': msg.sender },
      h('span', { class: 'ticker__icon' }, svg(ICONS.message)),
      h('div', { class: 'ticker__content' },
        h('div', { class: 'ticker__head' }, h('strong', { class: 'ticker__sender' }, SENDERS[msg.sender]), h('span', { class: 'ticker__date' }, formatDate(msg.day))),
        h('p', { class: 'ticker__text' }, messageText(msg))),
      close,
    );
    const item: Item = { msg, el, age: 0, leaving: false };
    close.addEventListener('click', () => this.remove(item));
    flip(this.el, () => this.el.append(el));
    this.items.push(item);
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.remove('is-entering'));
    // Zu viele: die älteste verschwindet
    const active = this.items.filter((i) => !i.leaving);
    if (active.length > MAX_VISIBLE) this.remove(active[0]);
  }

  private remove(item: Item): void {
    if (item.leaving) return;
    item.leaving = true;
    const drop = () => {
      if (!item.el.isConnected) return;
      flip(this.el, () => item.el.remove());
      this.items = this.items.filter((i) => i !== item);
    };
    if (reducedMotion()) {
      drop();
      return;
    }
    item.el.classList.add('is-leaving');
    window.setTimeout(drop, LEAVE_MS);
  }
}
