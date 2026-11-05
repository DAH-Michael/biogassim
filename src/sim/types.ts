import type { BuildKind, StaffRole, SubstrateId } from './config';
import type { CauseTracker, EventLogState } from './eventlog';
import type { RngState } from './rng';

export type SubstrateMap<T = number> = Record<SubstrateId, T>;

export interface WeatherDay {
  tempC: number;
  rainMm: number;
  /** Felder nicht befahrbar (nass) */
  wet: boolean;
  frost: boolean;
}

export interface WeatherYear {
  drought: boolean;
  days: WeatherDay[];
}

export type Crop = 'brache' | 'mais' | 'gruenroggen' | 'zweikultur';

export interface FieldState {
  id: string;
  /** frei wählbar erst, wenn geführt (gepachtet oder eigen) */
  status: 'verpachtet' | 'frei' | 'gefuehrt';
  crop: Crop;
  /** Was steht gerade auf dem Feld */
  standing: 'leer' | 'mais' | 'gruenroggen' | 'zweitmais';
  /** Wachstumsstand 0 bis 1 */
  growth: number;
  sownDay: number | null;
  /** Gewählter Erntetag (Spieltag) oder null für Standard */
  harvestDay: number | null;
  /** Bereits geerntete Fläche, ha */
  harvestedHa: number;
  harvesting: boolean;
  harvestStartEvent?: string;
  harvestedT: number;
  /** Grünroggen dieser Saison bereits geerntet (für Zweikultur) */
  ryeDone: boolean;
  /** Ereignis-ID der letzten Anbau- oder Ernteentscheidung */
  decisionEvent?: string;
  /** Gärrest, der in diesem Bedarfsfenster schon ausgebracht wurde, m³ */
  digestateApplied: Record<string, number>;
}

export interface SupplyContract {
  offerId: string;
  kind: 'mais' | 'gruenroggen';
  tonnes: number;
  delivered: number;
  priceEurPerT: number;
  distanceKm: number;
  throughVillage: boolean;
  deliveryTPerDay: number;
  startDay: number;
  eventId: string;
}

export interface ResidueOffer {
  id: string;
  tonnes: number;
  priceEurPerT: number;
  /** verborgen: Qualitätsfaktor und Störstoffe */
  quality: number;
  contaminated: boolean;
  expiresDay: number;
}

export interface ResidueLot {
  id: string;
  tonnes: number;
  quality: number;
  contaminated: boolean;
  arrivalDay: number;
  eventId: string;
  started: boolean;
}

export interface SpotOrder { tonnes: number; arrivalDay: number; eventId: string; priceEurPerT: number }

export interface BuildOrder { kind: BuildKind; doneDay: number; eventId: string; costEur: number }

export interface StaffMember { role: StaffRole; hiredDay: number; eventId: string }

export interface BiologyState {
  /** Substratpools im Fermenter, m³ CH4-Potenzial */
  pools: SubstrateMap;
  /** Säurestau, m³ CH4-Äquivalent */
  acids: number;
  /** Kapazität der Methanbildner, m³ CH4/d */
  capacity: number;
  /** geglättetes Säureangebot, m³ CH4/d */
  demandSmoothed: number;
  /** Restpotenzial im Nachgärer, m³ CH4 */
  postPool: number;
  /** Puffer (TAC-Index) */
  buffer: number;
  /** Spurenelemente (Index) */
  traceElements: number;
  /** Zusammensetzung, an die die Biologie angepasst ist (Anteile nach CH4-Potenzial) */
  adaptedMix: SubstrateMap;
  tempC: number;
  /** abgeleitete Kennwerte des letzten Tages */
  fosTac: number;
  olr: number;
  hrtDays: number;
  inhibition: number;
  adaptation: number;
  traceFactor: number;
  tempFactor: number;
  ch4Share: number;
  /** Zustand Umkippen */
  daysAboveTip: number;
  tipped: boolean;
  tippedDay: number | null;
  tippedEvent?: string;
  daysBelowWarning: number;
  /** Ursachenregister der Prozessbelastung */
  stressCauses: CauseTracker;
  /** letzte Zustandsereignisse zur Vermeidung von Wiederholungen */
  fosLevel: 0 | 1 | 2;
  fosLevelEvent?: string;
  coldEvent?: string;
  traceEvent?: string;
  /** OLR-Verlauf für Sprungerkennung */
  olrHistory: number[];
  /** Tatsächlich gefütterte Mischung des Vortags (Anteile nach CH4-Potenzial) */
  lastMix: SubstrateMap;
  lastShiftEvent?: string;
  lastLoadJumpDay?: number;
  lastLoadJumpEvent?: string;
}

export interface Measurement {
  /** angezeigter FOS/TAC-Wert (Laborwert) */
  fosTac: number;
  fosTacDay: number;
  /** ausstehende Proben: Ergebnis am Tag readyDay */
  pending: { readyDay: number; value: number; sampleDay: number }[];
  lastSampleDay: number;
  /** Trend aus den letzten Messwerten */
  history: { day: number; value: number }[];
}

