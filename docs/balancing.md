# Balancing-Durchgang (Meilenstein 7)

Stand nach Meilenstein 7. Alle Zahlen stammen aus der Simulation mit den scripted Testspielern (`src/sim/strategies/index.ts`), ausgewertet mit:

```bash
npm run balance -- --seeds 50
npm run balance -- --seeds 30 --scenario eigene_felder
npm run balance -- --seeds 30 --scenario schwieriger_standort
```

Die Testspieler sehen nur, was auch ein Spieler sieht (Laborwerte, Lager, Konto). Sie reagieren aber nicht auf Meldungen aus der Welt und planen nicht voraus. Ein aufmerksamer Mensch spielt besser, ein unaufmerksamer schlechter. Die Ergebnisse zeigen deshalb, ob die Mechanik die beabsichtigten Muster erzeugt, nicht, wie schwer sich das Spiel anfühlt.

## Kurzfassung

| Ziel aus der Arbeitsanweisung | Ergebnis |
|---|---|
| Ein naiver erster Versuch scheitert wahrscheinlich | erfüllt: 50 von 50 scheitern, alle am übergelaufenen Gärrestlager (Mitte Oktober) |
| Ein informierter zweiter oder dritter Versuch kann gelingen | erfüllt: der zweite Versuch scheitert am BHKW (Mitte November), der dritte schafft das Jahr in 50 von 50 Fällen |
| Reine Gülle scheitert oder bleibt schwach | erfüllt: scheitert immer (biologisch oder Stilllegung), vorher rund ein Drittel der Stromleistung |
| Sinnvolle Mais-Strategie funktioniert, stößt aber an Grenzen | erfüllt: Mais unter dem Deckel mit Gülle gelingt immer; Mais ohne Gülle scheitert an Spurenelementen oder Maisdeckel, Mais bis an den Deckel am Gärrestlager |
| Wartung immer aufschieben | scheitert immer am technischen Totalschaden (Mitte November) |
| Kein Personal | gelingt, aber mit mehr Gasverlusten und seltener „Gut geführt“ als mit Techniker |
| Mindestens vier Scheiterursachen erreichbar | erfüllt: Insolvenz, biologischer Totalausfall, Stilllegung (Lager und Akzeptanz), technischer Totalschaden |

Alle Ziele sind als Regressionstests in `tests/balance.test.ts` festgehalten.

## Ergebnisse je Strategie (Altanlage, 50 Seeds)

| Strategie | Jahr geschafft | Scheitern (Art: Anzahl) | typischer Zeitpunkt | Gewinn bei Erfolg (Mittel) | Stufen bei Erfolg | Akzeptanz Ø | Gasverluste Ø |
|---|---|---|---|---|---|---|---|
| nichts | 0 % | Behördliche Stilllegung: 49, Technischer Totalschaden: 1 | 10. November | – | – | 51 | 8.8 % |
| naiv | 0 % | Behördliche Stilllegung: 50 | 19. Oktober | – | – | 41 | 20.4 % |
| nur_mais | 0 % | Biologischer Totalausfall: 26, Insolvenz: 24 | 20. Juli | – | – | 44 | 3.2 % |
| nur_guelle | 0 % | Biologischer Totalausfall: 40, Behördliche Stilllegung: 10 | 13. April | – | – | 52 | 6.8 % |
| ausgewogen | 100 % | – | – | 12 T€ | Gut geführt 17, Solide 33 | 49 | 5.6 % |
| wartung_aufschieben | 0 % | Technischer Totalschaden: 50 | 15. November | – | – | 52 | 13.3 % |
| kein_personal | 100 % | – | – | 42 T€ | Gut geführt 23, Solide 27 | 49 | 5.5 % |
| versuch2 | 0 % | Technischer Totalschaden: 50 | 14. November | – | – | 40 | 20.7 % |
| versuch3 | 100 % | – | – | 22 T€ | Gut geführt 18, Solide 32 | 48 | 5.6 % |
| mais_maximal | 0 % | Behördliche Stilllegung: 50 | 20. Oktober | – | – | 33 | 11.8 % |
| mit_techniker | 100 % | – | – | 37 T€ | Gut geführt 45, Solide 5 | 50 | 3.3 % |
| mit_biologin | 100 % | – | – | 12 T€ | Gut geführt 17, Solide 33 | 49 | 5.6 % |
| mit_agrar | 100 % | – | – | 30 T€ | Gut geführt 21, Solide 29 | 51 | 5.5 % |
| mit_vermarkter | 100 % | – | – | 81 T€ | Gut geführt 34, Solide 16 | 49 | 5.5 % |
| vorbildlich | 100 % | – | – | 96 T€ | Vorbildlich 27, Gut geführt 23 | 57 | 0.9 % |
| dauerfackel | 0 % | Behördliche Stilllegung: 50 | 24. Oktober | – | – | 30 | 12.8 % |
| ueberfuettern_biologin | 0 % | Behördliche Stilllegung: 48, Biologischer Totalausfall: 2 | 31. Januar | – | – | 47 | 14.4 % |
| nur_mais_biologin | 10 % | Insolvenz: 45 | 4. Juli | -580 T€ | Solide 5 | 43 | 3.5 % |
| steigern | 4 % | Behördliche Stilllegung: 48 | 26. April | -242 T€ | Solide 2 | 41 | 11.9 % |
| steigern_biologin | 0 % | Behördliche Stilllegung: 50 | 18. April | – | – | 42 | 13.2 % |
| ueberfuettern | 0 % | Biologischer Totalausfall: 49, Behördliche Stilllegung: 1 | 28. Januar | – | – | 49 | 4.0 % |

