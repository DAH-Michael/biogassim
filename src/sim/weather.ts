import { CONFIG } from './config';
import { doyOfDay } from './calendar';
import { chance, deriveRng, gaussian, next, type RngState } from './rng';
import type { WeatherYear } from './types';

/**
 * Wetter für den ganzen Durchlauf wird beim Start aus einem eigenen Zufallsstrom
 * erzeugt. So ist das Wetter bei gleichem Seed immer gleich, unabhängig von
 * Entscheidungen des Spielers.
 */
export function generateWeather(seed: number): WeatherYear {
  const W = CONFIG.weather;
  const r: RngState = deriveRng(seed, 'weather');
  const drought = chance(r, W.droughtChance);
  const days = [];
  let anomaly = 0;
  let raining = false;
  let streak = 0;
  for (let d = 0; d < CONFIG.time.runDays; d++) {
    const doy = doyOfDay(d);
    const seasonal = W.tempMeanC + W.tempAmplitudeC * Math.cos((2 * Math.PI * (doy - W.tempPeakDoy)) / CONFIG.units.daysPerYear);
    anomaly = W.tempPersistence * anomaly + Math.sqrt(1 - W.tempPersistence ** 2) * W.tempNoiseC * gaussian(r);
    const tempC = seasonal + anomaly;
    const pRain: number = (raining ? W.rainAfterRain : W.rainAfterDry) * (drought ? W.droughtRainFactor : 1);
    raining = next(r) < pRain;
    const rainMm = raining ? -Math.log(Math.max(next(r), Number.EPSILON)) * W.rainMeanMm : 0;
    streak = raining ? streak + 1 : 0;
    days.push({
      tempC,
      rainMm,
      wet: rainMm >= W.wetDayMm || streak >= W.wetStreakDays,
      frost: tempC < W.frostC,
    });
  }
  return { drought, days };
}