export interface ChpState {
  status: 'betrieb' | 'wartung' | 'stoerung' | 'ersatz';
  downUntilDay: number;
  operatingHours: number;
  hoursSinceService: number;
  wear: number;
  /** Ursache des aktuellen Stillstands */
  downEvent?: string;
  /** Ereignisse, die den Verschleiß treiben (Aufschub, H2S) */
  wearCauses: CauseTracker;
  serviceNoticeSent: boolean;
  overdueEvent?: string;
  runShare: number;
  destroyedEvent?: string;
}

export interface DesulfState {
  mediumDays: number;
  rawPpm: number;
  cleanPpm: number;
  emptyEvent?: string;
  lowNoticeSent: boolean;
}

export interface SiloState {
  mais: { t: number; quality: number };
  gruenroggen: { t: number; quality: number };
  /** heute angelieferte Tonnen und Verdichtung */
  deliveredToday: number;
  compactionToday: number;
  compactingDays: number;
  /** Ursachen für schlechte Verdichtung in der laufenden Ernte */
  compactionCauses: CauseTracker;
  poorCompactionEvent?: string;
  emptyEvent?: { mais?: string; gruenroggen?: string };
  lowNoticeSent: boolean;
  /** Ereignis der Ernte-Zusammenfassung (Grundlage für spätere Engpässe) */
  harvestSummaryEvent?: string;
  overflowEvent?: string;
  qualityEvent?: string;
  ryeSummaryEvent?: string;
  capacityT: number;
}

export interface DigestateState {
  m3: number;
  capacityM3: number;
  covered: boolean;
  /** Restgaspotenzial im Lager, m³ CH4 */
  residualCh4: number;
  /** offene Ausbringungsaufträge, m³ */
  spreadOrderM3: number;
  spreadOrderEvent?: string;
  spreadToday: number;
  spreadTotal: number;
  /** Ausbringung im Zeitraum vor der Sperrfrist */
  spreadBeforeBlackout: number;
  demandBeforeBlackout: number;
  inflowCauses: CauseTracker;
  highEvent?: string;
  blackoutEvent?: string;
  overflowed: boolean;
  overflowEvent?: string;
  offtake: boolean;
  offtakeEvent?: string;
  rainToday: number;
}

export interface GasState {
  storedM3: number;
  capacityM3: number;
  producedToday: number;
  flaredToday: number;
  flaring: boolean;
  flareEvent?: string;
  flareCause?: string;
}

export interface AcceptanceState {
  value: number;
  baselineBonus: number;
  /** heutiger Belastungsindex (für Beschwerden und Anzeige) */
  nuisance: number;
  smell: number;
  trafficTrips: number;
  complaints: number[];
  complaintEvents: string[];
  lastComplaintDay: number;
  causes: CauseTracker;
  daysCritical: number;
  level: 0 | 1 | 2;
  levelEvent?: string;
  lastDialogDay: number;
  authorityNotified: boolean;
  authorityEvent?: string;
  /** Ursachenquellen als Ereignisse (Episoden) */
  sources: Record<string, string | undefined>;
}

export interface FinanceState {
  balance: number;
  /** Tage durchgehend unter dem Kreditrahmen */
  daysOverLimit: number;
  overLimitEvent?: string;
  /** Monatsakkumulatoren */
  monthKwh: number;
  monthHeatKwh: number;
  monthMarketerEur: number;
  monthMarketValueSum: number;
  monthDays: number;
  /** Euro-Wirkung je Ursache (Verluste und Sonderkosten), ohne Zerfall */
  lossCauses: CauseTracker;
  bankNoticeSent: boolean;
  /** Bilanzposten für Jahresübersicht und Kostenaufstellung */
  ledger: Record<string, number>;
  marketPrice: number;
}

export interface History {
  day: number[];
  gasM3: number[];
  fosTacTrue: number[];
  fosTacMeasured: number[];
  tempC: number[];
  olr: number[];
  gasStorageShare: number[];
  siloT: number[];
  digestateShare: number[];
  balance: number[];
  acceptance: number[];
  powerKwh: number[];
  flaredM3: number[];
  chpWear: number[];
}

export type FailureKind = 'insolvenz' | 'biologie' | 'behoerde' | 'technik';

export interface Unlocks {
  /** freigeschaltete Schlüssel aus meta/unlocks.config */
  keys: string[];
}

export interface ScenarioOptions {
  id: 'altanlage' | 'eigene_felder' | 'schwieriger_standort';
  difficulty?: 'vereinfacht' | 'normal' | 'real';
  largerStorage?: boolean;
  heatLineAtStart?: boolean;
}

