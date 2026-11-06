# Annahmen, Modell und offene Punkte

Stand Meilenstein 1. Alle Zahlen stehen in `src/sim/config.ts` und sind Richtwerte zur fachlichen Prüfung.

## Offene Punkte für den Fachbereich

1. **Maisdeckel (EEG):** Höchstanteil 40 % an der Inputmasse ist ein Platzhalter. Ebenfalls offen ist, ob eine Altanlage überhaupt einem Maisdeckel unterliegt; für das Spiel ist er bewusst als Grenze gesetzt. Folge einer Überschreitung (Annahme): Für den betroffenen Monat zahlt der Netzbetreiber nur den Marktwert statt der EEG-Vergütung. Gemessen wird kumuliert seit Beginn des Durchlaufs.
2. **EEG-Vergütung 0,21 €/kWh** für die Altanlage (inklusive Boni, Platzhalter). Davon hängt die Wirtschaftlichkeit stark ab.
3. **Personalkosten** sind anteilig für die Anlage angesetzt (Teilzeit oder mit Nachbaranlagen geteilt), 2.500 bis 3.500 € im Monat. Vollzeitgehälter würden sich bei 500 kW nicht tragen.
4. **Sperrfrist** vereinfacht vom 1. Oktober bis 31. Januar für alle Flächen.
5. **Gülle-Bonus** aus früheren EEG-Fassungen ist nicht modelliert.
6. **Biomethan:** fester Abnahmepreis 0,10 €/kWh (Heizwert), Strombedarf der Aufbereitung 0,25 kWh je m³ Rohbiogas, Methanschlupf 0,5 % (Membranverfahren). Der Maisdeckel gilt im Spiel auch für Biomethan; bei Überschreitung gibt es nur das Erdgaspreisniveau von 0,045 €/kWh. Das ist eine Vereinfachung: Ob und wie eine Einsatzstoffgrenze greift, hängt in der Realität vom Absatzweg ab.
7. **Größere Anlagen** (Biomethananlage 1,8-fach, Verbundanlage 2,6-fach) werden über einen Größenfaktor abgebildet: Lager, Silo, Gasspeicher, Fütterung, Lieferverträge, Gülle, Ausbringung, Startkonto und Kreditrahmen wachsen linear, Investitionen und Fixkosten mit dem Exponenten 0,8, die Verkehrstoleranz des Dorfs mit der Wurzel. Die Biologie rechnet pro Referenzeinheit (Fermenter der Altanlage), Raumbelastung und FOS/TAC sind also unabhängig von der Größe.

## Weitere Annahmen

* Durchlauf vom 1. August bis 31. Juli, Kalender ohne Schaltjahr.
* **Altanlage beim Start:**
  * BHKW mit 50 % Verschleiß und 2.200 Stunden seit der letzten Wartung (Intervall 2.000)
  * Entschwefelungsmittel für 25 Tage
  * Gärrestlager mit 9.500 m³, das sind rund 4,8 Monate statt der geforderten 9, zu 45 % gefüllt
  * 1.300 t Maissilage (etwa 52 Tage)
  * Fütterung des Vorbesitzers: 25 t Mais und 40 t Gülle pro Tag aus zwei bestehenden Gülleverträgen
* **Anlagen der Szenarien:**
  * Altanlage: BHKW 500 kW, Strom nach EEG
  * Biomethananlage mit eigenen Feldern (freigeschaltet): Gasaufbereitung für 450 m³ Rohbiogas pro Stunde, kein BHKW, ein Gaskessel heizt den Fermenter mit eigenem Biogas
  * Verbundanlage am schwierigen Standort (freigeschaltet): BHKW 500 kW für die EEG-Vergütung, der Rest des Gases geht in eine Aufbereitung für 400 m³ pro Stunde; reicht die BHKW-Abwärme nicht, springt der Kessel ein
  * Die Aufbereitung hat eigene Wartung (alle 4.000 Stunden), Störungen (schneller bei überfälliger Wartung und Schwefel im Gas) und in Stufe Real Einspeisestopps des Gasnetzbetreibers.
* **Eigene Felder im Basisszenario:** bis 15. Oktober an Nachbarn verpachtet, danach pachtbar. Im freigeschalteten Szenario gehören sie dem Betrieb, und der Mais steht zur Ernte.
* **Im Frühjahr gesäter Mais** wird erst nach dem Durchlauf geerntet. Die Jahresbilanz bewertet deshalb, ob Silovorrat oder stehender Mais bis zur nächsten Ernte reichen (45 Tage).
* **FOS/TAC sieht der Spieler nie als wahren Wert:**
  * externes Labor: wöchentlich, 3 Tage Verzug, Rauschen ±0,05
  * mit Biologin: zweimal pro Woche, 1 Tag Verzug
  * eigenes Labor (Freischaltung): täglich
* **Speichercode:** Ohne 0, O, 1, I und L bleiben 31 Zeichen. Kodiert wird daher in Basis 31 statt Base32.
  * 12 Zeichen in drei Vierergruppen
  * Inhalt: 6 Bit Version, 32 Bit Freischaltungen, 16 Bit CRC-16
  * Jeder einzelne Tippfehler und jede Vertauschung benachbarter Zeichen wird erkannt (getestet).

## Modell der Fermenterbiologie

Zweistufig: Hydrolyse und Säurebildung folgen der Fütterung schnell. Die Methanbildner haben eine Kapazität, die nur um höchstens 1,5 % pro Tag wächst und sich auf rund 135 % des Bedarfs einpendelt.

* Übersteigt das Säureangebot die wirksame Kapazität, staut sich Säure, FOS/TAC steigt und hemmt die Methanbildung weiter. Das verstärkt sich selbst bis zum Umkippen.
* Wirksame Kapazität = Kapazität · Temperatur · Hemmung · Anpassung an den Substratmix · Spurenelemente.
* Gülle liefert Puffer (TAC) und Spurenelemente. Reiner Mais führt über Monate zu Mangel.
* Ein abrupter Mixwechsel senkt die Anpassung; die Mikroorganismen stellen sich mit einer Zeitkonstante von 21 Tagen um.
* Die Verweilzeit ergibt sich aus Volumen und Durchsatz. Was nicht abgebaut ist, gast im Lager nach: offen als Verlust und Geruch, abgedeckt als zusätzliches Gas.

Die Verzögerungen entstehen aus diesen Mechanismen, nicht aus festen Wartezeiten.

## Kausalität

Jedes Folgeereignis nennt seine Ursachen, die gewichtigste zuerst. Grundlage dafür sind Ursachenregister je Mechanismus: Prozessbelastung, Lagerzufluss, Verschleiß, Akzeptanz und entgangene Euro.

* **Ursache** ist das Ende des Hauptpfads.
* **Auslöser** ist die direkte Ursache des Scheiterns.

Unterlassungen werden als zusammenfassende Ereignisse mit `playerDecision: true` protokolliert, damit die Kette nicht ins Leere läuft. Beispiele: „Ausbringung vor der Sperrfrist: 0 von 5.500 möglichen m³“, „Wartung überfällig“, „Maisversorgung für das Jahr: 2.500 von 12.000 t gesichert“.

## Farben

Folgt mit Meilenstein 2 in `docs/farbableitung.md`.
