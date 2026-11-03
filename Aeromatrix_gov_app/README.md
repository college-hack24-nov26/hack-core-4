# AeroMatrix Commissioner

A decision-support app for the Municipal Commissioner of Pune and Pimpri-Chinchwad. One decision-maker, no logins, no separate officer or citizen screens.

It **finds** the air-quality problem, **explains** it, **recommends** an action and the department to inform, **tests** the action in a simulation, and produces a **costed implementation report**. It never sends anything: instructions are prepared, and the Commissioner copies them or opens an email / WhatsApp draft.

This is its own Vite project (React 19, TypeScript strict, Tailwind 4, zustand, Leaflet, Cesium for the optional 3D map, jsPDF). It **reuses the backends of `aeromatrix_main`** (model API 8000, AeroSage 8010, Sensor Intelligence 8030) and has no backend folder of its own. The shared frontend code (store, services, scenario engine, Plan-It cost model, TwinMap, AeroSage) is a copy inside `src/`.

## Run it

```bash
npm install
npm run dev -- --port 5174     # http://localhost:5174
npm run typecheck
npm test
npm run build
```

On Windows, double-click `RUN_GOV_APP.bat`. It starts the backends that are installed in `..\aeromatrix_main` exactly as that folder's `RUN_AEROMATRIX.bat` does (skipping any port that is already listening), then the app, and opens http://localhost:5174. It stops with a message if `..\aeromatrix_main\backend\trained_model\bootstrap.py` is missing; in that case run the two npm commands above, the app works without any backend.

Phone try-out on your network: `npm run dev -- --host --port 5174`.

## Works without any backend or drop-in file

| Missing | What the app does |
| --- | --- |
| Model API (8000) | Station panels say **"No data feed"**. City and area values still come from live Open-Meteo data. |
| `public/data/station_coordinates_verified.json` | Stations and the Map say "Sourced station coordinates not loaded"; no station is drawn; coverage analysis is disabled with that reason. |
| `public/data/industry/industry_data.json` | No MIDC layer; industry evidence says "industry dataset not loaded". |
| AeroSage (8010), Sensor Intelligence (8030) | The assistant says it is not running; nothing else changes. |
| Open-Meteo (no internet) | Home says "No data feed"; no number is invented. |

The files above are **drop-ins** supplied separately. Add them later and restart; no code changes are needed. This app never creates them, nor the PWA icons.

## Screens

Open the round launcher at the bottom left; the screens fan out on an arc. There is no sidebar and no top navigation.

| Screen | What it does |
| --- | --- |
| **Home** | City AQI estimate with its method text, 24 / 48 / 72 h outlook, top 5 hotspots, active alerts by severity, station health (measured / outdated / no feed / not placed) and data freshness. |
| **Alerts** | Filter by status and severity. Detail: why (with evidence), current vs expected, threshold, confidence text, suggested departments and deadline. Workflow **New → Acknowledge → Assign → Resolve**. Assign opens an instruction composer (recipient, deadline, editable message), then Copy / Email draft / WhatsApp draft. Records persist in this browser. |
| **Map** | Light 2D map (Leaflet, canvas) everywhere: zones coloured by the CAMS estimate, verified stations (Outdated ring), top hotspots, hatched **coverage gaps**, MIDC estates, clustered industry markers. The 3D twin (Cesium) is offered only on capable desktops. Marker click opens a sheet with status chips and **Create report**. |
| **Stations** | Every station with a sourced coordinate, its status chip, last reading with date, freshness, pollutants and coordinate sources (single-source flagged). Stations without a coordinate are listed as **Not placed**, never drawn. |
| **Hotspots** | Two tabs: areas (live model estimate, one entry per model grid point) and stations (last reading, dated). Detail: why it ranks, pollutant breakdown, trend, possible causes with evidence, the "not assessed" list and a ready-to-send inspection task. |
| **Simulator** | Choose an area, then traffic enforcement, a road closure with diversion share, industrial controls, trees and dust control. Shows **Existing** against **Simulated** with a half-effect range, assumptions, one-time and recurring cost (INR), implementation weeks and zones improved. Save, compare side by side, export CSV. |
| **Reports** | Pick an area and a saved scenario (or the one you are building) and preview, then download a PDF with sections **A** Executive summary, **B** Current situation and reasons, **C** Recommended measures, **D** Operational instructions, **E** Cost breakdown, **F** Expected outcomes, **G** Before and after, **H** Timeline, **I** Final recommendations. |

