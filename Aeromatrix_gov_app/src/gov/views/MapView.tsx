import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Box, FileText, Layers, Loader2, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useGovStore } from '../govStore';
import { useAirData, type ZoneRow } from '../lib/airdata';
import { coverageGaps } from '../lib/coverage';
import { useHotspots } from '../lib/hotspots';
import { isCapableDesktop, readDevice } from '../lib/capability';
import { nearestZone } from '../lib/hotspots';
import { useStations, STATUS_LABEL, type StationRow } from '../lib/stations';
import { CATEGORIES, CATEGORY_COLOR } from '../lib/airdata';
import { formatIst } from '../lib/format';
import { AqiChip, Btn, ForecastStrip, StatusChip, TrendBadge, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';
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
  { id: 'zones', label: 'Zones (model estimate)' },
  { id: 'stations', label: 'Verified stations' },
  { id: 'hotspots', label: 'Top hotspots' },
  { id: 'coverage', label: 'Coverage gaps' },
  { id: 'midc', label: 'MIDC estates' },
  { id: 'industry', label: 'Industry markers' },
];

const chipOf = (s: StationRow['status']): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

function ZoneCard({ z, rank }: { z: ZoneRow; rank?: number }) {
  const openReport = useGovStore((s) => s.openReport);
  const openSimulator = useGovStore((s) => s.openSimulator);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AqiChip aqi={z.aqi} category={z.category} />
        <StatusChip kind="estimated" />
        <TrendBadge trend={z.trend} pct={z.trendPct} />
      </div>
      <p className="text-xs text-sand-300">
        {rank ? `Hotspot number ${rank}. ` : ''}Model hour {formatIst(z.time)}. An estimate from CAMS model data (about 40 km resolution), not a station reading.
      </p>
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Outlook</h3>
        <ForecastStrip days={z.forecast} />
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Possible causes (with evidence)</h3>
        {z.causes.length === 0 ? (
          <p className="text-xs text-sand-300">No cause could be shown with evidence.</p>
        ) : (
          <ul className="space-y-1 text-xs text-sand-100">
            {z.causes.map((c) => (
              <li key={c.key}>
                <b>{c.label}</b> ({c.strength.toLowerCase()}): {c.evidence[0]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn icon={SlidersHorizontal} onClick={() => openSimulator(z.id)}>Test an action</Btn>
        <Btn variant="primary" icon={FileText} onClick={() => openReport(z.id)}>Create report</Btn>
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
  const [selection, setSelection] = useState<MapSelection>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [visible, setVisible] = useState<Record<MapLayerId, boolean>>({ zones: true, stations: true, hotspots: true, coverage: false, midc: false, industry: false });

  const capable = useCapableDesktop();
  const show3d = capable && settings.map3d;
  const coverage = useMemo(() => (base ? coverageGaps(base.cells, st.placed) : null), [base, st.placed]);

  if (!base) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-sand-300">
        <Loader2 className="mr-2 animate-spin" size={16} /> Building the city model…
      </div>
    );
  }

  const disabled: Partial<Record<MapLayerId, string>> = {};
  if (st.placed.length === 0) disabled.stations = 'Sourced station coordinates not loaded';
  if (coverage?.disabledReason) disabled.coverage = coverage.disabledReason;
  if (!industry || industry.status !== 'loaded') disabled.midc = 'Industry dataset not loaded';
  const industryData = industry?.status === 'loaded' ? industry.data : null;
  const eff = (id: MapLayerId) => visible[id] && !disabled[id];

  const zone = selection?.kind === 'zone' ? air.zones.find((z) => z.id === selection.id) : undefined;
  const hotspot = selection?.kind === 'hotspot' ? hot.zones.find((h) => h.id === selection.id) : undefined;
  const station = selection?.kind === 'station' ? st.placed.find((s) => s.id === selection.id) : undefined;
  const midc = selection?.kind === 'midc' ? industryData?.areas.find((a) => String(a.code) === selection.id) : undefined;
  const gap = selection?.kind === 'gap' ? coverage?.gaps.find((g) => g.id === selection.id) : undefined;
  const gapZone = gap ? air.zones.find((z) => z.id === gap.id) : undefined;
  const stationZone = station ? nearestZone(air.zones, [station.lon, station.lat]) : null;

  return (
    <div className="absolute inset-0">
      {show3d ? (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-sand-300"><Loader2 className="mr-2 animate-spin" size={16} /> Loading the 3D map…</div>}>
          <Map3D />
        </Suspense>
      ) : (
        <Map2D
          base={base}
          visible={{ zones: eff('zones'), stations: eff('stations'), hotspots: eff('hotspots'), coverage: eff('coverage'), midc: eff('midc'), industry: eff('industry') }}
          zones={air.zones}
          stations={st.placed}
          hotspots={hot.zones}
          coverage={coverage}
          industry={industryData}
          focus={focus}
          onSelect={setSelection}
        />
      )}

      {/* top-left: layers and 2D / 3D */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-col items-start gap-2">
        <div className="flex gap-2">
          {!show3d && (
            <Btn icon={Layers} onClick={() => setPanelOpen((v) => !v)} className="!bg-ink-900/95 shadow-lg backdrop-blur" title="Choose map layers">
              Layers
            </Btn>
          )}
          {capable ? (
            <Btn icon={show3d ? MapIcon : Box} onClick={() => setSettings({ map3d: !show3d })} className="!bg-ink-900/95 shadow-lg backdrop-blur" title="Switch between the light 2D map and the 3D twin">
              {show3d ? '2D map' : '3D map'}
            </Btn>
          ) : null}
        </div>
        {panelOpen && !show3d && (
          <div className="w-72 max-w-full rounded-2xl bg-ink-950 p-3 shadow-2xl hairline">
            <ul className="space-y-1">
              {LAYERS.map((l) => (
                <li key={l.id}>
                  <label className={`gov-tap flex min-h-11 items-center gap-3 text-sm ${disabled[l.id] ? 'opacity-60' : ''}`}>
                    <input type="checkbox" className="h-5 w-5 accent-accent-500" checked={visible[l.id] && !disabled[l.id]} disabled={!!disabled[l.id]} onChange={(e) => setVisible({ ...visible, [l.id]: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block text-sand-50">{l.label}</span>
                      {disabled[l.id] && <span className="block text-[11px] text-sand-400">{disabled[l.id]}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-sand-400">
              Coverage gaps are hatched: no station with a data feed within {coverage?.radiusKm ?? 3} km of the zone centre. Stations with no feed give no coverage.
              {coverage && !coverage.disabledReason ? ` ${coverage.gaps.length} of ${coverage.total} zones are gaps${coverage.coveredOnlyByOutdated > 0 ? `; ${coverage.coveredOnlyByOutdated} are covered only by stations whose latest readings are old` : ''}.` : ''}
            </p>
          </div>
        )}
      </div>

      {/* legend */}
      {!show3d && (
        <div className="pointer-events-none absolute bottom-24 right-3 z-10 hidden max-w-[220px] rounded-xl bg-ink-950/95 p-2.5 text-[11px] text-sand-200 shadow-lg hairline sm:block">
          <div className="mb-1 font-bold text-sand-100">CPCB AQI (estimate)</div>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {CATEGORIES.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLOR[c] }} />
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-sand-400">Dashed ring: station reading is outdated. Grey: no AQI.</div>
        </div>
      )}

      {air.zones.length === 0 && !show3d && (
        <div role="status" className="absolute inset-x-3 top-16 z-10 mx-auto max-w-md rounded-xl bg-ink-950/95 p-3 text-xs text-sand-100 shadow-lg hairline">
          <b>No data feed for the zone colours.</b> {air.reason ?? 'Open-Meteo model data has not arrived.'} Nothing is shown rather than an invented value.
        </div>
      )}
      {st.placed.length === 0 && !show3d && (
        <div role="status" className="absolute left-3 top-16 z-10 max-w-xs rounded-xl bg-ink-950/95 p-2.5 text-[11px] text-sand-200 shadow-lg hairline max-sm:hidden">
          Sourced station coordinates not loaded: no station is drawn and coverage analysis is disabled.
        </div>
      )}

      {zone && (
        <Sheet title={zone.place} subtitle="Zone" onClose={() => setSelection(null)}>
          <ZoneCard z={zone} />
        </Sheet>
      )}
      {hotspot && hotspot.zone && (
        <Sheet title={hotspot.name} subtitle={hotspot.subtitle} onClose={() => setSelection(null)}>
          <ZoneCard z={hotspot.zone} rank={hot.zones.findIndex((h) => h.id === hotspot.id) + 1} />
        </Sheet>
      )}
      {station && (
        <Sheet title={station.name} subtitle={[station.agency, station.city].filter(Boolean).join(' · ') || 'Monitoring station'} onClose={() => setSelection(null)} chips={<StatusChip kind={chipOf(station.status)} label={STATUS_LABEL[station.status]} />}>
          <div className="space-y-3 text-xs text-sand-200">
            {station.aqi ? (
              <div className="flex flex-wrap items-center gap-2">
                <AqiChip aqi={station.aqi.value} category={station.aqi.category} />
                <span>{station.status === 'live' ? 'current reading' : `OUTDATED: reading from ${formatIst(station.lastReadingAt)}`}</span>
              </div>
            ) : station.estimate ? (
              <div className="flex flex-wrap items-center gap-2">
                <AqiChip aqi={station.estimate.aqi} category={station.estimate.category} />
                <StatusChip kind="estimated" />
                <span>no current reading: model estimate for this place</span>
              </div>
            ) : (
              <p>No data feed for this station.</p>
            )}
            {station.singleSource && <p className="text-amber-700">Single-source coordinate: position unconfirmed.</p>}
            {stationZone && (
              <Btn variant="primary" icon={FileText} onClick={() => openReport(stationZone.id)}>
                Create report for {stationZone.place}
              </Btn>
            )}
          </div>
        </Sheet>
      )}
      {midc && (
        <Sheet title={midc.name} subtitle="MIDC industrial estate" onClose={() => setSelection(null)}>
          <p className="text-xs text-sand-300">
            {midc.category ?? 'Estate'}; {midc.areaHa ? `${midc.areaHa.toFixed(0)} ha` : 'area not stated'}. Boundary and plot status only: the data has no company list and no emissions.
          </p>
        </Sheet>
      )}
      {gap && (
        <Sheet title="Coverage gap" subtitle={gapZone?.place ?? 'Zone without monitoring'} onClose={() => setSelection(null)}>
          <div className="space-y-3 text-xs text-sand-200">
            <p>No station with a data feed lies within {coverage?.radiusKm} km of this zone.{gap.nearest ? ` The nearest station is ${gap.nearest.name}, ${gap.nearest.km.toFixed(1)} km away.` : ''}</p>
            <p>Any value for this zone is a model estimate, not monitored.</p>
            {gapZone && <Btn variant="primary" icon={FileText} onClick={() => openReport(gapZone.id)}>Create report</Btn>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
