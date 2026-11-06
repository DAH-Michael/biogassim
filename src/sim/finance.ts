import { CONFIG, STAFF_ROLES } from './config';
import { dateOfDay } from './calendar';
import { addCause, logEvent, topCauses } from './eventlog';
import { round, sumMap } from './biology';
import { say } from './messages';
import { hasStaff, ledger } from './storage';
import { chpCh4PerDay, plantCh4PerDay, valuePerCh4 } from './tech';
import type { GameState } from './types';
import { cfg, plantSpec } from './plant';

/**
 * Finanzen: tägliche Zinsen, Monatsabrechnung (Strom, Wärme, Gehälter, Fixkosten),
 * Maisdeckel, Kreditrahmen. Verluste werden ihren Ursachen in Euro zugeordnet.
 */


export interface FinanceInput {
  kwhEl: number;
  kwhTh: number;
  /** eingespeistes Methan, m³ */
  ch4Injected: number;
  /** Strombedarf der Gasaufbereitung, kWh */
  upgradingKwh: number;
  /** heute verwertetes Methan (BHKW und Aufbereitung), m³ */
  ch4Used: number;
  /** Ereignis, das die heutige Erzeugung begrenzt hat */
  shortfallCause?: string;
}

/** Wärmebedarf des Dorfs heute in kWh. */
export function villageHeatDemandKwh(state: GameState): number {
  const doy = dateOfDay(state.day).doy;
  const kw = cfg(state).finance.villageHeatKwMean + cfg(state).finance.villageHeatKwAmplitude * Math.cos((2 * Math.PI * (doy - cfg(state).finance.villageHeatPeakDoy)) / CONFIG.units.daysPerYear);
  return Math.max(0, kw) * CONFIG.units.hoursPerDay;
}

export function marketerBonusPerKwh(state: GameState): number {
  const st = CONFIG.staff;
  // Speicherstunden bezogen auf das BHKW: so lange kann es bei vollem Speicher stillstehen
  const chpBiogasPerHour = chpCh4PerDay(state) / state.bio.ch4Share / CONFIG.units.hoursPerDay;
  const hours = chpBiogasPerHour > 0 ? state.gas.capacityM3 / chpBiogasPerHour : 0;
  return st.marketerBaseEurPerKwh + st.marketerPerStorageHourEurPerKwh * Math.max(0, hours - st.marketerReferenceStorageHours);
}

/** Eigenstrombedarf eines Tages bei gegebener Erzeugung, kWh */
export function ownPowerKwh(state: GameState, kwhEl: number): number {
  return cfg(state).plant.ownPowerBaseKw * CONFIG.units.hoursPerDay + kwhEl * cfg(state).plant.ownPowerShare;
}

