import { CONFIG, SUBSTRATES, STAFF_ROLES, type BuildKind, type Feature, type StaffRole, type SubstrateId } from '../sim/config';
import { dateOfDay, dayOfDate, formatDate, inWindow, windowDays } from '../sim/calendar';
import { guelleAvailability, offerOpen, offerPrice, spotPrice } from '../sim/contracts';
import { defaultHarvestDay, fieldConfig, harvestWindowFor } from '../sim/fields';
import { maizeShare } from '../sim/finance';
import { organicLoadingRate, scaleMap, sumMap } from '../sim/biology';
import { hasStaff } from '../sim/storage';
import type { Action, Crop, GameState } from '../sim/types';
import type { ActionResult } from '../sim/actions';
import { fmt, h, svg } from './dom';
import { TIPS } from '../content/tooltips.de';
import { buildAvailable, hasFeature, roleAvailable, type DifficultyId } from '../sim/difficulty';
import { ICONS, type IconName } from './icons';
import { cfg, hasChp, plantScale, plantSpec } from '../sim/plant';
import { maintenanceContractFee } from '../sim/finance';

/**
 * Entscheidungsbereiche. Beschriftet, aber ohne Erklärungen. Jede Änderung wirkt sofort
 * (Fütterung beim Loslassen des Reglers), auch bei angehaltener Zeit.
 */
export interface PanelCtx {
  state: GameState;
  act: (a: Action) => ActionResult;
}

export interface PanelDef {
  id: string;
  title: string;
  icon: IconName;
  key: string;
  render: (ctx: PanelCtx) => HTMLElement;
  /** Bereich nur in bestimmten Stufen */
  available?: (s: GameState) => boolean;
  /** Teilfunktionen, die es nur in höheren Stufen gibt (für die Vorschau im Startmenü) */
  limits?: { feature: Feature; label: string }[];
}

const SUBSTRATE_NAMES: Record<SubstrateId, string> = { mais: 'Maissilage', gruenroggen: 'Grünroggensilage', guelle: 'Rindergülle', reststoff: 'Reststoffe' };
const ROLE_NAMES: Record<StaffRole, string> = { biologin: 'Biologin', techniker: 'Verfahrenstechniker', agrar: 'Agrarberaterin', vermarkter: 'Energievermarkter' };
const BUILD_NAMES: Record<BuildKind, string> = {
  digestateStorage: 'Zweites Gärrestlager', gasStorage: 'Größerer Gasspeicher', cover: 'Abdeckung Gärrestlager', heatLine: 'Wärmeleitung ins Dorf', secondSilo: 'Zweites Fahrsilo',
};
const CROP_NAMES: Record<Crop, string> = { brache: 'keine Kultur', mais: 'Mais', gruenroggen: 'Grünroggen', zweikultur: 'Grünroggen, danach Mais' };
const REASONS: Record<string, string> = {
  stufe: 'In dieser Schwierigkeitsstufe nicht vorgesehen.',
  abgelaufen: 'Nicht mehr verfügbar.', bereits: 'Besteht bereits.', voll: 'Der Vorlagebehälter ist zu voll.', nicht_frei: 'Die Fläche ist nicht frei.',
  menge: 'Bitte eine Menge angeben.', gesperrt: 'Nicht verfügbar.', zu_frueh: 'Erst später wieder möglich.', keine_ernte: 'Gerade nichts zu ernten.',
  vergangen: 'Der Tag liegt in der Vergangenheit.', ersatz: 'Das BHKW wird gerade ersetzt.', unbekannt: 'Nicht möglich.', beendet: 'Der Durchlauf ist beendet.',
  nicht_gefuehrt: 'Die Fläche wird nicht bewirtschaftet.',
};

/** Statuszeile je Bereich für Rückmeldungen (aria-live). */
let lastStatus: { panel: string; text: string } | null = null;
function report(panel: string, r: ActionResult): void {
  lastStatus = r.ok ? null : { panel, text: REASONS[r.reason] ?? 'Nicht möglich.' };
}
function statusLine(panel: string): HTMLElement {
  const text = lastStatus && lastStatus.panel === panel ? lastStatus.text : '';
  return h('p', { class: 'panel__status', role: 'status', 'aria-live': 'polite' }, text);
}

