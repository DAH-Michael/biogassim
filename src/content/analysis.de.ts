import { formatDate } from '../sim/calendar';
import type { GameState } from '../sim/types';
import { TIER_NAMES } from './events.de';

/**
 * Texte der Analyse. Sie ist der einzige Ort, an dem Zusammenhänge erklärt werden.
 * Sachlich und beschreibend: was ist passiert und warum hatte es diese Folge.
 * Keine Vorschriften, was man hätte tun sollen.
 */

/** Ebene 1: ein Satz, was passiert ist und wann. */
export function outcomeSentence(s: GameState): string {
  if (!s.failure) {
    return `Sie haben die Anlage vom 1. August bis zum 31. Juli geführt.`;
  }
  const day = formatDate(s.failure.day);
  const ev = s.log.events.find((e) => e.id === s.failure!.eventId);
  switch (ev?.type) {
    case 'failure_overflow': return `Am ${day} ist das Gärrestlager übergelaufen, und das Landratsamt hat die Anlage stillgelegt.`;
    case 'failure_acceptance': return `Am ${day} hat das Landratsamt die Anlage nach anhaltenden Beschwerden aus dem Dorf stillgelegt.`;
    case 'failure_biology': return `Am ${day} war der Fermenter seit ${ev.data.days} Tagen umgekippt und musste geleert werden.`;
    case 'failure_technical': return `Am ${day} war das BHKW nicht mehr zu reparieren, und für ein neues fehlte das Geld.`;
    case 'failure_insolvency': return `Am ${day} hat die Bank den Kredit gekündigt, der Betrieb ist zahlungsunfähig.`;
    default: return `Am ${day} endete der Betrieb.`;
  }
}

export function tierName(tier: number | null): string {
  return tier === null ? '' : TIER_NAMES[tier] ?? '';
}

/**
 * Hintergrund zu einzelnen Ereignistypen: die Zusammenhänge dahinter,
 * aufklappbar in der Kausalkette.
 */
