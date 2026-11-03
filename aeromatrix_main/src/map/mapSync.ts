import { useTwinStore, type TwinStoreState } from '../store/useTwinStore';
import type { CellState, LayerId } from '../types';
import { deltaScaleFor } from '../utils/colors';
import type { TwinMap } from './TwinMap';

/** The states the map should currently show (baseline, or the active scenario when it matches this base). */
export function displayedStates(s: TwinStoreState): CellState[] {
  const r = s.activeResult;
  const fresh = r && s.base && r.scenario.length === s.base.cells.length && r.scenario[0]?.cellId === s.base.cells[0]?.id;
  return s.displayMode !== 'baseline' && fresh ? r.scenario : s.baseline;
}

const LAYER_IDS: LayerId[] = [
  'heatmap', 'grid', 'roads', 'industries', 'green', 'buildings', 'terrain', 'satellite', 'risk', 'labels',
  'elevationTint', 'shadows', 'photoreal', 'places',
];

/**
 * Subscribes to the store and updates the map imperatively
 * (heatmap, layers, selection, markers, fly-to) without re-creating the viewer.
 */
export function bindMapToStore(map: TwinMap): () => void {
  const apply = (s: TwinStoreState, prev?: TwinStoreState) => {
    const { base } = s;
    if (!base) return;
    const pv = prev ?? s;
    const baseChanged = !prev || prev.base !== base;
    const r = s.activeResult;
    const fresh = !!r && r.scenario.length === base.cells.length && r.scenario[0]?.cellId === base.cells[0]?.id;

    // Heatmap
    if (
      baseChanged ||
      pv.baseline !== s.baseline ||
      pv.pollutant !== s.pollutant ||
      pv.displayMode !== s.displayMode ||
      pv.activeResult !== s.activeResult
    ) {
      if (s.displayMode === 'delta' && fresh) {
        const values = base.cells.map((c) => r.delta[c.id]?.[s.pollutant] ?? 0);
        map.setHeatmap(base, values, { kind: 'delta', pollutant: s.pollutant, scale: deltaScaleFor(s.pollutant, values) });
      } else {
        const states = displayedStates(s);
        const byId = new Map(states.map((x) => [x.cellId, x]));
        const values = base.cells.map((c) => byId.get(c.id)?.[s.pollutant] ?? 0);
        map.setHeatmap(base, values, { kind: 'pollution', pollutant: s.pollutant });
      }
    }

    if (baseChanged) {
      map.setGrid(base);
      map.setGreen(base.greenAreas);
    }

    // Selection, target area and affected-zone outlines
    if (
      baseChanged ||
      pv.selectedCellId !== s.selectedCellId ||
      pv.params.targetCells !== s.params.targetCells ||
      pv.displayMode !== s.displayMode ||
      pv.activeResult !== s.activeResult
    ) {
      const cellById = new Map(base.cells.map((c) => [c.id, c]));
      const sel = s.selectedCellId ? cellById.get(s.selectedCellId) : undefined;
      const affected =
        s.displayMode !== 'baseline' && fresh
          ? r.affectedZones.flatMap((id) => {
              const c = cellById.get(id);
              return c ? [{ row: c.row, col: c.col, delta: r.delta[id]?.pm25 ?? 0 }] : [];
            })
          : [];
      map.setMarkup({
        gridSize: base.gridSize,
        selected: sel ? { row: sel.row, col: sel.col } : null,
        targets: s.params.targetCells.flatMap((id) => {
          const c = cellById.get(id);
          return c ? [{ row: c.row, col: c.col }] : [];
        }),
        affected,
      });
    }

    // Roads (neutral / traffic colours, closures, selected road)
    if (
      baseChanged ||
      pv.params.roadClosures !== s.params.roadClosures ||
      pv.selectedRoadId !== s.selectedRoadId ||
      pv.layers.traffic !== s.layers.traffic
    ) {
      map.setRoads({
        roads: base.roads,
        traffic: s.layers.traffic,
        closedIds: new Set(s.params.roadClosures.map((c) => c.roadId)),
        selectedId: s.selectedRoadId,
      });
    }

    // Industry and candidate markers
    if (
      baseChanged ||
      pv.params.addedIndustries !== s.params.addedIndustries ||
      pv.params.removedIndustryIds !== s.params.removedIndustryIds ||
      pv.params.industryIntensityOverrides !== s.params.industryIntensityOverrides ||
      pv.selectedIndustryId !== s.selectedIndustryId
    ) {
      map.setIndustries(base, s.params, s.selectedIndustryId);
    }
    if (baseChanged || pv.candidates !== s.candidates || pv.selectedCandidateId !== s.selectedCandidateId) {
      map.setCandidates(s.candidates, s.selectedCandidateId);
    }

    // 3D risk columns follow the displayed scenario
    if (
      baseChanged ||
      pv.baseline !== s.baseline ||
      pv.displayMode !== s.displayMode ||
      pv.activeResult !== s.activeResult
    ) {
      map.setRisk(base, displayedStates(s));
    }

    // Layer visibility
    const roadsVisible = (l: TwinStoreState['layers']) => l.roads || l.traffic;
    if (baseChanged || pv.layers !== s.layers) {
      // The first time a base state arrives (prev.base was null) every layer is applied once.
      const first = !prev || prev.base === null;
      for (const id of LAYER_IDS) {
        if (id === 'roads') {
          if (first || roadsVisible(pv.layers) !== roadsVisible(s.layers)) map.setLayerVisible('roads', roadsVisible(s.layers));
        } else if (first || pv.layers[id] !== s.layers[id]) {
          map.setLayerVisible(id, s.layers[id]);
        }
      }
    }

    if (s.focusRequest && s.focusRequest !== prev?.focusRequest) map.flyToCell(base, s.focusRequest.cellId);
    if (s.flyRequest && s.flyRequest !== prev?.flyRequest) map.flyToLonLat(s.flyRequest.lon, s.flyRequest.lat, s.flyRequest.range);
  };

  apply(useTwinStore.getState());
  return useTwinStore.subscribe((state, prev) => apply(state, prev));
}
