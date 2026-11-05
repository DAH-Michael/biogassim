import { CONFIG, SUBSTRATES, STAFF_ROLES, type BuildKind, type StaffRole, type SubstrateId } from '../sim/config';
import { dateOfDay, dayOfDate, formatDate, inWindow, windowDays } from '../sim/calendar';
import { guelleAvailability, offerOpen, offerPrice, spotPrice } from '../sim/contracts';
import { defaultHarvestDay, fieldConfig, harvestWindowFor } from '../sim/fields';
import { maizeShare } from '../sim/finance';
import { organicLoadingRate, sumMap } from '../sim/biology';
import { hasStaff } from '../sim/storage';
import type { Action, Crop, GameState } from '../sim/types';
import type { ActionResult } from '../sim/actions';
import { fmt, h, svg } from './dom';
import { ICONS, type IconName } from './icons';

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
}

const SUBSTRATE_NAMES: Record<SubstrateId, string> = { mais: 'Maissilage', gruenroggen: 'Grünroggensilage', guelle: 'Rindergülle', reststoff: 'Reststoffe' };
const ROLE_NAMES: Record<StaffRole, string> = { biologin: 'Biologin', techniker: 'Verfahrenstechniker', agrar: 'Agrarberaterin', vermarkter: 'Energievermarkter' };
const BUILD_NAMES: Record<BuildKind, string> = {
  digestateStorage: 'Zweites Gärrestlager', gasStorage: 'Größerer Gasspeicher', cover: 'Abdeckung Gärrestlager', heatLine: 'Wärmeleitung ins Dorf', secondSilo: 'Zweites Fahrsilo',
};
const CROP_NAMES: Record<Crop, string> = { brache: 'keine Kultur', mais: 'Mais', gruenroggen: 'Grünroggen', zweikultur: 'Grünroggen, danach Mais' };
const REASONS: Record<string, string> = {
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
function button(label: string, onclick: () => void, opts: { primary?: boolean; disabled?: boolean; key?: string } = {}) {
  return h('button', { type: 'button', class: opts.primary ? 'btn btn--primary' : 'btn', onclick, disabled: opts.disabled, 'data-focus': opts.key ?? label }, label);
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
      type: 'range', id, min: 0, max: CONFIG.feeding.maxPerSubstrate[sub], step: 0.5, value: target[sub], class: 'slider__input', 'data-focus': id,
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
      kv('Raumbelastung', `${fmt.dec(organicLoadingRate(target), 2)} kg oTS/(m³·d)`),
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
        }, { key: `sign-${o.id}` }),
      );
    }).filter(Boolean) as HTMLElement[];

  const maize = offers(CONFIG.contracts.maizeOffers);
  const rye = offers(CONFIG.contracts.ryeOffers);
  const ryeWin = windowDays(CONFIG.contracts.ryeOfferWindow);
  const guelle = CONFIG.contracts.guelleSuppliers.map((g) => {
    const c = s.guelleContracts.find((x) => x.supplierId === g.id);
    const status = c ? (c.activeFromDay <= s.day ? 'Vertrag läuft' : `Lieferung ab ${formatDate(c.activeFromDay)}`) : 'kein Vertrag';
    return row(
      h('strong', {}, g.name),
      h('span', { class: 'muted' }, `${g.distanceKm} km, bis ${g.maxTPerDay} t/Tag`),
      h('span', {}, status),
      c ? button('Kündigen', () => report('supply', ctx.act({ type: 'cancelGuelle', supplierId: g.id })), { key: `gc-${g.id}` })
        : button('Vertrag', () => report('supply', ctx.act({ type: 'signGuelle', supplierId: g.id })), { key: `gs-${g.id}` }),
    );
  });
  const tank = s.residueTank.reduce((a, l) => a + l.tonnes, 0);
  const residues = s.residueOffers.map((o) =>
    row(
      h('strong', {}, `${fmt.int(o.tonnes)} t`),
      h('span', { class: 'muted' }, `${fmt.int(o.priceEurPerT)} €/t, Angebot bis ${formatDate(o.expiresDay)}`),
      button('Kaufen', () => report('supply', ctx.act({ type: 'buyResidue', offerId: o.id })), { key: `res-${o.id}` }),
    ),
  );
  return h('div', {},
    section('Mais aus der Ernte', ...(maize.length ? maize : [h('p', { class: 'muted' }, 'Keine offenen Angebote.')])),
    section('Grünroggen für Mai', ...(rye.length ? rye : [h('p', { class: 'muted' }, s.day < ryeWin.start ? `Angebote ab ${formatDate(ryeWin.start)}.` : 'Keine offenen Angebote.')])),
    section('Gülle', ...guelle),
    section('Mais nachkaufen',
      kv('Preis heute', `${fmt.dec(spotPrice(s), 2)} €/t`),
      row(...[100, 300].map((t) => button(`${t} t kaufen`, () => report('supply', ctx.act({ type: 'buySpot', tonnes: t })), { key: `spot-${t}` }))),
    ),
    section('Reststoffe', kv('Vorlagebehälter', `${fmt.int(tank)} von ${fmt.int(CONFIG.plant.residueTankT)} t`), ...(residues.length ? residues : [h('p', { class: 'muted' }, 'Gerade kein Angebot.')])),
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
        button('Pachten', () => report('fields', ctx.act({ type: 'leaseField', fieldId: f.id })), { primary: true, key: `lease-${f.id}` }));
    }
    const cropId = `crop-${f.id}`;
    const select = h('select', { id: cropId, class: 'input', 'data-focus': cropId }, ...(Object.keys(CROP_NAMES) as Crop[]).map((c) => h('option', { value: c, selected: c === f.crop }, CROP_NAMES[c]))) as HTMLSelectElement;
    select.addEventListener('change', () => report('fields', ctx.act({ type: 'setCrop', fieldId: f.id, crop: select.value as Crop })));
    const standing = f.standing === 'leer' ? 'nichts' : f.standing === 'zweitmais' ? 'Mais (Zweitfrucht)' : f.standing === 'mais' ? 'Mais' : 'Grünroggen';
    const win = harvestWindowFor(f);
    let harvest: HTMLElement | null = null;
    if (win && f.standing !== 'leer') {
      const hid = `harvest-${f.id}`;
      const planned = f.harvestDay ?? defaultHarvestDay(s, f) ?? win.start;
      const days: number[] = [];
      for (let d = Math.max(win.start, s.day); d <= Math.min(win.end, CONFIG.time.runDays - 1); d++) days.push(d);
      const sel = h('select', { id: hid, class: 'input', 'data-focus': hid }, ...days.map((d) => h('option', { value: d, selected: d === planned }, formatDate(d)))) as HTMLSelectElement;
      sel.addEventListener('change', () => report('fields', ctx.act({ type: 'setHarvestDay', fieldId: f.id, day: Number(sel.value) })));
      harvest = h('div', { class: 'field-row' }, h('label', { for: hid }, 'Ernte ab'), days.length ? sel : h('span', {}, 'Ernte läuft'));
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
  return h('div', {},
    section('BHKW',
      kv('Zustand', status),
      kv('Stunden seit Wartung', `${fmt.int(chp.hoursSinceService)} h`),
      kv('Wartungsintervall', `${fmt.int(C.serviceIntervalH)} h`),
      kv('Betriebsstunden gesamt', `${fmt.int(chp.operatingHours)} h`),
      row(
        button(`Kleine Wartung, ${fmt.eur(s.maintenanceContract ? 0 : C.smallService.costEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'klein' })), { key: 'svc-small' }),
        button(`Instandsetzung, ${fmt.eur(C.majorService.costEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'gross' })), { key: 'svc-major' }),
      ),
      h('p', { class: 'muted' }, `Stillstand: ${tech ? 1 : C.smallService.downtimeDays} bzw. ${tech ? Math.max(1, Math.round(C.majorService.downtimeDays * CONFIG.staff.technicianDowntimeFactor)) : C.majorService.downtimeDays} Tage`),
    ),
    section('Entschwefelung',
      kv('Vorrat Verbrauchsmittel', `etwa ${fmt.int(s.desulf.mediumDays)} Tage`),
      kv('H₂S im Gas', `${fmt.int(s.desulf.cleanPpm)} ppm`),
      button(`Nachfüllen, ${fmt.eur(CONFIG.desulfurization.refillCostEur)}`, () => report('tech', ctx.act({ type: 'orderService', kind: 'entschwefelung' })), { key: 'svc-desulf' }),
    ),
    s.unlocks.includes('wartungsvertrag')
      ? section('Wartungsvertrag', s.maintenanceContract ? h('p', {}, 'Vertrag läuft.') : button(`Abschließen, ${fmt.eur(CONFIG.maintenanceContract.eurPerMonth)} im Monat`, () => report('tech', ctx.act({ type: 'signMaintenanceContract' })), { key: 'mc' }))
      : null,
    statusLine('tech'),
  );
}

