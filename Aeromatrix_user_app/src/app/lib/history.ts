/**
 * Weekly history from the same Open-Meteo model data, fetched on demand (one request for a handful of places) rather
 * than for every zone, so the phone only downloads a week of data when the Commissioner opens a place or the
 * "repeated" list. Days are Indian Standard Time days.
 */
import type { LonLat } from '../../types';
import { aqiForPoint, fetchAirQuality, type OmAirPoint } from '../../services/openMeteo';
import { snapPoint } from '../../services/liveData';
import { aqiCategory, type AqiCategory } from '../../services/cpcbAqi';
import { categoryRank } from './airdata';

const IST_MS = 330 * 60_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface DailyPoint {
  /** YYYY-MM-DD (IST) */
  date: string;
  aqi: number | null;
  category: AqiCategory | null;
  pm25: number | null;
  pm10: number | null;
}

const istDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

/** The last `days` IST days, oldest first, for one model point. A day with too few hours has no AQI. */
export function dailyFromPoint(point: Pick<OmAirPoint, 'times' | 'hourly'>, nowMs: number, days = 7): DailyPoint[] {
  const out: DailyPoint[] = [];
  const todayStart = Math.floor((nowMs + IST_MS) / DAY) * DAY - IST_MS; // 00:00 IST today, as a UTC instant
  for (let d = days - 1; d >= 0; d--) {
    const start = todayStart - d * DAY;
    const end = start + DAY;
    const probe = d === 0 ? nowMs : end - HOUR; // AQI is taken at the last hour of the day
    const { aqi } = aqiForPoint(point.times, point.hourly, probe);
    const mean = (series: Array<number | null>): number | null => {
      let s = 0;
      let n = 0;
      point.times.forEach((t, i) => {
        const ms = t * 1000;
        const v = series[i];
        if (ms >= start && ms < Math.min(end, nowMs + 1) && v !== null && v !== undefined) (s += v), n++;
      });
      return n >= 12 ? s / n : null;
    };
    const value = aqi?.value ?? null;
    out.push({
      date: istDay(start + HOUR),
      aqi: value,
      category: value === null ? null : (aqi?.category ?? aqiCategory(value)),
      pm25: mean(point.hourly.pm25),
      pm10: mean(point.hourly.pm10),
    });
  }
  return out;
}

export interface WeekSummary {
  /** days with an AQI at Moderate or worse */
  moderateDays: number;
  /** days at Poor or worse */
  poorDays: number;
  days: number;
  meanAqi: number | null;
}

export function summariseWeek(daily: DailyPoint[]): WeekSummary {
  const known = daily.filter((d) => d.aqi !== null);
  return {
    days: known.length,
    moderateDays: known.filter((d) => categoryRank(d.category) >= categoryRank('Moderate')).length,
    poorDays: known.filter((d) => categoryRank(d.category) >= categoryRank('Poor')).length,
    meanAqi: known.length > 0 ? known.reduce((a, d) => a + (d.aqi as number), 0) / known.length : null,
  };
}

/** Direction of the week: the last three days against the first three, in per cent. */
export function weekTrend(daily: DailyPoint[]): { pct: number; direction: 'up' | 'down' | 'flat' } | null {
  const vals = daily.map((d) => d.pm25).filter((v): v is number => v !== null);
  if (vals.length < 5) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const first = mean(vals.slice(0, 3));
  const last = mean(vals.slice(-3));
  if (first <= 0) return null;
  const pct = ((last - first) / first) * 100;
  return { pct, direction: pct > 8 ? 'up' : pct < -8 ? 'down' : 'flat' };
}

export interface HistoryTarget {
  id: string;
  location: LonLat;
}

/** One batched request (identical model points share a request point). Returns the daily series per target id. */
export async function fetchWeeklyHistory(targets: HistoryTarget[], nowMs: number = Date.now()): Promise<Record<string, DailyPoint[]>> {
  if (targets.length === 0) return {};
  const points = targets.map((t) => snapPoint(t.location));
  const air = await fetchAirQuality(points, { pastDays: 7, forecastDays: 1 });
  const out: Record<string, DailyPoint[]> = {};
  targets.forEach((t, i) => {
    out[t.id] = dailyFromPoint(air[i], nowMs, 7);
  });
  return out;
}
