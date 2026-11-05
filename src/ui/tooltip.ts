import { h } from './dom';

/**
 * Tooltips für alle Bedienelemente mit `data-tip`. Erscheinen bei Hover und Tastaturfokus,
 * auf Touch-Geräten bei langem Drücken (der Klick wird dann nicht ausgelöst).
 */
const SHOW_DELAY_MS = 350;
const LONG_PRESS_MS = 450;
const GAP = 8;

export class Tooltips {
  private el: HTMLElement;
  private target: HTMLElement | null = null;
  private timer: number | undefined;
  private pressTimer: number | undefined;
  private suppressClickOn: HTMLElement | null = null;

  constructor() {
    this.el = h('div', { class: 'tip', role: 'tooltip', id: 'tooltip', hidden: true });
    document.body.append(this.el);

    document.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      const t = this.find(e.target);
      if (t && t !== this.target) this.schedule(t, SHOW_DELAY_MS);
    });
    document.addEventListener('pointerout', (e) => {
      const t = this.find(e.target);
      if (t && t === this.target && !t.contains(e.relatedTarget as Node | null)) this.hide();
      else if (t) window.clearTimeout(this.timer);
    });
    document.addEventListener('focusin', (e) => {
      const t = this.find(e.target);
      if (t && (e.target as HTMLElement).matches(':focus-visible')) this.schedule(t, 0);
    });
    document.addEventListener('focusout', () => this.hide());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
    document.addEventListener('scroll', () => this.hide(), true);

    // Langes Drücken auf Touch-Geräten
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') {
        this.hide();
        return;
      }
      const t = this.find(e.target);
      window.clearTimeout(this.pressTimer);
      if (!t) {
        this.hide();
        return;
      }
      this.pressTimer = window.setTimeout(() => {
        this.show(t);
        this.suppressClickOn = t;
      }, LONG_PRESS_MS);
    });
    const cancelPress = () => window.clearTimeout(this.pressTimer);
    document.addEventListener('pointerup', cancelPress);
    document.addEventListener('pointercancel', cancelPress);
    document.addEventListener('click', (e) => {
      if (this.suppressClickOn && this.suppressClickOn.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.suppressClickOn = null;
    }, true);
  }

  private find(node: EventTarget | null): HTMLElement | null {
    return node instanceof Element ? (node.closest('[data-tip]') as HTMLElement | null) : null;
  }

  private schedule(t: HTMLElement, delay: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.show(t), delay);
  }

  private show(t: HTMLElement): void {
    const text = t.dataset.tip;
    if (!text || !t.isConnected) return;
    this.target = t;
    this.el.textContent = text;
    this.el.hidden = false;
    t.setAttribute('aria-describedby', 'tooltip');
    const r = t.getBoundingClientRect();
    const tip = this.el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = r.left + r.width / 2 - tip.width / 2;
    left = Math.max(GAP, Math.min(vw - tip.width - GAP, left));
    let top = r.bottom + GAP;
    if (top + tip.height > vh - GAP) top = r.top - tip.height - GAP;
    // Leiste links: Tooltip rechts daneben
    if (t.closest('.rail')) {
      left = r.right + GAP;
      top = Math.max(GAP, Math.min(vh - tip.height - GAP, r.top + r.height / 2 - tip.height / 2));
    }
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    if (this.target) this.target.removeAttribute('aria-describedby');
    this.target = null;
    this.el.hidden = true;
  }
}
