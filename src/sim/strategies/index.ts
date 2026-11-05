import { CONFIG } from '../config';
import { dayOfDate, inWindow, windowDays } from '../calendar';
import type { Action, GameState } from '../types';

/**
 * Scripted Spielerprofile für Konsole, Tests und Balancing (Meilenstein 7).
 * Sie sehen nur, was auch ein Spieler sehen kann (Messwerte, Lager, Konto),
 * nicht den wahren FOS/TAC.
 */
export type Strategy = (s: GameState) => Action[];

interface Profile {
  /** Fütterung ab Start, t/d */
  feed?: Partial<Record<'mais' | 'gruenroggen' | 'guelle' | 'reststoff', number>>;
  /** Fütterung nach dem Grünroggen-Einlagern */
  feedAfterRye?: Partial<Record<'mais' | 'gruenroggen' | 'guelle' | 'reststoff', number>>;
  maizeContracts?: Record<string, number>;
  ryeContracts?: Record<string, number>;
  guelle?: string[];
  cancelGuelle?: string[];
  maintain?: boolean;
  desulf?: boolean;
  spread?: boolean;
  staff?: ('biologin' | 'techniker' | 'agrar' | 'vermarkter')[];
  leaseFields?: { id: string; crop: 'gruenroggen' | 'zweikultur' | 'mais' }[];
  builds?: ('cover' | 'gasStorage' | 'digestateStorage' | 'heatLine' | 'secondSilo')[];
  /** Mais nachkaufen, wenn der Vorrat unter so viele Tage fällt */
  spotBelowDays?: number;
  /** reagiert auf hohe Messwerte mit weniger Fütterung */
  reactToFos?: boolean;
}

function profileStrategy(p: Profile): Strategy {
  return (s) => {
    const a: Action[] = [];
    const d = s.day;
    if (d === 0) {
      if (p.feed) a.push({ type: 'setFeeding', feed: p.feed });
      for (const [id, t] of Object.entries(p.maizeContracts ?? {})) a.push({ type: 'signSupply', offerId: id, tonnes: t });
      for (const id of p.guelle ?? []) a.push({ type: 'signGuelle', supplierId: id });
      for (const id of p.cancelGuelle ?? []) a.push({ type: 'cancelGuelle', supplierId: id });
      for (const r of p.staff ?? []) a.push({ type: 'hire', role: r });
      for (const b of p.builds ?? []) a.push({ type: 'build', kind: b });
    }
    if (d === windowDays(CONFIG.contracts.ryeOfferWindow).start) {
      for (const [id, t] of Object.entries(p.ryeContracts ?? {})) a.push({ type: 'signSupply', offerId: id, tonnes: t });
    }
    if (d === dayOfDate(CONFIG.fields.leaseAvailableFrom)) {
      for (const f of p.leaseFields ?? []) {
        a.push({ type: 'leaseField', fieldId: f.id });
        a.push({ type: 'setCrop', fieldId: f.id, crop: f.crop });
      }
    }
    if (p.feedAfterRye && d === windowDays(CONFIG.fields.windows.roggenHarvest).end + 2) {
      a.push({ type: 'setFeeding', feed: p.feedAfterRye });
    }
    if (p.maintain && s.chp.status === 'betrieb' && s.chp.hoursSinceService > CONFIG.chp.serviceIntervalH - CONFIG.chp.serviceNoticeHoursBefore) {
      a.push({ type: 'orderService', kind: 'klein' });
    }
    if (p.desulf && s.desulf.mediumDays < CONFIG.desulfurization.lowNoticeDays) a.push({ type: 'orderService', kind: 'entschwefelung' });
    if (p.spread && !inWindow(d, CONFIG.digestate.blackout)) {
      const dg = s.digestate;
      const target = dg.capacityM3 * strategyConfig.spreadTargetShare;
      if (dg.spreadOrderM3 <= 0 && dg.m3 > target + strategyConfig.spreadMinOrderM3) a.push({ type: 'orderSpreading', m3: dg.m3 - target });
    }
    if (p.spread && inWindow(d, CONFIG.digestate.blackout) && s.digestate.m3 / s.digestate.capacityM3 > strategyConfig.blackoutReduceShare && s.feedTarget.guelle > strategyConfig.blackoutGuelleT) {
      a.push({ type: 'setFeeding', feed: { guelle: strategyConfig.blackoutGuelleT } });
    }
    if (p.spread && !inWindow(d, CONFIG.digestate.blackout) && p.feed?.guelle !== undefined && s.feedTarget.guelle === strategyConfig.blackoutGuelleT && p.feed.guelle > strategyConfig.blackoutGuelleT) {
      a.push({ type: 'setFeeding', feed: { guelle: p.feed.guelle } });
    }
    if (p.spotBelowDays) {
      const daily = s.feedTarget.mais;
      const pending = s.spotOrders.reduce((x, o) => x + o.tonnes, 0);
      const contractsLeft = s.contracts.filter((c) => c.kind === 'mais').reduce((x, c) => x + c.tonnes - c.delivered, 0);
      if (daily > 0 && (s.silo.mais.t + pending + contractsLeft) / daily < p.spotBelowDays) a.push({ type: 'buySpot', tonnes: CONFIG.contracts.spot.maxTPerOrder });
    }
    if (p.reactToFos && s.measurement.fosTac > CONFIG.biology.fosTacWarning && s.feedChangedDay < d - strategyConfig.reactCooldownDays) {
      a.push({ type: 'setFeeding', feed: { mais: s.feedTarget.mais * strategyConfig.reactFactor, reststoff: 0 } });
    }
    return a;
  };
}