export interface GameState {
  seed: number;
  day: number;
  scenario: ScenarioOptions;
  unlocks: string[];
  rng: { tech: RngState; market: RngState; bio: RngState; village: RngState; fields: RngState };
  weather: WeatherYear;
  /** Fütterungssollwerte des Spielers, t/d */
  feedTarget: SubstrateMap;
  feedTargetEvent?: string;
  feedChangedDay: number;
  /** letzte Entscheidung, die den Gülleanteil deutlich gesenkt hat */
  lowBufferEvent?: string;
  /** tatsächlich gefütterte Mengen heute, t */
  fedToday: SubstrateMap;
  /** kumulierte Inputmassen seit Start (Maisdeckel), t */
  inputTotals: SubstrateMap;
  /** Biologin: aktuelle geglättete Fütterung */
  rampFeed: SubstrateMap | null;
  bio: BiologyState;
  measurement: Measurement;
  chp: ChpState;
  desulf: DesulfState;
  gas: GasState;
  silo: SiloState;
  digestate: DigestateState;
  residueTank: ResidueLot[];
  residueOffers: ResidueOffer[];
  nextOfferDay: number;
  contaminationUntilDay: number;
  contaminationEvent?: string;
  fields: FieldState[];
  contracts: SupplyContract[];
  guelleContracts: { supplierId: string; activeFromDay: number; eventId: string }[];
  spotOrders: SpotOrder[];
  /** Erwartete optimale Erntetage dieses Jahres (verborgen) */
  harvestOptimum: { mais: number; gruenroggen: number };
  staff: StaffMember[];
  builds: BuildOrder[];
  built: Partial<Record<BuildKind, string>>;
  maintenanceContract?: string;
  heatLineActive: boolean;
  acceptance: AcceptanceState;
  finance: FinanceState;
  maizeCapExceededEvent?: string;
  /** Entscheidung, mit der der Maisanteil über den Deckel gestellt wurde */
  highMaizeEvent?: string;
  contaminationStartDay: number;
  lastFed: SubstrateMap;
  residueDeliveredToday?: string;
  supplyEvents: { maizeContracts?: string; ryeContracts?: string };
  harvestTotals: { mais: { own: number; contract: number; spot: number }; gruenroggen: { own: number; contract: number; spot: number } };
  scenarioFactors: { guelleSupply: number; guelleDistance: number; trafficTolerance: number; acceptanceBaseline: number };
  /** Spielerentscheidungen mit Tag, für Wiederholung und Analyse */
  actionLog: { day: number; action: Action }[];
  noticeFlags: Record<string, boolean>;
  /** Logistik des letzten Tages, nur für die Darstellung (Fahrzeuge, Feldarbeit) */
  today: TodayLogistics;
  history: History;
  /** Meldungen aus der Welt, neueste zuletzt */
  messages: WorldMessage[];
  failure: { kind: FailureKind; eventId: string; day: number } | null;
  finished: boolean;
  /** Ereignisse, die für Ausgangslage stehen (Wurzeln) */
  origin: Record<string, string>;
  log: EventLogState;
  /** Kennzahlen fürs Jahr */
  totals: {
    kwhEl: number;
    kwhHeatSold: number;
    flaredM3: number;
    ch4LostStorageM3: number;
    ch4ProducedM3: number;
    bioErrorDays: number;
    trafficTrips: number;
  };
}

export interface WorldMessage {
  day: number;
  sender: 'betriebsleiter' | 'nachbar' | 'landwirt' | 'behoerde' | 'netzbetreiber' | 'bank' | 'biologin' | 'techniker' | 'agrar' | 'vermarkter';
  key: string;
  data: Record<string, number | string>;
  eventId?: string;
}

/** Spielerentscheidungen. */
export type Action =
  | { type: 'setFeeding'; feed: Partial<SubstrateMap> }
  | { type: 'signSupply'; offerId: string; tonnes: number }
  | { type: 'buySpot'; tonnes: number }
  | { type: 'signGuelle'; supplierId: string }
  | { type: 'cancelGuelle'; supplierId: string }
  | { type: 'buyResidue'; offerId: string }
  | { type: 'leaseField'; fieldId: string }
  | { type: 'setCrop'; fieldId: string; crop: Crop }
  | { type: 'setHarvestDay'; fieldId: string; day: number }
  | { type: 'orderService'; kind: 'klein' | 'gross' | 'entschwefelung' }
  | { type: 'hire'; role: StaffMember['role'] }
  | { type: 'fire'; role: StaffMember['role'] }
  | { type: 'orderSpreading'; m3: number }
  | { type: 'build'; kind: BuildKind }
  | { type: 'citizenDialog' }
  | { type: 'signOfftake' }
  | { type: 'signMaintenanceContract' };

export interface TodayLogistics {
  /** Silage-Anlieferungen: Herkunft (Feld-ID, Angebots-ID, 'spot') */
  deliveries: { origin: string; kind: 'mais' | 'gruenroggen'; t: number; distanceKm: number; throughVillage: boolean }[];
  guelle: { origin: string; t: number; distanceKm: number; throughVillage: boolean }[];
  /** Reststoffpartie angekommen */
  residueArrived: boolean;
  /** Felder, auf denen heute geerntet wurde */
  harvesting: string[];
  /** Felder, die heute bestellt wurden */
  sowing: string[];
  spreadM3: number;
}
