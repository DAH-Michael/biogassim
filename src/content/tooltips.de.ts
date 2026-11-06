import { CONFIG, type BuildKind } from '../sim/config';

/**
 * Tooltip-Texte: was ein Knopf tut und was der Klick bedeutet.
 * Beschreibend, ohne zu sagen, was man tun sollte.
 */
const days = (n: number) => `${n} Tage`;

export const TIPS = {
  pause: 'Hält die Zeit an. Entscheidungen sind auch angehalten möglich. (Leertaste oder 0)',
  speed1: 'Normale Geschwindigkeit: ein Spieljahr dauert etwa 20 Minuten. (Taste 1)',
  speed2: 'Doppelte Geschwindigkeit: ein Spieljahr in etwa 10 Minuten. (Taste 2)',
  speed4: 'Vierfache Geschwindigkeit: ein Spieljahr in etwa 5 Minuten. (Taste 3)',

  rail: {
    feed: 'Fütterung: wie viel von welchem Substrat täglich in den Fermenter geht. (F)',
    supply: 'Beschaffung: Lieferverträge für Mais und Grünroggen, Gülle, Nachkauf und Reststoffe. (B)',
    fields: 'Felder: Flächen pachten, Kultur wählen, Erntetermin festlegen. (A)',
    tech: 'Technik: Wartung des BHKW und Nachfüllen der Entschwefelung. (T)',
    staff: 'Personal: Fachleute einstellen oder entlassen. (P)',
    dig: 'Gärrest: Ausbringung beauftragen, Füllstand des Lagers und Sperrfrist. (G)',
    build: 'Ausbau und Dorf: Anlagenteile erweitern, Stimmung im Dorf. (U)',
    money: 'Finanzen: Kontostand, Erlöse und Kosten seit dem 1. August. (K)',
  } as Record<string, string>,

  serviceUpgrading: 'Wartet die Verdichter der Gasaufbereitung: Ventile, Dichtungen, Öl. Die Aufbereitung steht dafür einen Tag, das Gas geht so lange in den Speicher.',
  closePanel: 'Schließt diesen Bereich. (Esc)',
  stats: 'Statistik: Kennzahlen und Verlaufskurven aller Werte seit dem 1. August bis heute, mit Ihren Entscheidungen und Warnungen auf der Zeitachse. Das Spiel pausiert so lange. (S)',
  closeMessage: 'Blendet die Meldung aus. Sie hat keine weitere Wirkung.',
  zoomIn: 'Vergrößert die Ansicht. Mit der Maus ziehen verschiebt sie. (Taste +)',
  zoomOut: 'Verkleinert die Ansicht. (Taste −)',
  zoomFit: 'Zeigt wieder die ganze Anlage mit Feldern und Dorf.',

  feedSlider: 'Tägliche Menge dieses Substrats in Tonnen. Die Änderung gilt ab sofort, sobald Sie den Regler loslassen.',
  signSupply: 'Schließt den Vertrag über die eingetragene Menge. Geliefert wird zur Ernte; bezahlt wird bei Lieferung zum genannten Preis plus Transport.',
  signGuelle: `Schließt einen Liefervertrag. Nach ${days(CONFIG.contracts.guelleActivationDays)} liefert der Hof bis zur genannten Menge pro Tag, soweit die Fütterung sie abruft. Sie zahlen den Transport.`,
  cancelGuelle: 'Beendet den Vertrag sofort. Diese Gülle steht danach nicht mehr zur Verfügung.',
  buySpot: `Kauft Maissilage am Markt zum heutigen Preis. Lieferung in ${days(CONFIG.contracts.spot.deliveryDays)}.`,
  buyResidue: `Kauft die ganze Partie. Sie kommt in ${days(CONFIG.residues.deliveryDays)} in den Vorlagebehälter. Zusammensetzung und Qualität zeigen sich erst im Fermenter.`,
  lease: 'Pachtet die Fläche für ein Jahr. Danach bestimmen Sie Kultur und Erntetermin.',
  crop: 'Was auf dem Feld angebaut wird. Gesät wird automatisch im passenden Zeitfenster; Anbaukosten fallen bei der Saat an.',
  harvestDay: 'Ab diesem Tag wird gehäckselt, an nassen Tagen nicht. Das Erntegut fährt direkt ins Fahrsilo.',
  serviceSmall: `Ölwechsel, Zündkerzen, Filter. Das BHKW steht dafür etwa einen Tag. Der Zähler bis zur nächsten Wartung beginnt von vorn.`,
  serviceMajor: 'Große Überholung des Motors. Das BHKW steht mehrere Tage, der Verschleiß sinkt deutlich.',
  desulf: 'Füllt das Mittel nach, das Schwefelwasserstoff aus dem Biogas bindet.',
  maintenanceContract: 'Fester Monatsbetrag. Kleine Wartungen laufen automatisch und ohne Zusatzkosten, Reparaturen werden teilweise übernommen.',
  hire: `Stellt die Person ein. Die Kosten laufen ab sofort monatlich, wirksam ist sie nach ${days(CONFIG.staff.onboardingDays)} Einarbeitung.`,
  fire: 'Beendet die Zusammenarbeit sofort. Es fällt eine Abfindung von einem Monatsbetrag an.',
  spread: 'Beauftragt die Ausbringung dieser Menge. Gefahren wird, wenn Landwirte Bedarf haben, keine Sperrfrist gilt und die Felder befahrbar sind. Kosten je Kubikmeter.',
  offtake: 'Betriebe mit eigenem Lager holen täglich Gärrest ab, auch in der Sperrfrist. Kosten je Kubikmeter.',
  dialog: 'Ein Abend mit den Nachbarn auf der Anlage. Danach ist eine Weile Pause bis zum nächsten.',
  build: {
    digestateStorage: `Baut ein zweites Gärrestlager mit ${CONFIG.builds.digestateStorage.addM3.toLocaleString('de-DE')} m³.`,
    gasStorage: `Vergrößert den Gasspeicher um ${CONFIG.builds.gasStorage.addM3.toLocaleString('de-DE')} m³.`,
    cover: 'Deckt das Gärrestlager mit einer gasdichten Membran ab.',
    heatLine: 'Verlegt eine Wärmeleitung ins Dorf. Die Abwärme des BHKW wird an die Häuser verkauft.',
    secondSilo: `Baut ein zweites Fahrsilo für ${CONFIG.silo.secondSiloT.toLocaleString('de-DE')} t Silage.`,
  } as Record<BuildKind, string>,
  buildCost: 'Die Hälfte der Kosten wird bei Auftrag fällig, der Rest bei Fertigstellung.',

  start: 'Startet ein neues Jahr mit den gewählten Einstellungen.',
  applyCode: 'Liest den Code und schaltet die darin gespeicherten Werkzeuge frei.',
  copyCode: 'Kopiert den Code in die Zwischenablage. Er ist der einzige Weg, Ihren Fortschritt mitzunehmen.',
  restart: 'Startet sofort ein neues Jahr mit denselben Einstellungen und Ihren Freischaltungen.',
  toMenu: 'Zurück zum Startmenü: Szenario, Schwierigkeit und Speichercode.',
};
