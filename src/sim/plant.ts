import { CONFIG, type Config } from './config';

/**
 * Anlage eines Szenarios: Größe, BHKW, Gasaufbereitung, Heizkessel.
 *
 * Größere Anlagen werden über einen Größenfaktor abgebildet. `cfg(state)` liefert eine Kopie
 * der Konfiguration, in der alle Mengen (Lager, Silo, Gasspeicher, Fütterung, Verträge, Gülle,
 * Ausbringung) linear und Investitionen sowie Fixkosten unterproportional mit der Größe wachsen.
 * Werte ohne Mengenbezug (Preise je Tonne, Biologie, BHKW-Daten) bleiben gleich.
 * Die Biologie rechnet pro Referenzeinheit (Fermenter der Altanlage); siehe step.ts.
 */
export type ScenarioId = keyof typeof CONFIG.scenarios;
export type PlantSpec = (typeof CONFIG.scenarios)[ScenarioId]['plant'];

type WithScenario = { scenario: { id: ScenarioId } };

export function plantSpec(state: WithScenario): PlantSpec {
  return CONFIG.scenarios[state.scenario.id].plant;
}

export function plantScale(state: WithScenario): number {
  return plantSpec(state).scale;
}

export function hasChp(state: WithScenario): boolean {
  return plantSpec(state).chpKwEl > 0;
}

export function hasUpgrading(state: WithScenario): boolean {
  return plantSpec(state).upgradingRawM3PerH > 0;
}

const cache = new Map<number, Config>();

/** Konfiguration für die Anlagengröße des Durchlaufs. */
export function cfg(state: WithScenario): Config {
  return scaledConfig(plantScale(state));
}

export function scaledConfig(k: number): Config {
  if (k === 1) return CONFIG;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = structuredClone(CONFIG) as unknown as Config;
  const m = c as unknown as Record<string, Record<string, unknown>>;
  const cost = Math.pow(k, CONFIG.scaling.costExponent);
  const lin = (sec: string, keys: string[], f = k) => {
    for (const key of keys) m[sec][key] = (m[sec][key] as number) * f;
  };
  lin('plant', ['gasStorageM3', 'siloCapacityT', 'digestateCapacityM3', 'residueTankT', 'ownPowerBaseKw']);
  lin('silo', ['compactionCapacityTPerDay', 'startMaizeT', 'secondSiloT']);
  lin('digestate', ['spreadCapacityM3PerDay']);
  for (const d of c.digestate.regionalDemand) (d as { m3PerDay: number }).m3PerDay *= k;
  (c.digestate.offtake as { m3PerDay: number }).m3PerDay *= k;
  for (const o of [...c.contracts.maizeOffers, ...c.contracts.ryeOffers]) {
    const x = o as { maxT: number; deliveryTPerDay: number };
    x.maxT = Math.round(x.maxT * k);
    x.deliveryTPerDay = Math.round(x.deliveryTPerDay * k);
  }
  for (const g of c.contracts.guelleSuppliers) (g as { maxTPerDay: number }).maxTPerDay = Math.round(g.maxTPerDay * k);
  (c.contracts.spot as { maxTPerOrder: number }).maxTPerOrder = Math.round(c.contracts.spot.maxTPerOrder * k);
  (c.residues as unknown as { lotT: number[] }).lotT = c.residues.lotT.map((v) => Math.round(v * k));
  for (const sub of Object.keys(c.feeding.start) as (keyof typeof c.feeding.start)[]) {
    (c.feeding.start as Record<string, number>)[sub] = Math.round(c.feeding.start[sub] * k);
    (c.feeding.maxPerSubstrate as Record<string, number>)[sub] = Math.round(c.feeding.maxPerSubstrate[sub] * k);
  }
  lin('feeding', ['shortageToleranceT']);
  // Ausbauten: Mengen linear, Kosten unterproportional
  const b = c.builds as unknown as Record<string, { costEur?: number; costEurUnlocked?: number; addM3?: number }>;
  for (const key of Object.keys(b)) {
    const x = b[key];
    // Die Wärmeleitung ins Dorf hängt nicht an der Anlagengröße
    if (typeof x !== 'object' || key === 'heatLine') continue;
    if (x.addM3) x.addM3 = Math.round(x.addM3 * k);
    if (x.costEur) x.costEur = Math.round(x.costEur * cost);
    if (x.costEurUnlocked) x.costEurUnlocked = Math.round(x.costEurUnlocked * cost);
  }
  // Konto und Kosten
  lin('finance', ['startBalanceEur', 'creditLimitEur']);
  lin('finance', ['fixedCostsEurPerMonth'], cost);
  lin('desulfurization', ['refillCostEur']);
  (c.rating as unknown as { profitEur: number[] }).profitEur = c.rating.profitEur.map((v) => Math.round(v * k));
  lin('acceptance', ['trafficTolerance'], Math.pow(k, CONFIG.scaling.trafficToleranceExponent));
  cache.set(k, c);
  return c;
}
