import type { Pollutant } from '../types';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { isMeasuredValue, type ApiMeasured } from './aeromatrixApi';
import { OM_POLLUTANTS, currentHourIndex, type OmAirPoint } from './openMeteo';

/** A value from a monitoring station (OBSERVED). It can be historical: it is then Outdated and carries its date. */
export interface StationValue {
  status: 'OBSERVED';
  value: number;
  unit: string;
  /** hour start, ISO */
  time: string;
  outdated: boolean;
}

/** A value from the Open-Meteo CAMS model (MODEL_DATA). */
export interface LiveValue {
  status: 'MODEL_DATA';
  value: number;
  unit: string;
  /** hour start, ms */
  time: number;
}

export interface PollutantRecord {
  pollutant: Pollutant;
  label: string;
  unit: string;
  station: StationValue | null;
  stationReason: string | null;
  live: LiveValue | null;
  liveReason: string | null;
}

/** Station readings older than this are Outdated even if the service did not flag them historical. */
export const STALE_AFTER_MS = 3 * 3600 * 1000;

export function isOutdated(timeIso: string, historical: boolean, nowMs: number): boolean {
  if (historical) return true;
  const t = Date.parse(timeIso);
  return !Number.isFinite(t) || nowMs - t > STALE_AFTER_MS;
}

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "02 Jan 2026, 05:00 IST" */
export function fmtIst(time: string | number | Date): string {
  const d = time instanceof Date ? time : new Date(typeof time === 'number' ? (time < 1e11 ? time * 1000 : time) : time);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  return `${IST.format(d).replace(',', ',')} IST`;
}

/** Only the clock part: "05:00 IST" */
export function fmtIstTime(time: string | number | Date): string {
  const d = time instanceof Date ? time : new Date(typeof time === 'number' ? (time < 1e11 ? time * 1000 : time) : time);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  return `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)} IST`;
}

/**
 * Current values for one place. The station reading and the live model value stay in separate fields with their
 * own status, time and reason: they are never blended into one number, and a missing one is never filled in
 * from the other (or from a neighbour or a city average).
 */
export function resolveCurrent(
  ctx: { measured?: ApiMeasured | null; live?: OmAirPoint | null; stationReason?: string; liveReason?: string },
  nowMs: number = Date.now(),
): PollutantRecord[] {
  return (OM_POLLUTANTS as Pollutant[]).map((p) => {
    const rec: PollutantRecord = {
      pollutant: p,
      label: POLLUTANT_LABEL[p],
      unit: POLLUTANT_UNIT[p],
      station: null,
      stationReason: null,
      live: null,
      liveReason: null,
    };

    const m = ctx.measured?.pollutants?.[p];
    if (ctx.measured && isMeasuredValue(m)) {
      rec.station = {
        status: 'OBSERVED',
        value: m.value,
        unit: m.unit,
        time: m.time,
        outdated: isOutdated(m.time, m.historical, nowMs),
      };
    } else if (ctx.measured) {
      const u = m as { reason?: string } | undefined;
      rec.stationReason = u?.reason ?? 'This station does not report this pollutant';
    } else {
      rec.stationReason = ctx.stationReason ?? 'No data feed';
    }

    const live = ctx.live;
    if (live) {
      const idx = currentHourIndex(live.times, nowMs);
      const v = idx >= 0 ? live.hourly[p][idx] : null;
      if (v !== null && v !== undefined) {
        rec.live = { status: 'MODEL_DATA', value: v, unit: POLLUTANT_UNIT[p], time: live.times[idx] * 1000 };
      } else {
        rec.liveReason = live.missing[p] ?? 'The model has no value for the current hour';
      }
    } else {
      rec.liveReason = ctx.liveReason ?? 'Live model data not loaded';
    }
    return rec;
  });
}
