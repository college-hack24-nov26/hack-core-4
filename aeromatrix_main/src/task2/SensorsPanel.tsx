import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2, RadioTower, WifiOff } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge, Toggle } from '../components/ui';
import { CHART } from '../components/chartTheme';
import { Task2Planning } from './Task2Planning';
import {
  T2_LABEL,
  T2_LOSS_LEVELS,
  T2_PATTERNS,
  T2_POLLUTANTS,
  T2_SEEDS,
  T2_TEST_PERIOD,
  T2_UNIT,
  T2_AQI_COLOR,
  donorsOf,
  estimatePmAqi,
  getT2Cases,
  getT2Health,
  getT2Stations,
  isT2Available,
  isT2Unavailable,
  istCutoff,
  istParts,
  postT2Replay,
  shortName,
  withMissingDonors,
  type T2Cases,
  type T2Pattern,
  type T2Pollutant,
  type T2Replay,
} from './task2Api';
import { fmt } from '../utils/format';
import { haversineKm } from '../utils/geo';

type Svc = { status: 'checking' } | { status: 'offline'; reason: string } | { status: 'online'; stations: Array<{ id: string; name: string }>; cases: T2Cases };

const sel = 'h-10 w-full rounded-lg bg-ink-950 px-2 text-sm text-sand-50 hairline';

function ResultCard({ pollutant, replay, error }: { pollutant: T2Pollutant; replay: T2Replay | null; error: string | null }) {
  const p = replay?.prediction;
  return (
    <div className="rounded-xl bg-ink-850 p-3 hairline">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sand-50">Next hour {T2_LABEL[pollutant]}</h3>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800">Historical replay</span>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {!replay && !error && <p className="text-xs text-sand-400">No result yet.</p>}
      {replay && isT2Available(p) && (
        <>
          <div className="font-display text-3xl font-bold text-sand-50">
            {fmt(p.value)} <span className="text-xs font-medium text-sand-400">{T2_UNIT}</span>
          </div>
          <p className="text-xs text-sand-300">
            Interval {fmt(p.interval[0])} to {fmt(p.interval[1])} · for {istParts(p.target_time).label}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-ink-950 p-1.5 hairline"><dt className="text-sand-400">Model</dt><dd className="font-mono text-sand-50">{p.model}</dd></div>
            <div className="rounded-lg bg-ink-950 p-1.5 hairline"><dt className="text-sand-400">Version</dt><dd className="font-mono text-sand-50">{p.version}</dd></div>
            <div className="rounded-lg bg-ink-950 p-1.5 hairline"><dt className="text-sand-400">Persistence baseline</dt><dd className="font-mono text-sand-50">{p.baselines.persistence === null ? 'none (no own history)' : fmt(p.baselines.persistence)}</dd></div>
            <div className="rounded-lg bg-ink-950 p-1.5 hairline"><dt className="text-sand-400">IDW baseline</dt><dd className="font-mono text-sand-50">{p.baselines.idw === null ? 'n/a' : fmt(p.baselines.idw)}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-sand-300">
            Reliability <strong>{p.reliability.status}</strong>: {p.reliability.donor_count} donors, nearest {p.reliability.nearest_km === null ? 'n/a' : `${fmt(p.reliability.nearest_km)} km`}, oldest reading {p.reliability.oldest_donor_hours ?? 'n/a'} h.
            {p.reliability.out_of_training_bounds.length > 0 && <> Outside the training range: {p.reliability.out_of_training_bounds.join(', ')}.</>}
          </p>
          <p className="text-[10px] text-sand-500">{p.reliability.coverage_warning}</p>
          <p className="mt-1 text-[10px] text-sand-500">
            In normal hours a simple persistence baseline beat the ML model in evaluation, so compare the two. {replay.independent_reference.value !== null && <>Held-out actual: {fmt(replay.independent_reference.value)} {T2_UNIT}{replay.absolute_error !== null ? ` (error ${fmt(replay.absolute_error)})` : ''}.</>}
          </p>
        </>
      )}
      {replay && isT2Unavailable(p) && (
        <div role="status">
          <p className="text-sm font-bold text-amber-800">Unavailable</p>
          <p className="text-xs text-sand-300">{p.reason}</p>
          {replay.independent_reference.value !== null && <p className="mt-1 text-[10px] text-sand-500">Held-out actual (never given to the model): {fmt(replay.independent_reference.value)} {T2_UNIT}.</p>}
        </div>
      )}
    </div>
  );
}

