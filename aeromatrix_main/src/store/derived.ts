import { deriveForecastLayer, useTwinStore, type TwinStoreState } from './useTwinStore';
import { idwField, placedPoints, summariseStations } from '../services/observations';

/** Fields derived from other store slices: the observed (IDW) field and the forecast layer. */
export function startDerived(): () => void {
  const apply = (s: TwinStoreState, prev?: TwinStoreState) => {
    if (!s.base) return;
    const patch: Partial<TwinStoreState> = {};
    if (
      !prev ||
      prev.observations !== s.observations ||
      prev.obsWindow !== s.obsWindow ||
      prev.pollutant !== s.pollutant ||
      prev.base?.gridSize !== s.base.gridSize ||
      prev.base?.geometrySource !== s.base.geometrySource
    ) {
      let field = null;
      if (s.observations) {
        const pts = placedPoints(summariseStations(s.observations, s.obsWindow), s.pollutant);
        field = idwField(s.base, pts, s.pollutant, 'Observed (imported stations, interpolated)');
      }
      patch.observedField = field;
    }
    if (
      !prev ||
      prev.modelService.forecasts !== s.modelService.forecasts ||
      prev.catalog !== s.catalog ||
      prev.pollutant !== s.pollutant ||
      prev.base?.gridSize !== s.base.gridSize
    ) {
      patch.forecastLayer = deriveForecastLayer(s);
    }
    if (Object.keys(patch).length > 0) useTwinStore.setState(patch);
  };
  apply(useTwinStore.getState());
  return useTwinStore.subscribe((s, prev) => apply(s, prev));
}
