import type { GameState } from '../sim/types';

/**
 * Nach einem geschafften Jahr: Was zum echten Betrieb einer Biogasanlage noch gehört und im
 * Spiel nicht vorkommt. Bewusst knapp und ohne Anspruch auf Vollständigkeit; die Angaben zu
 * Regelwerken sind Beispiele und vor einer Veröffentlichung fachlich zu prüfen.
 */
export interface RealWorldItem {
  title: string;
  text: string;
  /** nur für Anlagen mit BHKW oder mit Gasaufbereitung */
  only?: 'chp' | 'upgrading';
}

export const REAL_WORLD_INTRO = 'Das Spiel zeigt einen Ausschnitt. Im echten Betrieb gehört noch einiges mehr dazu, das hier nicht einmal erwähnt wurde:';

export const REAL_WORLD: RealWorldItem[] = [
  { title: 'Nachhaltigkeitszertifizierung', text: 'Nachweise, dass Substrate und Gas die Nachhaltigkeitsanforderungen erfüllen: Treibhausgasbilanz, Herkunft der Einsatzstoffe, jährliche Audits über ein Zertifizierungssystem. Ab einer bestimmten Anlagengröße ist das Pflicht für die volle Vergütung.' },
  { title: 'Personalmanagement', text: 'Schichtpläne und Rufbereitschaft rund um die Uhr, Vertretung bei Urlaub und Krankheit, Schulungen, Einarbeitung neuer Leute und die Frage, wer den Betrieb in zehn Jahren führt.' },
  { title: 'Fuhrparkmanagement', text: 'Radlader, Traktoren, Güllefässer und Lkw: Wartung, Prüftermine, Fahrerqualifikation, Disposition in der Erntezeit und die Abstimmung mit Lohnunternehmern.' },
  { title: 'Arbeitssicherheit und Explosionsschutz', text: 'Gefährdungsbeurteilung, Explosionsschutzdokument, Gaswarngeräte, regelmäßige Unterweisungen und wiederkehrende Prüfungen von Anlagenteilen.' },
  { title: 'Genehmigungen und Behörden', text: 'Auflagen aus der Genehmigung, Emissionsmessungen, Prüfungen der Behälter und Rohrleitungen nach dem Wasserrecht, bei größeren Gasmengen zusätzliche Pflichten aus dem Störfallrecht.' },
  { title: 'Dokumentation und Meldepflichten', text: 'Einsatzstofftagebuch, Umweltgutachten, Einträge im Marktstammdatenregister, Meldungen an Netzbetreiber und Behörden. Fehlt ein Nachweis, ist die Vergütung schnell in Gefahr.' },
  { title: 'Düngerecht und Gärrest', text: 'Nährstoffanalysen des Gärrests, Düngebedarfsermittlung, Lieferscheine für jede Abgabe und eine Nährstoffbilanz des Betriebs.' },
  { title: 'Strom- und Wärmevermarktung', text: 'Direktvermarktung mit Fahrplänen, Flexibilisierung für Zeiten hoher Strompreise, Wärmelieferverträge mit Abrechnung und Messstellenbetrieb.', only: 'chp' },
  { title: 'Gasqualität und Messtechnik', text: 'Das eingespeiste Biomethan muss die Gasbeschaffenheit nach dem Regelwerk der Gasversorgung einhalten. Dazu kommen eichrechtskonforme Mengenmessung, Odorierung in Abstimmung mit dem Netzbetreiber und die Massenbilanz im Biogasregister.', only: 'upgrading' },
  { title: 'Verträge und Vermarktung des Biomethans', text: 'Abnahmeverträge mit Händlern oder Stadtwerken, Herkunftsnachweise, Bilanzkreise im Gasnetz und je nach Absatzmarkt eigene Anforderungen an Nachweise.', only: 'upgrading' },
  { title: 'Instandhaltung und Leittechnik', text: 'Wartungsplanung, Ersatzteillager, Koordination von Fremdfirmen, Prozessleittechnik mit Fernüberwachung und deren Schutz vor Cyberangriffen.' },
  { title: 'Versicherung, Finanzierung, Steuern', text: 'Betriebsunterbrechungs- und Haftpflichtversicherung, Kreditverträge, Abschreibungen, Energie- und Stromsteuer.' },
  { title: 'Kommunikation', text: 'Gespräche mit Gemeinde, Nachbarn, Landwirten und Presse, bevor es Ärger gibt, nicht erst danach.' },
];

export function realWorldItems(s: GameState, hasChp: boolean): RealWorldItem[] {
  return REAL_WORLD.filter((i) => !i.only || (i.only === 'chp' ? hasChp : !!s.upgrading));
}
