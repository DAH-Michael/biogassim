/**
 * Weiche Übergänge für Elemente, die ein- und ausgeblendet werden.
 *
 * `hidden` wird sofort gesetzt, damit die Programmlogik den Zustand ohne Verzögerung kennt.
 * Beim Ausblenden bleibt das Element per Klasse `is-leaving` noch so lange sichtbar, bis der
 * CSS-Übergang fertig ist. Wie ein Element ein- und ausgleitet, legt das Stylesheet fest
 * (Klassen `is-entering` und `is-leaving`). Bei „Bewegung reduzieren“ entfällt alles.
 */
const FALLBACK_MS = 450;

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const timers = new WeakMap<HTMLElement, number>();

export function setShown(el: HTMLElement, show: boolean): void {
  window.clearTimeout(timers.get(el));
  if (show) {
    const wasLeaving = el.classList.contains('is-leaving');
    if (!el.hidden && !wasLeaving) return;
    el.classList.remove('is-leaving');
    el.hidden = false;
    if (reducedMotion() || wasLeaving) return;
    el.classList.add('is-entering');
    void el.offsetWidth; // Startzustand übernehmen, dann zum Zielzustand gleiten
    requestAnimationFrame(() => el.classList.remove('is-entering'));
    return;
  }
  if (el.hidden) return;
  el.hidden = true;
  el.classList.remove('is-entering');
  if (reducedMotion()) return;
  el.classList.add('is-leaving');
  const done = () => {
    el.classList.remove('is-leaving');
    el.removeEventListener('transitionend', onEnd);
  };
  const onEnd = (e: TransitionEvent) => {
    if (e.target === el) done();
  };
  el.addEventListener('transitionend', onEnd);
  timers.set(el, window.setTimeout(done, FALLBACK_MS));
}

/**
 * FLIP: Positionen der Kinder merken, Änderung ausführen, dann jedes verbliebene Kind
 * von seiner alten Position an die neue gleiten lassen.
 */
export function flip(container: HTMLElement, mutate: () => void): void {
  if (reducedMotion()) {
    mutate();
    return;
  }
  const before = new Map<Element, DOMRect>();
  for (const c of Array.from(container.children)) before.set(c, c.getBoundingClientRect());
  mutate();
  for (const c of Array.from(container.children) as HTMLElement[]) {
    const old = before.get(c);
    if (!old) continue;
    const now = c.getBoundingClientRect();
    const dy = old.top - now.top;
    if (Math.abs(dy) < 0.5) continue;
    c.style.transition = 'none';
    c.style.transform = `translateY(${dy}px)`;
    void c.offsetWidth;
    c.style.transition = '';
    c.style.transform = '';
  }
}
