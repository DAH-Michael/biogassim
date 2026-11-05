# biogassim

A small sim game to promote biogas.

Browserspiel rund um eine 500-kW-Biogasanlage. Stand: **Meilenstein 3, Bedienung** (Scheitern und Analyse folgen in Meilenstein 4).

## Befehle

```bash
npm install
npm run dev                                           # Spiel im Browser (Vite)
npm run build                                         # statischer Build in dist/, relative Pfade
npm test                                              # Vitest, Simulation
npm run sim -- --seed 42 --strategy ausgewogen        # ein Jahr headless, Kennzahlen und Kausalkette
npm run sim -- --strategy naiv --events --messages    # mit allen Warnungen und Meldungen aus der Welt
npm run sim -- --strategy alle --seeds 30             # Übersicht aller Strategien über viele Seeds
npm run sim -- --strategy ausgewogen --scenario eigene_felder
```

Bedienung: Leiste links mit den Entscheidungsbereichen, Kennwertleiste rechts, Meldungen unten. Objekte in der Szene lassen sich antippen und öffnen den passenden Bereich.

| Taste | Wirkung |
|---|---|
| Leertaste, 0, 1, 2 | Pause, normal, doppelt |
| F, B, A, T, P, G, U, K | Fütterung, Beschaffung, Felder (Acker), Technik, Personal, Gärrest, Ausbau und Dorf, Finanzen (Konto) |
| Esc | Bereich schließen |

URL-Parameter für Abnahme und Balancing:

| Parameter | Wirkung |
|---|---|
| `?seed=42` | fester Zufallsstartwert |
| `?demo=ausgewogen` | ein Testspieler trifft die Entscheidungen |
| `?tag=120` | springt zu Spieltag 120 |
| `?szenario=eigene_felder` | Startszenario mit eigenen Feldern |
| `?waerme` | Wärmeleitung ab Start |
| `?speed=2`, mit `?debug` bis 50 | Geschwindigkeit |
| `?debug` | höhere Geschwindigkeiten, Lesezugriff `window.biogas.state` (Debug-Panel folgt in Meilenstein 6) |

Strategien: `nichts`, `naiv`, `nur_mais`, `nur_guelle`, `ausgewogen`, `wartung_aufschieben`, `kein_personal`, `dauerfackel`, `ueberfuettern` (siehe `src/sim/strategies/index.ts`).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/sim/` | reine Simulation, deterministisch, ohne DOM. Ein Tick ist ein Spieltag. |
| `src/sim/config.ts` | **alle** Balancing-Werte mit Einheit und Vermerk „Richtwert, fachlich prüfen“ |
| `src/sim/eventlog.ts` | kausales Ereignisprotokoll, Hauptpfad, Ursache und Auslöser |
| `src/sim/strategies/` | scripted Testspieler für Konsole, Tests und Balancing |
| `src/meta/` | Speichercode und Freischaltungen (`unlocks.config.ts`) |
| `src/content/` | deutsche Texte zu Ereignissen (Analyse) |
| `src/render/` | Canvas-2D-Darstellung: Projektion, Palette aus Designsystem-Tokens, Lageplan, Fahrzeuge, Szene |
| `src/styles/`, `src/assets/fonts/` | CSS-Variablen aus dem Designsystem, lokale WOFF2-Schriften |
| `design/tokens.json` | Export des DAH Designsystems |
| `src/ui/` | Oberfläche: Spielsteuerung, Kennwertleiste, Entscheidungsbereiche, Meldungen |
| `src/content/messages.de.ts` | Texte der Meldungen aus der Welt |
| `tools/simulate.ts` | Konsolenwerkzeug |
| `docs/` | Annahmen, Modell, offene Punkte |

Ein Test (`tests/config.test.ts`) stellt sicher, dass in `src/sim/` außerhalb von `config.ts` keine Zahlenwerte hart codiert sind.
