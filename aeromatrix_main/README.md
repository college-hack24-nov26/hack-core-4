# AeroMatrix - Versions 1 to 3

An urban air-quality digital twin of Pune and Pimpri-Chinchwad.

- **V1 Foundation:** app shell, design system, demo city, rule-based pollution engine, 3D map.
- **V2 Simulation:** What-If simulator, saved scenarios, reduction actions, candidate-site comparison, OpenStreetMap geometry, map layers.
- **V3 Real data:** the trained station-forecast service, verified station coordinates, live Open-Meteo model data, CPCB AQI, CSV import, validation and calibration, a forecast layer, analytics and industry data.

## Data disclaimer and what each label means

Every value carries a provenance status and the app never mixes them silently:

| Status | Meaning |
| --- | --- |
| **DEMO** | Deterministic, seeded demo value from the prototype rule model on demo inputs. Not a measurement. |
| **OBSERVED** | A measured station reading or a CSV you imported. Bundled station readings are historical and shown as Outdated with their date. |
| **MODEL_DATA** | Open-Meteo CAMS air-quality model data (about 40 km resolution). The CPCB AQI computed from it is an estimate, never an official station AQI. |
| **MODEL_PREDICTION** | A +24 h forecast from the trained model service, with its interval, model kind and test metrics. |
| **MODELED_SCENARIO** | A what-if result from the uncalibrated prototype rule model. Hypothetical. |

When a feed is missing the screen says so and gives the reason. A station with no recent reading never inherits a neighbour's or a city average. The prototype model must not be used for health, legal or planning decisions.

Map data: OSM data (c) OpenStreetMap contributors, ODbL 1.0. Imagery: Esri / CARTO. Terrain: Terrarium DEM. Air-quality and weather model data: Open-Meteo (CAMS global).

## Works without any of the optional pieces

The trained model service, the station-coordinate file and the industry dataset are **drop-in** pieces that may not exist on your machine. The app builds, starts and every screen opens without them:

- No model service (connection refused): the status is `offline`, station panels say **"No data feed"**, nothing is invented.
- No `public/data/station_coordinates_verified.json` and no coordinates from the service: no station is drawn and the panel says why. Stations without a sourced coordinate are listed as not placed, never drawn.
- No `public/data/industry/industry_data.json`: the Industries section says "Industry dataset not loaded" and the MIDC / industry-site layers are disabled.

When those files are added later nothing in the code needs to change; restart the app.

## What exists

**Map and engine (V1-V2):** 3D Pune map (CesiumJS, no token needed), pollution heatmap, grid, six pollutants, 5x5 / 10x10 / 20x20 zones, What-If simulator with presets, road closures, industry add / remove, area selection, weather; saved scenarios and examples A-E; six ranked reduction actions with a stability note; five-site comparison; OSM geometry (bundled snapshot, live Overpass or demo); layers, place search, drawers and a bottom chart panel. The photorealistic city appears only with a Cesium ion token or Google Maps key.

**Live and observed data (V3):**
- **Display modes:** Baseline, Scenario, Change, **Current** (Open-Meteo), **Observed** (imported CSV) and **Forecast** (trained model). The header badge and legend always name the true source of what the map shows; a mode with no data clears the overlay and says why.
- **Air Quality:** tabs for Now (model data), Monitoring stations, Forecast and the rule model. Live values refresh every `VITE_LIVE_REFRESH_MINUTES` (minimum 5, default 60) with a manual refresh that respects the interval. If the network is off the app shows an offline state, not stale numbers.
- **Monitoring stations:** drawn only where a sourced coordinate exists (service `/regions`, then `station_coordinates_verified.json`); marker colour is the last CPCB AQI category, grey without a reading. The station drawer shows the measured AQI and values with their own timestamps, the +24 h forecast with interval, model kind, test metrics and reliability warnings, an "Include historical forecast" toggle and the coordinate sources.
- **CSV import** (Data panel, deep link `#data`): CPCB CCR exports, station_hour tables or any station / date / pollutant CSV, plus ERA5 or CPCB weather. Files stay in your browser. You get markers, an interpolated observed field, a model-vs-observed table (MAE, RMSE, bias, r) and "Fit model to observed PM2.5" with a reset. The calibration adjusts the prototype model; it is not a validated forecast.
- **Analytics** (`#analytics`): demo source contribution (DEMO; no validated source-apportionment study exists), `/model/metrics` validation, per-station forecast and hypothetical scenario, how the forecasts are made, and a data-source status list.
- **Industries** (launcher): 28 MIDC estates, mapped OSM industry points, fuel emission estimates with ARAI/TERI factors, ERA5 seasonal weather, and reduce / shut down / relocate actions on the modeled sources in or within 1 km. The source intensities are assumptions because the dataset has no facility emissions, and every screen says so.
- **Region scenarios:** the What-If panel, station drawer and Analytics share one hypothetical evaluation: the trained model's baseline times the rule engine's relative change for the zone containing the station.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test
npm run build
```

On Windows, double-click `RUN_AEROMATRIX.bat`. If `backend\trained_model\bootstrap.py` exists it starts the model API (port 8000) in its own window first (64-bit Python 3.12 preferred, falling back to the `python` on PATH and saying which). Otherwise it prints that the package is not installed and starts only the web app. See `START_HERE.txt` for a new laptop.

Refresh the bundled OSM snapshot with `node scripts/fetch-osm-snapshot.mjs`. Copy `.env.example` to `.env` for the optional settings (`VITE_CESIUM_ION_TOKEN`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_AEROMATRIX_API_URL`, `VITE_LANDING_URL`, `VITE_LIVE_REFRESH_MINUTES`).

## Layout

- `src/services/` - engine, scenario API, OSM, `aeromatrixApi` (model service client), `cpcbAqi`, `openMeteo`, `liveData`, `forecast`, `pollutantData`, `observations`, `stations`, `industryData`, `industryScenarios`, `modelService`
- `src/data/import/` - CSV, CPCB and weather importers
- `src/scenarios/`, `src/simulator/`, `src/locations/` - actions, What-If, sites, region scenario
- `src/map/` - Cesium map, layers, display-mode sources and sync
- `src/store/` - zustand store, live scenario runner, derived fields
- `src/components/` - panels and drawers
- `src/services/__fixtures__/` - recorded API and Open-Meteo fixtures used by the tests
- `docs/contracts/` (repository root) - the model API contract and response examples these clients are built from