„Gewinn“ ist Kontostand am Ende minus Startkapital plus Restwert der Investitionen (90 % nach einem Jahr). Die Spalte „Akzeptanz Ø“ ist der Jahresmittelwert, „Gasverluste“ umfasst Fackel und Methan aus dem offenen Gärrestlager.

## Die beabsichtigten Strategien im Einzelnen

**Nur Mais** (`nur_mais`: 29 t Mais, keine Gülle, alle Maisverträge, Wartung, Ausbringung). Scheitert immer, aber spät und auf zwei Wegen: Ohne Gülle verarmt der Fermenter an Spurenelementen. Ab März sinkt die Leistung der Methanbildner, im Mai steigt FOS/TAC, im Juni kippt der Fermenter. Parallel liegt der Maisanteil bei 100 %, der Netzbetreiber zahlt nur den Marktwert, und das Konto läuft bis Juli über den Kreditrahmen. Mit Biologin (`nur_mais_biologin`) bleibt die Biologie dank Spurenelementdosierung stabil, die Anlage geht aber trotzdem am Maisdeckel pleite. Die Kausalkette führt jeweils auf die Fütterungsentscheidung am 1. August zurück.

**Nur Gülle** (`nur_guelle`: 80 t Gülle aus allen drei Ställen). Rund ein Drittel der Stromleistung, dafür sehr viel Volumen. Ohne Reaktion läuft das Lager in der Sperrfrist über. Reduziert der Spieler die Gülle, reicht die Gasmenge im Winter nicht mehr, um den Fermenter zu heizen; er kühlt aus und kippt. Beide Wege sind fachlich plausibel und zeigen, warum Gülle allein keine Anlage dieser Größe trägt.

**Ausgewogen** (`kein_personal`, `ausgewogen`: 24 t Mais, 40 t Gülle, Grünroggen im Mai, rechtzeitige Ausbringung, Wartung). Gelingt immer. Der Gewinn bleibt knapp (Mittel rund 42.000 € ohne Personal), was zur Wirklichkeit älterer 500-kW-Anlagen passt. Typische Bewertung „Solide“ bis „Gut geführt“.

**Mais bis an den Deckel** (`mais_maximal`: 30 t Mais und 45 t Gülle, also genau 40 % Mais). Um so viel Mais einsetzen zu dürfen, braucht es so viel Gülle, dass das Lager das Volumen nicht mehr fasst. Das ist der Zielkonflikt, den die Arbeitsanweisung meint: Maisdeckel, Gülle und Gärrestlager hängen zusammen.

**Wartung aufschieben** (`wartung_aufschieben`). Ohne Wartung und ohne Nachfüllen der Entschwefelung steigt der Verschleiß des ohnehin alten BHKW schnell. Nach drei bis vier Störungen folgt Mitte November der Totalschaden; für ein neues BHKW fehlt nach der Maisernte die Liquidität.

**Kein Personal** (`kein_personal`). Gelingt, und ist in ruhigen Jahren sogar das günstigste Profil. Die Unterschiede zeigen sich im Risiko und in der Qualität, siehe unten.

## Lernkurve

| Versuch | Was der Spieler anders macht | Ergebnis |
|---|---|---|
| 1 (`naiv`) | mehr Mais für mehr Strom, ein Liefervertrag | Lager läuft Mitte Oktober über |
| 2 (`versuch2`) | bringt im August und September Gärrest aus | übersteht die Sperrfrist, aber das BHKW fällt im November aus (keine Wartung) |
| 3 (`versuch3`) | zusätzlich Wartung, genug Mais, Fütterung des Vorbesitzers | schafft das Jahr, meist „Solide“ |
| später (`vorbildlich`) | Techniker und Vermarkter, nach der Ernte Abdeckung, Gasspeicher und Wärmeleitung | „Vorbildlich“ in gut der Hälfte der Fälle |

