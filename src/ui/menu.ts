import { UNLOCKS } from '../meta/unlocks.config';
import { decodeSaveCode } from '../meta/savecode';
import { flagsToKeys } from '../meta/unlocks.config';
import type { ScenarioOptions } from '../sim/types';
import { h } from './dom';
import { TIPS } from '../content/tooltips.de';
import { advisorPortrait } from './portrait';
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
  /** zuletzt gewählter Schwierigkeitsgrad */
  difficulty?: ScenarioOptions['difficulty'];
  tutorial?: boolean;
  /** zuletzt gewählter Anlagenname (nur im Speicher) */
  plantName?: string;
}

const SCENARIOS: { id: ScenarioOptions['id']; title: string; text: string; needs?: string }[] = [
  { id: 'altanlage', title: 'Altanlage', text: 'Der Vorbesitzer hat sich zur Ruhe gesetzt. Die Anlage läuft, ist aber in die Jahre gekommen. Seine Felder sind noch bis Mitte Oktober verpachtet.' },
  { id: 'eigene_felder', title: 'Mit eigenen Feldern', text: 'Dieselbe Anlage, aber die drei Felder gehören zum Betrieb. Der Mais steht kurz vor der Ernte.', needs: 'eigene_felder' },
  { id: 'schwieriger_standort', title: 'Schwieriger Standort', text: 'Weniger Tierhaltung in der Nähe, längere Wege für Gülle, und das Dorf liegt direkt an der Zufahrt.', needs: 'schwieriger_standort' },
];

const LEVELS: { id: NonNullable<ScenarioOptions['difficulty']>; title: string; text: string; tip: string }[] = [
  {
    id: 'vereinfacht', title: 'Vereinfacht',
    text: 'Die Grundfunktionen: Fütterung, Verträge, Wartung, Gärrest, Ausbau. Die Biologie verzeiht mehr, der Laborwert kommt täglich.',
    tip: 'Ohne Personal, Entschwefelung, Reststoffe, eigene Felder, Instandsetzung, Gasspeicher- und Siloausbau. Ohne Spurenelemente, Futterwechsel-Stress, zufällige Störungen und Dürre. Sperrfrist und Maisdeckel gelten.'
  },
  {
    id: 'normal', title: 'Normal',
    text: 'Dazu Entschwefelung, Reststoffe, eigene Felder, Biologin und Verfahrenstechniker. Die Biologie mit allen Zusammenhängen.',
    tip: 'Biologie mit Spurenelementen und Anpassungszeit, wöchentlicher Laborwert, Verschleiß und Störungen, Silageverluste, Reststoffe mit Risiko, gelegentlich Dürre. Ohne Agrarberaterin, Energievermarkter, Zweikultur und eigenen Erntetermin.'
  },
  {
    id: 'real', title: 'Real',
    text: 'Der volle Funktionsumfang mit Agrarberaterin, Energievermarkter, Zweikultur und Erntetermin. Empfindlichere Biologie, mehr Störungen.',
    tip: 'Alle Funktionen. Methanbildner wachsen langsamer, Futterwechsel belasten stärker, Laborwert nach fünf Tagen, mehr BHKW-Störungen, Netzausfälle, Rührwerksstörungen, häufiger Dürre, stärker schwankende Reststoffe.'
  },
];

const REASONS: Record<string, string> = {
  laenge: 'Der Code hat zwölf Zeichen. Bitte noch einmal prüfen.',
  zeichen: 'Der Code enthält ein Zeichen, das es darin nicht gibt. Die Ziffern 0 und 1 sowie die Buchstaben O, I und L kommen nicht vor.',
  pruefsumme: 'Dieser Code passt nicht. Vielleicht hat sich ein Tippfehler eingeschlichen.',
  version: 'Dieser Code stammt aus einer anderen Version des Spiels.',
};

const PLANT_NAME_MAX = 40;

/** Name säubern: Steuerzeichen raus, Leerraum zusammenfassen, Länge begrenzen. Leer wird zu undefined. */
export function cleanPlantName(raw: string): string | undefined {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PLANT_NAME_MAX);
  return s || undefined;
}

