# AeroMatrix - Versions 1 and 2

An urban air-quality digital twin of Pune and Pimpri-Chinchwad. Version 1 is the foundation (app shell, design
system, city model, pollution engine, 3D map). Version 2 turns it into an interactive planning tool: a What-If
simulator, saved scenarios, six reduction actions, candidate-site comparison, real OpenStreetMap geometry and
more map layers.

## Data disclaimer

**Pollution values are DEMO or MODELED_SCENARIO.** They come from a prototype, rule-based, **uncalibrated** model
(`prototype-rule-model 0.1.0-demo`) with deterministic (seeded) demo inputs. They are not measurements and not a
validated forecast, and must not be used for health, legal or planning decisions.

**Only the geometry can be real.** With OpenStreetMap geometry loaded, road lines, parks/forests and industrial zones
come from OSM. Road volumes are a DEMO *proxy* from the road class, and the emission point sources placed on the
largest industrial zones carry DEMO intensities. Population, weather and traffic are DEMO assumptions too.
Every value carries a provenance badge (DEMO or MODELED_SCENARIO). When something is unavailable the UI says so.

Map data: OSM data (c) OpenStreetMap contributors, ODbL 1.0. Imagery: Esri / CARTO. Terrain: Terrarium DEM.

## What exists

**V1 foundation**
- 3D Pune map (CesiumJS, free mode, no token): open terrain, satellite imagery with a dark-map fallback, pollution
  heatmap draped on terrain, grid, click-to-select zones, coordinate readout, reset / top-down / City 3D views.
- Six pollutants, 5x5 / 10x10 / 20x20 grids, Overview / Air Quality / Zones panels, zone drawer with source donut.
- Deterministic engine behind `DataProvider` and `ScenarioService` interfaces (swap = one `export const` line).

**V2 simulation**
- **What-If** (launcher "What-If"): traffic, road closures with diversion, industry add / remove / re-rate,
  industrial control, green buffer, green cover (with a trees helper), building density and height, area selection,
  weather (with a compass) and five presets. Every control re-runs the scenario live; invalid values show inline errors.
- **Display modes** Baseline | Scenario | Change. Change uses a blue-to-rose scale with a symmetric legend; zones that
  change by 0.5 ug/m3 or more are outlined; added industries and closed roads draw distinctly.
- **Scenarios** (deep link `#scenarios`): save (browser only), load, rename, delete, compare up to three, plus
  example scenarios A-E built from the presets.
- **Actions** (launcher "Actions"): six reduction actions ranked by mean PM2.5 reduction, with an insight line each,
  three core actions flagged, "Apply to map", and a note when the ranking changes under +/-20% coefficient changes.
- **Sites** (launcher "Sites"): pick up to five candidate points for a new industry, ranked on city impact, people
  exposed, worst zone and a downwind residential penalty, with markers A-E and plain-language recommendations.
- **OpenStreetMap geometry** (deep link `#data`): a bundled snapshot (works offline, default), live Overpass, or back
  to the demo geometry. If the snapshot file is missing the app falls back to demo geometry with a visible notice.
- **Map layers:** heatmap, grid, 3D risk columns, roads, traffic corridors, industries, green cover, OSM 3D
  buildings (zoom in; open vector tiles), terrain, satellite, labels, place markers, elevation tint and sun shadows.
  Place search with typeahead and a "My zone" jump. Click an industry or road for its drawer.
- **Photorealistic 3D city:** available only when `VITE_CESIUM_ION_TOKEN` or `VITE_GOOGLE_MAPS_API_KEY` is set in
  `.env`. Never commit a key. Without one the free mode is used and the layer is absent.
- **Bottom panel** (md and wider): zones sorted by PM2.5, baseline vs scenario sources, and a 24 h DEMO profile.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test
npm run build
```

Refresh the bundled OSM snapshot (needs internet, uses the Overpass API):

```bash
node scripts/fetch-osm-snapshot.mjs
```

Optional: copy `.env.example` to `.env` for the photorealistic layer. Nothing else needs a key.

## Layout

- `src/services/` - engine (`pollutionModel`), scenario API, `osmGeometry`, `dataProvider` (the swap line)
- `src/data/` - demo geometry, localities and the demo data provider (also builds the grid over OSM geometry)
- `src/simulator/` - What-If panel, presets, controls
- `src/scenarios/` - actions, insights, ranking stability, scenarios panel and examples
- `src/locations/` - site comparison, recommendations, hook and panel
- `src/map/` - Cesium map (`TwinMap.ts`), overlay and entity layers, building tiles, store sync, controls
- `src/store/` - zustand store and the live scenario runner
- `public/data/pune-osm-snapshot.json` - bundled OSM snapshot
