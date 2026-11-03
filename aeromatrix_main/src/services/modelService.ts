/**
 * Connects to the trained model service: health, regions, the latest measured snapshot and the +24 h forecast per
 * station. Any failure degrades to "offline" with the reason; nothing is invented and the rest of the app keeps working.
 */
import {
  ApiError,
  getAqiHistory,
  getForecast,
  getHealth,
  getPollution,
  getRegions,
  isForecast,
  isMeasured,
  regionKey,
  type ApiAqiHistory,
  type ApiForecast,
  type ApiHealth,
  type ApiMeasured,
  type ApiStation,
  type ApiUnavailable,
} from './aeromatrixApi';

export type ModelStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface ModelServiceState {
  status: ModelStatus;
  reason: string | null;
  health: ApiHealth | null;
  stations: ApiStation[];
  measured: Record<string, ApiMeasured | ApiUnavailable>;
  forecasts: Record<string, ApiForecast | ApiUnavailable>;
  aqiHistory: Record<string, ApiAqiHistory>;
  errors: string[];
  connectedAt: number | null;
}

export const initialModelService = (): ModelServiceState => ({
  status: 'idle',
  reason: null,
  health: null,
  stations: [],
  measured: {},
  forecasts: {},
  aqiHistory: {},
  errors: [],
  connectedAt: null,
});

const msg = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');

/** One station's measured snapshot and forecast. */
export async function fetchStationData(station: ApiStation, allowHistorical: boolean) {
  const key = regionKey(station);
  const [m, f] = await Promise.allSettled([getPollution(key), getForecast(key, undefined, allowHistorical)]);
  return { station, measured: m, forecast: f };
}

export async function connectModelService(allowHistorical = false, now: () => number = Date.now): Promise<ModelServiceState> {
  const base = initialModelService();
  let health: ApiHealth;
  try {
    health = await getHealth();
  } catch (e) {
    return { ...base, status: 'offline', reason: msg(e) };
  }
  let stations: ApiStation[] = [];
  const errors: string[] = [];
  try {
    stations = (await getRegions()).station_locations;
  } catch (e) {
    errors.push(`regions: ${msg(e)}`);
  }
  const results = await Promise.all(stations.map((s) => fetchStationData(s, allowHistorical)));
  const measured: ModelServiceState['measured'] = {};
  const forecasts: ModelServiceState['forecasts'] = {};
  let offlineCalls = 0;
  for (const r of results) {
    const id = r.station.station;
    if (r.measured.status === 'fulfilled') measured[id] = r.measured.value as ApiMeasured | ApiUnavailable;
    else {
      errors.push(`${r.station.name} snapshot: ${msg(r.measured.reason)}`);
      if (r.measured.reason instanceof ApiError && r.measured.reason.kind === 'offline') offlineCalls++;
    }
    if (r.forecast.status === 'fulfilled') forecasts[id] = r.forecast.value as ApiForecast | ApiUnavailable;
    else {
      errors.push(`${r.station.name} forecast: ${msg(r.forecast.reason)}`);
      if (r.forecast.reason instanceof ApiError && r.forecast.reason.kind === 'offline') offlineCalls++;
    }
  }
  // The service answered /health, so it is online even if some stations failed.
  return { status: 'online', reason: null, health, stations, measured, forecasts, aqiHistory: {}, errors, connectedAt: now() };
}

/** Re-request only the forecasts (for the "Include historical forecast" toggle). */
export async function refetchForecasts(stations: ApiStation[], allowHistorical: boolean) {
  const forecasts: ModelServiceState['forecasts'] = {};
  const errors: string[] = [];
  await Promise.all(
    stations.map(async (s) => {
      try {
        forecasts[s.station] = await getForecast(regionKey(s), undefined, allowHistorical);
      } catch (e) {
        errors.push(`${s.name} forecast: ${msg(e)}`);
      }
    }),
  );
  return { forecasts, errors };
}

export async function fetchAqiHistory(region: string): Promise<ApiAqiHistory | null> {
  try {
    return await getAqiHistory(region);
  } catch {
    return null;
  }
}

export { isForecast, isMeasured };
