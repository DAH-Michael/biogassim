import { CONFIG, STAFF_ROLES } from './config';
import { dateOfDay } from './calendar';
import { addCause, logEvent, topCauses } from './eventlog';
import { round, sumMap } from './biology';
import { say } from './messages';
import { hasStaff, ledger } from './storage';
import { biogasPerHourAtFullLoad, chpCh4PerDay } from './tech';
import type { GameState } from './types';

/**
 * Finanzen: tägliche Zinsen, Monatsabrechnung (Strom, Wärme, Gehälter, Fixkosten),
 * Maisdeckel, Kreditrahmen. Verluste werden ihren Ursachen in Euro zugeordnet.
 */

const F = CONFIG.finance;
const PL = CONFIG.plant;

export interface FinanceInput {
  kwhEl: number;
  kwhTh: number;
  /** Ereignis, das die heutige Erzeugung begrenzt hat */
  shortfallCause?: string;
}

/** Wärmebedarf des Dorfs heute in kWh. */
export function villageHeatDemandKwh(state: GameState): number {
  const doy = dateOfDay(state.day).doy;
  const kw = F.villageHeatKwMean + F.villageHeatKwAmplitude * Math.cos((2 * Math.PI * (doy - F.villageHeatPeakDoy)) / CONFIG.units.daysPerYear);
  return Math.max(0, kw) * CONFIG.units.hoursPerDay;
}

export function marketerBonusPerKwh(state: GameState): number {
  const st = CONFIG.staff;
  const hours = state.gas.capacityM3 / biogasPerHourAtFullLoad(state.bio.ch4Share);
  return st.marketerBaseEurPerKwh + st.marketerPerStorageHourEurPerKwh * Math.max(0, hours - st.marketerReferenceStorageHours);
}

/** Eigenstrombedarf eines Tages bei gegebener Erzeugung, kWh */
export function ownPowerKwh(kwhEl: number): number {
  return PL.ownPowerBaseKw * CONFIG.units.hoursPerDay + kwhEl * PL.ownPowerShare;
}

export function maizeShare(state: GameState): number {
  const total = sumMap(state.inputTotals);
  return total > 0 ? state.inputTotals.mais / total : 0;
}

export function financeDay(state: GameState, inp: FinanceInput): void {
  const fin = state.finance;
  const day = state.day;

  // Zinsen auf negativen Kontostand
  if (fin.balance < 0) {
    const interest = (-fin.balance * F.interestRatePa) / CONFIG.units.daysPerYear;
    fin.balance -= interest;
    ledger(state, 'zinsen', interest);
  }

  // Erzeugung sammeln
  const own = ownPowerKwh(inp.kwhEl);
  const sold = Math.max(0, inp.kwhEl - own);
  const bought = Math.max(0, own - inp.kwhEl);
  if (bought > 0) {
    const cost = bought * PL.gridPurchaseEurPerKwh;
    fin.balance -= cost;
    ledger(state, 'netzstrom', cost);
  }
  fin.monthKwh += sold;
  fin.monthDays++;
  fin.monthMarketValueSum += fin.marketPrice;
  state.totals.kwhEl += inp.kwhEl;
  state.totals.kwhSold += sold;
  if (hasStaff(state, 'vermarkter')) fin.monthMarketerEur += sold * marketerBonusPerKwh(state);
  if (state.heatLineActive) {
    const heat = Math.min(villageHeatDemandKwh(state), inp.kwhTh * F.heatShareAvailable);
    fin.monthHeatKwh += heat;
    state.totals.kwhHeatSold += heat;
  }

  // Entgangene Erlöse der Ursache zuordnen
  const fullKwh = chpCh4PerDay() * PL.methaneKwhPerM3 * PL.chpEtaEl;
  const shortfall = Math.max(0, fullKwh - inp.kwhEl);
  if (shortfall > fullKwh * F.shortfallTolerance) addCause(fin.lossCauses, inp.shortfallCause, shortfall * F.eegEurPerKwh);

  // Monatsabrechnung am Monatsersten
  if (day > 0 && dateOfDay(day).dayOfMonth === 1) settleMonth(state);

  // Kreditrahmen
  if (fin.balance < -F.creditLimitEur * F.bankNoticeShare && !fin.bankNoticeSent) {
    fin.bankNoticeSent = true;
    say(state, 'bank', 'kreditrahmen', {});
  }
  if (fin.balance < -F.creditLimitEur) {
    if (fin.daysOverLimit === 0) {
      const ev = logEvent(state.log, day, {
        type: 'credit_exceeded',
        severity: 'critical',
        causes: topCauses(fin.lossCauses),
        data: { balance: Math.round(fin.balance), limit: F.creditLimitEur },
      });
      fin.overLimitEvent = ev.id;
    }
    fin.daysOverLimit++;
  } else {
    fin.daysOverLimit = 0;
    fin.overLimitEvent = undefined;
  }
}

export function settleMonth(state: GameState): void {
  const fin = state.finance;
  const day = state.day;
  const share = maizeShare(state);
  const avgMarket = fin.monthDays > 0 ? fin.monthMarketValueSum / fin.monthDays : F.marketEurPerKwh;
  let price: number = F.eegEurPerKwh;
  if (share > CONFIG.maizeCap.maxShare && CONFIG.maizeCap.penaltyToMarketValue) {
    price = avgMarket;
    if (!state.maizeCapExceededEvent) {
      const ev = logEvent(state.log, day, {
        type: 'maizecap_exceeded',
        severity: 'warning',
        causes: [state.highMaizeEvent ?? state.feedTargetEvent ?? state.origin.feeding],
        data: { share: round(share, 2), cap: CONFIG.maizeCap.maxShare },
      });
      state.maizeCapExceededEvent = ev.id;
      say(state, 'netzbetreiber', 'maisdeckel', { prozent: Math.round(share * CONFIG.units.percent) }, ev.id);
    }
    addCause(fin.lossCauses, state.maizeCapExceededEvent, fin.monthKwh * (F.eegEurPerKwh - avgMarket));
  }
  const power = fin.monthKwh * price;
  const heat = fin.monthHeatKwh * F.heatEurPerKwh;
  fin.balance += power + heat + fin.monthMarketerEur;
  ledger(state, 'erloesStrom', power);
  ledger(state, 'erloesWaerme', heat);
  ledger(state, 'erloesVermarktung', fin.monthMarketerEur);

  // Gehälter
  let salaries = 0;
  for (const s of state.staff) {
    const sal = CONFIG.staff.roles[s.role].salaryEurPerMonth;
    salaries += sal;
    addCause(fin.lossCauses, s.eventId, sal);
  }
  fin.balance -= salaries;
  ledger(state, 'personal', salaries);
  fin.balance -= F.fixedCostsEurPerMonth;
  ledger(state, 'fixkosten', F.fixedCostsEurPerMonth);
  if (state.maintenanceContract) {
    fin.balance -= CONFIG.maintenanceContract.eurPerMonth;
    ledger(state, 'wartung', CONFIG.maintenanceContract.eurPerMonth);
  }
  logEvent(state.log, day, {
    type: 'month_settled',
    causes: [],
    data: { kwh: Math.round(fin.monthKwh), price: round(price, CONFIG.units.priceDigits), revenueEur: Math.round(power + heat + fin.monthMarketerEur), salariesEur: salaries, balance: Math.round(fin.balance) },
  });
  fin.monthKwh = 0;
  fin.monthHeatKwh = 0;
  fin.monthMarketerEur = 0;
  fin.monthMarketValueSum = 0;
  fin.monthDays = 0;
}

export { STAFF_ROLES };