export function SensorsPanel() {
  const catalog = useTwinStore((s) => s.catalog);
  const [svc, setSvc] = useState<Svc>({ status: 'checking' });
  const [station, setStation] = useState('');
  const [date, setDate] = useState('2025-06-30');
  const [hour, setHour] = useState(17);
  const [loss, setLoss] = useState(0);
  const [pattern, setPattern] = useState<T2Pattern>('random');
  const [seed, setSeed] = useState(T2_SEEDS[0]);
  const [unseen, setUnseen] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Partial<Record<T2Pollutant, { replay: T2Replay | null; error: string | null }>>>({});

  const check = useCallback(() => {
    setSvc({ status: 'checking' });
    Promise.all([getT2Health(), getT2Stations(), getT2Cases()])
      .then(([, st, cases]) => setSvc({ status: 'online', stations: st.stations, cases }))
      .catch((e: unknown) => setSvc({ status: 'offline', reason: e instanceof Error ? e.message : 'not reachable' }));
  }, []);
  useEffect(check, [check]);

  // Only coordinate-verified stations the service knows are offered.
  const offered = useMemo(() => {
    if (svc.status !== 'online') return [];
    const ids = new Set(svc.stations.map((s) => s.id));
    return catalog.stations.filter((s) => s.coordSource === 'verified' && s.lat !== null && ids.has(s.id));
  }, [svc, catalog]);

  useEffect(() => {
    if (!station && offered[0]) setStation(offered[0].id);
  }, [offered, station]);

  const run = async () => {
    if (!station) return;
    setRunning(true);
    const cutoff = istCutoff(date, hour);
    const one = async (p: T2Pollutant) => {
      try {
        const replay = await postT2Replay({ station, pollutant: p, cutoff, loss_level: loss, pattern, seed, excluded_station: unseen ? station : null, sensors_off: off });
        return [p, { replay, error: null }] as const;
      } catch (e) {
        return [p, { replay: null, error: e instanceof Error ? e.message : 'failed' }] as const;
      }
    };
    const out = await Promise.all(T2_POLLUTANTS.map(one));
    setResults(Object.fromEntries(out));
    setRunning(false);
  };

  const pm25 = results.pm25?.replay ?? null;
  const donors = useMemo(() => {
    if (!pm25) return [];
    const known = svc.status === 'online' ? svc.stations.map((s) => s.id).filter((id) => id !== station) : [];
    return withMissingDonors(donorsOf(pm25), known, off);
  }, [pm25, svc, station, off]);

  const here = catalog.stations.find((s) => s.id === station);
  const distance = (id: string) => {
    const d = catalog.stations.find((s) => s.id === id);
    return here && d && here.lat !== null && d.lat !== null && here.lon !== null && d.lon !== null ? haversineKm([here.lon, here.lat], [d.lon, d.lat]) : null;
  };

  // Timeline: donor readings at their own timestamps, gaps preserved.
  const timeline = useMemo(() => {
    if (!pm25) return { rows: [] as Array<Record<string, number | string | null>>, stations: [] as string[] };
    const obs = pm25.input.observations.filter((o) => o.station !== pm25.input.station);
    const stations = [...new Set(obs.map((o) => o.station))];
    const times = obs.map((o) => new Date(o.timestamp).getTime());
    if (times.length === 0) return { rows: [], stations };
    const pred = pm25.prediction;
    const target = isT2Available(pred) ? new Date(pred.target_time).getTime() : new Date(pm25.input.cutoff).getTime() + 3600000;
    const start = Math.min(...times);
    const end = Math.max(...times, target);
    const rows: Array<Record<string, number | string | null>> = [];
    for (let t = start; t <= end; t += 3600000) {
      const row: Record<string, number | string | null> = { t, label: istParts(new Date(t).toISOString()).label.slice(5, 16) };
      for (const s of stations) {
        const hit = obs.find((o) => o.station === s && Math.abs(new Date(o.timestamp).getTime() - t) < 1800000);
        row[s] = hit ? hit.value : null;
      }
      row.forecast = t === target && isT2Available(pred) ? pred.value : null;
      row.actual = t === target ? pm25.independent_reference.value : null;
      rows.push(row);
    }
    return { rows, stations };
  }, [pm25]);

  const aqi = useMemo(() => {
    const recorded: Partial<Record<T2Pollutant, Array<number | null>>> = {};
    const forecast: Partial<Record<T2Pollutant, number>> = {};
    for (const p of T2_POLLUTANTS) {
      const r = results[p]?.replay;
      if (!r) continue;
      if (isT2Available(r.prediction)) forecast[p] = r.prediction.value;
      // Only the station's own recorded hours count; donor readings are other stations.
      recorded[p] = r.input.observations.filter((o) => o.station === r.input.station).map((o) => o.value);
    }
    return estimatePmAqi(recorded, forecast);
  }, [results]);

  if (svc.status === 'checking') {
    return (
      <div role="status" className="flex items-center gap-2 py-4 text-sm text-sand-300">
        <Loader2 size={16} className="animate-spin" /> Checking for the Sensor Intelligence service…
      </div>
    );
  }
  if (svc.status === 'offline') {
    return (
      <div className="space-y-3 py-3">
        <div role="status" className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">
          <p className="mb-1 flex items-center gap-2 text-sm font-bold text-sand-50"><WifiOff size={15} /> Sensor Intelligence is not running</p>
          <p>{svc.reason}</p>
          <p className="mt-2">
            This screen predicts the next hour of PM2.5 and PM10 for a station whose sensor is off, using a second trained model package on port 8030. That package
            is not installed or not started, so nothing is shown and nothing is invented. Everything else in AeroMatrix works without it.
          </p>
          <p className="mt-2">
            To enable it: install the Sensor Intelligence package (<code>backend/task2_model</code>) and run <code>RUN_AEROMATRIX.bat</code>, which starts it on port 8030 when the
            package exists. Then press Check again.
          </p>
        </div>
        <button type="button" onClick={check} className="min-h-10 w-full rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400">Check again</button>
      </div>
    );
  }

  const period = svc.cases.from ? svc.cases : { from: T2_TEST_PERIOD.from, to: T2_TEST_PERIOD.to };
  return (
    <div className="space-y-1 py-2">
      <p className="flex gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40" role="note">
        <RadioTower size={15} className="mt-0.5 shrink-0" />
        <span><strong>Historical replay.</strong> Results replay the held-out Feb–Sep 2025 test period with sensors switched off on purpose. This is never live.</span>
      </p>

      <Section title="Replay settings">
        {offered.length === 0 ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">
            No station can be offered yet: a station must be known to the service and have a verified coordinate (the verified station file is not loaded, or none of its stations is replayable). The other supplied station IDs have no validated spatial mapping and are never offered.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs text-sand-300">
              Station
              <select value={station} onChange={(e) => setStation(e.target.value)} className={sel}>
                {offered.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({shortName(s.id)})</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-sand-300">
                Date (IST)
                <input type="date" min={period.from} max={period.to} value={date} onChange={(e) => setDate(e.target.value)} className={sel} />
              </label>
              <label className="text-xs text-sand-300">
                Hour (IST)
                <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={sel}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </label>
            </div>
            <Section title="Deliberate sensor loss">
              <label className="block text-xs text-sand-300">
                Evaluated loss level: {Math.round(loss * 100)}% of donor readings removed
                <input type="range" min={0} max={T2_LOSS_LEVELS.length - 1} step={1} value={T2_LOSS_LEVELS.indexOf(loss)} onChange={(e) => setLoss(T2_LOSS_LEVELS[Number(e.target.value)])} className="h-6 w-full accent-accent-500" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-sand-300">
                  Pattern
                  <select value={pattern} onChange={(e) => setPattern(e.target.value as T2Pattern)} className={sel}>
                    {T2_PATTERNS.map((p) => (
                      <option key={p.value} value={p.value} title={p.hint}>{p.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-sand-300">
                  Seed
                  <select value={seed} onChange={(e) => setSeed(Number(e.target.value))} className={sel}>
                    {T2_SEEDS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Toggle label="Treat the station as unseen (use its excluded-station model)" checked={unseen} onChange={setUnseen} />
              {off.length > 0 && <p className="text-[11px] text-sand-400">Nearby sensors switched off: {off.map(shortName).join(', ')}</p>}
            </Section>
            <button type="button" disabled={running || !station} onClick={() => void run()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400 disabled:opacity-50">
              {running && <Loader2 size={16} className="animate-spin" />} Run replay
            </button>
          </div>
        )}
      </Section>

      {(results.pm25 || results.pm10) && (
        <>
          <div className="space-y-2">
            {T2_POLLUTANTS.map((p) => (
              <ResultCard key={p} pollutant={p} replay={results[p]?.replay ?? null} error={results[p]?.error ?? null} />
            ))}
          </div>

          <Section title="Estimated PM-based AQI">
            <div className="rounded-xl bg-ink-850 p-3 text-xs hairline">
              {aqi.status === 'AVAILABLE' && aqi.value !== null ? (
                <>
                  <span className="rounded-full px-2.5 py-1 font-bold text-white" style={{ background: T2_AQI_COLOR[aqi.value <= 50 ? 'Good' : aqi.value <= 100 ? 'Satisfactory' : aqi.value <= 200 ? 'Moderate' : aqi.value <= 300 ? 'Poor' : aqi.value <= 400 ? 'Very Poor' : 'Severe'] }}>AQI ~{aqi.value}</span>
                  <p className="mt-1 text-sand-400">{aqi.label}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sand-100">AQI unavailable</p>
                  <p className="text-sand-400">{aqi.reason ?? 'Needs 16 valid recorded hours per pollutant.'} An official CPCB AQI also needs at least three pollutants.</p>
                </>
              )}
            </div>
          </Section>

          <Section title="Donor sensors" action={<StatusBadge status="OBSERVED" />}>
            <div className="overflow-x-auto rounded-xl hairline">
              <table className="w-full min-w-[360px] text-left text-[11px]">
                <thead>
                  <tr className="bg-ink-850 text-sand-400">
                    <th className="p-1.5 font-semibold">Station</th>
                    <th className="p-1.5 font-semibold">State</th>
                    <th className="p-1.5 font-semibold">Age</th>
                    <th className="p-1.5 font-semibold">Distance</th>
                    <th className="p-1.5 font-semibold">Off</th>
                  </tr>
                </thead>
                <tbody>
                  {donors.map((d) => {
                    const km = distance(d.station);
                    return (
                      <tr key={d.station} className="border-t border-sand-400/15">
                        <td className="p-1.5 font-semibold text-sand-50">{shortName(d.station)}</td>
                        <td className="p-1.5">{d.state}</td>
                        <td className="p-1.5 font-mono">{d.ageHours === null ? '-' : `${d.ageHours} h`}</td>
                        <td className="p-1.5 font-mono">{km === null ? 'n/a' : `${fmt(km)} km`}</td>
                        <td className="p-1.5">
                          <input type="checkbox" aria-label={`Switch ${d.station} off for the next run`} checked={off.includes(d.station)} onChange={(e) => setOff(e.target.checked ? [...off, d.station] : off.filter((x) => x !== d.station))} className="h-5 w-5 accent-accent-500" />
                        </td>
                      </tr>
                    );
                  })}
                  {donors.length === 0 && (
                    <tr><td colSpan={5} className="p-2 text-sand-400">No donor readings were supplied.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10px] text-sand-500">Spatial ML and IDW use donors aged 2 h or less (STALE otherwise); persistence uses the target's own history up to 6 h; at least two donor stations are required.</p>
          </Section>

          {timeline.rows.length > 0 && (
            <Section title="Timeline (PM2.5, actual timestamped readings, gaps kept)">
              <div className="h-[200px]" aria-label="Donor PM2.5 readings over time">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline.rows} margin={{ left: -14, right: 6, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                    <XAxis dataKey="label" tick={CHART.tick} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
                    <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
                    <Tooltip {...CHART.tooltip} />
                    {timeline.stations.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} name={shortName(s)} stroke={['#6d7aa8', '#2fae8b', '#d19a2a', '#8a6a68'][i % 4]} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
                    ))}
                    <Line dataKey="forecast" name="Forecast" stroke="#a3263f" dot={{ r: 6 }} strokeWidth={0} isAnimationActive={false} />
                    <Line dataKey="actual" name="Held-out actual" stroke="#1c0a10" dot={{ r: 5 }} strokeWidth={0} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          <Task2Planning prediction={isT2Available(results.pm25?.replay?.prediction) ? results.pm25!.replay!.prediction : null} />
        </>
      )}
    </div>
  );
}
