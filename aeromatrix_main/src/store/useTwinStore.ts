import { create } from 'zustand';
import type {
  BaseState,
  CandidateLocation,
  CellState,
  CityGeometry,
  DisplayMode,
  GeometryInfo,
  Industry,
  IndustryCategory,
  InteractionMode,
  LayerId,
  LonLat,
  PendingIndustry,
  Pollutant,
  RoadClosure,
  SavedScenario,
  ScenarioParams,
  ScenarioResult,
  Section,
  SiteProject,
  Weather,
} from '../types';
import { dataProvider } from '../services/dataProvider';
import {
  defaultParams,
  makeScenarioIndustry,
  sanitizeParams,
  scenarioService,
} from '../services/scenarioService';
import {
  fetchOsmGeometry,
  geometryCounts,
  loadOsmSnapshot,
  OSM_ATTRIBUTION,
  type OsmLoadResult,
} from '../services/osmGeometry';
import { exampleScenarios } from '../scenarios/examples';
import { PHOTOREAL_AVAILABLE } from '../config';
import { computeCellStates } from '../services/pollutionModel';
import {
  connectModelService as connectModel,
  initialModelService,
  refetchForecasts,
  fetchAqiHistory,
  type ModelServiceState,
} from '../services/modelService';
import { buildStationCatalog, loadAllVerified, type StationCatalog, type VerifiedLoad } from '../services/stations';
import { initialLive, type LiveState } from '../services/liveState';
import {
  fitCalibration,
  summariseStations,
  type FitResult,
  type ModelCalibration,
  type ObservationDataset,
  type ObservedField,
  type ObsWindow,
} from '../services/observations';
import { loadIndustryData, type IndustryLoad } from '../services/industryData';
import { buildForecastLayer, type ForecastLayer } from '../analytics/forecastLayer';
import type { WeatherDataset } from '../data/import/weatherImport';
import { planProject, DEFAULT_LIMITS, type Objective, type PlanLimits, type PlanOutcome } from '../plan/planEngine';
import { DEFAULT_ASSUMPTIONS, cloneAssumptions, type PlanAssumptions } from '../plan/costModel';
import { zonePlaceNames } from '../utils/zones';
import { uid } from '../utils/format';
import { bboxContains } from '../utils/geo';

export type MapStatus = 'idle' | 'loading' | 'ready' | 'error';
export type { DisplayMode };

const INTRO_KEY = 'aeromatrix.introSeen.v1';
export const SAVED_KEY = 'enr01.savedScenarios.v1';
export const MAX_CANDIDATES = 5;
const CANDIDATE_IDS = ['A', 'B', 'C', 'D', 'E'];

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* storage unavailable: the intro simply shows again next visit */
  }
}

function loadSavedScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SavedScenario =>
        !!s && typeof s === 'object' && typeof (s as SavedScenario).id === 'string' && !!(s as SavedScenario).params,
    );
  } catch {
    return [];
  }
}

function persistSavedScenarios(list: SavedScenario[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable: scenarios stay in memory for this session */
  }
}

export interface FocusRequest {
  cellId: string;
  nonce: number;
}

export interface FlyRequest {
  lon: number;
  lat: number;
  range: number;
  nonce: number;
}

export interface Notice {
  text: string;
  nonce: number;
}

const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  heatmap: true,
  grid: true,
  roads: true,
  traffic: false,
  industries: true,
  green: false,
  buildings: false,
  terrain: true,
  satellite: true,
  risk: false,
  labels: true,
  elevationTint: false,
  shadows: false,
  photoreal: PHOTOREAL_AVAILABLE,
  places: false,
  stations: true,
  midcAreas: false,
  industrySites: false,
};

const EMPTY_WEATHER: Weather = { temperature: 27, windSpeed: 2.4, windDirection: 290, humidity: 58, rainfall: 0, pressure: 1009 };

function placeholderParams(): ScenarioParams {
  return {
    name: 'Baseline',
    targetCells: [],
    trafficMultiplier: 1,
    areaTrafficMultiplier: 1,
    vehicleEmissionControl: 0,
    publicTransportShift: 0,
    roadClosures: [],
    addedIndustries: [],
    removedIndustryIds: [],
    industryIntensityOverrides: {},
    industrialControl: 0,
    greenCoverDelta: 0,
    greenBuffer: false,
    buildingDensityDelta: 0,
    buildingHeightMultiplier: 1,
    weather: { ...EMPTY_WEATHER },
  };
}