// ---------- Personal ----------

function staffPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const rows = STAFF_ROLES.map((role) => {
    const m = s.staff.find((x) => x.role === role);
    const cost = CONFIG.staff.roles[role].salaryEurPerMonth;
    const status = !m ? null : s.day - m.hiredDay < CONFIG.staff.onboardingDays ? `Einarbeitung bis ${formatDate(m.hiredDay + CONFIG.staff.onboardingDays)}` : `dabei seit ${formatDate(m.hiredDay)}`;
    return h('div', { class: 'card' },
      h('h4', {}, ROLE_NAMES[role]),
      kv('Kosten', `${fmt.eur(cost)} im Monat`),
      status ? kv('Stand', status) : null,
      m ? button(`Entlassen, Abfindung ${fmt.eur(cost * CONFIG.staff.severanceMonths)}`, () => report('staff', ctx.act({ type: 'fire', role })), { key: `fire-${role}` })
        : button('Einstellen', () => report('staff', ctx.act({ type: 'hire', role })), { primary: true, key: `hire-${role}` }),
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
        button('Beauftragen', () => report('dig', ctx.act({ type: 'orderSpreading', m3: Number((document.getElementById(id) as HTMLInputElement).value) })), { primary: true, key: 'spread' }),
      ),
    ),
    s.unlocks.includes('abnahmevertraege')
      ? section('Abnahmevertrag', dg.offtake ? h('p', {}, `Läuft, ${CONFIG.digestate.offtake.m3PerDay} m³ pro Tag.`) : button(`Abschließen, ${fmt.dec(CONFIG.digestate.offtake.costPerM3, 2)} €/m³`, () => report('dig', ctx.act({ type: 'signOfftake' })), { key: 'offtake' }))
      : null,
    statusLine('dig'),
  );
}

