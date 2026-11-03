import type { BaseState, Pollutant, TimeSeriesPoint } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';

/**
 * The UI only ever talks to this interface. Swapping the data source later
 * means changing the single `export const dataProvider = ...` line below.
 */
export interface DataProvider {
  id: string;
  label: string;
  getBaseState(gridSize: number): Promise<BaseState>;
  /** Hourly series for one cell around `baseValue` (DEMO in V1). */
  getTimeSeries(
    cellId: string,
    pollutant: Pollutant,
    baseValue: number,
    hours: number,
  ): Promise<TimeSeriesPoint[]>;
}

export const dataProvider: DataProvider = demoDataProvider;
