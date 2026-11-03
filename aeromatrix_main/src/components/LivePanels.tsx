import { useEffect, useMemo, useState } from 'react';
import { CloudSun, RefreshCw, WifiOff } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge } from './ui';
import { CHART } from './chartTheme';
import {
  LIVE_REFRESH_MINUTES,
  cityAqiEstimate,
  cityHourly,
  isLiveFresh,
  nextRefreshAt,
  refreshLiveNow,
  zonePointId,
  type LiveAirPoint,
} from '../services/liveData';
import { dailyForecast, aqiTrend, istDate } from '../services/forecast';
import { fmtIst, fmtIstTime, resolveCurrent } from '../services/pollutantData';
import { AQI_COLORS, aqiLabel, type AqiCategory } from '../services/cpcbAqi';
import { isForecast, isMeasured, isPredicted, type ApiPollutantKey } from '../services/aeromatrixApi';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { cellAtLonLat } from '../utils/grid';
import { zoneLabel } from '../utils/zones';
import { fmt } from '../utils/format';

function useNow(everyMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}

/** The zone whose live point is shown: the selected zone, else the zone at the city centre. */
function useLiveZone() {
  const base = useTwinStore((s) => s.base);
  const selected = useTwinStore((s) => s.selectedCellId);
  const names = useTwinStore((s) => s.placeNames);
  const live = useTwinStore((s) => s.live);
  return useMemo(() => {
    if (!base) return null;
    const cell = base.cells.find((c) => c.id === selected) ?? cellAtLonLat(base, base.city.center[0], base.city.center[1]) ?? base.cells[0];
    return { cell, name: zoneLabel(cell, names), point: live.points[zonePointId(cell.id)] as LiveAirPoint | undefined };
  }, [base, selected, names, live.points]);
}

function AqiPill({ category, text }: { category: AqiCategory | null; text: string }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: category ? AQI_COLORS[category] : '#6b7280' }}>
      {text}
    </span>
  );
}

function RefreshButton() {
  const live = useTwinStore((s) => s.live);
  const now = useNow(15000);
  const wait = live.lastUpdated !== null && live.status === 'ready' ? Math.max(0, nextRefreshAt(live.lastUpdated) - now) : 0;
  const busy = live.status === 'loading';
  return (
    <button
      type="button"
      disabled={busy || wait > 0}
      onClick={() => void refreshLiveNow(false)}
      title={wait > 0 ? `Refresh is limited to once every ${LIVE_REFRESH_MINUTES} min` : 'Refresh now'}
      className="flex min-h-9 items-center gap-1.5 rounded-lg bg-ink-700 px-2.5 text-xs font-semibold text-sand-50 hover:bg-ink-600 disabled:opacity-50"
    >
      <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
      {busy ? 'Updating…' : wait > 0 ? `Again in ${Math.ceil(wait / 60000)} min` : 'Refresh'}
    </button>
  );
}

