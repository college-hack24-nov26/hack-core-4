import { create } from 'zustand';
import type { BaseState, CellState, Pollutant, Section } from '../types';
import { dataProvider } from '../services/dataProvider';
import { scenarioService } from '../services/scenarioService';
import { zonePlaceNames } from '../utils/zones';

export type MapStatus = 'idle' | 'loading' | 'ready' | 'error';
/** V1 only has 'baseline'; V2 adds scenario/delta modes without restructuring. */
export type DisplayMode = 'baseline';

const INTRO_KEY = 'aeromatrix.introSeen.v1';

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

export interface FocusRequest {
  cellId: string;
  nonce: number;
}

interface TwinState {
  loading: boolean;
  error: string | null;
  base: BaseState | null;
  gridSize: number;
  pollutant: Pollutant;
  displayMode: DisplayMode;
  baseline: CellState[];
  placeNames: Record<string, string>;
  selectedCellId: string | null;
  section: Section;
  leftOpen: boolean;
  rightOpen: boolean;
  introOpen: boolean;
  bottomOpen: boolean;
  mapStatus: MapStatus;
  mapMessage: string | null;
  focusRequest: FocusRequest | null;

  init: (gridSize?: number) => Promise<void>;
  setGridSize: (n: number) => Promise<void>;
  setPollutant: (p: Pollutant) => void;
  selectCell: (id: string | null) => void;
  focusCell: (id: string) => void;
  setSection: (s: Section) => void;
  setLeftOpen: (open: boolean) => void;
  setIntroOpen: (open: boolean) => void;
  setMapStatus: (status: MapStatus, message?: string | null) => void;
}

let initToken = 0;

export const useTwinStore = create<TwinState>((set, get) => ({
  loading: true,
  error: null,
  base: null,
  gridSize: 10,
  pollutant: 'pm25',
  displayMode: 'baseline',
  baseline: [],
  placeNames: {},
  selectedCellId: null,
  section: 'overview',
  leftOpen: true,
  rightOpen: false,
  introOpen: !introSeen(),
  bottomOpen: false,
  mapStatus: 'idle',
  mapMessage: null,
  focusRequest: null,

  async init(gridSize = get().gridSize) {
    const token = ++initToken;
    set({ loading: true, error: null, gridSize });
    try {
      const base = await dataProvider.getBaseState(gridSize);
      if (token !== initToken) return;
      const baseline = scenarioService.baseline(base);
      set({
        base,
        baseline,
        placeNames: zonePlaceNames(base.cells),
        loading: false,
        selectedCellId: null,
        rightOpen: false,
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
    set({ selectedCellId: id, rightOpen: id !== null });
  },

  focusCell(id) {
    set({ selectedCellId: id, rightOpen: true, focusRequest: { cellId: id, nonce: Date.now() } });
  },

  setSection(s) {
    set({ section: s });
  },

  setLeftOpen(open) {
    set({ leftOpen: open });
  },

  setIntroOpen(open) {
    if (!open) markIntroSeen();
    set({ introOpen: open });
  },

  setMapStatus(status, message = null) {
    set({ mapStatus: status, mapMessage: message });
  },
}));
