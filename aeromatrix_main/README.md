# AeroMatrix - Version 1 (Foundation)

An urban air-quality digital twin of Pune and Pimpri-Chinchwad. This is **V1 only**: the app shell,
design system, demo city model, rule-based pollution engine, and a 3D map with a heatmap and grid.

## Data disclaimer

**Everything shown is DEMO data.** The city (roads, green areas, industries, localities) is a set of
hand-digitised, approximate demo features, not survey data. Values come from a prototype, rule-based,
**uncalibrated** model (`prototype-rule-model 0.1.0-demo`) and are deterministic (seeded). They are
not measurements, not a validated forecast, and must not be used for health, legal or planning decisions.
Every value carries a provenance badge (here always `DEMO`). Where data is unavailable the UI says so
instead of inventing numbers.

## What exists in V1

- 3D Pune map (CesiumJS, free mode, no token): open Terrarium terrain, Esri satellite imagery with a
  CARTO fallback, pollution heatmap draped on terrain, grid outline, click-to-select zones, cursor
  lat/lon/elevation readout, reset / top-down / City 3D views and an optional elevation tint.
- Selectable grid (5x5, 10x10, 20x20) and six pollutants (PM2.5, PM10, NO2, SO2, CO, O3).
- Panels: Overview, Air Quality, Zones (left), zone details with source contribution (right drawer).
- Orbit launcher (bottom-left) with keyboard support, first-visit guide, loading and error states.
- Deterministic pollution engine behind `DataProvider` and `ScenarioService` interfaces, with tests.
  (The engine already supports scenario parameters; the simulator UI is not part of V1.)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test
npm run build
```

Optional: copy `.env.example` to `.env`. V1 needs no token.

## Layout

- `src/services/pollutionModel.ts` - rule-based engine; `scenarioService.ts` - scenario API + validation
- `src/services/dataProvider.ts` - the single swappable data source line
- `src/data/` - demo geometry, localities and the demo data provider
- `src/map/` - Cesium map (`TwinMap.ts`), store sync, legend, heatmap canvases
- `src/store/useTwinStore.ts` - zustand store; `src/components/` - UI
