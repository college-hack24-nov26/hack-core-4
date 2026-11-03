import type { BaseState, Pollutant } from '../types';
import { isPredicted, type ApiForecast, type ApiPollutantKey } from '../services/aeromatrixApi';
import { idwField, type ObservedField } from '../services/observations';
import type { PlacedStation } from '../services/stations';

export interface ForecastLayer {
  field: ObservedField;
  /** valid_at of the forecasts used (the stations can differ) */
  validAt: string[];
  historical: boolean;
}

/**
 * IDW forecast field from the +24 h station forecasts of the trained model service (MODEL_PREDICTION).
 * It needs station coordinates; with no forecasts or no coordinates it returns null and the layer stays empty.
 */
export function buildForecastLayer(
  base: BaseState,
  stations: PlacedStation[],
  forecasts: Record<string, ApiForecast | undefined>,
  pollutant: Pollutant,
): ForecastLayer | null {
  const points: Array<{ lon: number; lat: number; value: number }> = [];
  const validAt: string[] = [];
  let historical = false;
  for (const s of stations) {
    if (s.lat === null || s.lon === null) continue;
    const f = forecasts[s.id];
    const p = f?.pollutants?.[pollutant as ApiPollutantKey];
    if (!isPredicted(p)) continue;
    points.push({ lon: s.lon, lat: s.lat, value: p.value });
    validAt.push(p.valid_at);
    historical = historical || p.historical;
  }
  const field = idwField(base, points, pollutant, 'Forecast +24 h (trained model, interpolated between stations)', 'MODEL_PREDICTION');
  return field ? { field, validAt, historical } : null;
}
