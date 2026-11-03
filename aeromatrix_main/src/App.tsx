import { useEffect } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { OrbitNav } from './components/OrbitNav';
import { IntroOverlay } from './components/IntroOverlay';
import { BottomPanel } from './components/BottomPanel';
import { Toast } from './components/Toast';
import { PlanItPanel } from './plan/PlanItPanel';
import { CesiumMap } from './map/CesiumMap';
import { MapLegend } from './map/MapLegend';
import { useTwinStore } from './store/useTwinStore';
import { startLiveScenario } from './store/liveScenario';
import { startDerived } from './store/derived';
import { startLiveDataWhenReady } from './services/liveData';
import { parseDeepLink } from './deepLink';

function LoadingOverlay() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink-950/60"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-ink-900 px-5 py-3 text-sm text-sand-100 hairline">
        <Loader2 className="animate-spin" size={18} />
        Building the Pune city model…
      </div>
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  const init = useTwinStore((s) => s.init);
  return (
    <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-ink-900 p-5 hairline">
        <div className="mb-2 flex items-center gap-2 font-bold text-accent-300">
          <TriangleAlert size={18} /> Could not load the city model
        </div>
        <p className="mb-4 text-sm text-sand-300">{message}</p>
        <button
          type="button"
          onClick={() => void init()}
          className="h-11 w-full rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function App() {
  const loading = useTwinStore((s) => s.loading);
  const error = useTwinStore((s) => s.error);
  const hasBase = useTwinStore((s) => s.base !== null);
  const init = useTwinStore((s) => s.init);

  useEffect(() => {
    // Deep link at startup: #/air, #scenarios, ?section=simulator ...
    const open = (sec: ReturnType<typeof parseDeepLink>) => {
      if (!sec) return;
      const st = useTwinStore.getState();
      if (sec !== st.section) st.setSection(sec);
      st.setLeftOpen(true);
    };
    open(parseDeepLink(window.location.hash, window.location.search));
    const onHash = () => open(parseDeepLink(window.location.hash, ''));
    window.addEventListener('hashchange', onHash);
    const unsubSection = useTwinStore.subscribe((s, prev) => {
      if (s.section !== prev.section && parseDeepLink(window.location.hash, '') !== s.section) {
        try {
          window.history.replaceState(null, '', `#${s.section}`);
        } catch {
          /* history unavailable: deep links just will not update */
        }
      }
    });
    const stopLive = startLiveScenario();
    const stopDerived = startDerived();
    const stopLiveData = startLiveDataWhenReady();
    void init();
    // External feeds: each one fails into an honest "unavailable" state and never blocks the app.
    void useTwinStore.getState().connectModelService();
    void useTwinStore.getState().loadIndustry();
    return () => {
      window.removeEventListener('hashchange', onHash);
      unsubSection();
      stopLive();
      stopDerived();
      stopLiveData();
    };
  }, [init]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-950 text-sand-100">
      <Header />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <CesiumMap />
        <MapLegend />
        {hasBase && (
          <>
            <LeftPanel />
            <RightPanel />
            <OrbitNav />
          </>
        )}
        <PlanItPanel />
        <Toast />
        <IntroOverlay />
        {loading && !hasBase && <LoadingOverlay />}
        {error && <ErrorOverlay message={error} />}
      </main>
      <BottomPanel />
    </div>
  );
}