const section = (title: string, ...children: (Node | null | false)[]) => h('section', { class: 'panel__section' }, h('h3', {}, title), ...children);
const row = (...children: (Node | string | null | false)[]) => h('div', { class: 'row' }, ...children);
const kv = (k: string, v: string) => h('div', { class: 'kv' }, h('span', { class: 'kv__k' }, k), h('span', { class: 'kv__v' }, v));
function button(label: string, onclick: () => void, opts: { primary?: boolean; disabled?: boolean; key?: string; tip?: string } = {}) {
  return h('button', { type: 'button', class: opts.primary ? 'btn btn--primary' : 'btn', onclick, disabled: opts.disabled, 'data-focus': opts.key ?? label, 'data-tip': opts.tip }, label);
}
function numberInput(id: string, value: number, min: number, max: number, step: number, label: string) {
  return h('input', { type: 'number', id, value, min, max, step, inputmode: 'numeric', class: 'input', 'aria-label': label, 'data-focus': id });
}

// ---------- Fütterung ----------

let feedTimer: number | undefined;
function feedPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const target = s.feedTarget;
  const pending: Partial<Record<SubstrateId, number>> = {};
  const commit = () => {
    window.clearTimeout(feedTimer);
    feedTimer = window.setTimeout(() => {
      if (Object.keys(pending).length) report('feed', ctx.act({ type: 'setFeeding', feed: { ...pending } }));
    }, 350);
  };
  const avail: Record<SubstrateId, string> = {
    mais: `Vorrat ${fmt.int(s.silo.mais.t)} t`,
    gruenroggen: `Vorrat ${fmt.int(s.silo.gruenroggen.t)} t`,
    guelle: `Verträge bis ${fmt.int(guelleAvailability(s).reduce((a, g) => a + g.tPerDay, 0))} t/Tag`,
    reststoff: `Behälter ${fmt.int(s.residueTank.reduce((a, l) => a + l.tonnes, 0))} t`,
  };
  const rows = SUBSTRATES.map((sub) => {
    const id = `feed-${sub}`;
    const out = h('output', { for: id, class: 'slider__value' }, `${fmt.dec(target[sub], 1)} t`);
    const input = h('input', {
      type: 'range', id, 'data-tip': TIPS.feedSlider, min: 0, max: cfg(s).feeding.maxPerSubstrate[sub], step: 0.5, value: target[sub], class: 'slider__input', 'data-focus': id,
      'aria-valuetext': `${fmt.dec(target[sub], 1)} Tonnen pro Tag`,
    }) as HTMLInputElement;
    input.addEventListener('input', () => {
      out.textContent = `${fmt.dec(Number(input.value), 1)} t`;
      input.setAttribute('aria-valuetext', `${fmt.dec(Number(input.value), 1)} Tonnen pro Tag`);
    });
    input.addEventListener('change', () => {
      pending[sub] = Number(input.value);
      commit();
    });
    return h('div', { class: 'slider' }, h('label', { for: id, class: 'slider__label' }, SUBSTRATE_NAMES[sub]), out, input, h('span', { class: 'slider__meta' }, avail[sub]));
  });
  return h('div', {},
    section('Tägliche Fütterung', ...rows),
    section('Kennwerte',
      kv('Tagesmenge', `${fmt.dec(sumMap(target), 1)} t`),
      kv('Raumbelastung', `${fmt.dec(organicLoadingRate(scaleMap(target, 1 / plantScale(s))), 2)} kg oTS/(m³·d)`),
      kv('Maisanteil seit 1. August', fmt.pct(maizeShare(s))),
      kv('Heute gefüttert', `${fmt.dec(sumMap(s.fedToday), 1)} t`),
    ),
    statusLine('feed'),
  );
}

// ---------- Beschaffung ----------

function supplyPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  type Offer = { id: string; name: string; distanceKm: number; maxT: number; priceEurPerT: number };
  const offers = (list: readonly Offer[]) =>
    list.map((o) => {
      const c = s.contracts.find((x) => x.offerId === o.id);
      if (c) return row(h('strong', {}, o.name), h('span', {}, `${fmt.int(c.tonnes)} t zu ${fmt.dec(c.priceEurPerT, 2)} €/t, geliefert ${fmt.int(c.delivered)} t`));
      if (!offerOpen(s, o.id)) return null;
      const id = `offer-${o.id}`;
      return row(
        h('strong', {}, o.name),
        h('span', { class: 'muted' }, `${o.distanceKm} km, ${fmt.dec(offerPrice(s, o.priceEurPerT), 2)} €/t, bis ${fmt.int(o.maxT)} t`),
        h('label', { class: 'sr-only', for: id }, `Menge ${o.name} in Tonnen`),
        numberInput(id, o.maxT, 0, o.maxT, 100, `Menge ${o.name} in Tonnen`),
        button('Abschließen', () => {
          const v = Number((document.getElementById(id) as HTMLInputElement).value);
          report('supply', ctx.act({ type: 'signSupply', offerId: o.id, tonnes: v }));
        }, { key: `sign-${o.id}`, tip: TIPS.signSupply }),
      );
    }).filter(Boolean) as HTMLElement[];

  const maize = offers(cfg(s).contracts.maizeOffers);
  const rye = offers(cfg(s).contracts.ryeOffers);
  const ryeWin = windowDays(cfg(s).contracts.ryeOfferWindow);
  const guelle = cfg(s).contracts.guelleSuppliers.map((g) => {
    const c = s.guelleContracts.find((x) => x.supplierId === g.id);
    const status = c ? (c.activeFromDay <= s.day ? 'Vertrag läuft' : `Lieferung ab ${formatDate(c.activeFromDay)}`) : 'kein Vertrag';
    return row(
      h('strong', {}, g.name),
      h('span', { class: 'muted' }, `${g.distanceKm} km, bis ${g.maxTPerDay} t/Tag`),
      h('span', {}, status),
      c ? button('Kündigen', () => report('supply', ctx.act({ type: 'cancelGuelle', supplierId: g.id })), { key: `gc-${g.id}`, tip: TIPS.cancelGuelle })
        : button('Vertrag', () => report('supply', ctx.act({ type: 'signGuelle', supplierId: g.id })), { key: `gs-${g.id}`, tip: TIPS.signGuelle }),
    );
  });
  const tank = s.residueTank.reduce((a, l) => a + l.tonnes, 0);
  const residues = s.residueOffers.map((o) =>
    row(
      h('strong', {}, `${fmt.int(o.tonnes)} t`),
      h('span', { class: 'muted' }, `${fmt.int(o.priceEurPerT)} €/t, Angebot bis ${formatDate(o.expiresDay)}`),
      button('Kaufen', () => report('supply', ctx.act({ type: 'buyResidue', offerId: o.id })), { key: `res-${o.id}`, tip: TIPS.buyResidue }),
    ),
  );
  return h('div', {},
    section('Mais aus der Ernte', ...(maize.length ? maize : [h('p', { class: 'muted' }, 'Keine offenen Angebote.')])),
    section('Grünroggen für Mai', ...(rye.length ? rye : [h('p', { class: 'muted' }, s.day < ryeWin.start ? `Angebote ab ${formatDate(ryeWin.start)}.` : 'Keine offenen Angebote.')])),
    section('Gülle', ...guelle),
    section('Mais nachkaufen',
      kv('Preis heute', `${fmt.dec(spotPrice(s), 2)} €/t`),
      row(...[100, 300].map((t) => button(`${t} t kaufen`, () => report('supply', ctx.act({ type: 'buySpot', tonnes: t })), { key: `spot-${t}`, tip: TIPS.buySpot }))),
    ),
    !hasFeature(s, 'reststoffe') ? null : section('Reststoffe', kv('Vorlagebehälter', `${fmt.int(tank)} von ${fmt.int(cfg(s).plant.residueTankT)} t`), ...(residues.length ? residues : [h('p', { class: 'muted' }, 'Gerade kein Angebot.')])),
    statusLine('supply'),
  );
}