export const BACKGROUND: Record<string, string> = {
  substrate_shift:
    'Im Fermenter arbeiten viele Gruppen von Mikroorganismen in einer Kette: Die einen zerlegen Stärke, Zellulose oder Eiweiß, andere machen daraus organische Säuren, und erst die Methanbildner wandeln diese Säuren in Methan um. Jede Gruppe hat sich auf das bisherige Futter eingestellt. Ändert sich die Zusammensetzung schlagartig, fehlt für einen Teil des neuen Futters die passende Mannschaft. Die säurebildenden Bakterien vermehren sich schnell, die Methanbildner brauchen Tage bis Wochen. Deshalb stellen Betreiber Futter meist schrittweise um, auch wenn die Energiemenge gleich bleibt.',
  load_jump:
    'Die Raumbelastung gibt an, wie viel organische Trockensubstanz pro Kubikmeter Fermenter und Tag hineinkommt. Mehr Futter erzeugt sofort mehr Säuren. Die Methanbildner wachsen aber nur langsam nach; bis sie die zusätzliche Menge bewältigen, vergehen Wochen. In dieser Zeit sammeln sich Säuren an. Eine schrittweise Steigerung gibt der Biologie Zeit mitzuwachsen.',
  trace_deficit:
    'Methanbildende Archaeen brauchen für ihre Enzyme Spurenelemente wie Nickel, Kobalt, Molybdän und Selen. Rindergülle bringt diese Stoffe aus dem Futter der Tiere mit. Mais und andere Silagen enthalten davon wenig. Fehlt Gülle über lange Zeit, verarmt der Fermenter schleichend; der Mangel zeigt sich erst nach Monaten. Viele Anlagen dosieren deshalb Spurenelemente gezielt, was Fachwissen über Analysen und Mengen voraussetzt.',
  fermenter_cold:
    'Der Fermenter wird mit der Abwärme des BHKW auf etwa 40 Grad gehalten. Steht das BHKW oder läuft es nur schwach, fehlt die Wärme, und im Winter kühlt der große Behälter innerhalb weniger Tage aus. Methanbildner reagieren empfindlicher auf Temperatur als die Säurebildner. Das Gleichgewicht verschiebt sich, Säure staut sich.',
  fos_tac_warning:
    'FOS/TAC ist das Verhältnis von flüchtigen organischen Säuren zum Kalkpuffer. Werte um 0,3 bis 0,4 gelten als unauffällig. Steigt der Wert, entstehen mehr Säuren, als abgebaut werden, und der Puffer wird aufgezehrt. Der Wert reagiert verzögert und wird im Labor gemessen; zwischen Probe und Ergebnis vergehen oft Tage.',
  fos_tac_critical:
    'Ab einem gewissen Säuregehalt hemmen die Säuren die Methanbildner selbst. Weniger Abbau bedeutet mehr Säure, mehr Säure bedeutet weniger Abbau. Dieser Kreislauf verstärkt sich und ist schwer aufzuhalten, wenn er einmal läuft.',
  fermenter_tipped:
    'Ein umgekippter Fermenter produziert kaum noch Gas. Ihn wieder hochzufahren dauert Wochen: Die Fütterung muss stark gesenkt werden, Puffer und frische Biologie müssen wieder aufgebaut werden. Gelingt das nicht, bleibt nur, den Behälter zu leeren und neu anzuimpfen.',
  service_overdue:
    'Ein Gasmotor läuft rund um die Uhr. Öl, Zündkerzen, Filter und Ventile verschleißen mit jeder Betriebsstunde. Die Wartungsintervalle sind so gelegt, dass Teile getauscht werden, bevor sie Schäden verursachen. Jede Stunde über das Intervall hinaus erhöht Verschleiß und Ausfallrisiko, auch wenn der Motor zunächst weiterläuft.',
  desulf_empty:
    'Biogas enthält Schwefelwasserstoff, besonders aus Gülle und eiweißreichen Reststoffen. Im Motor entsteht daraus Schwefelsäure, die Öl, Lager und Abgasanlage angreift. Die Entschwefelung bindet den Schwefel; ihr Mittel verbraucht sich und muss nachgefüllt werden.',
  chp_failure:
    'Steht das BHKW, wird kein Strom erzeugt. Das Gas sammelt sich im Speicher, und wenn er voll ist, muss es über die Notfackel verbrannt werden. Gleichzeitig fehlt die Abwärme für den Fermenter.',
  chp_destroyed:
    'Verschleiß summiert sich. Überfällige Wartungen, Schwefel im Gas und wiederholte Störungen beschleunigen ihn. Irgendwann ist eine Reparatur wirtschaftlich oder technisch nicht mehr möglich.',
  flare_on:
    'Die Notfackel ist eine Sicherheitseinrichtung: Gas darf nicht unverbrannt entweichen. Verfackeltes Gas bringt aber keinen Strom und kein Geld, und eine brennende Fackel beunruhigt die Nachbarschaft.',
  spreading_before_blackout:
    'Gärrest ist wertvoller Dünger und wird auf Felder gebracht. Das ist nur erlaubt, wenn Pflanzen die Nährstoffe aufnehmen können; im Herbst und Winter gilt eine Sperrfrist. In dieser Zeit muss das Lager alles aufnehmen, was die Anlage produziert. Wie viel vorher ausgebracht wird, entscheidet darüber, ob der Platz bis Februar reicht. Möglich ist das nur, wenn Felder frei sind, der Boden befahrbar ist und Landwirte Bedarf haben.',
  blackout_start_high:
    'Mit dem Beginn der Sperrfrist ist der Füllstand des Lagers die einzige Reserve für die nächsten vier Monate. Jeder Tag Betrieb bringt neuen Gärrest dazu, bei offenem Lager auch Regenwasser.',
  origin_storage:
    'Ältere Anlagen wurden oft mit kleineren Lagern gebaut. Heute verlangen die Auflagen Platz für etwa neun Monate. Ein kleineres Lager ist nicht verboten, aber es lässt wenig Spielraum: Fütterungsmenge, Gülleanteil, Regen und Ausbringung müssen genau zusammenpassen.',
  digestate_overflow:
    'Läuft ein Gärrestlager über, gelangen Nährstoffe unkontrolliert in Boden und Gewässer. Das ist ein schwerer Verstoß gegen die Lagerauflagen, und die Behörde muss einschreiten.',
  maize_contracts_closed:
    'Mais wird einmal im Jahr geerntet, im September. Was dann nicht im Silo liegt, muss bis zur nächsten Ernte am Markt gekauft werden, meist teurer und in kleinen Mengen. Deshalb planen Betreiber ihren Jahresbedarf im Sommer und schließen Lieferverträge mit Landwirten der Umgebung.',
  maize_harvest_summary:
    'Die eingelagerte Menge muss zwölf Monate reichen, abzüglich der Verluste im Silo. In Dürrejahren fallen die Erträge der ganzen Region geringer aus, und Nachkäufe werden teuer.',
  silo_empty:
    'Fehlt ein Substrat, ändert sich die Fütterung ohne eigenes Zutun: weniger Energie, eine andere Zusammensetzung, oft beides. Für die Biologie ist das ein abrupter Wechsel.',
  silo_compaction_poor:
    'Silage entsteht, wenn Milchsäurebakterien das Erntegut unter Luftabschluss konservieren. Dafür muss es fest verdichtet werden. Kommt in kurzer Zeit mehr an, als der Walzschlepper schafft, bleibt Luft im Stapel. Hefen und Schimmel bauen dann Energie ab, der Stapel erwärmt sich, und am Anschnitt riecht es.',
  silage_quality_poor:
    'Schlecht verdichtete Silage verliert über Monate Energie. Ein Teil des bezahlten Substrats geht so verloren, bevor es in den Fermenter kommt.',
  maizecap_exceeded:
    'Der sogenannte Maisdeckel begrenzt den Anteil von Mais an der eingesetzten Masse. Er soll verhindern, dass Biogas den Maisanbau in der Region übermäßig ausweitet. Gezählt wird nach Masse; Gülle zählt mit, Grünroggen nicht als Mais. Wer darüber liegt, bekommt für diesen Zeitraum nur den Marktwert des Stroms.',
  complaint:
    'Geruch, Verkehr und eine brennende Fackel sind für Nachbarn die sichtbaren Seiten einer Biogasanlage. Die meisten Ursachen hängen am Betrieb: offene Lager, schlecht verdichtete Silage, Prozessstörungen, Erntefahrten durch den Ort.',
  acceptance_low:
    'Akzeptanz baut sich langsam auf und schnell ab. Ruhiger Betrieb, Wärme für das Dorf und Gespräche helfen; wiederholte Belastungen zehren sie auf.',
  acceptance_critical:
    'Bei dauerhaft schlechter Stimmung und wiederholten Beschwerden prüft die Behörde den Betrieb genauer.',
  authority_notice:
    'Beschwerden landen beim Landratsamt. Häufen sie sich, wird der Betreiber angehört, und Auflagen können verschärft werden.',
  credit_exceeded:
    'Eine Biogasanlage hat hohe laufende Kosten und Einnahmen, die monatlich kommen. Große Zahlungen wie die Maisernte im Herbst oder Reparaturen werden über den Kreditrahmen überbrückt. Ist er dauerhaft überzogen, kündigt die Bank.',
  contaminants:
    'Reststoffe aus der Lebensmittelverarbeitung sind günstig und energiereich, aber nicht immer sauber. Verpackungsreste und Fremdkörper beschädigen Pumpen und Rührwerke.',
  grid_outage:
    'Bei Störungen im Stromnetz muss eine Anlage ihre Einspeisung unterbrechen. Ohne BHKW füllt sich der Gasspeicher, und der Fermenter bekommt keine Abwärme.',
  upgrading_failure:
    'Die Gasaufbereitung trennt Methan und Kohlendioxid über Membranen; Verdichter bringen das Gas auf Druck. Steht sie, kann kein Biomethan ins Netz. Das Gas sammelt sich im Speicher, und wenn er voll ist, brennt die Fackel. Schwefel im Gas und überfällige Wartung schädigen Verdichter und Membranen.',
  upgrading_service_overdue:
    'Verdichter haben feste Wartungsintervalle für Ventile, Dichtungen und Öl. Wird das Intervall überzogen, steigt das Risiko eines Ausfalls deutlich.',
  gas_grid_stop:
    'Das Erdgasnetz nimmt nur so viel Biomethan auf, wie Verbraucher abnehmen. In kleinen Netzen mit wenig Verbrauch, etwa im Sommer, oder bei Arbeiten am Netz muss die Einspeisung pausieren. Dann hilft nur ein großer Gasspeicher oder ein zweiter Verwerter wie ein BHKW.',
  stirrer_failure:
    'Rührwerke halten den Fermenterinhalt in Bewegung, damit Mikroorganismen und Futter in Kontakt kommen und keine Schwimmschichten entstehen. Fällt eines aus, kann weniger gefüttert werden.',
  residue_lot_started:
    'Jede Partie Reststoffe ist anders zusammengesetzt. Sie bauen schnell ab und erzeugen in kurzer Zeit viel Säure. Für die Biologie ist jede neue Partie ein kleiner Futterwechsel.',
};

/** Kategorie für die Darstellung in der Kausalkette. */
export function eventIcon(type: string, playerDecision: boolean): 'decision' | 'origin' | 'event' {
  if (playerDecision) return 'decision';
  if (type.startsWith('origin_') || type === 'drought_year') return 'origin';
  return 'event';
}
