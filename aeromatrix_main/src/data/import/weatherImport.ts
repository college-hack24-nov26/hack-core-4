/**
 * Weather CSV import (browser only). Understands ERA5 point extracts (t2m K -> C, u10/v10 -> wind speed and direction,
 * sp Pa -> hPa, tp m -> mm) and CPCB meteorology columns (AT, RH, WS, WD, RF, BP). Times without a zone are IST.
 */
import type { Weather } from '../../types';
import { headerUnit, normHeader, parseCsv, parseDateTime, toNumber } from './csv';

export interface WeatherReading {
  /** ms, UTC */
  time: number;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  /** degrees the wind blows FROM */
  windDirection?: number;
  pressure?: number;
  /** mm over the reading's interval (hourly) */
  rainfall?: number;
}

export interface WeatherDataset {
  readings: WeatherReading[];
  sources: string[];
  warnings: string[];
}

export const emptyWeather = (): WeatherDataset => ({ readings: [], sources: [], warnings: [] });

type Field = 'temperature' | 'humidity' | 'windSpeed' | 'windDirection' | 'pressure' | 'rainfall' | 'u' | 'v';

const FIELD_BY_HEADER: Record<string, Field> = {
  t2m: 'temperature', temperature2m: 'temperature', temperature: 'temperature', at: 'temperature', airtemperature: 'temperature', temp: 'temperature',
  rh: 'humidity', relativehumidity: 'humidity', relativehumidity2m: 'humidity', humidity: 'humidity',
  ws: 'windSpeed', windspeed: 'windSpeed', windspeed10m: 'windSpeed',
  wd: 'windDirection', winddirection: 'windDirection', winddirection10m: 'windDirection',
  u10: 'u', v10: 'v',
  sp: 'pressure', bp: 'pressure', pressure: 'pressure', pressuremsl: 'pressure', msl: 'pressure',
  tp: 'rainfall', rf: 'rainfall', rainfall: 'rainfall', precipitation: 'rainfall', rain: 'rainfall',
};

const TIME_HEADERS = ['time', 'validtime', 'datetime', 'date', 'fromdate', 'timestamp'];

/** Wind direction (degrees the wind blows FROM) from east/north components. */
export function windFromUV(u: number, v: number): { speed: number; direction: number } {
  const speed = Math.hypot(u, v);
  const direction = (270 - (Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
  return { speed, direction };
}

export function importWeatherCsv(text: string, fileName = 'weather.csv'): WeatherDataset {
  const ds = emptyWeather();
  ds.sources.push(fileName);
  const rows = parseCsv(text);
  let header = -1;
  let timeCol = -1;
  let cols: Array<{ col: number; field: Field; unit: string; raw: string }> = [];
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const norm = rows[i].map(normHeader);
    const t = norm.findIndex((h) => TIME_HEADERS.includes(h));
    if (t < 0) continue;
    const found = rows[i]
      .map((h, col) => ({ col, field: FIELD_BY_HEADER[normHeader(h)], unit: headerUnit(h), raw: h }))
      .filter((c): c is { col: number; field: Field; unit: string; raw: string } => !!c.field && c.col !== t);
    if (found.length > 0) {
      header = i;
      timeCol = t;
      cols = found;
      break;
    }
  }
  if (header < 0) {
    ds.warnings.push(`${fileName}: no header with a time column and a weather column (t2m, u10, v10, sp, tp, AT, RH, WS, WD, RF, BP) was found.`);
    return ds;
  }
  let bad = 0;
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i];
    const t = parseDateTime(r[timeCol] ?? '');
    if (t === null) {
      if ((r[timeCol] ?? '').trim() !== '') bad++;
      continue;
    }
    const reading: WeatherReading = { time: t };
    let u: number | null = null;
    let v: number | null = null;
    for (const c of cols) {
      const x = toNumber(r[c.col]);
      if (x === null) continue;
      switch (c.field) {
        case 'temperature': {
          const kelvin = /\bk\b|kelvin/.test(c.unit) || normHeader(c.raw) === 't2m' || x > 100;
          reading.temperature = kelvin ? x - 273.15 : x;
          break;
        }
        case 'humidity':
          reading.humidity = x;
          break;
        case 'windSpeed':
          reading.windSpeed = /km/.test(c.unit) ? x / 3.6 : x;
          break;
        case 'windDirection':
          reading.windDirection = ((x % 360) + 360) % 360;
          break;
        case 'u':
          u = x;
          break;
        case 'v':
          v = x;
          break;
        case 'pressure': {
          const pa = normHeader(c.raw) === 'sp' || /\bpa\b/.test(c.unit) || x > 20000;
          const mmHg = /mmhg/.test(c.unit);
          reading.pressure = pa ? x / 100 : mmHg ? x * 1.33322 : x;
          break;
        }
        case 'rainfall': {
          const metres = normHeader(c.raw) === 'tp' || /^m$/.test(c.unit);
          reading.rainfall = metres ? x * 1000 : x;
          break;
        }
      }
    }
    if (u !== null && v !== null) {
      const w = windFromUV(u, v);
      reading.windSpeed = reading.windSpeed ?? w.speed;
      reading.windDirection = reading.windDirection ?? w.direction;
    }
    if (Object.keys(reading).length > 1) ds.readings.push(reading);
  }
  ds.readings.sort((a, b) => a.time - b.time);
  if (bad > 0) ds.warnings.push(`${fileName}: ${bad} rows had a date that could not be read and were skipped.`);
  if (ds.readings.length === 0) ds.warnings.push(`${fileName}: no weather values were found.`);
  return ds;
}