/** Overview: the live strip (city AQI estimate from Open-Meteo, freshness, stations, next-24 h trend). */
export function LiveStrip() {
  const live = useTwinStore((s) => s.live);
  const svc = useTwinStore((s) => s.modelService);
  const catalog = useTwinStore((s) => s.catalog);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const now = useNow();
  const fresh = isLiveFresh(live, now);

  const est = useMemo(() => (fresh ? cityAqiEstimate(live.points, now) : null), [fresh, live.points, now]);
  const trend = useMemo(() => {
    if (!fresh) return null;
    const c = cityHourly(live.points);
    return c ? aqiTrend(dailyForecast(c), istDate(now / 1000)) : null;
  }, [fresh, live.points, now]);

  const outdated = Object.values(svc.measured).filter((m) => isMeasured(m) && m.historical).length;
  const withFeed = catalog.stations.filter((s) => s.api).length;

  return (
    <div className="rounded-2xl bg-ink-850 p-3 hairline" aria-label="Live city air quality">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status="MODEL_DATA" />
        <RefreshButton />
      </div>
      {fresh && est ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <AqiPill category={est.category} text={est.value === null ? 'AQI unavailable' : `AQI ${aqiLabel(est)}`} />
            {est.dominant_pollutant && <span className="text-[11px] text-sand-400">dominant {est.dominant_pollutant.toUpperCase()}</span>}
          </div>
          {est.status === 'UNAVAILABLE' && est.reason && <p className="mt-1 text-[11px] text-sand-400">{est.reason}</p>}
          <p className="mt-1 text-[10px] leading-snug text-sand-500">
            City AQI estimate from the Open-Meteo CAMS model: estimated, about 40 km resolution, not an official station AQI.
          </p>
          <p className="mt-1 text-[11px] text-sand-300">
            Updated {live.lastUpdated ? fmtIstTime(live.lastUpdated) : '-'} · model data as of {est.period_end ? fmtIstTime(est.period_end) : '-'}
            {trend && (
              <>
                {' '}
                · next day {trend.direction} ({trend.delta > 0 ? '+' : ''}
                {trend.delta})
              </>
            )}
          </p>
        </>
      ) : (
        <div className="mt-2 flex gap-2 text-xs text-sand-300" role="status">
          <WifiOff size={15} className="mt-0.5 shrink-0" />
          <p>
            {live.status === 'loading' || live.status === 'idle'
              ? 'Loading Open-Meteo model data…'
              : `Live model data unavailable${live.lastUpdated ? ` (last updated ${fmtIst(live.lastUpdated)})` : ''}. ${live.reason ?? ''} No numbers are shown rather than stale ones.`}
          </p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-sand-400">
        Stations: {catalog.stations.length} listed · {svc.status === 'online' ? `${withFeed} with a feed · ${outdated} Outdated` : 'model service offline (no data feed)'}
      </p>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={() => setMode('current')} className="min-h-8 rounded-lg bg-ink-700 px-2.5 text-[11px] font-semibold text-sand-50 hover:bg-ink-600">
          Show on map
        </button>
      </div>
    </div>
  );
}

/** Air Quality -> Now (model data). */
export function LiveNowTab() {
  const live = useTwinStore((s) => s.live);
  const pollutant = useTwinStore((s) => s.pollutant);
  const setPollutant = useTwinStore((s) => s.setPollutant);
  const setWeather = useTwinStore((s) => s.setWeather);
  const setNotice = useTwinStore((s) => s.setNotice);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const zone = useLiveZone();
  const now = useNow();
  const fresh = isLiveFresh(live, now);

  const records = useMemo(() => (fresh && zone?.point ? resolveCurrent({ live: zone.point }, now) : []), [fresh, zone?.point, now]);
  const series = useMemo(() => {
    const p = zone?.point;
    if (!fresh || !p) return [];
    return p.times.map((t, i) => ({ t: t * 1000, label: fmtIstTime(t * 1000).replace(' IST', ''), value: p.hourly[pollutant][i] }));
  }, [fresh, zone?.point, pollutant]);

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StatusBadge status="MODEL_DATA" />
          <span className="text-[11px] text-sand-400">Open-Meteo CAMS, ~40 km</span>
        </div>
        <RefreshButton />
      </div>
      <p className="text-[11px] text-sand-300">
        {live.lastUpdated ? `Updated ${fmtIstTime(live.lastUpdated)}` : 'Not updated yet'} · refreshes every {LIVE_REFRESH_MINUTES} min
      </p>

      {!fresh ? (
        <p className="flex gap-2 rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
          <WifiOff size={15} className="mt-0.5 shrink-0" />
          {live.status === 'loading' || live.status === 'idle'
            ? 'Loading Open-Meteo model data…'
            : `Offline: ${live.reason ?? 'Open-Meteo could not be reached.'} ${live.lastUpdated ? `Last updated ${fmtIst(live.lastUpdated)}. ` : ''}Nothing stale is shown as current.`}
        </p>
      ) : (
        zone && (
          <>
            <p className="text-xs text-sand-200">
              <strong>{zone.name}</strong> · requested {zone.cell.center[1].toFixed(3)}°N {zone.cell.center[0].toFixed(3)}°E
              {zone.point && <> · model grid point {zone.point.grid[1].toFixed(2)}°N {zone.point.grid[0].toFixed(2)}°E</>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {records.map((r) => {
                const active = r.pollutant === pollutant;
                return (
                  <button
                    key={r.pollutant}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPollutant(r.pollutant)}
                    className={`min-h-[72px] rounded-xl p-2.5 text-left hairline ${active ? 'bg-accent-500 text-sand-50' : 'bg-ink-850 hover:bg-ink-800'}`}
                  >
                    <div className="text-xs font-bold">{r.label}</div>
                    {r.live ? (
                      <div className="font-display text-lg font-bold leading-tight">
                        {fmt(r.live.value, r.pollutant === 'co' ? 2 : 1)} <span className="text-[10px] font-medium opacity-80">{POLLUTANT_UNIT[r.pollutant]}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] opacity-80">{r.liveReason}</div>
                    )}
                    <div className="text-[10px] opacity-70">model data</div>
                  </button>
                );
              })}
            </div>

            <Section title={`${POLLUTANT_LABEL[pollutant]} by hour (past day and forecast)`}>
              <div className="h-[160px]" aria-label="Hourly model values">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ left: -14, right: 6, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                    <XAxis dataKey="label" tick={CHART.tick} tickLine={false} interval={5} />
                    <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
                    <Tooltip {...CHART.tooltip} formatter={(v) => [`${v == null ? 'n/a' : Number(v).toFixed(1)} ${POLLUTANT_UNIT[pollutant]}`, POLLUTANT_LABEL[pollutant]]} />
                    <ReferenceLine x={series.find((s) => s.t > now)?.label} stroke="#a3263f" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-sand-500">Hours before the dashed line are the past day; after it, the model forecast. MODEL_DATA, not measurements.</p>
            </Section>

            {live.weather && (
              <Section title="Weather" action={<StatusBadge status="MODEL_DATA" />}>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Temperature', live.weather.temperature === null ? 'n/a' : `${fmt(live.weather.temperature)} °C`],
                    ['Humidity', live.weather.humidity === null ? 'n/a' : `${fmt(live.weather.humidity, 0)} %`],
                    ['Wind', live.weather.windSpeed === null ? 'n/a' : `${fmt(live.weather.windSpeed)} m/s from ${fmt(live.weather.windDirection ?? 0, 0)}°`],
                    ['Pressure', live.weather.pressure === null ? 'n/a' : `${fmt(live.weather.pressure, 0)} hPa`],
                    ['Rain (24 h)', live.weather.rainfall24h === null ? 'n/a' : `${fmt(live.weather.rainfall24h)} mm`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
                      <dt className="text-sand-400">{k}</dt>
                      <dd className="font-semibold text-sand-50">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-1 text-[10px] text-sand-500">Source: Open-Meteo Forecast API at the city centre.</p>
                <button
                  type="button"
                  onClick={() => {
                    const w = live.weather!;
                    const patch: Partial<Record<'temperature' | 'humidity' | 'windSpeed' | 'windDirection' | 'pressure' | 'rainfall', number>> = {};
                    if (w.temperature !== null) patch.temperature = w.temperature;
                    if (w.humidity !== null) patch.humidity = w.humidity;
                    if (w.windSpeed !== null) patch.windSpeed = w.windSpeed;
                    if (w.windDirection !== null) patch.windDirection = w.windDirection;
                    if (w.pressure !== null) patch.pressure = w.pressure;
                    if (w.rainfall24h !== null) patch.rainfall = w.rainfall24h;
                    setWeather(patch);
                    setNotice('Live weather copied into the What-If scenario (only the values Open-Meteo returned).');
                  }}
                  className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg bg-ink-700 px-2.5 text-xs font-semibold text-sand-50 hover:bg-ink-600"
                >
                  <CloudSun size={14} /> Use as What-If weather
                </button>
              </Section>
            )}
            <button type="button" onClick={() => setMode('current')} className="min-h-9 w-full rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400">
              Show Current (model data) on the map
            </button>
          </>
        )
      )}
    </div>
  );
}

