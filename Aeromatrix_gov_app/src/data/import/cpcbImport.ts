/**
 * Air-quality CSV import (processed in the browser only). Understands:
 *  - CPCB CCR exports: metadata rows, then a header such as "From Date, To Date, PM2.5 (ug/m3), PM10 (ug/m3) ..."
 *  - station_hour-style tables: StationId, Datetime, PM2.5, PM10, NO, NO2, NOx, NH3, SO2, CO, Ozone, ...
 *  - any CSV with station / datetime / pollutant columns, or station / datetime / pollutant / value (long form)
 * 15-minute rows are averaged to hours. Times without a zone are read as IST. Missing markers stay missing (never 0).
 */
import type { Pollutant } from '../../types';
import {
  floorToIstHour,
  headerUnit,
  normHeader,
  parseCsv,
  parseDateTime,
  slug,
  toNumber,
} from './csv';
import { emptyDataset, type ObsReading, type ObsStation, type ObservationDataset } from '../../services/observations';

const POLLUTANT_NAMES: Record<string, Pollutant> = {
  pm25: 'pm25',
  pm2: 'pm25',
  pm10: 'pm10',
  no2: 'no2',
  nitrogendioxide: 'no2',
  so2: 'so2',
  sulphurdioxide: 'so2',
  sulfurdioxide: 'so2',
  co: 'co',
  carbonmonoxide: 'co',
  o3: 'o3',
  ozone: 'o3',
};

export function pollutantFromHeader(h: string): Pollutant | null {
  const n = normHeader(h).replace(/^pm2\.?5.*/, 'pm25');
  return POLLUTANT_NAMES[n] ?? null;
}

const TIME_HEADERS = ['fromdate', 'datetime', 'timestamp', 'date', 'time', 'validtime', 'datetimeist', 'observationtime'];
const STATION_HEADERS = ['station', 'stationid', 'stationname', 'site', 'siteid', 'sitename', 'location', 'monitoringstation'];

interface ColumnPlan {
  headerRow: number;
  timeCol: number;
  stationCol: number;
  pollutantCols: Array<{ col: number; p: Pollutant; scale: number }>;
  longForm: { pollutantCol: number; valueCol: number; unitCol: number } | null;
}

/** Concentration scale to the app's units (ug/m3, CO mg/m3) from the unit text of a header. */
function unitScale(p: Pollutant, unit: string): number {
  const micro = /(ug|µg|μg|mcg)/.test(unit);
  const milli = /\bmg|mg\//.test(unit);
  if (p === 'co') return micro ? 0.001 : 1;
  return milli ? 1000 : 1;
}

function planColumns(rows: string[][]): ColumnPlan | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const heads = rows[i];
    const norm = heads.map(normHeader);
    const timeCol = norm.findIndex((h) => TIME_HEADERS.includes(h));
    if (timeCol < 0) continue;
    const stationCol = norm.findIndex((h) => STATION_HEADERS.includes(h));
    const pollutantCols = heads
      .map((h, col) => ({ col, p: pollutantFromHeader(h), unit: headerUnit(h) }))
      .filter((c): c is { col: number; p: Pollutant; unit: string } => c.p !== null && c.col !== timeCol)
      .map((c) => ({ col: c.col, p: c.p, scale: unitScale(c.p, c.unit) }));
    const pollutantCol = norm.findIndex((h) => h === 'pollutant' || h === 'parameter');
    const valueCol = norm.findIndex((h) => h === 'value' || h === 'concentration' || h === 'reading');
    const unitCol = norm.findIndex((h) => h === 'unit' || h === 'units');
    if (pollutantCols.length > 0) return { headerRow: i, timeCol, stationCol, pollutantCols, longForm: null };
    if (pollutantCol >= 0 && valueCol >= 0) {
      return { headerRow: i, timeCol, stationCol, pollutantCols: [], longForm: { pollutantCol, valueCol, unitCol } };
    }
  }
  return null;
}

/** Station name from metadata rows above the header ("Station: Karve Road, Pune - MPCB"). */
function stationFromMetadata(rows: string[][], headerRow: number): string | null {
  for (let i = 0; i < headerRow; i++) {
    const joined = rows[i].filter((c) => c !== '').join(', ');
    const m = joined.match(/^\s*(?:station(?:\s*name)?|site(?:\s*name)?|monitoring\s*station)\s*[:=,-]\s*(.+?)\s*$/i);
    if (m && m[1]) return m[1];
  }
  return null;
}

function cleanStationName(raw: string): string {
  return raw.replace(/\s*,?\s*(pune|pimpri[-\s]?chinchwad)\b.*$/i, '').replace(/\s+/g, ' ').trim() || raw.trim();
}