Jeder Versuch deckt ein neues Teilsystem auf, und jedes Scheitern schaltet ein passendes Werkzeug frei (größeres Lager oder Abnahmeverträge, Wartungsvertrag).

## Personal

Nach dem ersten Test auf realistische Vollzeitkosten umgestellt (Arbeitgeberkosten pro Monat, brutto plus rund 21 % Sozialabgaben): Biologin 5.700 €, Verfahrenstechniker 5.000 €, Agrarberaterin 5.200 €, Energievermarkter 5.800 €. Die Wirkungen sind auf plausible Größen gesetzt: Der Techniker macht kleine Wartungen selbst und stellt den Motor nach (1,5 % mehr elektrischer Wirkungsgrad), der Vermarkter erzielt 2 ct/kWh Mehrerlös, die Agrarberaterin 10 % bessere Preise, die Biologin 5 % Mehrertrag.

| Fachkraft (je 30 Seeds) | Normal: Gewinn ggü. ohne Personal | Real: Gewinn ggü. ohne Personal | Wirkung im Risiko |
|---|---|---|---|
| Verfahrenstechniker | rund +4.000 € | rund +12.000 € | Gasverluste 3,3 statt 5,3 %, fast immer „Gut geführt“ |
| Energievermarkter | nur in Real | rund +11.000 € | keine |
| Agrarberaterin | nur in Real | rund −46.000 € ohne eigene Felder | bessere Erträge eigener Felder, mehr Gärrestabnehmer |
| Biologin | rund −57.000 € | rund −68.000 € | verhindert den biologischen Totalausfall bei Überfütterung und bei reinem Mais |

Biologin und Agrarberaterin rechnen sich an einer einzelnen 500-kW-Anlage in ruhigen Jahren nicht. Das entspricht der Praxis: Kleinere Anlagen kaufen biologische Betreuung und Agrarberatung meist als Dienstleistung zu, statt Fachleute fest anzustellen. Ihr Wert zeigt sich im Risiko. Wer möchte, dass sich auch diese Rollen im Spiel als Festanstellung lohnen, bräuchte entweder größere Anlagen oder ein Modell „Dienstleister statt Festanstellung“ mit geringeren Kosten und schwächerer Wirkung.

## Szenarien

**Mit eigenen Feldern** (30 Seeds):

| Strategie | Jahr geschafft | Scheitern (Art: Anzahl) | typischer Zeitpunkt | Gewinn bei Erfolg (Mittel) | Stufen bei Erfolg | Akzeptanz Ø | Gasverluste Ø |
|---|---|---|---|---|---|---|---|
| naiv | 0 % | Behördliche Stilllegung: 30 | 17. Oktober | – | – | 34 | 18.8 % |
| versuch2 | 0 % | Behördliche Stilllegung: 21, Technischer Totalschaden: 9 | 4. November | – | – | 32 | 17.3 % |
| versuch3 | 100 % | – | – | 3 T€ | Gut geführt 12, Solide 18 | 38 | 5.5 % |
| ausgewogen | 100 % | – | – | -43 T€ | Gut geführt 5, Solide 25 | 39 | 5.6 % |
| kein_personal | 100 % | – | – | -9 T€ | Gut geführt 13, Solide 17 | 39 | 5.4 % |
| mit_agrar | 100 % | – | – | -5 T€ | Gut geführt 16, Solide 14 | 43 | 5.5 % |
| vorbildlich | 100 % | – | – | 37 T€ | Vorbildlich 7, Gut geführt 23 | 47 | 1.0 % |

Die Testspieler kaufen hier zusätzlich zu den eigenen 5.500 t noch volle Maisverträge und zahlen dafür. Ein Mensch würde weniger zukaufen. Der Gewinn ist deshalb unterschätzt.

**Schwieriger Standort** (30 Seeds):

| Strategie | Jahr geschafft | Scheitern (Art: Anzahl) | typischer Zeitpunkt | Gewinn bei Erfolg (Mittel) | Stufen bei Erfolg | Akzeptanz Ø | Gasverluste Ø |
|---|---|---|---|---|---|---|---|
| versuch3 | 100 % | – | – | -451 T€ | Solide 22, Durchgehalten 8 | 44 | 4.8 % |
| ausgewogen | 100 % | – | – | -468 T€ | Solide 25, Durchgehalten 5 | 45 | 4.8 % |
| kein_personal | 100 % | – | – | -419 T€ | Solide 26, Durchgehalten 4 | 45 | 4.6 % |
| vorbildlich | 0 % | Insolvenz: 30 | 10. April | – | – | 48 | 1.1 % |

