import { useEffect, useState } from 'react';
import { Loader2, Moon, Sun, TriangleAlert } from 'lucide-react';
import { LogoMark } from '../components/Brand';
import { startLiveDataWhenReady } from '../services/liveData';
import { useTwinStore } from '../store/useTwinStore';
import { GOV_VIEWS, useGovStore, type GovView } from './govStore';
import { BottomNav, VIEW_LABEL } from './BottomNav';
import { AlertBanner, AlertBell } from './AlertBell';
import { PwaBar } from './Pwa';
import { formatIst } from './lib/format';
import { installBackButton } from './lib/native';
import { HomeView } from './views/HomeView';
import { AlertsView } from './views/AlertsView';
import { MapView } from './views/MapView';
import { StationsView } from './views/StationsView';
import { HotspotsView } from './views/HotspotsView';
import { SimulatorView } from './views/SimulatorView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { useAirData, colorOf } from './lib/airdata';

const THEME_KEY = 'aeromatrix.gov.theme';
type Theme = 'cream' | 'dark';

/** The saved choice, else the phone's own light / dark setting. */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'cream') return saved;
  } catch {
    /* fall through to the system setting */
  }
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'cream';
  } catch {
    return 'cream';
  }
}

const hashView = (hash: string): GovView | null => {
  const k = hash.replace(/^#\/?/, '').toLowerCase();
  return (GOV_VIEWS as string[]).includes(k) ? (k as GovView) : null;
};

export function GovApp() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const view = useGovStore((s) => s.view);
  const setView = useGovStore((s) => s.setView);
  const loading = useTwinStore((s) => s.loading);
  const error = useTwinStore((s) => s.error);
  const hasBase = useTwinStore((s) => s.base !== null);
  const init = useTwinStore((s) => s.init);
  const live = useTwinStore((s) => s.live);
  const ui = useGovStore((s) => s.settings.ui);
  const selectedZoneId = useGovStore((s) => s.selectedZoneId);
  const air = useAirData();
  const accentCategory = (selectedZoneId ? air.zones.find((z) => z.id === selectedZoneId)?.category : null) ?? air.city?.category ?? null;

  // The chosen interface design and the accent that follows the air quality of the place in view.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ui = ui;
    root.style.setProperty('--gov-aqi', accentCategory ? colorOf(accentCategory) : '#2563eb');
  }, [ui, accentCategory]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-cream', theme === 'cream');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* the choice just does not persist */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'cream' ? '#a3263f' : '#1c0a10');
  }, [theme]);

  useEffect(() => {
    const fromHash = hashView(window.location.hash);
    if (fromHash) setView(fromHash);
    const onHash = () => {
      const v = hashView(window.location.hash);
      if (v) setView(v);
    };
    window.addEventListener('hashchange', onHash);
    const unsub = useGovStore.subscribe((s, prev) => {
      if (s.view !== prev.view && hashView(window.location.hash) !== s.view) {
        try {
          window.history.replaceState(null, '', `#${s.view}`);
        } catch {
          /* deep links just will not update */
        }
      }
    });
    const stopLive = startLiveDataWhenReady();
    void init();
    // External feeds: each fails into an honest "no data feed" state and never blocks the app.
    void useTwinStore.getState().connectModelService();
    void useTwinStore.getState().loadIndustry();
    return () => {
      window.removeEventListener('hashchange', onHash);
      unsub();
      stopLive();
    };
  }, [init, setView]);

  // Android back button: close an open panel, then go back to Home, then leave the app.
  useEffect(() => {
    let remove: (() => void) | undefined;
    void installBackButton(() => {
      const g = useGovStore.getState();
      if (g.selectedAlertId || g.selectedHotspotId || g.selectedStationId) {
        g.selectAlert(null);
        g.selectHotspot(null);
        g.selectStation(null);
        return true;
      }
      if (g.view !== 'home') {
        g.setView('home');
        return true;
      }
      return false;
    }).then((r) => {
      remove = r;
    });
    return () => remove?.();
  }, []);

  const liveText =
    live.status === 'ready' && live.lastUpdated
      ? `Updated ${formatIst(live.lastUpdated).replace(/^\d+ \w+ \d+, /, '')}`
      : live.status === 'offline'
        ? 'Offline'
        : 'Updating…';

  return (
    <div className="gov-root flex h-dvh flex-col overflow-hidden bg-ink-950 text-sand-100">
      <PwaBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
      <header className="gov-header absolute inset-x-0 top-0 z-30 flex min-h-12 shrink-0 items-center justify-between gap-3 border border-sand-500/20 bg-ink-900/95 py-1 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMark size={26} />
          <span className="truncate font-display text-[15px] font-bold tracking-tight text-sand-50">
            Aero<span className="text-accent-400">Matrix</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline ${live.status === 'offline' ? 'bg-amber-600/20 text-amber-700' : 'bg-ink-800 text-sand-300'}`} title="Open-Meteo CAMS model data">
            {liveText}
          </span>
          <AlertBell />
          <button
            type="button"
            onClick={() => setTheme(theme === 'cream' ? 'dark' : 'cream')}
            aria-label={theme === 'cream' ? 'Switch to the dark theme' : 'Switch to the light theme'}
            className="gov-tap flex h-11 w-11 items-center justify-center rounded-xl text-sand-200 hover:bg-ink-800"
          >
            {theme === 'cream' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <main className="absolute inset-0 overflow-hidden" aria-label={VIEW_LABEL[view]}>
        {view === 'map' ? (
          <MapView />
        ) : (
          <div key={view} className="gov-view gov-page panel-scroll absolute inset-0 overflow-x-hidden overflow-y-auto">
            {view === 'home' && <HomeView />}
            {view === 'alerts' && <AlertsView />}
            {view === 'stations' && <StationsView />}
            {view === 'hotspots' && <HotspotsView />}
            {view === 'simulator' && <SimulatorView />}
            {view === 'reports' && <ReportsView />}
            {view === 'settings' && <SettingsView />}
          </div>
        )}
        <AlertBanner />
        {loading && !hasBase && (
          <div role="status" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70">
            <div className="flex items-center gap-3 rounded-2xl bg-ink-900 px-5 py-3 text-sm text-sand-100 hairline">
              <Loader2 className="animate-spin" size={18} /> Building the Pune city model…
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/80 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-ink-900 p-5 hairline">
              <div className="mb-2 flex items-center gap-2 font-bold text-accent-300">
                <TriangleAlert size={18} /> Could not load the city model
              </div>
              <p className="mb-4 text-sm text-sand-300">{error}</p>
              <button type="button" onClick={() => void init()} className="gov-tap h-11 w-full rounded-xl bg-accent-500 text-sm font-bold text-white hover:bg-accent-400">
                Try again
              </button>
            </div>
          </div>
        )}
      </main>
      {hasBase && <BottomNav />}
      </div>
    </div>
  );
}