/** Parse one air-quality CSV into an ObservationDataset (stations have no coordinates until you give them). */
export function importAirQualityCsv(text: string, fileName = 'upload.csv'): ObservationDataset {
  const ds = emptyDataset();
  ds.sources.push(fileName);
  const rows = parseCsv(text);
  if (rows.length === 0) {
    ds.warnings.push(`${fileName}: the file is empty.`);
    return ds;
  }
  const plan = planColumns(rows);
  if (!plan) {
    ds.warnings.push(`${fileName}: no header with a date column and a pollutant (PM2.5, PM10, NO2, SO2, CO, O3) was found.`);
    return ds;
  }

  const metaName = stationFromMetadata(rows, plan.headerRow);
  const fallbackName = metaName ? cleanStationName(metaName) : fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported station';
  const stations = new Map<string, ObsStation>();
  // bucket key: station|hour -> sums per pollutant
  const buckets = new Map<string, { stationId: string; time: number; sum: Partial<Record<Pollutant, number>>; n: Partial<Record<Pollutant, number>> }>();
  let badDates = 0;
  let used = 0;

  const add = (stationName: string, t: number, p: Pollutant, v: number) => {
    const id = slug(stationName);
    if (!stations.has(id)) stations.set(id, { id, name: stationName, lat: null, lon: null });
    const hour = floorToIstHour(t);
    const key = `${id}|${hour}`;
    const b = buckets.get(key) ?? { stationId: id, time: hour, sum: {}, n: {} };
    b.sum[p] = (b.sum[p] ?? 0) + v;
    b.n[p] = (b.n[p] ?? 0) + 1;
    buckets.set(key, b);
    used++;
  };

  for (let i = plan.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const t = parseDateTime(r[plan.timeCol] ?? '');
    if (t === null) {
      if ((r[plan.timeCol] ?? '').trim() !== '') badDates++;
      continue;
    }
    const stationName = plan.stationCol >= 0 && r[plan.stationCol] ? r[plan.stationCol].trim() : fallbackName;
    if (plan.longForm) {
      const p = pollutantFromHeader(r[plan.longForm.pollutantCol] ?? '');
      const v = toNumber(r[plan.longForm.valueCol]);
      if (p && v !== null) {
        const unit = plan.longForm.unitCol >= 0 ? (r[plan.longForm.unitCol] ?? '').toLowerCase() : '';
        add(stationName, t, p, v * unitScale(p, unit));
      }
    } else {
      for (const c of plan.pollutantCols) {
        const v = toNumber(r[c.col]);
        if (v !== null) add(stationName, t, c.p, v * c.scale);
      }
    }
  }

  const readings: ObsReading[] = [...buckets.values()].map((b) => {
    const values: Partial<Record<Pollutant, number>> = {};
    for (const p of Object.keys(b.sum) as Pollutant[]) values[p] = (b.sum[p] as number) / (b.n[p] as number);
    return { stationId: b.stationId, time: b.time, values };
  });
  readings.sort((a, b) => a.time - b.time);
  ds.stations = [...stations.values()];
  ds.readings = readings;
  if (badDates > 0) ds.warnings.push(`${fileName}: ${badDates} rows had a date that could not be read and were skipped.`);
  if (used === 0) ds.warnings.push(`${fileName}: no numeric pollutant values were found.`);
  const unknown = rows[plan.headerRow].filter((h, c) => c !== plan.timeCol && c !== plan.stationCol && !pollutantFromHeader(h) && normHeader(h) !== '');
  if (unknown.length > 0) ds.warnings.push(`${fileName}: ignored columns (not one of the six pollutants): ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? '...' : ''}.`);
  return ds;
}

/** Merge two datasets: stations by id (keeping known coordinates), readings by station and hour (later wins). */
export function mergeObservations(a: ObservationDataset, b: ObservationDataset): ObservationDataset {
  const stations = new Map<string, ObsStation>();
  for (const s of [...a.stations, ...b.stations]) {
    const prev = stations.get(s.id);
    stations.set(s.id, prev ? { ...s, lat: prev.lat ?? s.lat, lon: prev.lon ?? s.lon } : s);
  }
  const readings = new Map<string, ObsReading>();
  for (const r of [...a.readings, ...b.readings]) {
    const key = `${r.stationId}|${r.time}`;
    const prev = readings.get(key);
    readings.set(key, prev ? { ...r, values: { ...prev.values, ...r.values } } : r);
  }
  return {
    stations: [...stations.values()],
    readings: [...readings.values()].sort((x, y) => x.time - y.time),
    sources: [...new Set([...a.sources, ...b.sources])],
    warnings: [...a.warnings, ...b.warnings],
  };
}

/** Set (or clear) the coordinate of one imported station. Invalid numbers clear it. */
export function withStationCoordinates(ds: ObservationDataset, stationId: string, lat: number | null, lon: number | null): ObservationDataset {
  const ok = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    ...ds,
    stations: ds.stations.map((s) => (s.id === stationId ? { ...s, lat: ok ? lat : null, lon: ok ? lon : null } : s)),
  };
}

/** A small CSV template users can fill in. */
export const CSV_TEMPLATE =
  'station,datetime,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),SO2 (ug/m3),CO (mg/m3),O3 (ug/m3)\n' +
  'My station,2025-01-15 08:00,85.2,160.4,41.0,12.5,1.3,28.0\n' +
  'My station,2025-01-15 09:00,92.0,171.8,44.2,13.1,1.5,30.5\n';