export function buildMenu(o: MenuOptions): HTMLElement {
  let scenario: ScenarioOptions['id'] = 'altanlage';
  let level: NonNullable<ScenarioOptions['difficulty']> = o.difficulty ?? 'normal';
  let tutorial = o.tutorial ?? false;
  let largerStorage = false;
  let heatLine = false;

  // Name der Anlage: nur für diesen Durchlauf, nicht im Speichercode
  const nameInput = h('input', { type: 'text', id: 'plant-name', class: 'input', maxlength: PLANT_NAME_MAX, autocomplete: 'off', spellcheck: 'false', placeholder: 'z. B. Biogas Lindenhof', value: o.plantName ?? '' }) as HTMLInputElement;
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') (document.querySelector('.menu .btn--primary') as HTMLElement | null)?.click(); });
  const nameField = h('div', { class: 'menu__name' },
    h('label', { for: 'plant-name', class: 'field-label' }, 'Name Ihrer Anlage (freiwillig)'),
    nameInput,
    h('p', { class: 'muted' }, 'Erscheint oben in der Leiste und auf dem Ergebnis. Der Name wird nirgends gespeichert und ist nach dem Schließen der Seite weg.'),
  );

  const has = (k: string) => o.unlocks.includes(k);

  const scenarioList = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Startszenario' },
    ...SCENARIOS.filter((sc) => !sc.needs || has(sc.needs)).map((sc, i) => {
      const id = `sc-${sc.id}`;
      const input = h('input', { type: 'radio', name: 'scenario', id, value: sc.id, checked: i === 0 }) as HTMLInputElement;
      input.addEventListener('change', () => { scenario = sc.id; });
      return h('label', { class: 'choice', for: id }, input, h('span', { class: 'choice__body' }, h('strong', {}, sc.title), h('span', {}, sc.text)));
    }),
  );

  const levelList = h('div', { class: 'choices choices--3', role: 'radiogroup', 'aria-label': 'Schwierigkeit' },
    ...LEVELS.map((lv) => {
      const id = `lv-${lv.id}`;
      const input = h('input', { type: 'radio', name: 'level', id, value: lv.id, checked: lv.id === level }) as HTMLInputElement;
      input.addEventListener('change', () => { level = lv.id; });
      return h('label', { class: 'choice', for: id, 'data-tip': lv.tip }, input, h('span', { class: 'choice__body' }, h('strong', {}, lv.title), h('span', {}, lv.text)));
    }),
  );

  // Tutorial-Modus: Schalter zusätzlich zur Schwierigkeit
  const sw = h('input', { type: 'checkbox', role: 'switch', id: 'opt-tutorial', class: 'switch__input', checked: tutorial }) as HTMLInputElement;
  sw.addEventListener('change', () => { tutorial = sw.checked; });
  const face = h('span', { class: 'switch__face' });
  face.innerHTML = advisorPortrait(48);
  const tutorialSwitch = h('label', { class: 'switch', for: 'opt-tutorial', 'data-tip': 'Eine DAH-Beraterin meldet sich in wichtigen Momenten, erklärt die Lage und zeigt, wo man entscheidet. Die Zeit hält dafür kurz an.' },
    sw, h('span', { class: 'switch__track', 'aria-hidden': 'true' }), face,
    h('span', { class: 'switch__body' }, h('strong', {}, 'Mit DAH-Beraterin spielen'), h('span', {}, 'Tutorial-Modus: Hinweise und Erklärungen während des Spiels.')));

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
    h('div', { class: 'row' }, codeInput, h('button', { type: 'button', class: 'btn', 'data-tip': TIPS.applyCode, onclick: apply }, 'Übernehmen')),
    codeMsg,
    unlocked.length ? h('div', {}, h('p', { class: 'field-label' }, 'Ihr aktueller Code'), saveCodeView(codeForKeys(o.unlocks))) : null,
  );

  const start = h('button', {
    type: 'button',
    class: 'btn btn--primary btn--large',
    'data-tip': TIPS.start,
    onclick: () => o.onStart({ id: scenario, difficulty: level, tutorial, largerStorage, heatLineAtStart: heatLine, plantName: cleanPlantName(nameInput.value) }),
  }, 'Anlage übernehmen');

  return h('div', { class: 'menu' },
    h('header', { class: 'menu__head' },
      h('p', { class: 'eyebrow' }, 'Ein Jahr auf der Biogasanlage'),
      h('h2', { id: 'end-title' }, 'Biogas-Anlage'),
      h('p', { class: 'analysis__sentence' }, 'Am 1. August übernehmen Sie eine Biogasanlage mit 500 Kilowatt. Bis zum 31. Juli führen Sie den Betrieb.'),
      nameField,
      start,
    ),
    h('section', { class: 'menu__section' }, h('h3', {}, 'Startszenario'), scenarioList, ...options),
    h('section', { class: 'menu__section' }, h('h3', {}, 'Schwierigkeit'), levelList, tutorialSwitch),
    knowledge,
    codeSection,
  );
}
