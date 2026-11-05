import type { GameState, WorldMessage } from '../sim/types';
import { formatDate } from '../sim/calendar';
import { messageText, SENDERS } from '../content/messages.de';
import { h, svg } from './dom';
import { ICONS } from './icons';
import { TIPS } from '../content/tooltips.de';

/**
 * Meldungen aus der Welt: höchstens eine gleichzeitig sichtbar, ignorierbar.
 * Neue Meldungen warten in einer kurzen Schlange; zu alte verfallen still.
 */
const SHOW_SECONDS = 9;
const MAX_QUEUE = 4;

export class Ticker {
  readonly el: HTMLElement;
  private queue: WorldMessage[] = [];
  private seen = 0;
  private current: WorldMessage | null = null;
  private shownFor = 0;
  private body: HTMLElement;
  private sender: HTMLElement;
  private date: HTMLElement;

  constructor() {
    this.sender = h('strong', { class: 'ticker__sender' });
    this.date = h('span', { class: 'ticker__date' });
    this.body = h('p', { class: 'ticker__text' });
    const close = h('button', { type: 'button', class: 'ticker__close', 'aria-label': 'Meldung schließen', 'data-tip': TIPS.closeMessage, onclick: () => this.next() }, svg(ICONS.close));
    this.el = h('div', { class: 'ticker', role: 'status', 'aria-live': 'polite', hidden: true },
      h('span', { class: 'ticker__icon' }, svg(ICONS.message)),
      h('div', { class: 'ticker__content' }, h('div', { class: 'ticker__head' }, this.sender, this.date), this.body),
      close,
    );
  }

  /** Neue Meldungen aus dem Spielzustand übernehmen. */
  sync(state: GameState): void {
    const fresh = state.messages.slice(this.seen);
    this.seen = state.messages.length;
    this.queue.push(...fresh);
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
    if (!this.current) this.next();
  }

  /** Alle Meldungen verwerfen (Ende des Durchlaufs, Neustart). */
  clear(seen = this.seen): void {
    this.queue = [];
    this.seen = seen;
    this.current = null;
    this.el.hidden = true;
  }

  /** Echtzeit-Fortschritt; läuft nur, wenn das Spiel läuft. */
  tick(dt: number, running: boolean): void {
    if (!this.current || !running) return;
    this.shownFor += dt;
    if (this.shownFor > SHOW_SECONDS) this.next();
  }

  private next(): void {
    this.current = this.queue.shift() ?? null;
    this.shownFor = 0;
    if (!this.current) {
      this.el.hidden = true;
      return;
    }
    this.sender.textContent = SENDERS[this.current.sender];
    this.date.textContent = formatDate(this.current.day);
    this.body.textContent = messageText(this.current);
    this.el.dataset.sender = this.current.sender;
    this.el.hidden = false;
  }
}
