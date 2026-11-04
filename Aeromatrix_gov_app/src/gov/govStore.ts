import { create } from 'zustand';
import type { MeasureSelection } from './lib/measures';
import { NO_MEASURES } from './lib/measures';

export type GovView = 'home' | 'alerts' | 'map' | 'stations' | 'hotspots' | 'simulator' | 'reports' | 'complaints' | 'settings';
export const GOV_VIEWS: GovView[] = ['home', 'alerts', 'map', 'stations', 'hotspots', 'simulator', 'reports', 'complaints', 'settings'];

/** Classic is the original look; glass is the blue and white glassmorphism look. */
export type UiTheme = 'classic' | 'glass' | 'glass-adv';

export type AlertStatus = 'new' | 'acknowledged' | 'assigned' | 'resolved';

export interface AlertInstruction {
  to: string;
  /** YYYY-MM-DD */
  deadline: string;
  message: string;
  /** when the Commissioner approved the instruction (the app itself never sends anything) */
  sentAt: number;
}

export interface AlertRecord {
  status: AlertStatus;
  firstSeen: number;
  acknowledgedAt?: number;
  instruction?: AlertInstruction;
  resolvedAt?: number;
  note?: string;
}

/** A simulation saved by the Commissioner. Every value is a Simulation result, never a measurement. */
export interface GovSavedScenario {
  id: string;
  name: string;
  savedAt: string;
  target: { id: string; label: string };
  measures: string[];
  weeks: number;
  baselinePm25: number;
  projectedPm25: number;
  changePct: number;
  lowPct: number;
  oneTime: number;
  recurring: number;
  zonesImproved: number;
  /** what was selected, so the report can rebuild the cost lines */
  selection: MeasureSelection;
}

export interface GovSettings {
  /** show the Cesium 3D map instead of the 2D map (only offered on capable desktops) */
  map3d: boolean;
  /** the interface design; the data and features are identical in both */
  ui: UiTheme;
}

export const ALERTS_KEY = 'aeromatrix.gov.alerts.v1';
export const SCENARIOS_KEY = 'aeromatrix.gov.scenarios.v1';
export const SETTINGS_KEY = 'aeromatrix.gov.settings.v1';

function read<T>(key: string, fallback: T, valid: (x: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the records stay in memory for this session */
  }
}

const isObject = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);

export interface GovState {
  view: GovView;
  selectedZoneId: string | null;
  selectedStationId: string | null;
  selectedHotspotId: string | null;
  selectedAlertId: string | null;
  /** the measures being tried in the Simulator */
  measures: MeasureSelection;
  simTargetId: string | null;
  /** the scenario chosen for the report (null = the live Simulator selection) */
  reportScenarioId: string | null;
  alertRecords: Record<string, AlertRecord>;
  scenarios: GovSavedScenario[];
  settings: GovSettings;
  /** a map fly-to request from a card or the locate button */
  mapFocus: { lon: number; lat: number; nonce: number } | null;

  setView: (v: GovView) => void;
  selectZone: (id: string | null) => void;
  selectStation: (id: string | null) => void;
  selectHotspot: (id: string | null) => void;
  selectAlert: (id: string | null) => void;
  setMeasures: (patch: Partial<MeasureSelection>) => void;
  resetMeasures: () => void;
  setSimTarget: (id: string | null) => void;
  setReportScenario: (id: string | null) => void;
  /** register alerts the first time they are shown, so "new" and firstSeen persist */
  markSeen: (ids: string[], nowMs?: number) => void;
  acknowledge: (id: string, nowMs?: number) => void;
  assign: (id: string, instruction: Omit<AlertInstruction, 'sentAt'>, nowMs?: number) => void;
  resolve: (id: string, note: string, nowMs?: number) => void;
  saveScenario: (s: GovSavedScenario) => void;
  deleteScenario: (id: string) => void;
  setSettings: (patch: Partial<GovSettings>) => void;
  focusMap: (lon: number, lat: number) => void;
  /** shortcut used by cards and map markers: prepare a report (or a simulation) for a zone */
  openReport: (zoneId: string | null) => void;
  openSimulator: (zoneId: string | null) => void;
}

const validRecords = (x: unknown) =>
  isObject(x) &&
  Object.values(x as Record<string, unknown>).every(
    (r) => isObject(r) && ['new', 'acknowledged', 'assigned', 'resolved'].includes((r as AlertRecord).status) && typeof (r as AlertRecord).firstSeen === 'number',
  );