Mit weniger Gülle in der Nähe reißen die üblichen Strategien den Maisdeckel. `standort_angepasst` (ausgewogen plus ferner Güllelieferant) schafft das Jahr mit Gewinn (Mittel rund 17.000 €). Der Standort ist damit schwer, aber lösbar.

## Änderungen in diesem Durchgang

* Bewertung: Investitionen zählen mit Restwert (90 %) statt als Verlust; Schwellen Gewinn 0 und 60.000 €, Akzeptanz 45 und 58, Gasverluste 5 und 3 %.
* Biologin: 2.500 € im Monat, 4 % Mehrertrag durch Prozessführung, sanfte Futterumstellung im Tempo des Mikrobenwachstums (1,5 % der Tagesmenge pro Tag).
* Agrarberaterin: 2.000 € im Monat, 8 % Preisnachlass, bessere Silagequalität aus Verträgen.
* Gasspeicher wird um 50 % Füllstand geführt (Meilenstein 6).
* Neue Testspieler für die Lernkurve, Personalvergleiche und Szenarien; neues Werkzeug `npm run balance`.

## Bekannte Schwächen und offene Punkte

1. **Alle Werte sind Richtwerte.** Die Größenordnungen sind plausibel, die Verhältnisse gewollt, die Zahlen nicht fachlich geprüft. Besonders wirksam und daher zuerst zu prüfen: EEG-Vergütung, Maisdeckel, Gärrestlagergröße der Altanlage, Ausbringnachfrage im Herbst, Verschleißrate des BHKW.
2. **Die Scheitermuster sind sehr regelmäßig.** Der naive Versuch scheitert in 50 von 50 Fällen auf dieselbe Weise. Für die Lernkurve ist das gut, für Abwechslung weniger. Mehr Zufall (z. B. nasser Herbst, frühere Sperrfrist durch Frost) wäre möglich.
3. **Der Totalschaden bei aufgeschobener Wartung kommt früh** (Mitte November). Wer das Spiel länger erleben soll, bevor es endet, sollte den Startverschleiß oder den Verschleißzuschlag senken.
4. **Wärmeleitung und Ausbauten lohnen sich in einem einzigen Jahr nur über die Bewertung**, nicht im Kontostand. Mehrjährige Durchläufe würden das ändern (bewusst nicht im Prototyp).
5. **Testspieler sind keine Menschen.** Vor der Vorführung bei der Geschäftsführung sollten zwei oder drei Personen ohne Vorwissen spielen. Interessant ist vor allem, ob die Meldungen aus der Welt als Hinweise verstanden werden und ob die Analyse nach dem ersten Scheitern gelesen wird.

## Schwierigkeitsgrade (nach dem ersten Test ergänzt)

Die Stufen ändern Funktionsumfang und Simulationstiefe, nicht das Startszenario. Werte in `CONFIG.difficulty`, Zuordnung der Funktionen in `features`. Gesperrte Entscheidungen lehnt die Simulation ab, die Oberfläche zeigt sie nicht.

| Funktion | Vereinfacht | Normal | Real |
|---|---|---|---|
| Fütterung, Mais- und Grünroggenverträge, Gülle, Nachkauf | ja | ja | ja |
| kleine Wartung, Gärrest ausbringen, Finanzen, Dorf | ja | ja | ja |
| Ausbau: Gärrestlager, Abdeckung, Wärmeleitung | ja | ja | ja |
| Entschwefelung | nein | ja | ja |
| Reststoffmarkt | nein | ja | ja |
| eigene Felder (Pacht, Kultur Mais oder Grünroggen) | nein | ja | ja |
| Instandsetzung BHKW | nein | ja | ja |
| Ausbau: größerer Gasspeicher, zweites Fahrsilo | nein | ja | ja |
| Personal: Biologin, Verfahrenstechniker | nein | ja | ja |
| Personal: Agrarberaterin, Energievermarkter | nein | nein | ja |
| Zweikultur und eigener Erntetermin | nein | nein | ja |

| Simulationstiefe | Vereinfacht | Normal | Real |
|---|---|---|---|
| Spurenelemente, Stress durch Futterwechsel | nein | ja | ja, Wechsel belasten stärker |
| Wachstum der Methanbildner | schneller | normal | langsamer |
| Laborwert FOS/TAC | täglich | wöchentlich, 3 Tage Verzug | wöchentlich, 5 Tage Verzug, ungenauer |
| zufällige BHKW-Störungen | nein | ja | mehr |
| Verdichtungsverluste im Silo, Störstoffe | nein | ja | ja, Reststoffe schwanken stärker |
| Dürrejahr | nie | 15 % | 25 % |
| Netzausfälle, Rührwerksstörungen | nein | nein | ja |

