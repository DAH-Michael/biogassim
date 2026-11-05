import { CONFIG, type DateWindow, type MonthDay } from './config';

/** Kalender ohne Schaltjahr. Spieltag 0 ist der Starttag (1. August). */
const MONTH_LENGTHS = CONFIG.units.monthLengths;
export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Tag im Kalenderjahr, 1 bis 365. */
export function doyOf([month, day]: MonthDay): number {
  let d = day;
  for (let m = 1; m < month; m++) d += MONTH_LENGTHS[m - 1];
  return d;
}

const START_DOY = doyOf(CONFIG.time.startDate);

export function doyOfDay(day: number): number {
  return ((START_DOY - 1 + day) % CONFIG.units.daysPerYear) + 1;
}

export interface CalendarDate { month: number; dayOfMonth: number; doy: number; yearOffset: number }

export function dateOfDay(day: number): CalendarDate {
  const absolute = START_DOY - 1 + day;
  const yearOffset = Math.floor(absolute / CONFIG.units.daysPerYear);
  let doy = (absolute % CONFIG.units.daysPerYear) + 1;
  const result = doy;
  let month = 1;
  while (doy > MONTH_LENGTHS[month - 1]) {
    doy -= MONTH_LENGTHS[month - 1];
    month++;
  }
  return { month, dayOfMonth: doy, doy: result, yearOffset };
}

/** Spieltag, an dem ein Kalenderdatum im Durchlauf erstmals erreicht wird. */
export function dayOfDate(md: MonthDay): number {
  const doy = doyOf(md);
  return (doy - START_DOY + CONFIG.units.daysPerYear) % CONFIG.units.daysPerYear;
}

/** Liegt der Spieltag im Fenster? Fenster dürfen über den Jahreswechsel gehen. */
export function inWindow(day: number, w: DateWindow): boolean {
  const d = doyOfDay(day);
  const a = doyOf(w.from);
  const b = doyOf(w.to);
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

/** Erster und letzter Spieltag eines Fensters im Durchlauf. */
export function windowDays(w: DateWindow): { start: number; end: number } {
  const start = dayOfDate(w.from);
  let end = dayOfDate(w.to);
  if (end < start) end += CONFIG.units.daysPerYear;
  return { start, end };
}

export function isFirstOfMonth(day: number): boolean {
  return dateOfDay(day).dayOfMonth === 1;
}

export function formatDate(day: number): string {
  const d = dateOfDay(day);
  return `${d.dayOfMonth}. ${MONTH_NAMES[d.month - 1]}`;
}

export function daysInMonthBefore(day: number): number {
  // Länge des Vormonats (für Monatsabrechnungen)
  const d = dateOfDay(day);
  const prev = d.month === 1 ? CONFIG.units.monthsPerYear : d.month - 1;
  return MONTH_LENGTHS[prev - 1];
}
