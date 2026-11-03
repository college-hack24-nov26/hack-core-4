import type { BaseState, Pollutant } from '../types';

/**
 * Optional grid-forecast service at VITE_API_URL (default http://localhost:8000).
 * There is NO legacy backend in this repository: when the service answers 404 / 501 or refuses the connection the
 * client returns { status: 'unavailable', reason } and nothing is invented.
 */
const env = import.meta.env as Record<string, string | undefined>;
export const PREDICTION_URL = (env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

export type PredictionResult =
  | { status: 'available'; values: Record<string, number>; issuedAt: string | null }
  | { status: 'unavailable'; reason: string };

export interface PredictionService {
  id: string;
  label: string;
  getGridForecast(base: BaseState, pollutant: Pollutant): Promise<PredictionResult>;
}

class HttpPredictionService implements PredictionService {
  id = 'http-grid-forecast';
  label = 'Grid forecast service';

  async getGridForecast(base: BaseState, pollutant: Pollutant): Promise<PredictionResult> {
    let res: Response;
    try {
      res = await fetch(`${PREDICTION_URL}/predict/grid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollutant,
          cells: base.cells.map((c) => ({ id: c.id, lon: c.center[0], lat: c.center[1] })),
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { status: 'unavailable', reason: `No grid-forecast service is reachable at ${PREDICTION_URL}.` };
    }
    if (res.status === 404 || res.status === 501) {
      return { status: 'unavailable', reason: 'The service at this address does not provide a grid forecast.' };
    }
    if (!res.ok) return { status: 'unavailable', reason: `The grid-forecast service answered HTTP ${res.status}.` };
    try {
      const json = (await res.json()) as { values?: Record<string, number>; issued_at?: string };
      if (!json.values || typeof json.values !== 'object') return { status: 'unavailable', reason: 'The grid-forecast response had no values.' };
      return { status: 'available', values: json.values, issuedAt: json.issued_at ?? null };
    } catch {
      return { status: 'unavailable', reason: 'The grid-forecast service returned something that is not JSON.' };
    }
  }
}

/** The single swap line for a grid-forecast service. */
export const predictionService: PredictionService = new HttpPredictionService();