// ---------- Felder ----------

function fieldsPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const cards = s.fields.map((f) => {
    const cfg = fieldConfig(f.id);
    const head = h('h4', {}, `${cfg.name}, ${cfg.ha} ha, ${cfg.distanceKm} km`);
    if (f.status === 'verpachtet') return h('div', { class: 'card' }, head, h('p', { class: 'muted' }, `Verpachtet bis ${formatDate(dayOfDate(CONFIG.fields.leaseAvailableFrom))}`));
    if (f.status === 'frei') {
      return h('div', { class: 'card' }, head, kv('Pacht', `${fmt.eur(cfg.ha * CONFIG.fields.leaseEurPerHa)} im Jahr`),
        button('Pachten', () => report('fields', ctx.act({ type: 'leaseField', fieldId: f.id })), { primary: true, key: `lease-${f.id}`, tip: TIPS.lease }));
    }
    const cropId = `crop-${f.id}`;
    const select = h('select', { id: cropId, class: 'input', 'data-focus': cropId, 'data-tip': TIPS.crop }, ...(Object.keys(CROP_NAMES) as Crop[]).filter((c) => c !== 'zweikultur' || hasFeature(s, 'felder_experten') || f.crop === c).map((c) => h('option', { value: c, selected: c === f.crop }, CROP_NAMES[c]))) as HTMLSelectElement;
    select.addEventListener('change', () => report('fields', ctx.act({ type: 'setCrop', fieldId: f.id, crop: select.value as Crop })));
    const standing = f.standing === 'leer' ? 'nichts' : f.standing === 'zweitmais' ? 'Mais (Zweitfrucht)' : f.standing === 'mais' ? 'Mais' : 'Grünroggen';
    const win = harvestWindowFor(f);
    let harvest: HTMLElement | null = null;
    if (win && f.standing !== 'leer') {
      const hid = `harvest-${f.id}`;
      const planned = f.harvestDay ?? defaultHarvestDay(s, f) ?? win.start;
      const days: number[] = [];
      for (let d = Math.max(win.start, s.day); d <= Math.min(win.end, CONFIG.time.runDays - 1); d++) days.push(d);
      const planText = h('span', {}, formatDate(planned));
      const sel = h('select', { id: hid, class: 'input', 'data-focus': hid, 'data-tip': TIPS.harvestDay }, ...days.map((d) => h('option', { value: d, selected: d === planned }, formatDate(d)))) as HTMLSelectElement;
      sel.addEventListener('change', () => report('fields', ctx.act({ type: 'setHarvestDay', fieldId: f.id, day: Number(sel.value) })));
      // Eigener Erntetermin nur mit vollem Funktionsumfang; sonst erntet der Betriebsleiter zum üblichen Termin
      const choose = hasFeature(s, 'felder_experten');
      harvest = h('div', { class: 'field-row' }, h('label', { for: hid }, 'Ernte ab'), !days.length ? h('span', {}, 'Ernte läuft') : choose ? sel : planText);
      if (f.harvestedHa > 0) harvest.append(h('span', { class: 'muted' }, `geerntet ${fmt.int(f.harvestedHa)} von ${cfg.ha} ha`));
    }
    return h('div', { class: 'card' }, head,
      h('div', { class: 'field-row' }, h('label', { for: cropId }, 'Anbau'), select),
      kv('Steht', f.standing === 'leer' ? 'nichts' : `${standing}, ${fmt.pct(f.growth)} entwickelt`),
      harvest,
    );
  });
  return h('div', {}, section('Felder', ...cards), statusLine('fields'));
}

// ---------- Technik ----------

function techPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const chp = s.chp;
  const C = CONFIG.chp;
  const status = chp.status === 'betrieb' ? 'in Betrieb' : chp.status === 'wartung' ? `Wartung bis ${formatDate(chp.downUntilDay)}` : chp.status === 'stoerung' ? `Störung bis ${formatDate(chp.downUntilDay)}` : Number.isFinite(chp.downUntilDay) ? `Austausch bis ${formatDate(chp.downUntilDay)}` : 'ausgefallen';
  const tech = hasStaff(s, 'techniker');
  const upg = s.upgrading;
  const U = CONFIG.upgrading;
  const upgStatus = !upg ? '' : upg.status === 'betrieb' ? 'in Betrieb' : upg.status === 'wartung' ? `Wartung bis ${formatDate(upg.downUntilDay)}` : upg.status === 'stoerung' ? `Störung bis ${formatDate(upg.downUntilDay)}` : `Einspeisestopp bis ${formatDate(upg.downUntilDay)}`;
  const upgSection = !upg ? null : section('Gasaufbereitung',
    kv('Zustand', upgStatus),
    kv('Kapazität', `${fmt.int(plantSpec(s).upgradingRawM3PerH)} m³ Rohbiogas pro Stunde`),
    kv('Auslastung heute', fmt.pct(upg.runShare)),
    kv('Biomethan heute', `${fmt.int(upg.injectedCh4Today * CONFIG.plant.methaneKwhPerM3)} kWh`),
    kv('Stunden seit Wartung', `${fmt.int(upg.hoursSinceService)} h`),
    kv('Wartungsintervall', `${fmt.int(U.serviceIntervalH)} h`),
    button(`Verdichter warten, ${fmt.eur(s.maintenanceContract ? 0 : U.serviceCostEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'aufbereitung' })), { key: 'svc-upg', tip: TIPS.serviceUpgrading }),
    h('p', { class: 'muted' }, `Vergütung ${fmt.dec(U.biomethaneEurPerKwh * 100, 1)} ct pro kWh Biomethan. Strombedarf ${fmt.dec(U.powerKwhPerRawM3, 2)} kWh je m³ Rohbiogas, Methanschlupf ${fmt.dec(U.methaneSlip * 100, 1)} %.`),
  );
  const boilerSection = !plantSpec(s).boiler ? null : section('Heizkessel',
    kv('Gas für die Fermenterheizung heute', `${fmt.int(s.boilerCh4Today)} m³ Methan`),
    h('p', { class: 'muted' }, hasChp(s) ? 'Springt ein, wenn die Abwärme des BHKW für den Fermenter nicht reicht.' : 'Heizt den Fermenter mit eigenem Biogas, weil es kein BHKW gibt.'),
  );
  return h('div', {},
    !hasChp(s) ? null : section('BHKW',
      kv('Zustand', status),
      kv('Stunden seit Wartung', `${fmt.int(chp.hoursSinceService)} h`),
      kv('Wartungsintervall', `${fmt.int(C.serviceIntervalH)} h`),
      kv('Betriebsstunden gesamt', `${fmt.int(chp.operatingHours)} h`),
      row(
        button(`Kleine Wartung, ${fmt.eur(s.maintenanceContract ? 0 : C.smallService.costEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'klein' })), { key: 'svc-small', tip: TIPS.serviceSmall }),
        !hasFeature(s, 'instandsetzung') ? null : button(`Instandsetzung, ${fmt.eur(C.majorService.costEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'gross' })), { key: 'svc-major', tip: TIPS.serviceMajor }),
      ),
      !hasFeature(s, 'instandsetzung') ? null : h('p', { class: 'muted' }, `Stillstand: ${tech ? 1 : C.smallService.downtimeDays} bzw. ${tech ? Math.max(1, Math.round(C.majorService.downtimeDays * CONFIG.staff.technicianDowntimeFactor)) : C.majorService.downtimeDays} Tage`),
    ),
    upgSection,
    boilerSection,
    !hasFeature(s, 'entschwefelung') ? null : section('Entschwefelung',
      kv('Vorrat Verbrauchsmittel', `etwa ${fmt.int(s.desulf.mediumDays)} Tage`),
      kv('H₂S im Gas', `${fmt.int(s.desulf.cleanPpm)} ppm`),
      button(`Nachfüllen, ${fmt.eur(cfg(s).desulfurization.refillCostEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'entschwefelung' })), { key: 'svc-desulf', tip: TIPS.desulf }),
    ),
    s.unlocks.includes('wartungsvertrag')
      ? section('Wartungsvertrag', s.maintenanceContract ? h('p', {}, 'Vertrag läuft.') : button(`Abschließen, ${fmt.eur(maintenanceContractFee(s))} im Monat`, () => report('tech', ctx.act({ type: 'signMaintenanceContract' })), { key: 'mc', tip: TIPS.maintenanceContract }))
      : null,
    statusLine('tech'),
  );
}