const validScenarios = (x: unknown) => Array.isArray(x) && x.every((s) => isObject(s) && typeof (s as GovSavedScenario).id === 'string' && isObject((s as GovSavedScenario).selection));

export const useGovStore = create<GovState>((set, get) => {
  const patchRecord = (id: string, make: (prev: AlertRecord | undefined) => AlertRecord) => {
    const next = { ...get().alertRecords, [id]: make(get().alertRecords[id]) };
    write(ALERTS_KEY, next);
    set({ alertRecords: next });
  };
  return {
    view: 'home',
    selectedZoneId: null,
    selectedStationId: null,
    selectedHotspotId: null,
    selectedAlertId: null,
    measures: { ...NO_MEASURES },
    simTargetId: null,
    reportScenarioId: null,
    alertRecords: read<Record<string, AlertRecord>>(ALERTS_KEY, {}, validRecords),
    scenarios: read<GovSavedScenario[]>(SCENARIOS_KEY, [], validScenarios),
    settings: { map3d: false, ui: 'classic', ...read<Partial<GovSettings>>(SETTINGS_KEY, {}, isObject) },
    mapFocus: null,

    setView: (view) => set({ view }),
    selectZone: (id) => set({ selectedZoneId: id }),
    selectStation: (id) => set({ selectedStationId: id }),
    selectHotspot: (id) => set({ selectedHotspotId: id }),
    selectAlert: (id) => set({ selectedAlertId: id }),
    setMeasures: (patch) => set({ measures: { ...get().measures, ...patch } }),
    resetMeasures: () => set({ measures: { ...NO_MEASURES } }),
    setSimTarget: (id) => set({ simTargetId: id }),
    setReportScenario: (id) => set({ reportScenarioId: id }),

    markSeen(ids, nowMs = Date.now()) {
      const cur = get().alertRecords;
      const missing = ids.filter((id) => !cur[id]);
      if (missing.length === 0) return;
      const next = { ...cur };
      for (const id of missing) next[id] = { status: 'new', firstSeen: nowMs };
      write(ALERTS_KEY, next);
      set({ alertRecords: next });
    },
    acknowledge(id, nowMs = Date.now()) {
      patchRecord(id, (p) => {
        const prev = p ?? { status: 'new' as const, firstSeen: nowMs };
        return prev.status === 'new' ? { ...prev, status: 'acknowledged', acknowledgedAt: nowMs } : prev;
      });
    },
    assign(id, instruction, nowMs = Date.now()) {
      patchRecord(id, (p) => {
        const prev = p ?? { status: 'new' as const, firstSeen: nowMs };
        return { ...prev, status: 'assigned', acknowledgedAt: prev.acknowledgedAt ?? nowMs, instruction: { ...instruction, sentAt: nowMs } };
      });
    },
    resolve(id, note, nowMs = Date.now()) {
      patchRecord(id, (p) => {
        const prev = p ?? { status: 'new' as const, firstSeen: nowMs };
        return { ...prev, status: 'resolved', resolvedAt: nowMs, note: note.trim() || undefined };
      });
    },
    saveScenario(s) {
      const next = [s, ...get().scenarios.filter((x) => x.id !== s.id)];
      write(SCENARIOS_KEY, next);
      set({ scenarios: next });
    },
    deleteScenario(id) {
      const next = get().scenarios.filter((s) => s.id !== id);
      write(SCENARIOS_KEY, next);
      set({ scenarios: next, reportScenarioId: get().reportScenarioId === id ? null : get().reportScenarioId });
    },
    setSettings(patch) {
      const next = { ...get().settings, ...patch };
      write(SETTINGS_KEY, next);
      set({ settings: next });
    },
    focusMap(lon, lat) {
      set({ mapFocus: { lon, lat, nonce: Date.now() } });
    },
    openReport(zoneId) {
      set({ view: 'reports', simTargetId: zoneId ?? get().simTargetId, selectedZoneId: zoneId ?? get().selectedZoneId, reportScenarioId: null });
    },
    openSimulator(zoneId) {
      set({ view: 'simulator', simTargetId: zoneId ?? get().simTargetId, selectedZoneId: zoneId ?? get().selectedZoneId });
    },
  };
});
