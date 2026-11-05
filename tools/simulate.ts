/**
 * Headless-Simulation auf der Konsole.
 *
 *   npm run sim -- --seed 42 --strategy ausgewogen
 *   npm run sim -- --strategy alle --seeds 20      (Übersicht über viele Seeds)
 *   npm run sim -- --strategy naiv --events        (alle Warnungen mit Ursachen)
 */
import { createGame } from '../src/sim/scenario';
import { runToEnd } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import { yearSummary } from '../src/sim/rating';
import { causalClosure, mainPath, findEvent, type SimEvent } from '../src/sim/eventlog';
import { dateOfDay, formatDate, MONTH_NAMES } from '../src/sim/calendar';
import { describeEvent, FAILURE_TITLES, TIER_NAMES } from '../src/content/events.de';
import type { GameState, ScenarioOptions } from '../src/sim/types';

const args = process.argv.slice(2);
const arg = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const seed = Number(arg('seed', '1'));
const strategyName = arg('strategy', 'ausgewogen')!;
const scenario = (arg('scenario', 'altanlage') as ScenarioOptions['id']);
const seeds = Number(arg('seeds', '0'));

const eur = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`;
const num = (v: number, d = 0) => v.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });

function run(name: string, s: number): GameState {
  const st = STRATEGIES[name];
  if (!st) throw new Error(`Unbekannte Strategie ${name}. Verfügbar: ${Object.keys(STRATEGIES).join(', ')}`);
  return runToEnd(createGame(s, { id: scenario }), st.strategy);
}

function outcome(g: GameState): string {
  if (g.failure) return `${FAILURE_TITLES[g.failure.kind]} am ${formatDate(g.failure.day)}`;
  const y = yearSummary(g);
  return `Jahr geschafft, Stufe ${TIER_NAMES[y.tier ?? 0]} (${y.points} Punkte)`;
}

function printChain(g: GameState, id: string): void {
  const path = mainPath(g.log, id);
  const rootId = path[path.length - 1]?.id;
  const triggerId = path[1]?.id;
  console.log('\nKausalkette (Hauptpfad, vom Scheitern zurück zur Ursache):');
  for (const e of path) {
    const t = describeEvent(e);
    const role = e.id === rootId && path.length > 1 ? 'URSACHE ' : e.id === triggerId ? 'AUSLÖSER' : '        ';
    const who = e.playerDecision ? ' [Entscheidung]' : '';
    console.log(`  ${role} ${formatDate(e.day).padEnd(14)} ${t.title}${who}`);
    if (t.text) console.log(`             ${t.text}`);
  }
  const closure = causalClosure(g.log, id).filter((e) => !path.includes(e));
  if (closure.length) {
    console.log('\nWeitere beteiligte Ereignisse:');
    for (const e of closure) {
      const t = describeEvent(e);
      console.log(`  ${formatDate(e.day).padEnd(14)} ${t.title}${e.playerDecision ? ' [Entscheidung]' : ''}`);
    }
  }
}

function printSingle(g: GameState): void {
  const y = yearSummary(g);
  console.log(`\nStrategie: ${strategyName} (${STRATEGIES[strategyName].label})`);
  console.log(`Seed ${seed}, Szenario ${scenario}${g.weather.drought ? ', Dürrejahr' : ''}`);
  console.log(`Ergebnis: ${outcome(g)}\n`);

  console.log('Monat         Strom kWh   Gas m³/d  FOS/TAC wahr/gemessen  °C    Silo t  Gärrest  Konto        Akzeptanz  Verschleiß');
  const h = g.history;
  let monthStart = 0;
  for (let i = 0; i < h.day.length; i++) {
    const last = i === h.day.length - 1 || dateOfDay(h.day[i + 1]).month !== dateOfDay(h.day[i]).month;
    if (!last) continue;
    const slice = (arr: number[]) => arr.slice(monthStart, i + 1);
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const kwh = sum(slice(h.powerKwh));
    const gas = sum(slice(h.gasM3)) / (i + 1 - monthStart);
    const m = MONTH_NAMES[dateOfDay(h.day[i]).month - 1];
    console.log(
      `${m.padEnd(12)} ${num(kwh).padStart(10)} ${num(gas).padStart(9)}  ${num(h.fosTacTrue[i], 2).padStart(6)} / ${num(h.fosTacMeasured[i], 2).padEnd(12)} ${num(h.tempC[i], 1).padStart(5)} ${num(h.siloT[i]).padStart(8)} ${num(h.digestateShare[i] * 100).padStart(6)} % ${eur(h.balance[i]).padStart(12)} ${num(h.acceptance[i]).padStart(8)} ${num(h.chpWear[i] * 100).padStart(9)} %`,
    );
    monthStart = i + 1;
  }

  console.log('\nKennzahlen:');
  console.log(`  Strom erzeugt         ${num(y.kwhEl / 1000)} MWh`);
  console.log(`  Gewinn                ${eur(y.profitEur)} (Kontostand ${eur(y.balanceEur)})`);
  console.log(`  Akzeptanz             ${num(y.acceptance)} (Mittel ${num(y.acceptanceAvg)})`);
  console.log(`  Gasverluste           ${num(y.gasLossShare * 100, 1)} % (Fackel ${num(y.flaredM3)} m³ Biogas, Lager ${num(y.ch4LostStorageM3)} m³ CH4)`);
  console.log(`  Maisanteil (Masse)    ${num(y.maizeShare * 100, 1)} %`);
  console.log(`  Fehlerquote Biologie  ${num(y.bioErrorShare * 100, 1)} % der Tage mit FOS/TAC über Warnschwelle`);
  console.log(`  Vorrat bis Ernte      ${num(y.supplyDays)} Tage`);
  const L = y.ledger;
  console.log('  Posten: ' + Object.entries(L).filter(([k]) => k !== 'inputT').map(([k, v]) => `${k} ${eur(v)}`).join(', '));

  if (g.failure) printChain(g, g.failure.eventId);

  if (flag('events')) {
    console.log('\nWarnungen und kritische Ereignisse:');
    for (const e of g.log.events.filter((x) => x.severity !== 'info')) {
      const causes = e.causes.map((c) => findEvent(g.log, c)).filter(Boolean) as SimEvent[];
      console.log(`  ${formatDate(e.day).padEnd(14)} ${describeEvent(e).title}  ← ${causes.map((c) => describeEvent(c).title).join('; ')}`);
    }
  }
  if (flag('messages')) {
    console.log('\nMeldungen aus der Welt:');
    for (const m of g.messages) console.log(`  ${formatDate(m.day).padEnd(14)} ${m.sender}: ${m.key} ${JSON.stringify(m.data)}`);
  }
}

if (seeds > 0) {
  const names = strategyName === 'alle' ? Object.keys(STRATEGIES) : [strategyName];
  console.log(`Übersicht über ${seeds} Seeds, Szenario ${scenario}\n`);
  for (const name of names) {
    const counts: Record<string, number> = {};
    let profit = 0;
    let finished = 0;
    for (let s = 1; s <= seeds; s++) {
      const g = run(name, s);
      const key = g.failure ? FAILURE_TITLES[g.failure.kind] : `Erfolg (${TIER_NAMES[yearSummary(g).tier ?? 0]})`;
      counts[key] = (counts[key] ?? 0) + 1;
      if (!g.failure) {
        finished++;
        profit += yearSummary(g).profitEur;
      }
    }
    const res = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`${name.padEnd(20)} ${res}${finished ? `  | Ø Gewinn bei Erfolg ${eur(profit / finished)}` : ''}`);
  }
} else if (strategyName === 'alle') {
  for (const name of Object.keys(STRATEGIES)) console.log(`${name.padEnd(20)} ${outcome(run(name, seed))}`);
} else {
  printSingle(run(strategyName, seed));
}
