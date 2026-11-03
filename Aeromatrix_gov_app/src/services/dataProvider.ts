import type { BaseState, CityGeometry, Pollutant, TimeSeriesPoint } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';

/**
 * The UI only ever talks to this interface. Swapping the data source later
 * means changing the single `export const dataProvider = ...` line below.
 */
export interface DataProvider {
  id: string;
  label: string;
  /** Build the city base state for a grid size over the given geometry (defaults to the provider's own). */
  getBaseState(gridSize: number, geometry?: CityGeometry): Promise<BaseState>;
  /** The provider's built-in geometry (the demo city for the demo provider). */
  getDefaultGeometry(): CityGeometry;
  /** Hourly series for one cell around `baseValue` (DEMO in V1/V2). */
  getTimeSeries(
    cellId: string,
    pollutant: Pollutant,
    baseValue: number,
    hours: number,
  ): Promise<TimeSeriesPoint[]>;
}

export const dataProvider: DataProvider = demoDataProvider;
