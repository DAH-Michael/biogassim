import type { GameState } from '../sim/types';
import { GENERAL_TIPS, GENERAL_TIP_EVERY_DAYS, HINTS, type Hint } from '../content/tutorial.de';
import { advisorPortrait } from './portrait';
import { h } from './dom';

/**
 * DAH-Beraterin im Tutorial-Modus. Zeigt einen Hinweis, sobald seine Lage eintritt,
 * hält dafür die Zeit an und setzt sie beim Weiterklicken fort. „Zeigen“ öffnet den
 * passenden Bereich.
 */
export interface AdvisorHooks {
  getSpeed: () => number;
  setSpeed: (v: number) => void;
  openPanel: (id: string) => void;
}

export class Advisor {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private actions: HTMLElement;
  private shown = new Set<string>();
  private lastHintDay = 0;
  private tipIndex = 0;
  private active = false;
  private resumeSpeed: number | null = null;
  private enabled = false;

  constructor(private hooks: AdvisorHooks) {
    this.text = h('p', { class: 'advisor__text' });
    this.actions = h('div', { class: 'advisor__actions' });
    const portrait = h('div', { class: 'advisor__portrait' });
    portrait.innerHTML = advisorPortrait(76);
    this.el = h('aside', { class: 'advisor', role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Hinweis der DAH-Beraterin', hidden: true },
      portrait,
      h('div', { class: 'advisor__body' }, h('strong', { class: 'advisor__name' }, 'Ihre DAH-Beraterin'), this.text, this.actions),
    );
  }

  /** Neuer Durchlauf: Tutorial an oder aus, gezeigte Hinweise zurücksetzen. */
  reset(enabled: boolean): void {
    this.enabled = enabled;
    this.shown.clear();
    this.lastHintDay = 0;
    this.tipIndex = 0;
    this.hide(false);
  }

  /** Nach jedem Spieltag und jeder Entscheidung prüfen. */
  check(s: GameState): void {
    if (!this.enabled || this.active || s.failure || s.finished) return;
    const hint = HINTS.find((x) => !this.shown.has(x.id) && x.when(s));
    if (hint) {
      this.shown.add(hint.id);
      this.show(hint.text(s), hint);
      return;
    }
    if (s.day - this.lastHintDay >= GENERAL_TIP_EVERY_DAYS && this.tipIndex < GENERAL_TIPS.length) {
      this.show(GENERAL_TIPS[this.tipIndex++], null);
    }
  }

  private show(text: string, hint: Hint | null): void {
    this.active = true;
    this.lastHintDay = Number.MAX_SAFE_INTEGER;
    this.text.textContent = text;
    const buttons: HTMLElement[] = [];
    if (hint?.panel) {
      const panel = hint.panel;
      buttons.push(h('button', { type: 'button', class: 'btn btn--primary', 'data-tip': 'Öffnet den passenden Bereich. Die Zeit bleibt angehalten, bis Sie sie selbst fortsetzen.', onclick: () => { this.hide(false); this.hooks.openPanel(panel); } }, 'Zeigen'));
    }
    buttons.push(h('button', { type: 'button', class: hint?.panel ? 'btn' : 'btn btn--primary', 'data-tip': 'Schließt den Hinweis und lässt die Zeit weiterlaufen.', onclick: () => this.hide(true) }, 'Weiter'));
    this.actions.replaceChildren(...buttons);
    // Zeit anhalten, damit man in Ruhe lesen kann
    const sp = this.hooks.getSpeed();
    if (sp > 0) {
      this.resumeSpeed = sp;
      this.hooks.setSpeed(0);
    }
    this.el.hidden = false;
  }

  private hide(resume: boolean): void {
    if (!this.active && this.el.hidden) return;
    this.active = false;
    this.el.hidden = true;
    if (resume && this.resumeSpeed !== null) this.hooks.setSpeed(this.resumeSpeed);
    this.resumeSpeed = null;
    this.lastHintDay = this.currentDay;
  }

  /** wird von außen aktuell gehalten, damit der Abstand allgemeiner Tipps stimmt */
  currentDay = 0;
}
