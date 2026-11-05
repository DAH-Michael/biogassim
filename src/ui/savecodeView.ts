import { formatSaveCode } from '../meta/savecode';
import { h } from './dom';

/**
 * Anzeige des Speichercodes in Vierergruppen mit Kopierknopf.
 * Kopieren über die Zwischenablage; wenn das im iframe nicht erlaubt ist,
 * wird der Code markiert, damit man ihn selbst kopieren kann.
 */
export function saveCodeView(code: string): HTMLElement {
  const shown = formatSaveCode(code);
  const field = h('input', { type: 'text', class: 'code__field', value: shown, readonly: true, 'aria-label': 'Speichercode', spellcheck: 'false' }) as HTMLInputElement;
  const status = h('span', { class: 'code__status', role: 'status', 'aria-live': 'polite' });
  const copy = h('button', {
    type: 'button',
    class: 'btn',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(shown);
        status.textContent = 'Kopiert.';
      } catch {
        field.focus();
        field.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        status.textContent = ok ? 'Kopiert.' : 'Markiert. Bitte mit Strg+C oder Kopieren übernehmen.';
      }
    },
  }, 'Kopieren');
  field.addEventListener('focus', () => field.select());
  return h('div', { class: 'code' }, field, copy, status);
}
