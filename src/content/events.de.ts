import type { SimEvent } from '../sim/eventlog';
import { formatDate } from '../sim/calendar';

/**
 * Texte zu Ereignissen für Analyse und Konsole. Sachlich und beschreibend:
 * was ist passiert und warum hat es die Folge verursacht. Keine Vorschriften,
 * was man hätte tun sollen.
 */

const n = (v: number | string | undefined, digits = 0) =>
  typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : String(v ?? '');
const pct = (v: number | string | undefined) => (typeof v === 'number' ? `${n(v * 100)} %` : '');
const day = (v: number | string | undefined) => (typeof v === 'number' ? formatDate(v) : '');

const SUBSTRATE: Record<string, string> = { mais: 'Maissilage', gruenroggen: 'Grünroggensilage', guelle: 'Rindergülle', reststoff: 'Reststoffe' };
const ROLE: Record<string, string> = { biologin: 'Biologin', techniker: 'Verfahrenstechniker', agrar: 'Agrarberaterin', vermarkter: 'Energievermarkter' };
const BUILD: Record<string, string> = {
  digestateStorage: 'zweites Gärrestlager', gasStorage: 'größerer Gasspeicher', cover: 'Abdeckung des Gärrestlagers', heatLine: 'Wärmeleitung ins Dorf', secondSilo: 'zweites Fahrsilo',
};
const CROP: Record<string, string> = { brache: 'keine Kultur', mais: 'Mais', gruenroggen: 'Grünroggen', zweikultur: 'Grünroggen mit Mais als Zweitfrucht', zweitmais: 'Zweitfruchtmais' };
const TOPIC: Record<string, string> = { geruch: 'Geruch', verkehr: 'Verkehr', fackel: 'die Fackel', waerme: 'fehlende Wärme' };

export interface EventText { title: string; text: string }