AeroSage stays available at the bottom right, with the Commissioner context (screen, selected station and area). It can open screens and select stations; anything that changes the Simulator measures waits for confirmation.

## Data rules

Every value carries one of five chips: **Measured**, **Outdated**, **Estimated**, **Forecast** or **Simulation** (plus an explicit **No data feed**). Nothing is shown as a bare number.

- City and area AQI come from **Open-Meteo CAMS model data** with the CPCB AQI method at about 40 km resolution. They are **estimates, not official station AQI**, and the app says so.
- Bundled station readings are **historical**. They are shown with their dates as Outdated, never as current.
- A station with no current reading shows a labelled model estimate, if any. Stations without a data feed give **no monitoring coverage**.
- Station coordinates are never invented. Stations appear only where a sourced coordinate exists.
- Likely causes are shown only with evidence (mapped OpenStreetMap roads and industry near the place, and the PM2.5/PM10 ratio). Construction sites, RMC plants, waste burning and brick kilns are listed as **not assessed**.
- There is **no source-contribution chart**: no validated source-apportionment study exists. The report says so.
- Simulation results come from the existing **uncalibrated** rule-based engine. They are relative changes applied to the area's current model value, always labelled Simulation, always with a range (the result if only half of the assumed effect is achieved). **The effect of dust control is not modelled**: it is costed and scheduled and checked by readings on Day 7 and Day 14.
- Prices come from the Plan-It price table: sourced items name their source, estimates are marked with `*`.
- **The app never sends anything.** Approving an instruction records it and marks the alert Assigned.

An alert exists only when real data crosses a threshold: the current model value or a model-outlook day of an area reaching **Poor (CPCB AQI 201) or worse**, or station feeds going stale. Severity: critical (Very Poor or worse), high (Poor), watch (a Poor crossing only at +72 h, or stale feeds), info (a service is unreachable).

## Phone and PWA

It installs like an app: web manifest (`AeroMatrix Commissioner`, standalone, portrait), a service worker that caches **only the app shell and static data** (never the model API, Open-Meteo, map tiles or the assistant, so nothing offline is shown as current), an "Offline" notice and a dismissible install prompt (the choice is remembered under `aeromatrix.gov.installHidden`).

- Layout: no sideways scrolling at 375 px, 44 px touch targets, 16 px inputs, safe-area insets, tables scroll inside their card, bottom sheets instead of side panels, the 2D map by default.
- **Installing needs https.** Deploy the built app (`vercel.json` is a static SPA configuration) or use any https host. The model API must be reachable from the phone as well for a real rollout.
- The service worker is registered in production builds only.
- A store app would be a Capacitor wrapper; that is **not** set up.
- The install icons `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-touch-icon.png` are drop-ins in `public/`. The app works without them; install prompts need them.

## Code map

- `src/gov/govStore.ts` view, selections, alert workflow records, saved scenarios, settings (records and scenarios persist in `localStorage`, with try/catch around every access)
- `src/gov/lib/` the logic, all covered by tests: `airdata` (zone rows, causes, city summary), `stations`, `coverage`, `alerts`, `routing`, `hotspots`, `measures`, `dustControl`, `scenarios`, `instructions`, `capability`, `format`
- `src/gov/views/` Home, Alerts, Map (`Map2D`, `Map3D`), Stations, Hotspots, Simulator, Reports, the instruction composer
- `src/gov/report/govReport.ts` the PDF (jsPDF + autotable)
- `src/gov/GovOrbit.tsx`, `ui.tsx`, `Sheet.tsx`, `Pwa.tsx`, `mobile.css`
- `src/aerosage/` the shared assistant; `existingTwinAdapter.ts` maps its actions onto these screens
- `src/store`, `src/services`, `src/plan`, `src/scenarios`, `src/map`, `src/utils`, `src/types`, `src/task2`: shared code copied from `aeromatrix_main`

Tests: `npm test`. Types: `npm run typecheck`.

## Configuration

Copy `.env.example` to `.env` for the optional settings (Cesium ion token, Google key, service addresses, `VITE_LIVE_REFRESH_MINUTES`). Never commit `.env`.

Map data: OSM data (c) OpenStreetMap contributors, ODbL 1.0. Air-quality model data: Open-Meteo (CAMS global).
