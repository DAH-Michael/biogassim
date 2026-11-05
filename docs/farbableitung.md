# Farben der Spielfläche

Alle Farben stammen aus dem DAH Designsystem (`design/tokens.json`, als CSS-Variablen in `src/styles/tokens.css`, erzeugt mit `npm run tokens`). Die Spielfläche liest sie zur Laufzeit aus den CSS-Variablen (`src/render/palette.ts`). Es gibt keine eigenen Markenfarben.

## Statusfarben

Das Designsystem enthält bereits abgeleitete Statusfarben `success`, `warning`, `danger` mit `-ink` und `-soft`. Sie werden unverändert genutzt: `warning` für das Warnsymbol am BHKW und für die aktive Wärmeleitung, `danger`, `warning` und `gelb` für die Fackelflamme. Zustände werden nie nur über Farbe gezeigt, sondern zusätzlich über Form, Symbol oder Bewegung:

| Zustand | Form oder Bewegung |
|---|---|
| BHKW in Betrieb | aufsteigende Abgasfahne, pulsierende Schallbögen |
| BHKW gestört | Warndreieck mit Ausrufezeichen, keine Fahne |
| BHKW in Wartung | Schraubenschlüssel |
| Fermenter stabil, gestört, gekippt | Rührwerk gleichmäßig, ruckelnd, still; Gasblasen gleichmäßig, unregelmäßig, keine |
| Gasspeicher | Höhe der Haube |
| Fackel | Flamme |
| Gärrestlager | Höhe der Oberfläche und Pegelstrich, Membran bei Abdeckung, Lache bei Überlauf |
| Silagequalität | helle Flecken am Anschnitt |
| Geruch im Dorf | Wellenlinien über den Häusern, Anzahl nach Stärke |
| Wärmeversorgung | erleuchtete Fenster, wandernde Lichtpunkte auf der Leitung |
| Wetter | Regenstriche, Schneeflocken |

## Abgeleitete Farben

Nur durch Mischen von Designsystem-Farben, ohne neue Farbtöne:

| Name | Ableitung | Einsatz |
|---|---|---|
| Ackerboden | `k80` und `gelb-ink` 1:1, 25 % aufgehellt | unbestellte Felder, Furchen |
| Gärrest | `ink` mit 45 % `gelb-ink` | Lageroberfläche, Güllefass, Lache |
| Gülle | `k80` mit 40 % `gelb-ink` | Vorgrube, Tank-LKW |
| Silage | `gelb-50` mit 25 % `hellgruen-ink` | Anschnitt Maissilage |
| Grünroggensilage | `hellgruen-70` mit 30 % `hellgruen-ink` | Anschnitt Grünroggen |
| Dach | `dunkelgruen-70` mit 35 % `k60` | Häuser, BHKW, Höfe |
| Asphalt, Beton, Folie | `k40`, `k20`, `k80` | Straßen, Behälter, Silofolie |

Jahreszeiten mischen `hellgruen-15/30/50`, `gelb-30` und `k10` für den Boden; Dürre verschiebt Boden und Felder Richtung `gelb-30` bzw. `gelb-50`, Frost Richtung `white`; Regen trübt den Himmel (`blau-15` mit `k20`).

## Warnstufen der Kennwertleiste

Die Kennwerte rechts färben sich, wenn sie in einen bedenklichen Bereich laufen. Schwellen stehen in `CONFIG.metricWarnings`.

| Stufe | Rand und Symbolkreis | Fläche | Zusätzliches Merkmal |
|---|---|---|---|
| ok | `dunkelgruen` | `white`, Symbolkreis `dunkelgruen-15` | keins |
| Achtung | `warning` | `warning-soft` | Warndreieck |
| kritisch | `danger` | 10 % `danger` auf `white` (abgeleitet, `danger-soft` fehlt im Designsystem) | Warndreieck, pulsiert ohne `prefers-reduced-motion` |
