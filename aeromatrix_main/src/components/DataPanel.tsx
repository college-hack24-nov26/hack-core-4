import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Database, Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section, Segmented, StatusBadge } from './ui';
import { CHART } from './chartTheme';
import { OSM_ATTRIBUTION } from '../services/osmGeometry';
import {
  CSV_TEMPLATE,
  importAirQualityCsv,
  mergeObservations,
  withStationCoordinates,
} from '../data/import/cpcbImport';
import { importWeatherCsv, mergeWeather, summariseWeather } from '../data/import/weatherImport';
import { emptyWeather } from '../data/import/weatherImport';
import { emptyDataset, observedSeries, summariseStations, validateModel, type FitResult } from '../services/observations';
import { fmtIst } from '../services/pollutantData';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { fmt, fmtInt } from '../utils/format';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function DropZone({ label, hint, onFiles }: { label: string; hint: string; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles([...e.dataTransfer.files]);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`rounded-xl border-2 border-dashed p-3 text-center ${over ? 'border-accent-500 bg-accent-500/10' : 'border-sand-400/40'}`}
    >
      <FileUp size={20} className="mx-auto mb-1 text-sand-400" />
      <p className="text-xs font-semibold text-sand-100">{label}</p>
      <p className="mb-2 text-[11px] text-sand-400">{hint}</p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.txt,text/csv,text/plain"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="min-h-9 rounded-lg bg-ink-700 px-3 text-xs font-semibold text-sand-50 hover:bg-ink-600">
        Choose files
      </button>
    </div>
  );
}

