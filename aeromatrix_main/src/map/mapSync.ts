import { useTwinStore } from '../store/useTwinStore';
import type { TwinMap } from './TwinMap';

/**
 * Subscribes to the store and updates the map imperatively
 * (heatmap pollutant, selection, grid size, fly-to) without re-creating the viewer.
 */
export function bindMapToStore(map: TwinMap): () => void {
  const apply = (state = useTwinStore.getState(), prev?: ReturnType<typeof useTwinStore.getState>) => {
    const { base, baseline, pollutant, selectedCellId, focusRequest } = state;
    if (!base) return;

    if (!prev || prev.base !== base) {
      void map.setGrid(base);
    }
    if (!prev || prev.base !== base || prev.baseline !== baseline || prev.pollutant !== pollutant) {
      void map.setHeatmap(base, baseline, pollutant);
    }
    if (!prev || prev.base !== base || prev.selectedCellId !== selectedCellId) {
      void map.setSelection(base, selectedCellId);
    }
    if (focusRequest && focusRequest !== prev?.focusRequest) {
      map.flyToCell(base, focusRequest.cellId);
    }
  };

  apply();
  return useTwinStore.subscribe((state, prev) => apply(state, prev));
}
