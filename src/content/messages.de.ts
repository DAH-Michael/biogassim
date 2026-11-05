import type { WorldMessage } from '../sim/types';

/**
 * Meldungen aus der Welt. Kurz, in der Sprache der Person, ignorierbar.
 * Sie beschreiben, was die Person wahrnimmt oder möchte, und erklären nie die Lösung.
 * Landwirte und frühere Betreiber werden respektvoll dargestellt.
 */
export const SENDERS: Record<WorldMessage['sender'], string> = {
  betriebsleiter: 'Betriebsleiter',
  nachbar: 'Nachbarin',
  landwirt: 'Landwirt',
  behoerde: 'Landratsamt',
  netzbetreiber: 'Netzbetreiber',
  bank: 'Hausbank',
  biologin: 'Biologin',
  techniker: 'Verfahrenstechniker',
  agrar: 'Agrarberaterin',
  vermarkter: 'Energievermarkter',
};

type Text = (d: WorldMessage['data']) => string;

const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-DE') : String(v ?? ''));

export const MESSAGES: Record<string, Text> = {
  mais_angebot: () => 'Moin! Die Maisernte steht vor der Tür. Ein paar von uns hätten noch Mengen frei. Melden Sie sich bis Ende August, danach ist alles verplant.',
  roggen_angebot: () => 'Wir säen bald Grünroggen. Wenn Sie im Mai etwas davon wollen, sollten wir jetzt reden.',
  gaerrest_stoppel: () => 'Das Getreide ist runter. Auf unsere Stoppeln könnte Gärrest, solange es nicht zu nass ist.',
  gaerrest_fruehjahr: () => 'Die Sperrfrist ist vorbei. Wir bräuchten Dünger für die Frühjahrsbestellung.',
  feld_frei: (d) => `Mein Pachtvertrag für das ${n(d.feld)} läuft aus. ${n(d.ha)} Hektar, falls Sie Interesse haben.`,
  silo_voll: (d) => `Das Silo ist voll. ${n(d.t)} Tonnen mussten wir billig abgeben.`,
  silo_knapp: (d) => `Im Silo reicht es bei der jetzigen Fütterung noch etwa ${n(d.tage)} Tage.`,
  silo_leer: (d) => (d.kind === 'gruenroggen' ? 'Der Grünroggen ist alle.' : 'Der Mais ist alle. Ich füttere, was da ist.'),
  gaerrest_hoch: (d) => `Das Gärrestlager steht bei ${n(d.prozent)} Prozent. Mir ist das zu voll.`,
  entschwefelung_knapp: (d) => `Das Mittel in der Entschwefelung reicht noch ungefähr ${n(d.tage)} Tage.`,
  entschwefelung_leer: () => 'Die Entschwefelung ist leer. Das Gas riecht nach faulen Eiern.',
  wartung_faellig: (d) => `Das BHKW hat ${n(d.stunden)} Stunden seit der letzten Wartung drauf.`,
  bhkw_stoerung: (d) => `Das BHKW ist ausgefallen. Der Monteur rechnet mit ${n(d.tage)} Tagen.`,
  stoerstoffe: () => 'In der letzten Partie waren Folien und Dosen. Das Rührwerk hat was abbekommen.',
  fermenter_unruhig: () => 'Im Fermenter schäumt es, und das Gas wird weniger. Gefällt mir gar nicht.',
  fos_steigt: () => 'Die Säurewerte ziehen an. Noch nicht dramatisch, aber ich schaue genauer hin.',
  beschwerde_geruch: () => 'Bei uns im Garten stinkt es heute wieder. Kann man da nichts machen?',
  beschwerde_verkehr: () => 'Schon wieder ein Laster nach dem anderen durchs Dorf. Die Kinder spielen hier auf der Straße.',
  beschwerde_fackel: () => 'Bei Ihnen brennt schon wieder diese Fackel. Ist da etwas kaputt?',
  beschwerde_waerme: () => 'Unsere Heizung ist kalt. Wann kommt die Wärme wieder?',
  anhoerung: () => 'Uns liegen mehrere Beschwerden über Ihre Anlage vor. Wir laden Sie zu einer Anhörung ein.',
  maisdeckel: (d) => `Ihr Maisanteil liegt bei ${n(d.prozent)} Prozent. Für diesen Zeitraum können wir nur den Marktwert vergüten.`,
  kreditrahmen: () => 'Ihr Kontokorrent ist fast ausgeschöpft. Wir beobachten das.',
};

export function messageText(m: WorldMessage): string {
  const f = MESSAGES[m.key];
  return f ? f(m.data) : m.key;
}