/** Air Quality -> Forecast. */
export function ForecastTab() {
  const live = useTwinStore((s) => s.live);
  const svc = useTwinStore((s) => s.modelService);
  const catalog = useTwinStore((s) => s.catalog);
  const pollutant = useTwinStore((s) => s.pollutant);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const selectStation = useTwinStore((s) => s.selectStation);
  const zone = useLiveZone();
  const now = useNow();
  const fresh = isLiveFresh(live, now);
  const days = useMemo(() => (fresh && zone?.point ? dailyForecast(zone.point) : []), [fresh, zone?.point]);

  return (
    <div className="space-y-3 py-2">
      <Section title={`Daily AQI estimate${zone ? ` · ${zone.name}` : ''}`} action={<StatusBadge status="MODEL_DATA" />}>
        {!fresh ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">Live model data is unavailable, so there is no forecast to show.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {days.map((d) => (
                <li key={d.date} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 p-2 text-xs hairline">
                  <span className="font-semibold text-sand-50">{d.date}</span>
                  {d.aqi.value !== null ? (
                    <AqiPill category={d.aqi.category} text={aqiLabel(d.aqi)} />
                  ) : (
                    <span className="text-[11px] text-sand-400">{d.aqi.reason ?? 'unavailable'}</span>
                  )}
                  <span className="font-mono text-[11px] text-sand-300">{d.pm25Mean === null ? '' : `PM2.5 ${fmt(d.pm25Mean, 0)}`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] leading-snug text-sand-500">
              Estimated from the CAMS model (about 40 km), IST dates. A day needs 16 valid hours per pollutant. Not an official station AQI.
            </p>
          </>
        )}
      </Section>

      <Section title={`Trained model +24 h · ${POLLUTANT_LABEL[pollutant]}`} action={<StatusBadge status="MODEL_PREDICTION" />}>
        {svc.status !== 'online' ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
            No data feed: the trained model service is not connected{svc.reason ? ` (${svc.reason})` : ''}. No forecast is invented.
          </p>
        ) : (
          <ul className="space-y-1">
            {catalog.stations
              .filter((s) => s.api)
              .map((s) => {
                const f = svc.forecasts[s.id];
                const p = isForecast(f) ? f.pollutants[pollutant as ApiPollutantKey] : undefined;
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => selectStation(s.id)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-ink-850 px-2 text-left text-xs hairline hover:bg-ink-800">
                      <span className="min-w-0 truncate font-semibold text-sand-50">{s.name}</span>
                      {isPredicted(p) ? (
                        <span className="font-mono text-sand-100">
                          {fmt(p.value)} <span className="text-[10px] text-sand-500">({fmt(p.lower, 0)}-{fmt(p.upper, 0)}){p.historical ? ' hist.' : ''}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-sand-400">UNAVAILABLE</span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-sand-500">
          Bundled readings are historical, so a current forecast is UNAVAILABLE until "Include historical forecast" is turned on in a station's details.
        </p>
        <button type="button" onClick={() => setMode('forecast')} className="mt-2 min-h-9 w-full rounded-xl bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600">
          Show Forecast on the map
        </button>
      </Section>
    </div>
  );
}