const NO_SELECTION = {
  selectedCellId: null,
  selectedIndustryId: null,
  selectedRoadId: null,
  selectedCandidateId: null,
  resultOpen: false,
  rightOpen: false,
  selectedStationId: null,
  selectedAreaCode: null,
  selectedSiteId: null,
};

function demoInfo(message: string | null, notice: string | null): GeometryInfo {
  return {
    status: 'ready',
    source: 'demo',
    origin: 'demo',
    message,
    notice,
    attribution: null,
    generated: null,
    counts: geometryCounts(dataProvider.getDefaultGeometry()),
  };
}

interface TwinState {
  loading: boolean;
  error: string | null;
  base: BaseState | null;
  gridSize: number;
  pollutant: Pollutant;
  baseline: CellState[];
  placeNames: Record<string, string>;
  section: Section;
  leftOpen: boolean;
  rightOpen: boolean;
  introOpen: boolean;
  bottomOpen: boolean;
  mapStatus: MapStatus;
  mapMessage: string | null;
  focusRequest: FocusRequest | null;
  flyRequest: FlyRequest | null;
  notice: Notice | null;
  /** short status notes shown under layer toggles (e.g. buildings, photoreal) */
  layerNotes: Record<string, string | null>;

  // selection (one at a time; the right drawer switches on it)
  selectedCellId: string | null;
  selectedIndustryId: string | null;
  selectedRoadId: string | null;
  selectedCandidateId: string | null;
  resultOpen: boolean;

  // scenario
  params: ScenarioParams;
  paramErrors: string[];
  activeResult: ScenarioResult | null;
  displayMode: DisplayMode;
  runNonce: number;
  savedScenarios: SavedScenario[];

  // map
  layers: Record<LayerId, boolean>;
  interactionMode: InteractionMode;
  pendingIndustry: PendingIndustry;

  // sites
  candidates: CandidateLocation[];
  siteProject: SiteProject;

  // geometry
  geometry: CityGeometry | null;
  geometryInfo: GeometryInfo;

  // V3: trained model service, stations, live model data, observations, industry
  modelService: ModelServiceState;
  verified: VerifiedLoad | null;
  catalog: StationCatalog;
  allowHistoricalForecast: boolean;
  selectedStationId: string | null;
  live: LiveState;
  observations: ObservationDataset | null;
  weatherObs: WeatherDataset | null;
  obsWindow: ObsWindow;
  observedField: ObservedField | null;
  forecastLayer: ForecastLayer | null;
  calibration: ModelCalibration | null;
  industry: IndustryLoad | null;
  selectedAreaCode: number | null;
  selectedSiteId: string | null;

  // V4: Plan-It
  planItOpen: boolean;
  plan: PlanItState;

  init: (gridSize?: number) => Promise<void>;
  setGridSize: (n: number) => Promise<void>;
  setPollutant: (p: Pollutant) => void;
  selectCell: (id: string | null) => void;
  focusCell: (id: string) => void;
  selectIndustry: (id: string | null) => void;
  selectRoad: (id: string | null) => void;
  selectCandidate: (id: string | null) => void;
  openResult: (open: boolean) => void;
  setSection: (s: Section) => void;
  setLeftOpen: (open: boolean) => void;
  setIntroOpen: (open: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  setMapStatus: (status: MapStatus, message?: string | null) => void;
  flyTo: (lon: number, lat: number, range?: number) => void;
  setNotice: (text: string | null) => void;
  setLayerNote: (id: string, text: string | null) => void;

  setParam: <K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) => void;
  patchParams: (patch: Partial<ScenarioParams>) => void;
  setWeather: (patch: Partial<Weather>) => void;
  resetParams: () => void;
  /** Replace the active scenario parameters (presets, actions, saved scenarios). */
  applyParams: (params: ScenarioParams) => void;
  runNow: () => void;
  setDisplayMode: (m: DisplayMode) => void;
  saveScenario: (name: string) => SavedScenario | null;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  loadScenario: (id: string) => boolean;

