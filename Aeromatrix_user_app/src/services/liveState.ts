import type { OmAirPoint, OmWeatherPoint } from './openMeteo';

/** Types and the initial value of the live-data slice (kept apart from liveData.ts so the store can import them). */
export interface LiveAirPoint extends OmAirPoint {
  targetId: string;
}

export type LiveStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface LiveState {
  status: LiveStatus;
  points: Record<string, LiveAirPoint>;
  weather: OmWeatherPoint | null;
  lastUpdated: number | null;
  errors: string[];
  reason: string | null;
}

export const initialLive = (): LiveState => ({ status: 'idle', points: {}, weather: null, lastUpdated: null, errors: [], reason: null });
