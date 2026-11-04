import type { Pollutant } from '../types';
import { METHOD_MODEL, calculateAqi, type AqiResult, type HourlySeries } from './cpcbAqi';
import { OM_POLLUTANTS, type HourlyValues } from './openMeteo';

const IST_OFFSET_S = 5.5 * 3600;

export interface DailyForecast {
  /** IST calendar date, yyyy-mm-dd */
  date: string;
  aqi: AqiResult;
  hoursCovered: number;
  /** mean PM2.5 over the day's valid hours (ug/m3) */
  pm25Mean: number | null;
}

/** IST calendar date for a unix-seconds timestamp. */
export function istDate(sec: number): string {
  return new Date((sec + IST_OFFSET_S) * 1000).toISOString().slice(0, 10);
}

export function forecastDates(times: number[]): string[] {
  return [...new Set(times.map(istDate))];
}

/**
 * Daily aggregation of the hourly model forecast into one estimated CPCB AQI per IST date.
 * A day needs at least 16 valid hours per pollutant (the usual rule), so a partly covered day is UNAVAILABLE
 * with a reason rather than guessed.
 */
export function dailyForecast(point: { times: number[]; hourly: HourlyValues }): DailyForecast[] {
  const byDate = new Map<string, number[]>();
  point.times.forEach((t, i) => {
    const d = istDate(t);
    byDate.set(d, [...(byDate.get(d) ?? []), i]);
  });
  const out: DailyForecast[] = [];
  for (const [date, idxs] of byDate) {
    const newestFirst = [...idxs].reverse();
    const series: HourlySeries = {};
    for (const p of OM_POLLUTANTS as Pollutant[]) series[p] = newestFirst.map((i) => point.hourly[p][i] ?? null);
    const lastHour = point.times[idxs[idxs.length - 1]];
    const aqi = calculateAqi(series, new Date((lastHour + 3600) * 1000), METHOD_MODEL);
    const pm = idxs.map((i) => point.hourly.pm25[i]).filter((v): v is number => v !== null);
    out.push({
      date,
      aqi,
      hoursCovered: idxs.length,
      pm25Mean: pm.length ? pm.reduce((a, b) => a + b, 0) / pm.length : null,
    });
  }
  return out;
}

/** Next-24 h trend of the estimated AQI: later day minus the first full day. null when either is unavailable. */
export function aqiTrend(days: DailyForecast[], todayIst: string): { direction: 'rising' | 'falling' | 'steady'; delta: number } | null {
  const today = days.find((d) => d.date === todayIst);
  const next = days.find((d) => d.date > todayIst);
  if (!today || !next || today.aqi.value === null || next.aqi.value === null) return null;
  const delta = next.aqi.value - today.aqi.value;
  return { direction: delta > 10 ? 'rising' : delta < -10 ? 'falling' : 'steady', delta };
}