  toggleLayer: (id: LayerId) => void;
  setLayer: (id: LayerId, on: boolean) => void;
  setInteractionMode: (m: InteractionMode) => void;
  setPendingIndustry: (patch: Partial<PendingIndustry>) => void;
  addIndustryAt: (lon: number, lat: number) => Industry | null;
  removeIndustry: (id: string) => void;
  restoreIndustry: (id: string) => void;
  rerateIndustry: (id: string, intensity: number) => void;
  setTargetCells: (ids: string[]) => void;
  addClosure: (closure: RoadClosure) => void;
  removeClosure: (roadId: string) => void;

  addCandidate: (location: LonLat) => CandidateLocation | null;
  removeCandidate: (id: string) => void;
  clearCandidates: () => void;
  setSiteProject: (patch: Partial<SiteProject>) => void;

  loadOsm: (source: 'snapshot' | 'live') => Promise<void>;
  useDemoGeometry: () => Promise<void>;

  connectModelService: () => Promise<void>;
  loadStationCatalog: () => Promise<void>;
  setAllowHistoricalForecast: (on: boolean) => Promise<void>;
  loadAqiHistory: (stationName: string) => Promise<void>;
  selectStation: (id: string | null) => void;
  setLive: (patch: Partial<LiveState>) => void;
  setObservations: (ds: ObservationDataset | null) => void;
  setWeatherObs: (ds: WeatherDataset | null) => void;
  setObsWindow: (w: ObsWindow) => void;
  fitModelToObserved: () => FitResult;
  resetCalibration: () => void;
  loadIndustry: () => Promise<void>;
  selectArea: (code: number | null) => void;
  selectSite: (id: string | null) => void;
  setPlanItOpen: (open: boolean) => void;
  patchPlan: (patch: Partial<PlanItState>) => void;
  runPlan: () => void;
}

/** Plan-It form and result state. A grid or data change marks an existing outcome stale (see planBaseKey). */
export interface PlanItState {
  budget: number;
  targetId: string;
  limits: PlanLimits;
  objective: Objective;
  assumptions: PlanAssumptions;
  view: 'form' | 'results';
  outcome: PlanOutcome | null;
  outcomeKey: string | null;
  selected: 'A' | 'B' | 'C';
}

export const initialPlan = (): PlanItState => ({
  budget: 5_000_000,
  targetId: 'city',
  limits: { ...DEFAULT_LIMITS },
  objective: 'pm25',
  assumptions: cloneAssumptions(DEFAULT_ASSUMPTIONS),
  view: 'form',
  outcome: null,
  outcomeKey: null,
  selected: 'A',
});

/** Identity of the data a plan was computed on. */
export function planBaseKey(base: BaseState): string {
  const cal = base.calibration ? `/${base.calibration.backgroundScale.toFixed(3)}` : '-';
  return `|${base.geometrySource}|${base.cells.length}|${base.industries.length}|${cal}`;
}

let initToken = 0;

async function buildBase(gridSize: number, geometry: CityGeometry) {
  const base = await dataProvider.getBaseState(gridSize, geometry);
  return { base, baseline: scenarioService.baseline(base), placeNames: zonePlaceNames(base.cells) };
}

