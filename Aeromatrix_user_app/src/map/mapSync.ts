import { useTwinStore, type TwinStoreState } from '../store/useTwinStore';
import type { LayerId } from '../types';
import { AQI_COLORS, type AqiCategory } from '../services/cpcbAqi';
import { isMeasured } from '../services/aeromatrixApi';
import { displayedStates, heatSource } from './heatSource';
import { placedPoints, summariseStations } from '../services/observations';
import { pollutionColor, rgbCss } from '../utils/colors';
import type { TwinMap } from './TwinMap';

export { displayedStates };

const LAYER_IDS: LayerId[] = [
  'heatmap', 'grid', 'roads', 'industries', 'green', 'buildings', 'terrain', 'satellite', 'risk', 'labels',
  'elevationTint', 'shadows', 'photoreal', 'places', 'stations', 'midcAreas', 'industrySites',
];

const GREY = '#9aa0a6';

/** Marker colour of a station: its last AQI category, or grey when it has no reading. */
export function stationStyle(s: TwinStoreState): Record<string, { color: string; outdated: boolean }> {
  const out: Record<string, { color: string; outdated: boolean }> = {};
  for (const st of s.catalog.stations) {
    const m = s.modelService.measured[st.id];
    if (isMeasured(m) && (m.aqi.status === 'AVAILABLE' || m.aqi.status === 'LOWER_BOUND') && m.aqi.category && m.aqi.category in AQI_COLORS) {
      out[st.id] = { color: AQI_COLORS[m.aqi.category as AqiCategory], outdated: !!m.historical };
    } else {
      out[st.id] = { color: GREY, outdated: false };
    }
  }
  return out;
}

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

    // Heatmap: whichever source the display mode names (a missing source clears the overlay)
    if (
      baseChanged ||
      pv.baseline !== s.baseline ||
      pv.pollutant !== s.pollutant ||
      pv.displayMode !== s.displayMode ||
      pv.activeResult !== s.activeResult ||
      pv.live !== s.live ||
      pv.observedField !== s.observedField ||
      pv.observations !== s.observations ||
      pv.forecastLayer !== s.forecastLayer ||
      pv.modelService.status !== s.modelService.status
    ) {
      const src = heatSource(s);
      map.setHeatmap(base, src.values, src.spec);
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
        (s.displayMode === 'scenario' || s.displayMode === 'delta') && fresh
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

    // Monitoring stations: only those with a sourced coordinate; colour = last AQI category, grey = no reading
    if (
      baseChanged ||
      pv.catalog !== s.catalog ||
      pv.modelService.measured !== s.modelService.measured ||
      pv.selectedStationId !== s.selectedStationId ||
      pv.observations !== s.observations ||
      pv.obsWindow !== s.obsWindow ||
      pv.pollutant !== s.pollutant
    ) {
      // Imported observation stations with a coordinate are drawn too, coloured by their observed mean (OBSERVED).
      const imported = s.observations ? placedPoints(summariseStations(s.observations, s.obsWindow), s.pollutant) : [];
      const style = stationStyle(s);
      const extra = imported.map((p) => {
        const id = `obsmark:${p.name}`;
        style[id] = { color: rgbCss(pollutionColor(s.pollutant, p.value)), outdated: false };
        return { id, name: ` · ${Math.round(p.value)}`, lat: p.lat, lon: p.lon };
      });
      map.setStations([...s.catalog.stations, ...extra], style, s.selectedStationId);
    }

    // MIDC estates and mapped industry sites (only when the drop-in dataset is loaded)
    if (baseChanged || pv.industry !== s.industry || pv.selectedAreaCode !== s.selectedAreaCode || pv.selectedSiteId !== s.selectedSiteId) {
      const data = s.industry?.status === 'loaded' ? s.industry.data : null;
      map.setMidc(data ? data.areas.filter((a) => a.rings.length > 0) : null, s.selectedAreaCode);
      map.setSites(data ? data.sites.filter((x) => x.inAnalysisArea) : [], s.selectedSiteId);
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