/** Parameter der Strategien (keine Spielbalance, nur Verhalten der Testspieler). */
export const strategyConfig = {
  spreadTargetShare: 0.15,
  spreadMinOrderM3: 300,
  reactCooldownDays: 10,
  reactFactor: 0.85,
  /** in der Sperrfrist ab diesem Füllstand weniger Gülle */
  blackoutReduceShare: 0.85,
  blackoutGuelleT: 20,
};

const ALL_MAIZE = Object.fromEntries(CONFIG.contracts.maizeOffers.map((o) => [o.id, o.maxT]));

export const STRATEGIES: Record<string, { label: string; strategy: Strategy }> = {
  nichts: { label: 'Keine Entscheidungen', strategy: () => [] },
  naiv: {
    label: 'Naiver erster Versuch: mehr Mais für mehr Strom, ein Vertrag, sonst nichts',
    strategy: profileStrategy({ feed: { mais: 32 }, maizeContracts: { lw_brandt: 2500 } }),
  },
  nur_mais: {
    label: 'Nur Mais: Gülle abbestellt, alle Maisverträge, Wartung und Ausbringung',
    strategy: profileStrategy({
      feed: { mais: 29, guelle: 0 }, cancelGuelle: ['th_haase', 'th_koenig'], maizeContracts: ALL_MAIZE,
      maintain: true, desulf: true, spread: true, spotBelowDays: 20,
    }),
  },
  nur_guelle: {
    label: 'Nur Gülle: alle Tierhalter, kein Mais',
    strategy: profileStrategy({ feed: { mais: 0, guelle: 80 }, guelle: ['th_seidel'], maintain: true, desulf: true, spread: true }),
  },
  ausgewogen: {
    label: 'Ausgewogen: Mais unter dem Deckel, Gülle, Grünroggen, Wartung, Ausbringung, Biologin',
    strategy: profileStrategy({
      feed: { mais: 24, guelle: 40 },
      feedAfterRye: { mais: 16, gruenroggen: 10, guelle: 40 },
      maizeContracts: { lw_wendt: 1500, lw_brandt: 2500, lw_lindner: 3000 },
      ryeContracts: { lw_brandt_r: 1500 },
      maintain: true, desulf: true, spread: true, staff: ['biologin'],
      leaseFields: [{ id: 'f1', crop: 'zweikultur' }], spotBelowDays: 15, reactToFos: true,
    }),
  },
  wartung_aufschieben: {
    label: 'Wie ausgewogen, aber Wartung und Entschwefelung immer aufgeschoben',
    strategy: profileStrategy({
      feed: { mais: 24, guelle: 40 },
      feedAfterRye: { mais: 16, gruenroggen: 10, guelle: 40 },
      maizeContracts: { lw_wendt: 1500, lw_brandt: 2500, lw_lindner: 3000 },
      ryeContracts: { lw_brandt_r: 1500 },
      spread: true, staff: ['biologin'], leaseFields: [{ id: 'f1', crop: 'zweikultur' }], spotBelowDays: 15, reactToFos: true,
    }),
  },
  kein_personal: {
    label: 'Wie ausgewogen, aber ohne Personal',
    strategy: profileStrategy({
      feed: { mais: 24, guelle: 40 },
      feedAfterRye: { mais: 16, gruenroggen: 10, guelle: 40 },
      maizeContracts: { lw_wendt: 1500, lw_brandt: 2500, lw_lindner: 3000 },
      ryeContracts: { lw_brandt_r: 1500 },
      maintain: true, desulf: true, spread: true, leaseFields: [{ id: 'f1', crop: 'zweikultur' }], spotBelowDays: 15, reactToFos: true,
    }),
  },
  dauerfackel: {
    label: 'Mehr Gas als das BHKW verwerten kann, ferne Lieferanten, offenes Lager',
    strategy: profileStrategy({
      feed: { mais: 30, guelle: 45 }, guelle: ['th_seidel'],
      maizeContracts: { ag_heidekamp: 5000, lw_lindner: 3000 },
      maintain: true, desulf: true, spread: true, spotBelowDays: 15,
    }),
  },
  ueberfuettern: {
    label: 'Ausgewogen, dann im Winter schnell auf viel mehr Mais erhöht',
    strategy: (s) => {
      const base = STRATEGIES.kein_personal.strategy(s);
      if (s.day === 120) base.push({ type: 'setFeeding', feed: { mais: 40 } });
      return base;
    },
  },
};
