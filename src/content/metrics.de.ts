/**
 * Tooltips der Kennwertleiste: was der Wert bedeutet und wo es eng wird.
 * Der aktuelle Zustand (z. B. „Silo reicht noch 12 Tage“) wird beim Anzeigen angehängt.
 */
export const METRIC_TIPS: Record<string, string> = {
  gas: 'Biogas, das die Fermenter heute erzeugt haben. Für Volllast braucht das BHKW je nach Methangehalt rund 5.700 m³ am Tag. Fällt die Menge, fehlt Strom und damit Erlös.',
  fos: 'Verhältnis von Säuren zu Puffer im Fermenter, gemessen im Labor. Unter 0,4 ist die Biologie entspannt, ab 0,5 droht sie zu kippen. Der Wert stammt aus der letzten Probe.',
  temp: 'Temperatur im Hauptfermenter. Die Biologie arbeitet zwischen 37 und 43 °C am besten. Reicht die Abwärme des BHKW nicht, kühlt der Fermenter langsam aus.',
  store: 'Füllstand des Gasspeichers auf dem Nachgärer. Fast voll heißt: bald brennt die Fackel. Fast leer heißt: das BHKW muss drosseln.',
  silo: 'Silage im Fahrsilo (Mais und Grünroggen). Die Reichweite ergibt sich aus der eingestellten Fütterung. Leeres Silo heißt: der Fermenter bekommt nur noch Gülle.',
  dig: 'Füllstand des Gärrestlagers. In der Sperrfrist vom 1. Oktober bis 31. Januar darf nichts ausgebracht werden. Ist das Lager voll, muss die Fütterung stoppen.',
  money: 'Kontostand des Betriebs. Strom wird am Monatsersten abgerechnet. Unter null fallen Zinsen an, jenseits des Kreditrahmens droht die Insolvenz.',
  acc: 'Wie das Dorf zur Anlage steht. Fackel, Geruch und Verkehr kosten Akzeptanz, Wärme und Dialog bringen sie zurück. Sehr niedrige Akzeptanz führt zu Beschwerden und Auflagen.',
};

export const METRIC_LEVEL_LABEL = { ok: 'im grünen Bereich', warn: 'Achtung', crit: 'kritisch' } as const;

export const METRIC_OPEN_HINT = 'Klicken zeigt den Verlauf.';