export const useTwinStore = create<TwinState>((set, get) => {
  /** Swap in new geometry: rebuild the base state and reset the (now stale) active scenario. */
  const applyGeometry = async (geometry: CityGeometry, info: GeometryInfo, resetScenario: boolean) => {
    const gridSize = get().gridSize;
    const built = await buildBase(gridSize, geometry);
    const hadScenario = get().params.name !== 'Baseline' || get().activeResult?.summary.affectedCount;
    set({
      geometry,
      geometryInfo: info,
      ...built,
      ...NO_SELECTION,
      params: resetScenario ? defaultParams(built.base) : sanitizeParams(built.base, get().params),
      activeResult: null,
      loading: false,
      error: null,
      ...(resetScenario && hadScenario
        ? { notice: { text: 'The city geometry changed, so the active scenario was reset. Saved scenarios keep their own settings.', nonce: Date.now() } }
        : {}),
    });
  };

  const markScenario = (patch: Partial<TwinState>): Partial<TwinState> => ({
    ...patch,
    displayMode: ['baseline', 'current', 'observed', 'forecast'].includes(get().displayMode) ? 'scenario' : get().displayMode,
  });

  return {
    loading: true,
    error: null,
    base: null,
    gridSize: 10,
    pollutant: 'pm25',
    baseline: [],
    placeNames: {},
    section: 'overview',
    leftOpen: true,
    introOpen: !introSeen(),
    bottomOpen: false,
    mapStatus: 'idle',
    mapMessage: null,
    focusRequest: null,
    flyRequest: null,
    notice: null,
    layerNotes: {},

    ...NO_SELECTION,

    params: placeholderParams(),
    paramErrors: [],
    activeResult: null,
    displayMode: 'baseline',
    runNonce: 0,
    savedScenarios: loadSavedScenarios(),

    layers: { ...DEFAULT_LAYERS },
    interactionMode: 'select',
    pendingIndustry: { location: null, category: 'Manufacturing', intensity: 60 },

    candidates: [],
    siteProject: { category: 'Manufacturing', intensity: 60, greenBuffer: false },

    modelService: initialModelService(),
    verified: null,
    catalog: { stations: [], unlocated: [], notice: 'Station list not loaded yet.', sourcesText: {} },
    allowHistoricalForecast: false,
    live: initialLive(),
    observations: null,
    weatherObs: null,
    obsWindow: { kind: 'last24h' },
    observedField: null,
    forecastLayer: null,
    calibration: null,
    industry: null,
    planItOpen: false,
    plan: initialPlan(),

    geometry: null,
    geometryInfo: {
      status: 'idle',
      source: 'demo',
      origin: 'demo',
      message: null,
      notice: null,
      attribution: null,
      generated: null,
      counts: { roads: 0, roadKm: 0, green: 0, industrialZones: 0, industries: 0 },
    },

    async init(gridSize = get().gridSize) {
      const token = ++initToken;
      set({ loading: true, error: null, gridSize });
      try {
        let geometry = get().geometry;
        let info = get().geometryInfo;
        let firstLoad = false;
        if (!geometry) {
          firstLoad = true;
          // Default geometry: the bundled OSM snapshot, falling back to the demo city.
          try {
            const r: OsmLoadResult = await loadOsmSnapshot();
            geometry = r.geometry;
            info = {
              status: 'ready',
              source: 'osm',
              origin: 'snapshot',
              message: null,
              notice: null,
              attribution: r.attribution,
              generated: r.generated,
              counts: geometryCounts(geometry),
            };
          } catch (e) {
            geometry = dataProvider.getDefaultGeometry();
            info = demoInfo(
              e instanceof Error ? e.message : null,
              'OSM snapshot not available, load Live from Overpass or use demo geometry.',
            );
          }
        }
        const built = await buildBase(gridSize, geometry);
        if (token !== initToken) return;
        const prev = get().params;
        set({
          geometry,
          geometryInfo: info,
          ...built,
          ...NO_SELECTION,
          params: firstLoad ? defaultParams(built.base) : sanitizeParams(built.base, prev),
          activeResult: null,
          loading: false,
          ...(info.notice && firstLoad ? { notice: { text: info.notice, nonce: Date.now() } } : {}),
        });
      } catch (e) {
        if (token !== initToken) return;
        set({ loading: false, error: e instanceof Error ? e.message : 'Could not load the city model.' });
      }
    },

    async setGridSize(n) {
      if (n === get().gridSize && get().base) return;
      await get().init(n);
    },

    setPollutant(p) {
      set({ pollutant: p });
    },

    selectCell(id) {
      set({ ...NO_SELECTION, selectedCellId: id, rightOpen: id !== null });
    },

    focusCell(id) {
      set({
        ...NO_SELECTION,
        selectedCellId: id,
        rightOpen: true,
        focusRequest: { cellId: id, nonce: Date.now() },
      });
    },

    selectIndustry(id) {
      set({ ...NO_SELECTION, selectedIndustryId: id, rightOpen: id !== null });
    },

    selectRoad(id) {
      set({ ...NO_SELECTION, selectedRoadId: id, rightOpen: id !== null });
    },

    selectCandidate(id) {
      set({ ...NO_SELECTION, selectedCandidateId: id, rightOpen: id !== null });
    },

    openResult(open) {
      set({ ...NO_SELECTION, resultOpen: open, rightOpen: open });
    },

    setSection(s) {
      set({ section: s });
      // Selecting the area or placing sites only makes sense in the matching panel.
      const mode = get().interactionMode;
      if (mode === 'select-area' && s !== 'simulator') set({ interactionMode: 'select' });
      if (mode === 'add-industry' && s !== 'simulator') set({ interactionMode: 'select' });
      if (mode === 'pick-candidate' && s !== 'locations') set({ interactionMode: 'select' });
    },

    setLeftOpen(open) {
      set({ leftOpen: open });
    },

    setIntroOpen(open) {
      if (!open) markIntroSeen();
      set({ introOpen: open });
    },

    setBottomOpen(open) {
      set({ bottomOpen: open });
    },

    setMapStatus(status, message = null) {
      set({ mapStatus: status, mapMessage: message });
    },

    flyTo(lon, lat, range = 4500) {
      set({ flyRequest: { lon, lat, range, nonce: Date.now() } });
    },

    setNotice(text) {
      set({ notice: text ? { text, nonce: Date.now() } : null });
    },

    setLayerNote(id, text) {
      if (get().layerNotes[id] === text) return;
      set({ layerNotes: { ...get().layerNotes, [id]: text } });
    },

    // ---- scenario parameters ----

    setParam(key, value) {
      set(markScenario({ params: { ...get().params, [key]: value } }));
    },

    patchParams(patch) {
      set(markScenario({ params: { ...get().params, ...patch } }));
    },

    setWeather(patch) {
      const p = get().params;
      set(markScenario({ params: { ...p, weather: { ...p.weather, ...patch } } }));
    },

    resetParams() {
      const base = get().base;
      if (!base) return;
      set({ params: defaultParams(base), interactionMode: 'select' });
    },

    applyParams(params) {
      set({ params, displayMode: 'scenario', paramErrors: [] });
    },

    runNow() {
      set({ runNonce: get().runNonce + 1 });
    },

    setDisplayMode(m) {
      set({ displayMode: m });
    },

    saveScenario(name) {
      const { params, activeResult } = get();
      const base = get().base;
      if (!base) return null;
      const entry: SavedScenario = {
        id: uid('scn'),
        name: name.trim() || `Scenario ${get().savedScenarios.length + 1}`,
        createdAt: new Date().toISOString(),
        params: JSON.parse(JSON.stringify(params)) as ScenarioParams,
        geometrySource: base.geometrySource,
        gridSize: base.gridSize,
        meanDelta: activeResult?.summary.meanDelta ?? 0,
        meanDeltaPct: activeResult?.summary.meanDeltaPct ?? 0,
      };
      const list = [entry, ...get().savedScenarios];
      persistSavedScenarios(list);
      set({ savedScenarios: list });
      return entry;
    },

    deleteScenario(id) {
      const list = get().savedScenarios.filter((s) => s.id !== id);
      persistSavedScenarios(list);
      set({ savedScenarios: list });
    },

    renameScenario(id, name) {
      const clean = name.trim();
      if (!clean) return;
      const list = get().savedScenarios.map((s) => (s.id === id ? { ...s, name: clean } : s));
      persistSavedScenarios(list);
      set({ savedScenarios: list });
    },

    loadScenario(id) {
      const base = get().base;
      if (!base) return false;
      const found = get().savedScenarios.find((s) => s.id === id) ?? exampleScenarios(base).find((s) => s.id === id);
      if (!found) return false;
      const params = sanitizeParams(base, JSON.parse(JSON.stringify(found.params)) as ScenarioParams);
      const mismatch = found.geometrySource !== base.geometrySource;
      set({
        params,
        displayMode: 'scenario',
        ...(mismatch
          ? {
              notice: {
                text: `"${found.name}" was saved with ${found.geometrySource === 'osm' ? 'OpenStreetMap' : 'demo'} geometry; references that do not exist here were dropped.`,
                nonce: Date.now(),
              },
            }
          : {}),
      });
      return true;
    },

    // ---- layers and interaction ----

    toggleLayer(id) {
      set({ layers: { ...get().layers, [id]: !get().layers[id] } });
    },

    setLayer(id, on) {
      set({ layers: { ...get().layers, [id]: on } });
    },

    setInteractionMode(m) {
      set({ interactionMode: m });
    },

    setPendingIndustry(patch) {
      set({ pendingIndustry: { ...get().pendingIndustry, ...patch } });
    },

    addIndustryAt(lon, lat) {
      const base = get().base;
      if (!base || !bboxContains(base.city.bbox, [lon, lat])) return null;
      const { category, intensity } = get().pendingIndustry;
      const ind = makeScenarioIndustry({
        name: `New ${category.toLowerCase()} unit`,
        category,
        location: [lon, lat],
        emissionIntensity: intensity,
      });
      const p = get().params;
      set({
        ...markScenario({ params: { ...p, addedIndustries: [...p.addedIndustries, ind] } }),
        ...NO_SELECTION,
        selectedIndustryId: ind.id,
        rightOpen: true,
        interactionMode: 'select',
        pendingIndustry: { ...get().pendingIndustry, location: [lon, lat] },
      });
      return ind;
    },

    removeIndustry(id) {
      const p = get().params;
      const isAdded = p.addedIndustries.some((i) => i.id === id);
      const overrides = { ...p.industryIntensityOverrides };
      delete overrides[id];
      set(
        markScenario({
          params: isAdded
            ? { ...p, addedIndustries: p.addedIndustries.filter((i) => i.id !== id) }
            : {
                ...p,
                removedIndustryIds: p.removedIndustryIds.includes(id) ? p.removedIndustryIds : [...p.removedIndustryIds, id],
                industryIntensityOverrides: overrides,
              },
        }),
      );
      if (isAdded) set({ ...NO_SELECTION });
    },

    restoreIndustry(id) {
      const p = get().params;
      set(markScenario({ params: { ...p, removedIndustryIds: p.removedIndustryIds.filter((i) => i !== id) } }));
    },

    rerateIndustry(id, intensity) {
      const p = get().params;
      if (p.addedIndustries.some((i) => i.id === id)) {
        set(
          markScenario({
            params: { ...p, addedIndustries: p.addedIndustries.map((i) => (i.id === id ? { ...i, emissionIntensity: intensity } : i)) },
          }),
        );
      } else {
        set(markScenario({ params: { ...p, industryIntensityOverrides: { ...p.industryIntensityOverrides, [id]: intensity } } }));
      }
    },

    setTargetCells(ids) {
      set(markScenario({ params: { ...get().params, targetCells: ids } }));
    },

    addClosure(closure) {
      const p = get().params;
      set(
        markScenario({
          params: { ...p, roadClosures: [...p.roadClosures.filter((c) => c.roadId !== closure.roadId), closure] },
        }),
      );
    },

    removeClosure(roadId) {
      const p = get().params;
      set(markScenario({ params: { ...p, roadClosures: p.roadClosures.filter((c) => c.roadId !== roadId) } }));
    },

    // ---- sites ----

    addCandidate(location) {
      const { candidates, base } = get();
      if (!base || candidates.length >= MAX_CANDIDATES || !bboxContains(base.city.bbox, location)) return null;
      const id = CANDIDATE_IDS.find((c) => !candidates.some((x) => x.id === c));
      if (!id) return null;
      const cand: CandidateLocation = { id, location };
      set({ candidates: [...candidates, cand] });
      return cand;
    },

    removeCandidate(id) {
      set({
        candidates: get().candidates.filter((c) => c.id !== id),
        ...(get().selectedCandidateId === id ? NO_SELECTION : {}),
      });
    },

    clearCandidates() {
      set({ candidates: [], ...(get().selectedCandidateId ? NO_SELECTION : {}) });
    },

    setSiteProject(patch) {
      set({ siteProject: { ...get().siteProject, ...patch } });
    },

    // ---- geometry ----

    async loadOsm(source) {
      set({ geometryInfo: { ...get().geometryInfo, status: 'loading', message: null, notice: null } });
      try {
        const r = source === 'snapshot' ? await loadOsmSnapshot() : await fetchOsmGeometry();
        await applyGeometry(
          r.geometry,
          {
            status: 'ready',
            source: 'osm',
            origin: source,
            message: null,
            notice: null,
            attribution: r.attribution || OSM_ATTRIBUTION,
            generated: r.generated,
            counts: geometryCounts(r.geometry),
          },
          true,
        );
      } catch (e) {
        set({
          geometryInfo: {
            ...get().geometryInfo,
            status: 'error',
            message: e instanceof Error ? e.message : 'Could not load OpenStreetMap geometry.',
          },
        });
      }
    },

    async useDemoGeometry() {
      await applyGeometry(dataProvider.getDefaultGeometry(), demoInfo(null, null), true);
    },

    // ---- V3: model service and stations ----

    async loadStationCatalog() {
      const verified = await loadAllVerified();
      set({ verified, catalog: buildStationCatalog(get().modelService.stations, verified) });
    },

    async connectModelService() {
      set({ modelService: { ...get().modelService, status: 'connecting', reason: null } });
      const [svc, verified] = await Promise.all([connectModel(get().allowHistoricalForecast), loadAllVerified()]);
      set({ modelService: svc, verified, catalog: buildStationCatalog(svc.stations, verified) });
    },

    async setAllowHistoricalForecast(on) {
      set({ allowHistoricalForecast: on });
      const svc = get().modelService;
      if (svc.status !== 'online') return;
      const { forecasts, errors } = await refetchForecasts(svc.stations, on);
      if (get().allowHistoricalForecast !== on) return; // a newer toggle won
      set({ modelService: { ...get().modelService, forecasts: { ...get().modelService.forecasts, ...forecasts }, errors } });
    },

    async loadAqiHistory(stationName) {
      const h = await fetchAqiHistory(stationName);
      if (h) set({ modelService: { ...get().modelService, aqiHistory: { ...get().modelService.aqiHistory, [stationName]: h } } });
    },

    selectStation(id) {
      set({ ...NO_SELECTION, selectedStationId: id, rightOpen: id !== null });
    },

    setLive(patch) {
      set({ live: { ...get().live, ...patch } });
    },

    // ---- V3: observations and calibration ----

    setObservations(ds) {
      set({ observations: ds && ds.readings.length > 0 ? ds : ds && ds.stations.length > 0 ? ds : null });
      if (!ds || ds.readings.length === 0) get().resetCalibration();
    },

    setWeatherObs(ds) {
      set({ weatherObs: ds && ds.readings.length > 0 ? ds : null });
    },

    setObsWindow(w) {
      set({ obsWindow: w });
    },

    fitModelToObserved() {
      const { base, observations, obsWindow } = get();
      if (!base || !observations) return { ok: false, reason: 'Import air-quality observations first.' };
      const summaries = summariseStations(observations, obsWindow);
      const uncal = computeCellStates({ ...base, calibration: undefined }, defaultParams(base));
      const label = obsWindow.kind === 'last24h' ? 'newest 24 h of the imported data' : 'selected period';
      const fit = fitCalibration(base, uncal, summaries, label);
      if (!fit.ok) return fit;
      const nextBase = { ...base, calibration: { localScale: fit.calibration.localScale, backgroundScale: fit.calibration.backgroundScale } };
      set({ base: nextBase, baseline: scenarioService.baseline(nextBase), calibration: fit.calibration });
      return fit;
    },

    resetCalibration() {
      const { base } = get();
      if (!base) {
        set({ calibration: null });
        return;
      }
      const nextBase = { ...base, calibration: undefined };
      set({ base: nextBase, baseline: scenarioService.baseline(nextBase), calibration: null });
    },

    // ---- V3: industry ----

    async loadIndustry() {
      set({ industry: await loadIndustryData() });
    },

    selectArea(code) {
      set({ ...NO_SELECTION, selectedAreaCode: code, rightOpen: code !== null });
    },

    selectSite(id) {
      set({ ...NO_SELECTION, selectedSiteId: id, rightOpen: id !== null });
    },

    // ---- V4: Plan-It ----

    setPlanItOpen(open) {
      set({ planItOpen: open });
    },

    patchPlan(patch) {
      set({ plan: { ...get().plan, ...patch } });
    },

    runPlan() {
      const { base, plan } = get();
      if (!base) return;
      const outcome = planProject({ base, budget: plan.budget, targetId: plan.targetId, limits: plan.limits, objective: plan.objective, assumptions: plan.assumptions });
      set({ plan: { ...plan, outcome, outcomeKey: planBaseKey(base), view: 'results', selected: 'A' } });
    },
  };
});

/** Recompute the forecast layer from the current stations and forecasts. */
export function deriveForecastLayer(s: Pick<TwinStoreState, 'base' | 'catalog' | 'modelService' | 'pollutant'>): ForecastLayer | null {
  if (!s.base) return null;
  const forecasts: Record<string, import('../services/aeromatrixApi').ApiForecast | undefined> = {};
  for (const [id, f] of Object.entries(s.modelService.forecasts)) {
    if (f && 'pollutants' in f) forecasts[id] = f as import('../services/aeromatrixApi').ApiForecast;
  }
  return buildForecastLayer(s.base, s.catalog.stations, forecasts, s.pollutant);
}

export type TwinStoreState = ReturnType<typeof useTwinStore.getState>;
export type { IndustryCategory };