// ---------- Personal ----------

function staffPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const rows = STAFF_ROLES.filter((role) => roleAvailable(s, role)).map((role) => {
    const m = s.staff.find((x) => x.role === role);
    const cost = CONFIG.staff.roles[role].salaryEurPerMonth;
    const status = !m ? null : s.day - m.hiredDay < CONFIG.staff.onboardingDays ? `Einarbeitung bis ${formatDate(m.hiredDay + CONFIG.staff.onboardingDays)}` : `dabei seit ${formatDate(m.hiredDay)}`;
    return h('div', { class: 'card' },
      h('h4', {}, ROLE_NAMES[role]),
      kv('Kosten', `${fmt.eur(cost)} im Monat`),
      status ? kv('Stand', status) : null,
      m ? button(`Entlassen, Abfindung ${fmt.eur(cost * CONFIG.staff.severanceMonths)}`, () => report('staff', ctx.act({ type: 'fire', role })), { key: `fire-${role}`, tip: TIPS.fire })
        : button('Einstellen', () => report('staff', ctx.act({ type: 'hire', role })), { primary: true, key: `hire-${role}`, tip: TIPS.hire }),
    );
  });
  return h('div', {}, section('Fachleute', ...rows), statusLine('staff'));
}

// ---------- Gärrest ----------

function digestatePanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const dg = s.digestate;
  const blackout = inWindow(s.day, CONFIG.digestate.blackout);
  const bw = windowDays(CONFIG.digestate.blackout);
  const id = 'spread-m3';
  return h('div', {},
    section('Gärrestlager',
      kv('Füllstand', `${fmt.int(dg.m3)} von ${fmt.int(dg.capacityM3)} m³`),
      kv('Oberfläche', dg.covered ? 'abgedeckt' : 'offen'),
      kv('Sperrfrist', blackout ? `bis ${formatDate(bw.end % CONFIG.units.daysPerYear)}` : `ab ${formatDate(bw.start)}`),
    ),
    section('Ausbringung',
      kv('Offener Auftrag', `${fmt.int(dg.spreadOrderM3)} m³`),
      kv('Heute ausgebracht', `${fmt.int(dg.spreadToday)} m³`),
      kv('Kosten', `${fmt.dec(CONFIG.digestate.spreadCostPerM3 + CONFIG.digestate.spreadCostPerM3Km * CONFIG.digestate.regionalDistanceKm, 2)} €/m³`),
      row(
        h('label', { for: id }, 'Menge in m³'),
        numberInput(id, 1000, 0, 20000, 100, 'Menge in Kubikmetern'),
        button('Beauftragen', () => report('dig', ctx.act({ type: 'orderSpreading', m3: Number((document.getElementById(id) as HTMLInputElement).value) })), { primary: true, key: 'spread', tip: TIPS.spread }),
      ),
    ),
    s.unlocks.includes('abnahmevertraege')
      ? section('Abnahmevertrag', dg.offtake ? h('p', {}, `Läuft, ${CONFIG.digestate.offtake.m3PerDay} m³ pro Tag.`) : button(`Abschließen, ${fmt.dec(CONFIG.digestate.offtake.costPerM3, 2)} €/m³`, () => report('dig', ctx.act({ type: 'signOfftake' })), { key: 'offtake', tip: TIPS.offtake }))
      : null,
    statusLine('dig'),
  );
}