/** Latitude / longitude fields with local drafts: a coordinate is applied once both parts are valid numbers. */
function CoordInputs({ station, onChange }: { station: { id: string; lat: number | null; lon: number | null }; onChange: (lat: number | null, lon: number | null) => void }) {
  const [lat, setLat] = useState(station.lat === null ? '' : String(station.lat));
  const [lon, setLon] = useState(station.lon === null ? '' : String(station.lon));
  // Follow changes made elsewhere (for example "Use verified").
  useEffect(() => {
    if (station.lat !== null && Number(lat) !== station.lat) setLat(String(station.lat));
    if (station.lon !== null && Number(lon) !== station.lon) setLon(String(station.lon));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.lat, station.lon]);
  const apply = (a: string, b: string) => {
    const la = a.trim() === '' ? null : Number(a);
    const lo = b.trim() === '' ? null : Number(b);
    if (la !== null && lo !== null && Number.isFinite(la) && Number.isFinite(lo)) onChange(la, lo);
    else if (station.lat !== null || station.lon !== null) onChange(null, null);
  };
  const bad = (v: string, lim: number) => v.trim() !== '' && !(Number.isFinite(Number(v)) && Math.abs(Number(v)) <= lim);
  return (
    <div className="mt-1 grid grid-cols-2 gap-2">
      <label className="text-[10px] text-sand-400">
        Latitude
        <input
          type="number"
          step="0.0001"
          value={lat}
          aria-invalid={bad(lat, 90) || undefined}
          onChange={(e) => {
            setLat(e.target.value);
            apply(e.target.value, lon);
          }}
          className={`h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline ${bad(lat, 90) ? 'ring-1 ring-red-500' : ''}`}
        />
      </label>
      <label className="text-[10px] text-sand-400">
        Longitude
        <input
          type="number"
          step="0.0001"
          value={lon}
          aria-invalid={bad(lon, 180) || undefined}
          onChange={(e) => {
            setLon(e.target.value);
            apply(lat, e.target.value);
          }}
          className={`h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline ${bad(lon, 180) ? 'ring-1 ring-red-500' : ''}`}
        />
      </label>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ObservationsSection() {
  const ds = useTwinStore((s) => s.observations);
  const weatherObs = useTwinStore((s) => s.weatherObs);
  const win = useTwinStore((s) => s.obsWindow);
  const base = useTwinStore((s) => s.base);
  const baseline = useTwinStore((s) => s.baseline);
  const catalog = useTwinStore((s) => s.catalog);
  const calibration = useTwinStore((s) => s.calibration);
  const pollutant = useTwinStore((s) => s.pollutant);
  const setObs = useTwinStore((s) => s.setObservations);
  const setWeatherObs = useTwinStore((s) => s.setWeatherObs);
  const setWin = useTwinStore((s) => s.setObsWindow);
  const fit = useTwinStore((s) => s.fitModelToObserved);
  const reset = useTwinStore((s) => s.resetCalibration);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const setWeather = useTwinStore((s) => s.setWeather);
  const setNotice = useTwinStore((s) => s.setNotice);
  const [fitMsg, setFitMsg] = useState<FitResult | null>(null);
  const [chartStation, setChartStation] = useState('');

  const readAll = async (files: File[]) => {
    let acc = ds ?? emptyDataset();
    for (const f of files) acc = mergeObservations(acc, importAirQualityCsv(await f.text(), f.name));
    setObs(acc);
    setFitMsg(null);
  };
  const readWeather = async (files: File[]) => {
    let acc = weatherObs ?? emptyWeather();
    for (const f of files) acc = mergeWeather(acc, importWeatherCsv(await f.text(), f.name));
    setWeatherObs(acc);
  };

  const summaries = useMemo(() => (ds ? summariseStations(ds, win) : []), [ds, win]);
  const validation = useMemo(() => (base && ds ? validateModel(base, baseline, summaries, 'pm25') : null), [base, baseline, ds, summaries]);
  const stationId = chartStation || ds?.stations[0]?.id || '';
  const series = useMemo(
    () => (ds && stationId ? observedSeries(ds, stationId, pollutant).map((p) => ({ t: p.time, label: fmtIst(p.time).replace(' IST', ''), value: Number(p.value.toFixed(2)) })) : []),
    [ds, stationId, pollutant],
  );

  const matchCatalog = (name: string) => catalog.stations.find((s) => s.lat !== null && norm(s.name) === norm(name));

  return (
    <>
      <Section title="Air-quality observations (CSV)" action={ds ? <StatusBadge status="OBSERVED" /> : undefined}>
        <DropZone
          label="Drop CPCB CSV files here"
          hint="CPCB CCR exports, station_hour tables or any CSV with station / date / pollutant columns. Processed in your browser only."
          onFiles={(f) => void readAll(f)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => download('aeromatrix_observations_template.csv', CSV_TEMPLATE)} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-ink-700 px-2.5 text-xs font-semibold text-sand-50 hover:bg-ink-600">
            <Download size={13} /> Template
          </button>
          {ds && (
            <button
              type="button"
              onClick={() => {
                setObs(null);
                setFitMsg(null);
              }}
              className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-ink-700"
            >
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>
        {ds?.warnings.map((w) => (
          <p key={w} className="mt-1 text-[11px] text-amber-800">
            {w}
          </p>
        ))}
        {ds && (
          <p className="mt-2 text-[11px] text-sand-300">
            {ds.stations.length} stations · {fmtInt(ds.readings.length)} hourly rows · {ds.sources.join(', ')}
          </p>
        )}
      </Section>

      {ds && (
        <>
          <Section title="Station coordinates">
            <p className="mb-1 text-[11px] text-sand-400">A station only appears on the map and in the observed field once it has a coordinate.</p>
            <ul className="space-y-1.5">
              {ds.stations.map((s) => {
                const m = matchCatalog(s.name);
                return (
                  <li key={s.id} className="rounded-lg bg-ink-850 p-2 hairline">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-sand-50">{s.name}</span>
                      {m && (s.lat === null || s.lon === null) && (
                        <button type="button" onClick={() => setObs(withStationCoordinates(ds, s.id, m.lat, m.lon))} className="min-h-8 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700">
                          Use verified
                        </button>
                      )}
                    </div>
                    <CoordInputs station={s} onChange={(lat, lon) => setObs(withStationCoordinates(ds, s.id, lat, lon))} />
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Window">
            <Segmented
              ariaLabel="Observation window"
              value={win.kind}
              onChange={(k) => setWin(k === 'last24h' ? { kind: 'last24h' } : { kind: 'period', from: -Infinity, to: Infinity })}
              options={[
                { value: 'last24h', label: 'Newest 24 h' },
                { value: 'period', label: 'Whole period' },
              ]}
            />
            <button type="button" onClick={() => setMode('observed')} className="ml-2 min-h-9 rounded-lg bg-ink-700 px-2.5 text-xs font-semibold text-sand-50 hover:bg-ink-600">
              Show Observed on map
            </button>
          </Section>

          <Section title={`Observed ${POLLUTANT_LABEL[pollutant]} by hour`} action={<StatusBadge status="OBSERVED" />}>
            <select value={stationId} onChange={(e) => setChartStation(e.target.value)} aria-label="Station for the chart" className="mb-2 h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline">
              {ds.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {series.length === 0 ? (
              <p className="text-xs text-sand-400">This station has no {POLLUTANT_LABEL[pollutant]} readings.</p>
            ) : (
              <div className="h-[170px]" aria-label="Observed hourly series">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ left: -14, right: 6, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                    <XAxis dataKey="label" tick={CHART.tick} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
                    <Tooltip {...CHART.tooltip} formatter={(v) => [`${v} ${POLLUTANT_UNIT[pollutant]}`, POLLUTANT_LABEL[pollutant]]} />
                    <Line type="monotone" dataKey="value" stroke="#6d7aa8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          <Section title="Prototype model vs observed PM2.5">
            {validation && validation.rows.length > 0 ? (
              <>
                <div className="overflow-x-auto rounded-xl hairline">
                  <table className="w-full min-w-[320px] text-left text-[11px]">
                    <thead>
                      <tr className="bg-ink-850 text-sand-400">
                        <th className="p-1.5 font-semibold">Station</th>
                        <th className="p-1.5 font-semibold">Observed</th>
                        <th className="p-1.5 font-semibold">Model</th>
                        <th className="p-1.5 font-semibold">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.rows.map((r) => (
                        <tr key={r.stationId} className="border-t border-sand-400/15">
                          <td className="p-1.5 font-semibold text-sand-50">{r.name}</td>
                          <td className="p-1.5 font-mono">{fmt(r.observed)}</td>
                          <td className="p-1.5 font-mono">{fmt(r.modeled)}</td>
                          <td className="p-1.5 font-mono">{r.error > 0 ? '+' : ''}{fmt(r.error)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  {[
                    ['MAE', validation.stats.mae],
                    ['RMSE', validation.stats.rmse],
                    ['Bias', validation.stats.bias],
                    ['r', validation.stats.r],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-ink-850 p-1.5 hairline">
                      <dt className="text-sand-400">{k as string}</dt>
                      <dd className="font-mono font-semibold text-sand-50">{v === null ? 'n/a' : fmt(v as number, k === 'r' ? 2 : 1)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-1 text-[10px] text-sand-500">
                  {calibration ? 'The model is currently calibrated to these observations (see below).' : 'Uncalibrated prototype model.'} r needs three or more stations.
                </p>
              </>
            ) : (
              <p className="text-xs text-sand-400">Needs stations with a coordinate inside the analysis area and PM2.5 readings.</p>
            )}
          </Section>

          <Section title="Calibrate the prototype model">
            <p className="mb-2 text-[11px] leading-snug text-sand-400">
              Fits PM2.5 = a × background + b × local sources over the station means. This calibrates the rule model to these readings; it is not a validated forecast.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFitMsg(fit())}
                className="min-h-10 rounded-xl bg-accent-500 px-3 text-xs font-bold text-sand-50 hover:bg-accent-400"
              >
                Fit model to observed PM2.5
              </button>
              <button
                type="button"
                disabled={!calibration}
                onClick={() => {
                  reset();
                  setFitMsg(null);
                }}
                className="min-h-10 rounded-xl bg-ink-700 px-3 text-xs font-semibold text-sand-50 hover:bg-ink-600 disabled:opacity-40"
              >
                Reset calibration
              </button>
            </div>
            {fitMsg && !fitMsg.ok && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {fitMsg.reason}
              </p>
            )}
            {calibration && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-ink-850 p-2 hairline"><dt className="text-sand-400">Background scale</dt><dd className="font-mono font-semibold text-sand-50">{fmt(calibration.backgroundScale, 3)}</dd></div>
                <div className="rounded-lg bg-ink-850 p-2 hairline"><dt className="text-sand-400">Local-sources scale</dt><dd className="font-mono font-semibold text-sand-50">{fmt(calibration.localScale, 3)}</dd></div>
                <div className="rounded-lg bg-ink-850 p-2 hairline"><dt className="text-sand-400">RMSE before → after</dt><dd className="font-mono font-semibold text-sand-50">{fmt(calibration.rmseBefore)} → {fmt(calibration.rmseAfter)}</dd></div>
                <div className="rounded-lg bg-ink-850 p-2 hairline"><dt className="text-sand-400">Stations · window</dt><dd className="font-semibold text-sand-50">{calibration.stations} · {calibration.window}</dd></div>
              </dl>
            )}
          </Section>
        </>
      )}

      <Section title="Weather observations (CSV)">
        <DropZone label="Drop weather CSV files here" hint="ERA5 point extracts (t2m, u10, v10, sp, tp) or CPCB meteorology (AT, RH, WS, WD, RF, BP)." onFiles={(f) => void readWeather(f)} />
        {weatherObs?.warnings.map((w) => (
          <p key={w} className="mt-1 text-[11px] text-amber-800">{w}</p>
        ))}
        {weatherObs && (
          <div className="mt-2 text-[11px] text-sand-300">
            {fmtInt(weatherObs.readings.length)} rows · {weatherObs.sources.join(', ')}
            <button
              type="button"
              onClick={() => {
                const w = summariseWeather(weatherObs);
                if (w) {
                  setWeather(w);
                  setNotice(`Observed weather applied to the What-If scenario: ${Object.keys(w).join(', ')}.`);
                }
              }}
              className="ml-2 min-h-8 rounded-lg bg-ink-700 px-2 text-[11px] font-semibold text-sand-50 hover:bg-ink-600"
            >
              Use in What-If
            </button>
            <button type="button" onClick={() => setWeatherObs(null)} className="ml-1 min-h-8 rounded-lg px-2 text-[11px] font-semibold text-red-600 hover:bg-ink-700">Clear</button>
          </div>
        )}
      </Section>
    </>
  );
}

function GeometrySection() {
  const info = useTwinStore((s) => s.geometryInfo);
  const loadOsm = useTwinStore((s) => s.loadOsm);
  const useDemo = useTwinStore((s) => s.useDemoGeometry);
  const loading = info.status === 'loading';

  const btn = (active: boolean) =>
    `flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-50 md:min-h-9 ${
      active ? 'bg-accent-500 text-sand-50' : 'bg-ink-700 text-sand-50 hover:bg-ink-600'
    }`;

  return (
    <>
      <div className="rounded-xl bg-ink-850 p-3 hairline">
        <div className="flex items-center gap-2 text-sm font-bold text-sand-50">
          <Database size={16} />
          {info.source === 'osm' ? 'OpenStreetMap geometry' : 'Demo geometry'}
          {loading && <Loader2 size={14} className="animate-spin" />}
        </div>
        <p className="mt-1 text-xs text-sand-300">
          {info.source === 'osm'
            ? `Loaded from the ${info.origin === 'live' ? 'live Overpass API' : 'bundled snapshot'}${info.generated ? ` (${new Date(info.generated).toLocaleDateString()})` : ''}.`
            : 'Hand-digitised, approximate demo features of Pune.'}
        </p>
      </div>
      {info.notice && (
        <p role="note" className="mt-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">{info.notice}</p>
      )}
      {info.status === 'error' && info.message && (
        <p role="alert" className="mt-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 ring-1 ring-red-500/30">{info.message}</p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {[
          ['Roads', fmtInt(info.counts.roads)],
          ['Road length', `${fmtInt(info.counts.roadKm)} km`],
          ['Green areas', fmtInt(info.counts.green)],
          ['Industrial zones', fmtInt(info.counts.industrialZones)],
          ['Emission sources', fmtInt(info.counts.industries)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
            <dt className="text-sand-400">{k}</dt>
            <dd className="font-semibold text-sand-50">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 space-y-2">
        <button type="button" disabled={loading} onClick={() => void loadOsm('snapshot')} className={btn(info.origin === 'snapshot')}>Bundled snapshot (works offline)</button>
        <button type="button" disabled={loading} onClick={() => void loadOsm('live')} className={btn(info.origin === 'live')}>Live from Overpass API</button>
        <button type="button" disabled={loading} onClick={() => void useDemo()} className={btn(info.source === 'demo')}>Back to demo geometry</button>
      </div>
      <p className="mt-2 text-[11px] text-sand-400">Changing the geometry rebuilds the city model and resets the active scenario.</p>
      <div className="mt-2 space-y-2 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        <p><strong className="text-sand-100">Only the geometry is real:</strong> roads, parks and industrial zones come from OpenStreetMap.</p>
        <p>Traffic volumes are a <StatusBadge status="DEMO" className="align-middle" /> proxy from the road class; emission intensities, population and weather are DEMO assumptions.</p>
      </div>
      <p className="pb-2 pt-1 text-[11px] text-sand-500">{info.attribution ?? OSM_ATTRIBUTION} Licence: ODbL 1.0.</p>
    </>
  );
}

export function DataPanel() {
  const [tab, setTab] = useState<'observations' | 'geometry'>('observations');
  return (
    <div className="space-y-1 py-2">
      <Segmented
        ariaLabel="Data section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'observations', label: 'Observations' },
          { value: 'geometry', label: 'Map geometry' },
        ]}
      />
      {tab === 'observations' ? <ObservationsSection /> : <GeometrySection />}
    </div>
  );
}
