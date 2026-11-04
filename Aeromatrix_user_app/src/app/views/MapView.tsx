import { useMemo, useState } from 'react';
import { Loader2, LocateFixed, Search } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { AQI_SHORT } from '../../services/cpcbAqi';
import { useUserStore } from '../userStore';
import { useAirData, CATEGORIES, CATEGORY_COLOR } from '../lib/airdata';
import { useStations } from '../lib/stations';
import { Btn } from '../ui';
import { Map2D } from './Map2D';
import { StationDetail } from './StationDetail';

/** The map of monitoring stations, with a place search and a "Me" button. Tapping a station opens its details. */
export function MapView() {
  const base = useTwinStore((s) => s.base);
  const air = useAirData();
  const st = useStations();
  const focus = useUserStore((s) => s.mapFocus);
  const focusMap = useUserStore((s) => s.focusMap);
  const selectedId = useUserStore((s) => s.selectedStationId);
  const select = useUserStore((s) => s.selectStation);
  const [me, setMe] = useState<{ lon: number; lat: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    return air.zones.filter((z) => z.place.toLowerCase().includes(q) && z.place.toLowerCase() !== q && !seen.has(z.place) && (seen.add(z.place), true)).slice(0, 6);
  }, [air.zones, query]);

  /** Asks the device for its position once, only when tapped. Nothing is stored or sent anywhere. */
  const locate = () => {
    setNote(null);
    if (!('geolocation' in navigator)) {
      setNote('This device cannot give its location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const here = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy };
        setMe(here);
        focusMap(here.lon, here.lat);
      },
      (err) => {
        setLocating(false);
        setNote(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Your location could not be found.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  if (!base) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-sand-300">
        <Loader2 className="mr-2 animate-spin" size={16} /> Loading the map…
      </div>
    );
  }

  const station = st.placed.find((s) => s.id === selectedId);

  return (
    <div className="absolute inset-0">
      <Map2D base={base} stations={st.placed} focus={focus} me={me} onSelectStation={select} />

      <div className="absolute inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-10 flex flex-col items-start gap-2">
        <div className="relative w-full max-w-md">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place"
            aria-label="Search a place"
            autoComplete="off"
            className="gov-tap h-12 w-full rounded-2xl border-2 border-accent-500/40 bg-white pl-11 pr-3 text-[15px] font-medium text-slate-900 shadow-xl placeholder:font-normal placeholder:text-slate-500 focus:border-accent-500"
          />
          {suggestions.length > 0 && (
            <ul role="listbox" className="animate-rise absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-sand-400/20 bg-ink-950 p-1.5 shadow-2xl backdrop-blur-xl">
              {suggestions.map((z) => (
                <li key={z.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(z.place);
                      focusMap(z.location[0], z.location[1]);
                    }}
                    className="gov-tap flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm text-sand-100 hover:bg-ink-800"
                  >
                    <span className="truncate">{z.place}</span>
                    <span className="shrink-0 text-xs text-sand-400">AQI {z.aqi}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Btn icon={locating ? Loader2 : LocateFixed} onClick={locate} disabled={locating} className="shrink-0 !bg-ink-900/95 shadow-lg backdrop-blur" ariaLabel="Show my location">
          {locating ? 'Locating…' : 'Me'}
        </Btn>
        {note && (
          <p role="status" className="max-w-xs rounded-xl bg-ink-950 p-3 text-sm text-sand-100 shadow-lg">
            {note}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-24 right-3 z-10 hidden max-w-[210px] rounded-2xl bg-ink-950/95 p-3 text-xs text-sand-200 shadow-lg sm:block">
        <div className="mb-1.5 font-semibold text-sand-100">Air quality index (US)</div>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLOR[c] }} />
              {AQI_SHORT[c]}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-2 text-sand-300">
          <span className="h-3 w-3 rounded-full border-2 border-ink-950 bg-sand-400" /> Continuous station
        </div>
        <div className="mt-1 flex items-center gap-2 text-sand-300">
          <span className="h-2.5 w-2.5 rotate-45 border-2 border-ink-950 bg-sand-400" /> Manual station
        </div>
        <div className="mt-1 text-sand-400">A dashed ring means the reading is outdated.</div>
      </div>

      {st.placed.length === 0 && (
        <div role="status" className="absolute inset-x-3 top-64 z-10 mx-auto max-w-md rounded-2xl bg-ink-950/95 p-4 text-sm text-sand-100 shadow-lg">
          <b>No stations to show on the map yet.</b> The station list is still loading.
        </div>
      )}

      {station && <StationDetail key={station.id} s={station} onClose={() => select(null)} />}
    </div>
  );
}