export function describeEvent(e: SimEvent): EventText {
  const d = e.data;
  switch (e.type) {
    case 'origin_plant': return { title: 'Übernahme der Altanlage', text: `Das BHKW hat ${n(d.operatingHours)} Betriebsstunden und einen Verschleiß von ${pct(d.wear)}. Die letzte Wartung liegt ${n(d.hoursSinceService)} Stunden zurück.` };
    case 'origin_storage': return { title: 'Gärrestlager der Altanlage', text: `Das Lager fasst ${n(d.capacityM3)} m³. Das reicht bei der übernommenen Fütterung für rund ${n(d.months, 1)} Monate. Die Auflage verlangt ${n(d.requiredMonths)} Monate.` };
    case 'origin_open_storage': return { title: 'Offenes Gärrestlager', text: 'Das Gärrestlager ist nicht abgedeckt. Regen läuft hinein, Restgas entweicht, Geruch dringt nach außen.' };
    case 'origin_silo': return { title: 'Silovorrat bei Übernahme', text: `Im Fahrsilo lagen ${n(d.maizeT)} t Maissilage, genug für etwa ${n(d.days)} Tage.` };
    case 'origin_feeding': return { title: 'Fütterung des Vorbesitzers', text: `${n(d.mais)} t Mais und ${n(d.guelle)} t Gülle pro Tag.` };
    case 'origin_fields': return { title: 'Flächen', text: d.owned ? 'Die drei Felder gehören zum Betrieb, Mais steht kurz vor der Ernte.' : 'Die Felder des Vorbesitzers sind bis Mitte Oktober an Nachbarn verpachtet.' };
    case 'origin_heat_line': return { title: 'Wärmeleitung', text: 'Die Wärmeleitung ins Dorf ist von Beginn an in Betrieb.' };
    case 'drought_year': return { title: 'Dürrejahr', text: 'Der Sommer war trocken. Die Maiserträge in der Region fallen deutlich geringer aus, Nachkäufe werden teuer.' };

    case 'feeding_changed': return { title: 'Fütterung geändert', text: `Neue Tagesmenge: ${n(d.mais, 1)} t Mais, ${n(d.gruenroggen, 1)} t Grünroggen, ${n(d.guelle, 1)} t Gülle, ${n(d.reststoff, 1)} t Reststoffe (zusammen ${n(d.total, 1)} t, vorher ${n(d.prevTotal, 1)} t).` };
    case 'supply_signed': return { title: 'Liefervertrag geschlossen', text: `${n(d.tonnes)} t ${SUBSTRATE[String(d.kind)]} zu ${n(d.price, 2)} €/t, Entfernung ${n(d.distanceKm)} km.` };
    case 'spot_bought': return { title: 'Mais nachgekauft', text: `${n(d.tonnes)} t zu ${n(d.price, 2)} €/t.` };
    case 'guelle_signed': return { title: 'Güllevertrag geschlossen', text: `Bis zu ${n(d.tPerDay)} t pro Tag aus ${n(d.distanceKm)} km Entfernung.` };
    case 'guelle_cancelled': return { title: 'Güllevertrag gekündigt', text: 'Ein Gülleliefervertrag wurde beendet.' };
    case 'residue_bought': return { title: 'Reststoffe gekauft', text: `Partie mit ${n(d.tonnes)} t zu ${n(d.price)} €/t.` };
    case 'field_leased': return { title: 'Feld gepachtet', text: `${n(d.ha)} ha für ${n(d.costEur)} € im Jahr.` };
    case 'crop_set': return { title: 'Anbau festgelegt', text: `Kultur: ${CROP[String(d.crop)]}.` };
    case 'harvest_day_set': return { title: 'Erntetermin festgelegt', text: `Ernte ab ${day(d.day)}.` };
    case 'service_ordered': return { title: 'Wartung beauftragt', text: d.kind === 'entschwefelung' ? 'Entschwefelungsmittel nachgefüllt.' : d.kind === 'gross' ? 'Instandsetzung des BHKW beauftragt.' : 'Kleine Wartung des BHKW beauftragt.' };
    case 'staff_hired': return { title: 'Personal eingestellt', text: `${ROLE[String(d.role)]}, ${n(d.salary)} € im Monat.` };
    case 'staff_fired': return { title: 'Personal entlassen', text: `${ROLE[String(d.role)]}, Abfindung ${n(d.costEur)} €.` };
    case 'spreading_ordered': return { title: 'Gärrestausbringung beauftragt', text: `${n(d.m3)} m³.` };
    case 'build_ordered': return { title: 'Ausbau beauftragt', text: `${BUILD[String(d.kind)]}, ${n(d.costEur)} €, Bauzeit ${n(d.days)} Tage.` };
    case 'build_done': return { title: 'Ausbau fertig', text: `${BUILD[String(d.kind)]} ist in Betrieb.` };
    case 'citizen_dialog': return { title: 'Bürgerdialog', text: 'Ein Abend mit den Nachbarn auf der Anlage.' };
    case 'offtake_signed': return { title: 'Abnahmevertrag für Gärrest', text: `Betriebe mit eigenem Lager nehmen ${n(d.m3PerDay)} m³ pro Tag ab, auch in der Sperrfrist.` };
    case 'maintenance_contract': return { title: 'Wartungsvertrag', text: `Feste Kosten von ${n(d.eurPerMonth)} € im Monat.` };

    case 'maize_contracts_closed': return { title: 'Maisversorgung für das Jahr', text: `Bis Ende August wurden Lieferverträge über ${n(d.contractedT)} t Mais geschlossen. Angeboten waren ${n(d.offeredT)} t. Mais wird nur einmal im Jahr geerntet; was jetzt nicht gesichert ist, muss später teurer nachgekauft werden.` };
    case 'rye_contracts_closed': return { title: 'Grünroggen für das Frühjahr', text: `Für die Ernte im Mai wurden ${n(d.contractedT)} t Grünroggen vertraglich gesichert.` };
    case 'maize_harvest_summary': return { title: 'Maisernte abgeschlossen', text: `Eingelagert: ${n(d.totalT)} t (eigene Felder ${n(d.ownT)} t, Verträge ${n(d.contractT)} t, Nachkauf ${n(d.spotT)} t). Silobestand danach ${n(d.siloT)} t.` };
    case 'rye_harvest_summary': return { title: 'Grünroggenernte abgeschlossen', text: `Eingelagert: ${n(d.totalT)} t (eigene Felder ${n(d.ownT)} t, Verträge ${n(d.contractT)} t).` };
    case 'field_sown': return { title: 'Feld bestellt', text: `${CROP[String(d.crop)]} auf ${n(d.ha)} ha, Kosten ${n(d.costEur)} €.` };
    case 'field_harvest_start': return { title: 'Ernte begonnen', text: Number(d.offsetToOptimum) < 0 ? `${n(-Number(d.offsetToOptimum))} Tage vor der besten Reife. Das Erntegut ist noch nass.` : Number(d.offsetToOptimum) > 0 ? `${n(d.offsetToOptimum)} Tage nach der besten Reife. Das Erntegut ist trockener und schwerer zu verdichten.` : 'Zur besten Reife.' };
    case 'field_harvest_done': return { title: 'Feld abgeerntet', text: `${n(d.t)} t eingefahren.` };
    case 'silo_compaction_poor': return { title: 'Silo nicht ausreichend verdichtet', text: `An einem Tag kamen ${n(d.deliveredT)} t an. Der Walzschlepper schafft nur einen Teil davon gründlich (Verdichtung ${pct(d.compaction)}). Locker eingelagerte Silage enthält Luft, darin bauen Hefen und Schimmel die Energie ab.` };
    case 'silage_quality_poor': return { title: 'Silage verliert an Qualität', text: `Die Qualität der Maissilage liegt bei ${pct(d.quality)}. Ein Teil der Energie geht im Lager verloren, und am Anschnitt riecht es.` };
    case 'silo_overflow': return { title: 'Fahrsilo voll', text: `${n(d.overflowT)} t passten nicht mehr ins Silo (Kapazität ${n(d.capacityT)} t) und wurden billig abgegeben.` };
    case 'silo_empty': return { title: `${SUBSTRATE[String(d.kind)]} aufgebraucht`, text: `Geplant waren ${n(d.wantT, 1)} t pro Tag, vorhanden nur ${n(d.fedT, 1)} t. Die Fütterung ändert sich damit ohne eigenes Zutun.` };
    case 'residue_lot_started': return { title: 'Neue Reststoffpartie', text: `Eine neue Partie (${n(d.tonnes)} t) geht in den Fermenter. Jede Partie ist anders zusammengesetzt.` };
    case 'residue_out': return { title: 'Reststoffe aufgebraucht', text: 'Der Vorlagebehälter ist leer, die Mischung ändert sich.' };
    case 'contaminants': return { title: 'Störstoffe in der Partie', text: `Verpackungsreste und Fremdkörper haben Pumpe und Rührwerk beschädigt. Reparatur ${n(d.costEur)} €, ${n(d.days)} Tage eingeschränkte Fütterung.` };

    case 'substrate_shift': return { title: 'Abrupter Substratwechsel', text: `Die Zusammensetzung des Futters hat sich auf einen Schlag um ${pct(d.shift)} verschoben. Die Mikroorganismen im Fermenter sind auf ihr bisheriges Futter eingestellt. Jede Gruppe zersetzt bestimmte Stoffe; ändert sich das Angebot plötzlich, fehlen die passenden Spezialisten, und es dauert Wochen, bis sie sich vermehrt haben. In dieser Zeit entstehen mehr Säuren, als abgebaut werden.` };
    case 'load_jump': return { title: 'Belastung schnell erhöht', text: `Die Raumbelastung stieg innerhalb weniger Tage von ${n(d.from, 2)} auf ${n(d.to, 2)} kg oTS pro m³ und Tag. Die säurebildenden Bakterien reagieren sofort auf mehr Futter, die methanbildenden Archaeen wachsen dagegen langsam nach. Die Lücke füllt sich mit Säure.` };
    case 'trace_deficit': return { title: 'Spurenelemente knapp', text: `Methanbildner brauchen Spurenelemente wie Nickel, Kobalt und Selen. Gülle bringt sie mit, Silage kaum. Der Index liegt bei ${n(d.traceIndex, 2)}, die Methanbildung arbeitet gebremst.` };
    case 'fermenter_cold': return { title: 'Fermenter kühlt aus', text: `Ohne Abwärme des BHKW sinkt die Temperatur (${n(d.tempC, 1)} °C). Methanbildner sind temperaturempfindlicher als die Säurebildner, das Gleichgewicht kippt in Richtung Säure.` };
    case 'fos_tac_warning': return { title: 'FOS/TAC steigt', text: `Der Wert erreicht ${n(d.fosTac, 2)} bei einer Raumbelastung von ${n(d.olr, 2)}. Es entstehen mehr organische Säuren, als die Methanbildner umsetzen, der Kalkpuffer wird aufgezehrt.` };
    case 'fos_tac_critical': return { title: 'FOS/TAC kritisch', text: `Der Wert erreicht ${n(d.fosTac, 2)}. Die angestauten Säuren hemmen nun selbst die Methanbildung. Weniger Abbau bedeutet noch mehr Säure: Der Prozess verstärkt sich selbst.` };
    case 'fos_tac_normal': return { title: 'FOS/TAC wieder unauffällig', text: `Der Wert liegt wieder bei ${n(d.fosTac, 2)}.` };
    case 'fermenter_tipped': return { title: 'Fermenter umgekippt', text: `FOS/TAC über ${n(d.fosTac, 2)}. Die Methanbildung ist weitgehend zum Erliegen gekommen, die Gasproduktion bricht ein.` };
    case 'fermenter_recovered': return { title: 'Fermenter erholt', text: `Nach ${n(d.days)} Tagen arbeitet die Biologie wieder stabil.` };

    case 'service_overdue': return { title: 'Wartung überfällig', text: `Das BHKW läuft ${n(d.hoursSinceService)} Stunden seit der letzten Wartung. Öl, Zündkerzen und Filter altern, Verschleiß und Störanfälligkeit steigen.` };
    case 'service_small': return { title: 'BHKW gewartet', text: `Kosten ${n(d.costEur)} €, Stillstand ${n(d.days)} Tag(e).` };
    case 'service_major': return { title: 'BHKW instand gesetzt', text: `Kosten ${n(d.costEur)} €, Stillstand ${n(d.days)} Tage.` };
    case 'desulf_empty': return { title: 'Entschwefelungsmittel verbraucht', text: `Ohne Mittel bleibt deutlich mehr Schwefelwasserstoff im Gas (${n(d.cleanPpm)} statt weniger als 30 ppm). Im Motor wird daraus Schwefelsäure, die Lager und Öl angreift.` };
    case 'desulf_refilled': return { title: 'Entschwefelung nachgefüllt', text: `Kosten ${n(d.costEur)} €.` };
    case 'chp_failure': return { title: 'BHKW-Störung', text: `Das BHKW steht ${n(d.days)} Tage, Reparatur ${n(d.costEur)} €. Verschleiß jetzt ${pct(d.wear)}.` };
    case 'chp_restart': return { title: 'BHKW läuft wieder', text: '' };
    case 'chp_destroyed': return { title: 'BHKW-Totalschaden', text: `Der Motor ist irreparabel beschädigt (Verschleiß ${pct(d.wear)}). Ein Ersatz kostet ${n(d.costEur)} €.` };
    case 'chp_replaced': return { title: 'Ersatz-BHKW bestellt', text: `${n(d.costEur)} €, einige Wochen ohne Stromerzeugung.` };
    case 'flare_on': return { title: 'Notfackel brennt', text: `Der Gasspeicher ist voll, ${n(d.flaredM3)} m³ Biogas werden am ersten Tag verbrannt, ohne Strom zu erzeugen.` };

    case 'spreading_before_blackout': return { title: 'Ausbringung vor der Sperrfrist', text: `Von August bis Ende September wurden ${n(d.spreadM3)} m³ Gärrest ausgebracht. Abnehmer hätten in dieser Zeit rund ${n(d.possibleM3)} m³ aufnehmen können. Zu Beginn der Sperrfrist war das Lager zu ${pct(d.fillShare)} gefüllt.` };
    case 'blackout_start_high': return { title: 'Sperrfrist beginnt mit vollem Lager', text: `Ab dem 1. Oktober darf bis Ende Januar kein Gärrest auf Ackerland. Das Lager ist zu ${pct(d.fillShare)} gefüllt und nimmt jeden Tag weiter zu.` };
    case 'digestate_high': return { title: 'Gärrestlager fast voll', text: `Füllstand ${pct(d.fillShare)} (${n(d.m3)} m³).` };
    case 'digestate_overflow': return { title: 'Gärrestlager übergelaufen', text: `Das Lager ist mit ${n(d.m3)} m³ über seiner Kapazität von ${n(d.capacityM3)} m³. Gärrest tritt aus. Das ist ein Verstoß gegen die Lagerauflagen.` };

    case 'complaint': return { title: 'Beschwerde aus dem Dorf', text: `Es geht um ${TOPIC[String(d.topic)]}. Akzeptanz ${n(d.acceptance)}.` };
    case 'authority_notice': return { title: 'Behörde schaltet sich ein', text: `Nach ${n(d.complaints)} Beschwerden kündigt das Amt eine Anhörung an.` };
    case 'acceptance_low': return { title: 'Akzeptanz sinkt', text: `Die Stimmung im Dorf ist gekippt (${n(d.acceptance)}).` };
    case 'acceptance_critical': return { title: 'Akzeptanz kritisch', text: `Die Akzeptanz liegt bei ${n(d.acceptance)}.` };

    case 'maizecap_exceeded': return { title: 'Maisdeckel überschritten', text: `Der Maisanteil an der eingesetzten Masse liegt bei ${pct(d.share)}, erlaubt sind ${pct(d.cap)}. Für diesen Zeitraum zahlt der Netzbetreiber nur den Marktwert statt der EEG-Vergütung.` };
    case 'credit_exceeded': return { title: 'Kreditrahmen überschritten', text: `Kontostand ${n(d.balance)} €, Rahmen ${n(d.limit)} €.` };
    case 'month_settled': return { title: 'Monatsabrechnung', text: `${n(d.kwh)} kWh zu ${n(d.price, 3)} €/kWh, Erlöse ${n(d.revenueEur)} €.` };

    case 'failure_overflow': return { title: 'Behördliche Stilllegung', text: 'Wegen des übergelaufenen Gärrestlagers ordnet die Behörde die Stilllegung an.' };
    case 'failure_acceptance': return { title: 'Behördliche Stilllegung', text: `Nach anhaltender Belastung und ${n(d.complaints)} Beschwerden ordnet die Behörde die Stilllegung an.` };
    case 'failure_biology': return { title: 'Biologischer Totalausfall', text: `Der Fermenter ließ sich innerhalb von ${n(d.days)} Tagen nicht wieder hochfahren. Er muss geleert und neu angeimpft werden.` };
    case 'failure_technical': return { title: 'Technischer Totalschaden', text: `Für ein Ersatz-BHKW reicht das Geld nicht (Kontostand ${n(d.balance)} €).` };
    case 'failure_insolvency': return { title: 'Insolvenz', text: `Der Kreditrahmen ist seit ${n(d.days)} Tagen überschritten (Kontostand ${n(d.balance)} €). Die Bank kündigt den Kredit.` };
    case 'year_completed': return { title: 'Jahr abgeschlossen', text: '' };
    default: return { title: e.type, text: JSON.stringify(d) };
  }
}

export const FAILURE_TITLES: Record<string, string> = {
  insolvenz: 'Insolvenz',
  biologie: 'Biologischer Totalausfall',
  behoerde: 'Behördliche Stilllegung',
  technik: 'Technischer Totalschaden',
};

export const TIER_NAMES = ['Durchgehalten', 'Solide', 'Gut geführt', 'Vorbildlich'];