// ---------- Ausbau und Dorf ----------

/** Tooltip eines Ausbaus mit den Mengen dieser Anlagengröße. */
function buildTip(s: GameState, k: BuildKind): string {
  const c = cfg(s);
  const n = (v: number) => fmt.int(v);
  switch (k) {
    case 'digestateStorage': return `Baut ein zweites Gärrestlager mit ${n(c.builds.digestateStorage.addM3)} m³. Mehr Platz über die Sperrfrist.`;
    case 'gasStorage': return `Vergrößert den Gasspeicher um ${n(c.builds.gasStorage.addM3)} m³. Mehr Puffer bei Stillständen, weniger Fackel.`;
    case 'secondSilo': return `Baut ein zweites Fahrsilo für ${n(c.silo.secondSiloT)} t Silage.`;
    default: return TIPS.build[k];
  }
}

function buildPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const kinds = (Object.keys(BUILD_NAMES) as BuildKind[]).filter((k) => buildAvailable(s, k));
  const rows = kinds.map((k) => {
    const spec = cfg(s).builds[k];
    const cost = k === 'cover' && s.unlocks.includes('abdeckung_guenstig') ? cfg(s).builds.cover.costEurUnlocked : spec.costEur;
    const order = s.builds.find((b) => b.kind === k);
    const done = s.built[k] || (k === 'heatLine' && s.heatLineActive);
    const state = done ? 'fertig' : order ? `im Bau bis ${formatDate(order.doneDay)}` : null;
    return h('div', { class: 'card' },
      h('h4', {}, BUILD_NAMES[k]),
      kv('Kosten', fmt.eur(cost)),
      kv('Bauzeit', `${spec.days} Tage`),
      state ? kv('Stand', state) : button('Beauftragen', () => report('build', ctx.act({ type: 'build', kind: k })), { key: `build-${k}`, tip: `${buildTip(s, k)} ${TIPS.buildCost}` }),
    );
  });
  const dialog = s.unlocks.includes('buergerdialog')
    ? button(`Bürgerdialog, ${fmt.eur(CONFIG.acceptance.dialogCostEur)}`, () => report('build', ctx.act({ type: 'citizenDialog' })), { key: 'dialog', tip: TIPS.dialog })
    : null;
  return h('div', {},
    section('Dorf', kv('Akzeptanz', `${fmt.int(s.acceptance.value)} von 100`), kv('Fahrten durchs Dorf heute', fmt.int(s.acceptance.trafficTrips)), dialog),
    section('Ausbauten', ...rows),
    statusLine('build'),
  );
}

// ---------- Finanzen ----------

const LEDGER_NAMES: Record<string, string> = {
  erloesStrom: 'Strom', erloesWaerme: 'Wärme', erloesVermarktung: 'Vermarktung', silageSold: 'Silage abgegeben',
  substrat: 'Substrat', transport: 'Transport', gaerrest: 'Gärrest', personal: 'Personal', fixkosten: 'Betrieb und Versicherung',
  wartung: 'Wartung', reparatur: 'Reparaturen', ausbau: 'Ausbau', pacht: 'Pacht', anbau: 'Anbau', labor: 'Labor', betrieb: 'Sonstiges',
  zinsen: 'Zinsen', erloesBiomethan: 'Biomethan', netzstrom: 'Netzstrom (Eigenbedarf)', ersatzBhkw: 'Ersatz-BHKW',
};
const INCOME = new Set(['erloesBiomethan', 'erloesStrom', 'erloesWaerme', 'erloesVermarktung', 'silageSold']);

function financePanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const L = s.finance.ledger;
  const income = Object.entries(L).filter(([k]) => INCOME.has(k));
  const costs = Object.entries(L).filter(([k]) => !INCOME.has(k) && LEDGER_NAMES[k]).sort((a, b) => b[1] - a[1]);
  // Bezug: verkaufte Energie (Strom und Biomethan)
  const kwh = s.totals.kwhSold + s.totals.kwhGas;
  const totalCost = costs.reduce((a, [, v]) => a + v, 0);
  return h('div', {},
    section('Konto',
      kv('Kontostand', fmt.eur(s.finance.balance)),
      kv('Kreditrahmen', fmt.eur(cfg(s).finance.creditLimitEur)),
      hasChp(s) ? kv('Strom diesen Monat', `${fmt.int(s.finance.monthKwh)} kWh`) : null,
      s.upgrading ? kv('Biomethan diesen Monat', `${fmt.int(s.finance.monthGasKwh)} kWh`) : null,
      kv('Abrechnung', 'am Monatsersten'),
    ),
    section('Erlöse seit 1. August', ...income.map(([k, v]) => kv(LEDGER_NAMES[k], fmt.eur(v)))),
    section('Kosten seit 1. August', ...costs.map(([k, v]) => kv(LEDGER_NAMES[k], fmt.eur(v)))),
    s.unlocks.includes('kostenaufstellung') && kwh > 0
      ? section('Kosten pro Kilowattstunde',
        ...costs.map(([k, v]) => kv(LEDGER_NAMES[k], `${fmt.dec((v / kwh) * 100, 2)} ct`)),
        kv('Zusammen', `${fmt.dec((totalCost / kwh) * 100, 2)} ct`),
        hasChp(s) ? kv('Vergütung Strom', `${fmt.dec(cfg(s).finance.eegEurPerKwh * 100, 2)} ct`) : null,
        s.upgrading ? kv('Vergütung Biomethan', `${fmt.dec(CONFIG.upgrading.biomethaneEurPerKwh * 100, 2)} ct`) : null)
      : null,
  );
}

export const PANELS: PanelDef[] = [
  { id: 'feed', title: 'Fütterung', icon: 'feed', key: 'f', render: feedPanel },
  { id: 'supply', title: 'Beschaffung', icon: 'truck', key: 'b', render: supplyPanel, limits: [{ feature: 'reststoffe', label: 'Reststoffe' }] },
  { id: 'fields', title: 'Felder', icon: 'field', key: 'a', render: fieldsPanel, available: (s) => hasFeature(s, 'felder'), limits: [{ feature: 'felder_experten', label: 'Zweikultur und eigener Erntetermin' }] },
  { id: 'tech', title: 'Technik', icon: 'wrench', key: 't', render: techPanel, limits: [{ feature: 'entschwefelung', label: 'Entschwefelung' }, { feature: 'instandsetzung', label: 'Instandsetzung' }] },
  { id: 'staff', title: 'Personal', icon: 'users', key: 'p', render: staffPanel, available: (s) => hasFeature(s, 'personal'), limits: [{ feature: 'personal_experten', label: 'Agrarberaterin und Energievermarkter' }] },
  { id: 'dig', title: 'Gärrest', icon: 'droplet', key: 'g', render: digestatePanel },
  { id: 'build', title: 'Ausbau und Dorf', icon: 'build', key: 'u', render: buildPanel, limits: [{ feature: 'ausbau_erweitert', label: 'Gasspeicher- und Siloausbau' }] },
  { id: 'money', title: 'Finanzen', icon: 'coins', key: 'k', render: financePanel },
];

export interface PanelPreview { id: string; title: string; state: 'full' | 'limited' | 'off'; missing: string[] }

/** Welche Bereiche in einer Stufe fehlen oder eingeschränkt sind (Vorschau im Startmenü). */
export function panelPreview(level: DifficultyId): PanelPreview[] {
  const probe = { scenario: { id: 'altanlage', difficulty: level } } as unknown as GameState;
  return PANELS.map((p) => {
    if (p.available && !p.available(probe)) return { id: p.id, title: p.title, state: 'off' as const, missing: [] };
    const missing = (p.limits ?? []).filter((l) => !hasFeature(probe, l.feature)).map((l) => l.label);
    return { id: p.id, title: p.title, state: missing.length ? 'limited' as const : 'full' as const, missing };
  });
}

export function panelIcon(name: IconName): SVGElement {
  return svg(ICONS[name]);
}

export { dateOfDay };