Sperrfrist und Maisdeckel gelten in allen Stufen. Der naive erste Versuch scheitert deshalb überall am Gärrestlager.

Ergebnisse (je 30 Seeds, Altanlage):

| Strategie | Vereinfacht | Normal | Real |
|---|---|---|---|
| naiv | scheitert immer (Lager) | scheitert immer (Lager) | scheitert immer (Lager) |
| versuch2 (Ausbringung, keine Wartung) | scheitert (BHKW-Totalschaden im März, danach kühlt der Fermenter aus) | scheitert (BHKW im November) | scheitert (BHKW im November) |
| versuch3 | gelingt immer, Ø 129.000 € | gelingt immer, Ø 32.000 € | gelingt immer, Ø −19.000 € |
| kein_personal | gelingt immer, Ø 134.000 € | gelingt immer, Ø 45.000 € | gelingt in 29 von 30, Ø 5.000 € |
| vorbildlich | immer „Vorbildlich“ (ohne Personal, das es hier nicht gibt) | 6 von 30 „Vorbildlich“ (ohne Vermarkter) | 13 von 30 „Vorbildlich“ |

In „Vereinfacht“ ist ein gutes Jahr leicht zu erreichen. Das ist gewollt: Die Stufe zeigt die Grundzusammenhänge, ohne mit Details zu überfordern.

## Eigenstrom und leeres Silo

Der Eigenstrombedarf besteht aus einer Grundlast von 15 kW (Rührwerke, Pumpen, Steuerung, Gaskühlung) und 4 % der Erzeugung, bei Volllast zusammen rund 7 %. Deckt die Erzeugung den Eigenbedarf nicht, wird Netzstrom zu 0,25 €/kWh gekauft. Vorher war der Eigenstrom ein fester Anteil der Erzeugung und fiel bei Teillast unrealistisch mit ab.

Prüfung „Silo leer, nichts nachkaufen“ (Altanlage, Normal, Wartung erledigt): Die Gasproduktion fällt nach dem letzten Mais in vier Tagen auf etwa 70 %, nach zwölf Tagen auf etwa 30 % und pendelt sich dann bei rund 15 % ein, getragen nur von der Gülle. Die Abwärme reicht dann im Winter nicht mehr, der Fermenter kühlt von November bis Februar aus und die Biologie kippt Anfang März. Der schnelle Abfall in den ersten zwei Wochen ist fachlich plausibel (leicht abbaubare Silage). Der Nachlauf ist eher etwas zu kurz, weil der Abbau mit nur einer Fraktion je Substrat modelliert ist; eine langsame Faserfraktion würde den Rest über einige Wochen strecken. Offener Punkt: Die Fixkosten von 8.500 € im Monat sind für eine 500-kW-Anlage eher knapp, deshalb verliert der Betrieb im Stillstand vergleichsweise wenig Geld. Richtwert, fachlich prüfen.

## Anlagen der Szenarien

Normal, 8 Seeds, Gewinn bei Erfolg im Mittel:

| Szenario | ausgewogen | standort_angepasst | vorbildlich | naiv |
|---|---|---|---|---|
| Altanlage (BHKW, 1-fach) | −13 T€ | +38 T€ | +34 T€ | scheitert |
| Biomethananlage (Aufbereitung, 1,8-fach) | +85 T€ | +116 T€ | +95 T€ | scheitert |
| Verbundanlage (BHKW und Aufbereitung, 2,6-fach) | −915 T€ (Maisdeckel) | +340 T€ | −839 T€ (Maisdeckel) | scheitert |

Die Verbundanlage steht am schwierigen Standort mit wenig Gülle. Wer keinen zusätzlichen Güllelieferanten unter Vertrag nimmt, überschreitet den Maisdeckel und verliert dann für Strom und Biomethan den Aufschlag. Das war schon bei der kleinen Anlage so, ist jetzt aber 2,6-fach so teuer. Die Gewinnschwellen der Bewertung wachsen mit der Anlagengröße.

Die größte Kostenposition der Biomethananlage nach dem Substrat ist der Strom für die Aufbereitung (rund 260 T€ im Jahr). Reagiert das Ergebnis empfindlich auf den Biomethanpreis: 1 ct/kWh mehr oder weniger verschiebt den Gewinn um rund 150 T€.