/** Monatliche Gebühr des Wartungsvertrags: BHKW, Aufbereitung oder beides. */
export function maintenanceContractFee(state: GameState): number {
  const M = CONFIG.maintenanceContract;
  return (plantSpec(state).chpKwEl > 0 ? M.eurPerMonth : 0) + (state.upgrading ? M.upgradingEurPerMonth : 0);
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
    const interest = (-fin.balance * cfg(state).finance.interestRatePa) / CONFIG.units.daysPerYear;
    fin.balance -= interest;
    ledger(state, 'zinsen', interest);
  }

  // Erzeugung sammeln
  const own = ownPowerKwh(state, inp.kwhEl) + inp.upgradingKwh;
  const sold = Math.max(0, inp.kwhEl - own);
  const bought = Math.max(0, own - inp.kwhEl);
  if (bought > 0) {
    const cost = bought * cfg(state).plant.gridPurchaseEurPerKwh;
    fin.balance -= cost;
    ledger(state, 'netzstrom', cost);
  }
  fin.monthKwh += sold;
  fin.monthDays++;
  fin.monthMarketValueSum += fin.marketPrice;
  state.totals.kwhEl += inp.kwhEl;
  state.totals.kwhSold += sold;
  const gasKwh = inp.ch4Injected * CONFIG.plant.methaneKwhPerM3;
  fin.monthGasKwh += gasKwh;
  state.totals.kwhGas += gasKwh;
  if (hasStaff(state, 'vermarkter')) fin.monthMarketerEur += sold * marketerBonusPerKwh(state);
  if (state.heatLineActive) {
    const heat = Math.min(villageHeatDemandKwh(state), inp.kwhTh * cfg(state).finance.heatShareAvailable);
    fin.monthHeatKwh += heat;
    state.totals.kwhHeatSold += heat;
  }

  // Entgangene Erlöse der Ursache zuordnen
  const fullCh4 = plantCh4PerDay(state);
  const shortfall = Math.max(0, fullCh4 - inp.ch4Used);
  if (shortfall > fullCh4 * cfg(state).finance.shortfallTolerance) addCause(fin.lossCauses, inp.shortfallCause, shortfall * valuePerCh4(state));

  // Monatsabrechnung am Monatsersten
  if (day > 0 && dateOfDay(day).dayOfMonth === 1) settleMonth(state);

  // Kreditrahmen
  if (fin.balance < -cfg(state).finance.creditLimitEur * cfg(state).finance.bankNoticeShare && !fin.bankNoticeSent) {
    fin.bankNoticeSent = true;
    say(state, 'bank', 'kreditrahmen', {});
  }
  if (fin.balance < -cfg(state).finance.creditLimitEur) {
    if (fin.daysOverLimit === 0) {
      const ev = logEvent(state.log, day, {
        type: 'credit_exceeded',
        severity: 'critical',
        causes: topCauses(fin.lossCauses),
        data: { balance: Math.round(fin.balance), limit: cfg(state).finance.creditLimitEur },
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
  const avgMarket = fin.monthDays > 0 ? fin.monthMarketValueSum / fin.monthDays : cfg(state).finance.marketEurPerKwh;
  let price: number = cfg(state).finance.eegEurPerKwh;
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
    addCause(fin.lossCauses, state.maizeCapExceededEvent, fin.monthKwh * (cfg(state).finance.eegEurPerKwh - avgMarket));
  }
  const power = fin.monthKwh * price;
  const heat = fin.monthHeatKwh * cfg(state).finance.heatEurPerKwh;
  // Biomethan: fester Abnahmepreis, bei verletztem Maisdeckel nur Erdgaspreisniveau
  const capBroken = share > CONFIG.maizeCap.maxShare && CONFIG.maizeCap.penaltyToMarketValue;
  const gasPrice = capBroken ? CONFIG.upgrading.biomethaneCapPenaltyEurPerKwh : CONFIG.upgrading.biomethaneEurPerKwh;
  const gas = fin.monthGasKwh * gasPrice;
  if (capBroken) addCause(fin.lossCauses, state.maizeCapExceededEvent, fin.monthGasKwh * (CONFIG.upgrading.biomethaneEurPerKwh - gasPrice));
  if (gas > 0) ledger(state, 'erloesBiomethan', gas);
  fin.balance += power + heat + gas + fin.monthMarketerEur;
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
  fin.balance -= cfg(state).finance.fixedCostsEurPerMonth;
  ledger(state, 'fixkosten', cfg(state).finance.fixedCostsEurPerMonth);
  if (state.maintenanceContract) {
    const fee = maintenanceContractFee(state);
    fin.balance -= fee;
    ledger(state, 'wartung', fee);
  }
  logEvent(state.log, day, {
    type: 'month_settled',
    causes: [],
    data: { kwh: Math.round(fin.monthKwh), price: round(price, CONFIG.units.priceDigits), gasKwh: Math.round(fin.monthGasKwh), revenueEur: Math.round(power + heat + gas + fin.monthMarketerEur), salariesEur: salaries, balance: Math.round(fin.balance) },
  });
  fin.monthKwh = 0;
  fin.monthHeatKwh = 0;
  fin.monthGasKwh = 0;
  fin.monthMarketerEur = 0;
  fin.monthMarketValueSum = 0;
  fin.monthDays = 0;
}

export { STAFF_ROLES };