export function mergeWeather(a: WeatherDataset, b: WeatherDataset): WeatherDataset {
  const byTime = new Map<number, WeatherReading>();
  for (const r of [...a.readings, ...b.readings]) byTime.set(r.time, { ...(byTime.get(r.time) ?? {}), ...r });
  return {
    readings: [...byTime.values()].sort((x, y) => x.time - y.time),
    sources: [...new Set([...a.sources, ...b.sources])],
    warnings: [...a.warnings, ...b.warnings],
  };
}

/**
 * Mean weather over the window (or the newest 24 h of the data). Only fields present in the data are returned:
 * nothing is filled in. Wind is the vector mean; rainfall is the daily total.
 */
export function summariseWeather(ds: WeatherDataset, window?: { from: number; to: number }): Partial<Weather> | null {
  if (ds.readings.length === 0) return null;
  const to = window?.to ?? ds.readings[ds.readings.length - 1].time;
  const from = window?.from ?? to - 24 * 3600 * 1000 + 1;
  const rs = ds.readings.filter((r) => r.time >= from && r.time <= to);
  if (rs.length === 0) return null;
  const mean = (get: (r: WeatherReading) => number | undefined) => {
    const v = rs.map(get).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const out: Partial<Weather> = {};
  const t = mean((r) => r.temperature);
  if (t !== undefined) out.temperature = Math.round(t * 10) / 10;
  const h = mean((r) => r.humidity);
  if (h !== undefined) out.humidity = Math.round(h);
  const p = mean((r) => r.pressure);
  if (p !== undefined) out.pressure = Math.round(p * 10) / 10;
  const winds = rs.filter((r) => typeof r.windSpeed === 'number' && typeof r.windDirection === 'number');
  if (winds.length > 0) {
    let ue = 0;
    let vn = 0;
    let sp = 0;
    for (const w of winds) {
      const rad = ((w.windDirection as number) * Math.PI) / 180;
      ue += -(w.windSpeed as number) * Math.sin(rad);
      vn += -(w.windSpeed as number) * Math.cos(rad);
      sp += w.windSpeed as number;
    }
    out.windSpeed = Math.round((sp / winds.length) * 10) / 10;
    out.windDirection = Math.round(windFromUV(ue / winds.length, vn / winds.length).direction);
  } else {
    const s = mean((r) => r.windSpeed);
    if (s !== undefined) out.windSpeed = Math.round(s * 10) / 10;
  }
  const rain = rs.map((r) => r.rainfall).filter((x): x is number => typeof x === 'number');
  if (rain.length > 0) {
    const hours = Math.max(1, rs.length);
    out.rainfall = Math.round(((rain.reduce((a, b) => a + b, 0) / hours) * 24) * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}
