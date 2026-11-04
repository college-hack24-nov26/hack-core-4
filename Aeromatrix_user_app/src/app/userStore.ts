import { create } from 'zustand';

export type UserView = 'home' | 'map' | 'stations' | 'shop' | 'settings';
export const USER_VIEWS: UserView[] = ['home', 'map', 'stations', 'shop', 'settings'];

/** Classic is the warm original look; glass and glass-adv are the blue and white frosted designs. */
export type UiTheme = 'classic' | 'glass' | 'glass-adv';

export interface UserSettings {
  ui: UiTheme;
}

export type ComplaintState = 'sent' | 'queued';

/** A complaint this phone has filed. Files are uploaded when it is sent; only their names are kept here. */
export interface ComplaintRecord {
  /** local id */
  id: string;
  /** the reference the authorities' service gave it, once sent */
  reference?: string;
  stationId: string;
  stationName: string;
  text: string;
  files: string[];
  createdAt: number;
  state: ComplaintState;
  /** latest status read back from the authorities' service */
  remoteStatus?: string;
}

export type DeviceState = 'saved' | 'connected';

/** The AeroMatrix prototype this user added. */
export interface DeviceRecord {
  deviceId: string;
  label: string;
  addedAt: number;
  state: DeviceState;
  lastSyncAt: number | null;
  /** the newest reading the device sent, when there is one */
  reading: DeviceReading | null;
}

export interface DeviceReading {
  at: number;
  pm25: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
}

export const SETTINGS_KEY = 'aeromatrix.user.settings.v1';
export const COMPLAINTS_KEY = 'aeromatrix.user.complaints.v1';
export const DEVICE_KEY = 'aeromatrix.user.device.v1';

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
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the records stay in memory for this session */
  }
}

const isObject = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
const validComplaints = (x: unknown) => Array.isArray(x) && x.every((c) => isObject(c) && typeof (c as ComplaintRecord).id === 'string' && Array.isArray((c as ComplaintRecord).files));
const validDevice = (x: unknown) => isObject(x) && typeof (x as DeviceRecord).deviceId === 'string';

export interface UserState {
  view: UserView;
  selectedStationId: string | null;
  /** the area chosen on Home (null = the whole city) */
  selectedZoneId: string | null;
  mapFocus: { lon: number; lat: number; nonce: number } | null;
  settings: UserSettings;
  complaints: ComplaintRecord[];
  device: DeviceRecord | null;

  setView: (v: UserView) => void;
  selectStation: (id: string | null) => void;
  selectZone: (id: string | null) => void;
  focusMap: (lon: number, lat: number) => void;
  setSettings: (patch: Partial<UserSettings>) => void;
  addComplaint: (c: ComplaintRecord) => void;
  updateComplaint: (id: string, patch: Partial<ComplaintRecord>) => void;
  setDevice: (d: DeviceRecord | null) => void;
  patchDevice: (patch: Partial<DeviceRecord>) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  view: 'home',
  selectedStationId: null,
  selectedZoneId: null,
  mapFocus: null,
  settings: { ui: 'glass-adv', ...read<Partial<UserSettings>>(SETTINGS_KEY, {}, isObject) },
  complaints: read<ComplaintRecord[]>(COMPLAINTS_KEY, [], validComplaints),
  device: read<DeviceRecord | null>(DEVICE_KEY, null, validDevice),

  setView: (view) => set({ view }),
  selectStation: (id) => set({ selectedStationId: id }),
  selectZone: (id) => set({ selectedZoneId: id }),
  focusMap: (lon, lat) => set({ mapFocus: { lon, lat, nonce: Date.now() } }),
  setSettings(patch) {
    const next = { ...get().settings, ...patch };
    write(SETTINGS_KEY, next);
    set({ settings: next });
  },
  addComplaint(c) {
    const next = [c, ...get().complaints].slice(0, 50);
    write(COMPLAINTS_KEY, next);
    set({ complaints: next });
  },
  updateComplaint(id, patch) {
    const next = get().complaints.map((c) => (c.id === id ? { ...c, ...patch } : c));
    write(COMPLAINTS_KEY, next);
    set({ complaints: next });
  },
  setDevice(d) {
    write(DEVICE_KEY, d);
    set({ device: d });
  },
  patchDevice(patch) {
    const cur = get().device;
    if (!cur) return;
    const next = { ...cur, ...patch };
    write(DEVICE_KEY, next);
    set({ device: next });
  },
}));