// ---------- Ausbau und Dorf ----------

function buildPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const kinds = Object.keys(BUILD_NAMES) as BuildKind[];
  const rows = kinds.map((k) => {
    const cfg = CONFIG.builds[k];
    const cost = k === 'cover' && s.unlocks.includes('abdeckung_guenstig') ? CONFIG.builds.cover.costEurUnlocked : cfg.costEur;
    const order = s.builds.find((b) => b.kind === k);
    const done = s.built[k] || (k === 'heatLine' && s.heatLineActive);
    const state = done ? 'fertig' : order ? `im Bau bis ${formatDate(order.doneDay)}` : null;
    return h('div', { class: 'card' },
      h('h4', {}, BUILD_NAMES[k]),
      kv('Kosten', fmt.eur(cost)),
      kv('Bauzeit', `${cfg.days} Tage`),
      state ? kv('Stand', state) : button('Beauftragen', () => report('build', ctx.act({ type: 'build', kind: k })), { key: `build-${k}` }),
    );
  });
  const dialog = s.unlocks.includes('buergerdialog')
    ? button(`Bürgerdialog, ${fmt.eur(CONFIG.acceptance.dialogCostEur)}`, () => report('build', ctx.act({ type: 'citizenDialog' })), { key: 'dialog' })
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
  zinsen: 'Zinsen', ersatzBhkw: 'Ersatz-BHKW',
};
const INCOME = new Set(['erloesStrom', 'erloesWaerme', 'erloesVermarktung', 'silageSold']);

function financePanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.state;
  const L = s.finance.ledger;
  const income = Object.entries(L).filter(([k]) => INCOME.has(k));
  const costs = Object.entries(L).filter(([k]) => !INCOME.has(k) && LEDGER_NAMES[k]).sort((a, b) => b[1] - a[1]);
  const kwh = s.totals.kwhEl * (1 - CONFIG.plant.ownPowerShare);
  const totalCost = costs.reduce((a, [, v]) => a + v, 0);
  return h('div', {},
    section('Konto',
      kv('Kontostand', fmt.eur(s.finance.balance)),
      kv('Kreditrahmen', fmt.eur(CONFIG.finance.creditLimitEur)),
      kv('Strom diesen Monat', `${fmt.int(s.finance.monthKwh)} kWh`),
      kv('Abrechnung', 'am Monatsersten'),
    ),
    section('Erlöse seit 1. August', ...income.map(([k, v]) => kv(LEDGER_NAMES[k], fmt.eur(v)))),
    section('Kosten seit 1. August', ...costs.map(([k, v]) => kv(LEDGER_NAMES[k], fmt.eur(v)))),
    s.unlocks.includes('kostenaufstellung') && kwh > 0
      ? section('Kosten pro Kilowattstunde',
        ...costs.map(([k, v]) => kv(LEDGER_NAMES[k], `${fmt.dec((v / kwh) * 100, 2)} ct`)),
        kv('Zusammen', `${fmt.dec((totalCost / kwh) * 100, 2)} ct`),
        kv('Vergütung', `${fmt.dec(CONFIG.finance.eegEurPerKwh * 100, 2)} ct`))
      : null,
  );
}

export const PANELS: PanelDef[] = [
  { id: 'feed', title: 'Fütterung', icon: 'feed', key: 'f', render: feedPanel },
  { id: 'supply', title: 'Beschaffung', icon: 'truck', key: 'b', render: supplyPanel },
  { id: 'fields', title: 'Felder', icon: 'field', key: 'a', render: fieldsPanel },
  { id: 'tech', title: 'Technik', icon: 'wrench', key: 't', render: techPanel },
  { id: 'staff', title: 'Personal', icon: 'users', key: 'p', render: staffPanel },
  { id: 'dig', title: 'Gärrest', icon: 'droplet', key: 'g', render: digestatePanel },
  { id: 'build', title: 'Ausbau und Dorf', icon: 'build', key: 'u', render: buildPanel },
  { id: 'money', title: 'Finanzen', icon: 'coins', key: 'k', render: financePanel },
];

export function panelIcon(name: IconName): SVGElement {
  return svg(ICONS[name]);
}

export { dateOfDay };
