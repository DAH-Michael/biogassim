import { CONFIG } from './config';
import { windowDays } from './calendar';
import { createEventLog, logEvent } from './eventlog';
import { createBiology, round, scaleMap, warmUpBiology, zeroMap } from './biology';
import { deriveRng, intRange } from './rng';
import { generateWeather } from './weather';
import { difficulty } from './difficulty';
import type { FieldState, GameState, ScenarioOptions } from './types';
import { cfg, hasChp, hasUpgrading, plantScale } from './plant';

/**
 * Startzustand eines Durchlaufs. Die Ausgangslage wird als Ereignisse
 * protokolliert, damit Kausalketten auf strukturelle Ursachen zeigen können
 * (zum Beispiel ein zu kleines Gärrestlager der Altanlage).
 */
export function createGame(seed: number, scenario: ScenarioOptions = { id: 'altanlage' }, unlocks: string[] = []): GameState {
  const sc = CONFIG.scenarios[scenario.id];
  // Konfiguration für die Größe dieser Anlage
  const cs = cfg({ scenario });
  const weather = generateWeather(seed, difficulty({ scenario }).droughtChance);
  const log = createEventLog();
  const rngFields = deriveRng(seed, 'fields');

  const storageCap = cs.plant.digestateCapacityM3 + (scenario.largerStorage ? cs.builds.digestateStorage.addM3 : 0);
  const feedStart = { ...cs.feeding.start };
  const dailyDigestate = feedStart.mais + feedStart.gruenroggen + feedStart.guelle + feedStart.reststoff;
  const storageMonths = storageCap / (dailyDigestate * cs.plant.inputVolumeM3PerT) / (CONFIG.units.daysPerYear / CONFIG.units.monthsPerYear);

  const origin: Record<string, string> = {};
  origin.plant = logEvent(log, 0, {
    type: 'origin_plant',
    causes: [],
    data: { plant: hasChp({ scenario }) ? (hasUpgrading({ scenario }) ? 'verbund' : 'bhkw') : 'aufbereitung', wear: CONFIG.chp.startWear, hoursSinceService: CONFIG.chp.startHoursSinceService, operatingHours: CONFIG.chp.startOperatingHours },
  }).id;
  origin.storage = logEvent(log, 0, {
    type: 'origin_storage',
    causes: [],
    data: { capacityM3: storageCap, months: round(storageMonths, 1), requiredMonths: cs.digestate.requiredMonths },
  }).id;
  origin.openStorage = logEvent(log, 0, { type: 'origin_open_storage', causes: [], data: { covered: 0 } }).id;
  origin.silo = logEvent(log, 0, {
    type: 'origin_silo',
    causes: [],
    data: { maizeT: cs.silo.startMaizeT, days: Math.round(cs.silo.startMaizeT / feedStart.mais) },
  }).id;
  origin.feeding = logEvent(log, 0, { type: 'origin_feeding', causes: [], data: { ...feedStart } }).id;
  origin.fields = logEvent(log, 0, { type: 'origin_fields', causes: [], data: { owned: sc.fieldsOwned ? 1 : 0 } }).id;
  if (weather.drought) origin.drought = logEvent(log, 0, { type: 'drought_year', severity: 'warning', causes: [], data: {} }).id;

  const fields: FieldState[] = CONFIG.fields.list.map((f) => ({
    id: f.id,
    status: sc.fieldsOwned ? 'gefuehrt' : 'verpachtet',
    crop: 'mais',
    standing: 'mais',
    growth: CONFIG.fields.startGrowth,
    sownDay: sc.fieldsOwned ? -CONFIG.fields.startGrowthAgeDays : null,
    harvestDay: null,
    harvestedHa: 0,
    harvestedT: 0,
    harvesting: false,
    ryeDone: false,
    decisionEvent: origin.fields,
    digestateApplied: {},
  }));

  const maizeWin = windowDays(CONFIG.fields.windows.maisHarvest);
  const ryeWin = windowDays(CONFIG.fields.windows.roggenHarvest);
  const j = CONFIG.fields.optimumJitterDays;

  const bio = createBiology();
  warmUpBiology(bio, scaleMap(feedStart, 1 / plantScale({ scenario })), cs.feeding.warmupAmbientC, cs.feeding.startTraceElements);

  const state: GameState = {
    seed,
    day: 0,
    scenario,
    unlocks: [...unlocks],
    rng: {
      tech: deriveRng(seed, 'tech'),
      market: deriveRng(seed, 'market'),
      bio: deriveRng(seed, 'bio'),
      village: deriveRng(seed, 'village'),
      fields: rngFields,
    },
    weather,
    feedTarget: feedStart,
    feedTargetEvent: origin.feeding,
    feedChangedDay: -1,
    fedToday: zeroMap(),
    inputTotals: zeroMap(),
    rampFeed: null,
    bio,
    measurement: { fosTac: bio.fosTac, fosTacDay: 0, pending: [], lastSampleDay: 0, history: [{ day: 0, value: bio.fosTac }] },
    chp: {
      status: 'betrieb',
      downUntilDay: 0,
      operatingHours: CONFIG.chp.startOperatingHours,
      hoursSinceService: CONFIG.chp.startHoursSinceService,
      wear: CONFIG.chp.startWear,
      wearCauses: {},
      serviceNoticeSent: false,
      runShare: hasChp({ scenario }) ? 1 : 0,
    },
    upgrading: hasUpgrading({ scenario }) ? {
      status: 'betrieb',
      downUntilDay: 0,
      operatingHours: 0,
      hoursSinceService: CONFIG.upgrading.startHoursSinceService,
      serviceNoticeSent: false,
      runShare: 1,
      injectedCh4Today: 0,
    } : null,
    heatShare: 1,
    boilerCh4Today: 0,
    desulf: { mediumDays: cs.desulfurization.startMediumDays, rawPpm: 0, cleanPpm: 0, lowNoticeSent: false },
    gas: { storedM3: cs.plant.gasStorageM3 * cs.plant.gasStartShare, capacityM3: cs.plant.gasStorageM3, producedToday: 0, flaredToday: 0, flaring: false },
    silo: {
      mais: { t: cs.silo.startMaizeT, quality: cs.silo.startMaizeQuality },
      gruenroggen: { t: 0, quality: 1 },
      deliveredToday: 0,
      compactionToday: 1,
      compactingDays: 0,
      compactionCauses: {},
      lowNoticeSent: false,
      capacityT: cs.plant.siloCapacityT,
    },
    digestate: {
      m3: storageCap * cs.digestate.startFillShare,
      capacityM3: storageCap,
      covered: false,
      residualCh4: 0,
      spreadOrderM3: 0,
      spreadToday: 0,
      offtakeToday: 0,
      spreadTotal: 0,
      spreadBeforeBlackout: 0,
      demandBeforeBlackout: 0,
      inflowCauses: {},
      overflowed: false,
      offtake: false,
      rainToday: 0,
    },
    residueTank: [],
    residueOffers: [],
    nextOfferDay: 0,
    contaminationUntilDay: -1,
    contaminationStartDay: -1,
    fields,
    contracts: [],
    guelleContracts: [],
    spotOrders: [],
    harvestOptimum: {
      mais: maizeWin.start + CONFIG.fields.optimumOffsetDays.mais + intRange(rngFields, -j, j),
      gruenroggen: ryeWin.start + CONFIG.fields.optimumOffsetDays.gruenroggen + intRange(rngFields, -j, j),
    },
    staff: [],
    builds: [],
    built: {},
    heatLineActive: false,
    acceptance: {
      value: cs.acceptance.start + sc.acceptanceStart,
      baselineBonus: 0,
      nuisance: 0,
      smell: 0,
      trafficTrips: 0,
      complaints: [],
      complaintEvents: [],
      lastComplaintDay: -cs.acceptance.complaintCooldownDays,
      causes: {},
      daysCritical: 0,
      level: 0,
      lastDialogDay: -cs.acceptance.dialogCooldownDays,
      authorityNotified: false,
      sources: {},
    },
    finance: {
      balance: cs.finance.startBalanceEur,
      daysOverLimit: 0,
      monthKwh: 0,
      monthHeatKwh: 0,
      monthGasKwh: 0,
      monthMarketerEur: 0,
      monthMarketValueSum: 0,
      monthDays: 0,
      lossCauses: {},
      bankNoticeSent: false,
      ledger: {},
      marketPrice: cs.finance.marketEurPerKwh,
    },
    history: { day: [], gasM3: [], fosTacTrue: [], fosTacMeasured: [], tempC: [], olr: [], gasStorageShare: [], siloT: [], digestateShare: [], balance: [], acceptance: [], powerKwh: [], gasKwh: [], flaredM3: [], chpWear: [] },
    messages: [],
    failure: null,
    finished: false,
    origin,
    log,
    totals: { kwhEl: 0, kwhSold: 0, kwhHeatSold: 0, kwhGas: 0, ch4SlipM3: 0, flaredM3: 0, ch4LostStorageM3: 0, ch4ProducedM3: 0, bioErrorDays: 0, trafficTrips: 0 },
    contaminationEvent: undefined,
    lastFed: { ...feedStart },
    supplyEvents: {},
    harvestTotals: { mais: { own: 0, contract: 0, spot: 0 }, gruenroggen: { own: 0, contract: 0, spot: 0 } },
    scenarioFactors: {
      guelleSupply: sc.guelleSupply,
      guelleDistance: sc.guelleDistance,
      trafficTolerance: sc.trafficTolerance,
      acceptanceBaseline: sc.acceptanceBaseline,
    },
    actionLog: [],
    noticeFlags: {},
    today: { deliveries: [], guelle: [], residueArrived: false, harvesting: [], sowing: [], spreadM3: 0, offtakeM3: 0, siloSoldT: 0 },
  };

  // Bestehende Gülleverträge des Vorbesitzers
  for (const id of cs.contracts.startGuelleContracts) {
    state.guelleContracts.push({ supplierId: id, activeFromDay: 0, eventId: origin.feeding });
  }
  // Größeres Gärrestlager ab Start (Freischaltung): als zweites Lager sichtbar
  if (scenario.largerStorage) state.built.digestateStorage = origin.storage;
  // Wärmeleitung ab Start (Freischaltung)
  if (scenario.heatLineAtStart) {
    state.heatLineActive = true;
    state.built.heatLine = logEvent(log, 0, { type: 'origin_heat_line', causes: [], data: {} }).id;
  }
  state.nextOfferDay = cs.residues.firstOfferDay;
  return state;
}
