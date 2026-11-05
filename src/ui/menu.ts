import { UNLOCKS } from '../meta/unlocks.config';
import { decodeSaveCode } from '../meta/savecode';
import { flagsToKeys } from '../meta/unlocks.config';
import type { ScenarioOptions } from '../sim/types';
import { h } from './dom';
import { saveCodeView } from './savecodeView';
import { codeForKeys } from '../meta/progression';

/**
 * Startmenü: Ausgangslage, Startszenario, freigeschaltete Werkzeuge, Speichercode.
 * Keine Spielanleitung; die Ausgangslage ist erzählt, nicht erklärt.
 */
export interface MenuOptions {
  unlocks: string[];
  onUnlocks: (keys: string[]) => void;
  onStart: (scenario: ScenarioOptions) => void;
}

const SCENARIOS: { id: ScenarioOptions['id']; title: string; text: string; needs?: string }[] = [
  { id: 'altanlage', title: 'Altanlage', text: 'Der Vorbesitzer hat sich zur Ruhe gesetzt. Die Anlage läuft, ist aber in die Jahre gekommen. Seine Felder sind noch bis Mitte Oktober verpachtet.' },
  { id: 'eigene_felder', title: 'Mit eigenen Feldern', text: 'Dieselbe Anlage, aber die drei Felder gehören zum Betrieb. Der Mais steht kurz vor der Ernte.', needs: 'eigene_felder' },
  { id: 'schwieriger_standort', title: 'Schwieriger Standort', text: 'Weniger Tierhaltung in der Nähe, längere Wege für Gülle, und das Dorf liegt direkt an der Zufahrt.', needs: 'schwieriger_standort' },
];

const REASONS: Record<string, string> = {
  laenge: 'Der Code hat zwölf Zeichen. Bitte noch einmal prüfen.',
  zeichen: 'Der Code enthält ein Zeichen, das es darin nicht gibt. Die Ziffern 0 und 1 sowie die Buchstaben O, I und L kommen nicht vor.',
  pruefsumme: 'Dieser Code passt nicht. Vielleicht hat sich ein Tippfehler eingeschlichen.',
  version: 'Dieser Code stammt aus einer anderen Version des Spiels.',
};

export function buildMenu(o: MenuOptions): HTMLElement {
  let scenario: ScenarioOptions['id'] = 'altanlage';
  let largerStorage = false;
  let heatLine = false;

  const has = (k: string) => o.unlocks.includes(k);

  const scenarioList = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Startszenario' },
    ...SCENARIOS.filter((sc) => !sc.needs || has(sc.needs)).map((sc, i) => {
      const id = `sc-${sc.id}`;
      const input = h('input', { type: 'radio', name: 'scenario', id, value: sc.id, checked: i === 0 }) as HTMLInputElement;
      input.addEventListener('change', () => { scenario = sc.id; });
      return h('label', { class: 'choice', for: id }, input, h('span', { class: 'choice__body' }, h('strong', {}, sc.title), h('span', {}, sc.text)));
    }),
  );

  const options: HTMLElement[] = [];
  if (has('grosses_lager')) {
    const cb = h('input', { type: 'checkbox', id: 'opt-lager' }) as HTMLInputElement;
    cb.addEventListener('change', () => { largerStorage = cb.checked; });
    options.push(h('label', { class: 'check', for: 'opt-lager' }, cb, 'Mit zweitem Gärrestlager starten'));
  }
  if (has('waermeleitung_start')) {
    const cb = h('input', { type: 'checkbox', id: 'opt-waerme' }) as HTMLInputElement;
    cb.addEventListener('change', () => { heatLine = cb.checked; });
    options.push(h('label', { class: 'check', for: 'opt-waerme' }, cb, 'Wärmeleitung ins Dorf von Beginn an'));
  }

  const unlocked = UNLOCKS.filter((u) => has(u.key));
  const knowledge = h('section', { class: 'menu__section' },
    h('h3', {}, 'Wissen und Werkzeuge'),
    h('p', { class: 'muted' }, `${unlocked.length} von ${UNLOCKS.length} freigeschaltet`),
    unlocked.length ? h('ul', { class: 'unlocks' }, ...unlocked.map((u) => h('li', {}, h('strong', {}, u.title), h('span', {}, u.text)))) : null,
  );

  // Code eingeben
  const codeInput = h('input', { type: 'text', id: 'code-in', class: 'input code__input', autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXX XXXX XXXX', 'aria-describedby': 'code-msg', maxlength: 20 }) as HTMLInputElement;
  const codeMsg = h('p', { id: 'code-msg', class: 'code__msg', role: 'status', 'aria-live': 'polite' });
  const apply = () => {
    const r = decodeSaveCode(codeInput.value);
    if (!r.ok) {
      codeMsg.textContent = REASONS[r.reason];
      codeMsg.dataset.state = 'error';
      codeInput.setAttribute('aria-invalid', 'true');
      return;
    }
    const merged = [...new Set([...o.unlocks, ...flagsToKeys(r.payload.flags)])];
    o.onUnlocks(merged);
  };
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  const codeSection = h('section', { class: 'menu__section' },
    h('h3', {}, 'Speichercode'),
    h('label', { for: 'code-in', class: 'field-label' }, 'Code vom letzten Mal'),
    h('div', { class: 'row' }, codeInput, h('button', { type: 'button', class: 'btn', onclick: apply }, 'Übernehmen')),
    codeMsg,
    unlocked.length ? h('div', {}, h('p', { class: 'field-label' }, 'Ihr aktueller Code'), saveCodeView(codeForKeys(o.unlocks))) : null,
  );

  const start = h('button', {
    type: 'button',
    class: 'btn btn--primary btn--large',
    onclick: () => o.onStart({ id: scenario, largerStorage, heatLineAtStart: heatLine }),
  }, 'Anlage übernehmen');

  return h('div', { class: 'menu' },
    h('header', { class: 'menu__head' },
      h('p', { class: 'eyebrow' }, 'Ein Jahr auf der Biogasanlage'),
      h('h2', { id: 'end-title' }, 'Biogas-Anlage'),
      h('p', { class: 'analysis__sentence' }, 'Am 1. August übernehmen Sie eine Biogasanlage mit 500 Kilowatt. Bis zum 31. Juli führen Sie den Betrieb.'),
      start,
    ),
    h('section', { class: 'menu__section' }, h('h3', {}, 'Startszenario'), scenarioList, ...options),
    knowledge,
    codeSection,
  );
}
