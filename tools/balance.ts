/**
 * Balancing-Auswertung: alle Strategien über viele Seeds, Ausgabe als Markdown-Tabelle.
 *   npm run balance -- --seeds 40
 */
import { createGame } from '../src/sim/scenario';
import { runToEnd } from '../src/sim/step';
import { STRATEGIES } from '../src/sim/strategies';
import { yearSummary } from '../src/sim/rating';
import { formatDate } from '../src/sim/calendar';
import { FAILURE_TITLES, TIER_NAMES } from '../src/content/events.de';
import type { ScenarioOptions } from '../src/sim/types';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const seeds = Number(arg('seeds', '40'));
const scenario = arg('scenario', 'altanlage') as ScenarioOptions['id'];
const only = arg('strategies', '');
const level = arg('difficulty', 'normal') as NonNullable<ScenarioOptions['difficulty']>;
const names = only ? only.split(',') : Object.keys(STRATEGIES);

const eur = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')} T€`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

console.log(`Szenario ${scenario}, Schwierigkeit ${level}, ${seeds} Seeds je Strategie\n`);
console.log('| Strategie | Jahr geschafft | Scheitern (Art: Anzahl) | typischer Zeitpunkt | Gewinn bei Erfolg (Mittel) | Stufen bei Erfolg | Akzeptanz Ø | Gasverluste Ø |');
console.log('|---|---|---|---|---|---|---|---|');
for (const name of names) {
  const fails: Record<string, number> = {};
  const failDays: number[] = [];
  const profits: number[] = [];
  const tiers: Record<string, number> = {};
  let acc = 0;
  let loss = 0;
  for (let s = 1; s <= seeds; s++) {
    const g = runToEnd(createGame(s, { id: scenario, difficulty: level }), STRATEGIES[name].strategy);
    const y = yearSummary(g);
    acc += y.acceptanceAvg;
    loss += y.gasLossShare;
    if (g.failure) {
      fails[FAILURE_TITLES[g.failure.kind]] = (fails[FAILURE_TITLES[g.failure.kind]] ?? 0) + 1;
      failDays.push(g.failure.day);
    } else {
      profits.push(y.profitEur);
      const t = TIER_NAMES[y.tier ?? 0];
      tiers[t] = (tiers[t] ?? 0) + 1;
    }
  }
  const ok = profits.length;
  const failText = Object.entries(fails).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ') || '–';
  const when = failDays.length ? formatDate(median(failDays)) : '–';
  const profit = ok ? eur(profits.reduce((a, b) => a + b, 0) / ok) : '–';
  const tierText = Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(', ') || '–';
  console.log(`| ${name} | ${pct(ok / seeds)} | ${failText} | ${when} | ${profit} | ${tierText} | ${Math.round(acc / seeds)} | ${(loss / seeds * 100).toFixed(1)} % |`);
}
