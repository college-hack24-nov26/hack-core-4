import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Box, FileText, Layers, LocateFixed, Loader2, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useGovStore } from '../govStore';
import { useAirData, type ZoneRow } from '../lib/airdata';
import { coverageGaps } from '../lib/coverage';
import { useHotspots } from '../lib/hotspots';
import { isCapableDesktop, readDevice } from '../lib/capability';
import { useStations } from '../lib/stations';
import { CATEGORIES, CATEGORY_COLOR, POLLUTANT_KEYS, POLLUTANT_NAME } from '../lib/airdata';
import type { HeatMetric } from '../lib/heat';
import { POLLUTANT_RANGE, POLLUTANT_UNIT as UNIT, legendGradient } from '../../utils/colors';
import { formatIst } from '../lib/format';
import { AqiChip, Btn, ForecastStrip, StatusChip, TrendBadge } from '../ui';
import { Sheet } from '../Sheet';
import { AQI_SHORT } from '../../services/cpcbAqi';
import { StationDetail } from './StationDetail';
import { Map2D, type MapLayerId, type MapSelection } from './Map2D';

const Map3D = lazy(() => import('./Map3D'));

/** Re-checked when the window is resized, so a pane that starts narrow or hidden is judged again once it is wide. */
function useCapableDesktop(): boolean {
  const check = () => {
    try {
      return isCapableDesktop(readDevice());
    } catch {
      return false;
    }
  };
  const [capable, setCapable] = useState(check);
  useEffect(() => {
    const on = () => setCapable(check());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return capable;
}

const LAYERS: Array<{ id: MapLayerId; label: string }> = [
  { id: 'heat', label: 'AQI heatmap' },
  { id: 'zones', label: 'Pollution surface (estimated)' },
  { id: 'stations', label: 'Monitoring stations (continuous and manual)' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'coverage', label: 'Monitoring gaps' },
  { id: 'midc', label: 'MIDC areas' },
  { id: 'industry', label: 'Industrial locations' },
];


function ZoneCard({ z, rank }: { z: ZoneRow; rank?: number }) {
  const openReport = useGovStore((s) => s.openReport);
  const openSimulator = useGovStore((s) => s.openSimulator);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <AqiChip aqi={z.aqi} category={z.category} />
        <StatusChip kind="estimated" />
        <TrendBadge trend={z.trend} pct={z.trendPct} />
      </div>
      <p className="text-sm text-sand-300">
        {rank ? `Hotspot ${rank}. ` : ''}Model update {formatIst(z.time)}.
      </p>
      <section>
        <h3 className="gov-eyebrow mb-2">Forecast</h3>
        <ForecastStrip days={z.forecast} />
      </section>
      <section>
        <h3 className="gov-eyebrow mb-3">Why the air is like this</h3>
        {z.causes.length === 0 ? (
          <p className="text-sm text-sand-300">No cause is supported by the available data.</p>
        ) : (
          <ul className="space-y-3">
            {z.causes.map((c) => (
              <li key={c.key} className="rounded-xl bg-ink-800 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium text-sand-50">{c.label}</span>
                  <span className="rounded-full bg-ink-700 px-2.5 py-0.5 text-xs font-medium text-sand-100">{c.strength}</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-sm text-sand-200">
                  {c.evidence.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
                      <span>{e.replace(/ \(DEMO source\)/g, '')}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        <Btn icon={SlidersHorizontal} onClick={() => openSimulator(z.id)}>
          Test an action
        </Btn>
        <Btn variant="primary" icon={FileText} onClick={() => openReport(z.id)}>
          Create report
        </Btn>
      </div>
    </div>
  );
}

export function MapView() {
  const base = useTwinStore((s) => s.base);
  const industry = useTwinStore((s) => s.industry);
  const air = useAirData();
  const st = useStations();
  const hot = useHotspots();
  const focus = useGovStore((s) => s.mapFocus);
  const settings = useGovStore((s) => s.settings);
  const setSettings = useGovStore((s) => s.setSettings);
  const openReport = useGovStore((s) => s.openReport);
  const focusMap = useGovStore((s) => s.focusMap);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [metric, setMetric] = useState<HeatMetric>('pm25');
  const [query, setQuery] = useState('');
  const [me, setMe] = useState<{ lon: number; lat: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<MapLayerId, boolean>>({ heat: true, zones: false, stations: false, hotspots: true, coverage: false, midc: false, industry: false });

  const mode: 'heat' | 'stations' = visible.heat ? 'heat' : 'stations';
  const capable = useCapableDesktop();
  const show3d = capable && settings.map3d;
  const coverage = useMemo(() => (base ? coverageGaps(base.cells, st.placed) : null), [base, st.placed]);

  /** Asks the device for its position once, only when tapped. Nothing is stored or sent anywhere. */
  const locate = () => {
    setLocateNote(null);
    if (!('geolocation' in navigator)) {
      setLocateNote('This device cannot give its location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const here = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy };
        setMe(here);
        focusMap(here.lon, here.lat);
        const cell = base?.cells.find((c) => here.lon >= c.bounds.west && here.lon < c.bounds.east && here.lat >= c.bounds.south && here.lat <= c.bounds.north);
        if (!cell) setLocateNote('You are outside the mapped area.');
        else if (air.zones.some((z) => z.id === cell.id)) setSelection({ kind: 'zone', id: cell.id });
      },
      (err) => {
        setLocating(false);
        setLocateNote(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Your location could not be found.');
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

  const disabled: Partial<Record<MapLayerId, string>> = {};
  if (st.placed.length === 0) disabled.stations = 'No station locations';
  if (coverage?.disabledReason) disabled.coverage = 'No station locations';
  if (!industry || industry.status !== 'loaded') disabled.midc = 'Not available';
  const industryData = industry?.status === 'loaded' ? industry.data : null;
  const eff = (id: MapLayerId) => visible[id] && !disabled[id];

  const zone = selection?.kind === 'zone' ? air.zones.find((z) => z.id === selection.id) : undefined;
  const hotspot = selection?.kind === 'hotspot' ? hot.zones.find((h) => h.id === selection.id) : undefined;
  const station = selection?.kind === 'station' ? st.placed.find((s) => s.id === selection.id) : undefined;
  const midc = selection?.kind === 'midc' ? industryData?.areas.find((a) => String(a.code) === selection.id) : undefined;
  const gap = selection?.kind === 'gap' ? coverage?.gaps.find((g) => g.id === selection.id) : undefined;
  const gapZone = gap ? air.zones.find((z) => z.id === gap.id) : undefined;

  return (
    <div className="absolute inset-0">
      {show3d ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-sand-300">
              <Loader2 className="mr-2 animate-spin" size={16} /> Loading the 3D map…
            </div>
          }
        >
          <Map3D />
        </Suspense>
      ) : (
        <Map2D
          base={base}
          visible={{ heat: eff('heat'), zones: eff('zones'), stations: eff('stations'), hotspots: eff('hotspots'), coverage: eff('coverage'), midc: eff('midc'), industry: eff('industry') }}
          zones={air.zones}
          metric={metric}
          stations={st.placed}
          hotspots={hot.zones}
          coverage={coverage}
          industry={industryData}
          focus={focus}
          me={me}
          simplify={!capable}
          onSelect={setSelection}
        />
      )}

      <div className="absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2">
        {!show3d && (
          <div className="relative w-full max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sand-400" />
            <input
              type="search"
              list="map-places"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                const z = air.zones.find((x) => x.place.toLowerCase() === e.target.value.trim().toLowerCase());
                if (z) {
                  focusMap(z.location[0], z.location[1]);
                  setSelection({ kind: 'zone', id: z.id });
                }
              }}
              placeholder="Search a place"
              aria-label="Search a place"
              className="gov-tap h-11 w-full rounded-2xl border border-white/60 bg-ink-900/95 pl-10 pr-3 text-sm text-sand-50 shadow-lg backdrop-blur placeholder:text-sand-500"
            />
            <datalist id="map-places">
              {[...new Set(air.zones.map((z) => z.place))].sort().map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        )}
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {!show3d && (
            <div role="radiogroup" aria-label="Map view" className="flex shrink-0 rounded-2xl bg-ink-900/95 p-1 shadow-lg backdrop-blur">
              {(['heat', 'stations'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setVisible({ ...visible, heat: m === 'heat', stations: m === 'stations' })}
                  className={`gov-tap min-h-9 rounded-xl px-3.5 text-sm font-semibold transition-colors ${mode === m ? 'bg-accent-500 text-white' : 'text-sand-200'}`}
                >
                  {m === 'heat' ? 'Heatmap' : 'Stations'}
                </button>
              ))}
            </div>
          )}
          {!show3d && (
            <Btn icon={Layers} onClick={() => setPanelOpen((v) => !v)} className="shrink-0 !bg-ink-900/95 shadow-lg backdrop-blur" ariaLabel="Map layers">
              Layers
            </Btn>
          )}
          {!show3d && (
            <Btn icon={locating ? Loader2 : LocateFixed} onClick={locate} disabled={locating} className="shrink-0 !bg-ink-900/95 shadow-lg backdrop-blur" ariaLabel="Show my location">
              {locating ? 'Locating…' : 'Me'}
            </Btn>
          )}
          {capable && (
            <Btn icon={show3d ? MapIcon : Box} onClick={() => setSettings({ map3d: !show3d })} className="shrink-0 !bg-ink-900/95 shadow-lg backdrop-blur">
              {show3d ? '2D' : '3D'}
            </Btn>
          )}
        </div>
        {!show3d && mode === 'heat' && (
          <div role="tablist" aria-label="Pollutant" className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(['aqi', ...POLLUTANT_KEYS] as HeatMetric[]).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={metric === k}
                onClick={() => setMetric(k)}
                className={`gov-tap min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold shadow-md backdrop-blur ${metric === k ? 'bg-accent-500 text-white' : 'bg-ink-900/95 text-sand-100'}`}
              >
                {k === 'aqi' ? 'AQI' : POLLUTANT_NAME[k]}
              </button>
            ))}
          </div>
        )}
        {locateNote && !show3d && (
          <p role="status" className="max-w-xs rounded-xl bg-ink-950 p-3 text-sm text-sand-100 shadow-lg">
            {locateNote}
          </p>
        )}
        {panelOpen && !show3d && (
          <div className="gov-card panel-scroll max-h-[60dvh] w-72 max-w-full !p-3">
            <ul>
              {LAYERS.map((l) => (
                <li key={l.id}>
                  <label className={`gov-tap flex min-h-11 items-center gap-3 px-2 text-sm ${disabled[l.id] ? 'opacity-55' : ''}`}>
                    <input type="checkbox" className="h-5 w-5 accent-accent-500" checked={visible[l.id] && !disabled[l.id]} disabled={!!disabled[l.id]} onChange={(e) => setVisible({ ...visible, [l.id]: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block text-sand-50">{l.label}</span>
                      {disabled[l.id] && <span className="block text-xs text-sand-400">{disabled[l.id]}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {coverage && !coverage.disabledReason && (
              <p className="mt-2 border-t border-sand-500/15 px-2 pt-3 text-xs text-sand-300">
                Hatched areas have no working station within {coverage.radiusKm} km: {coverage.gaps.length} of {coverage.total} areas.
              </p>
            )}
          </div>
        )}
      </div>

      {!show3d && (
        <div className="pointer-events-none absolute bottom-24 right-3 z-10 hidden max-w-[210px] rounded-2xl bg-ink-950/95 p-3 text-xs text-sand-200 shadow-lg sm:block">
          {metric === 'aqi' || mode === 'stations' ? (
            <>
              <div className="mb-1.5 font-semibold text-sand-100">Air quality index (US)</div>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
                {CATEGORIES.map((c) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLOR[c] }} />
                    {AQI_SHORT[c]}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="mb-1.5 font-semibold text-sand-100">{POLLUTANT_NAME[metric as keyof typeof POLLUTANT_NAME]}</div>
              <div className="h-2.5 w-full rounded-full" style={{ background: legendGradient() }} />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-sand-300">
                <span>{POLLUTANT_RANGE[metric as keyof typeof POLLUTANT_RANGE][0]}</span>
                <span>{(POLLUTANT_RANGE[metric as keyof typeof POLLUTANT_RANGE][0] + POLLUTANT_RANGE[metric as keyof typeof POLLUTANT_RANGE][1]) / 2}</span>
                <span>{POLLUTANT_RANGE[metric as keyof typeof POLLUTANT_RANGE][1]}+</span>
              </div>
              <div className="mt-1 text-sand-400">{UNIT[metric as keyof typeof UNIT]} (colour scale)</div>
            </>
          )}
          <div className="mt-2 flex items-center gap-2 text-sand-300">
            <span className="h-3 w-3 rounded-full border-2 border-ink-950 bg-sand-400" /> Continuous station
          </div>
          <div className="mt-1 flex items-center gap-2 text-sand-300">
            <span className="h-2.5 w-2.5 rotate-45 border-2 border-ink-950 bg-sand-400" /> Manual station
          </div>
          <div className="mt-1 text-sand-400">A dashed ring means the reading is outdated.</div>
        </div>
      )}

      {air.zones.length === 0 && !show3d && (
        <div role="status" className="absolute inset-x-3 top-44 z-10 mx-auto max-w-md rounded-2xl bg-ink-950/95 p-4 text-sm text-sand-100 shadow-lg">
          <b>No area readings right now.</b> {air.reason ?? 'Model data has not arrived.'}
        </div>
      )}

      {zone && (
        <Sheet full title={zone.place} subtitle="Area" onClose={() => setSelection(null)}>
          <ZoneCard z={zone} />
        </Sheet>
      )}
      {hotspot && hotspot.zone && (
        <Sheet full title={hotspot.name} subtitle="Hotspot" onClose={() => setSelection(null)}>
          <ZoneCard z={hotspot.zone} rank={hot.zones.findIndex((h) => h.id === hotspot.id) + 1} />
        </Sheet>
      )}
      {station && <StationDetail key={station.id} s={station} onClose={() => setSelection(null)} />}
      {midc && (
        <Sheet title={midc.name} subtitle="MIDC area" onClose={() => setSelection(null)}>
          <p className="text-sm text-sand-300">
            {midc.category ?? 'Industrial estate'}
            {midc.areaHa ? ` · ${midc.areaHa.toFixed(0)} ha` : ''}
          </p>
        </Sheet>
      )}
      {gap && (
        <Sheet title="Monitoring gap" subtitle={gapZone?.place ?? 'Area'} onClose={() => setSelection(null)}>
          <div className="space-y-4 text-sm text-sand-200">
            <p>
              No working station lies within {coverage?.radiusKm} km.{gap.nearest ? ` The nearest is ${gap.nearest.name}, ${gap.nearest.km.toFixed(1)} km away.` : ''}
            </p>
            {gapZone && (
              <Btn variant="primary" icon={FileText} onClick={() => openReport(gapZone.id)}>
                Create report
              </Btn>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
