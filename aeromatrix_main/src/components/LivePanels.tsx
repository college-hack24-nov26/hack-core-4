import { useEffect, useMemo, useState } from 'react';
import { CloudSun, RefreshCw, WifiOff } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section } from './ui';
import { AqiCard } from './AqiCard';
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
import { fmtIstTime, resolveCurrent } from '../services/pollutantData';
import { AQI_COLORS, aqiCategory, aqiLabel, type AqiCategory, type AqiResult } from '../services/cpcbAqi';
import { isForecast, isPredicted, type ApiPollutantKey } from '../services/aeromatrixApi';
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

/** The headline card for a city AQI estimate plus the live weather. */
function CityAqiCard({ est, weather }: { est: AqiResult; weather: ReturnType<typeof useTwinStore.getState>['live']['weather'] }) {
  const dom = est.dominant_pollutant;
  const sub = dom ? est.subindices[dom] : undefined;
  return (
    <AqiCard
      value={est.value}
      category={est.category}
      mainPollutant={dom ? POLLUTANT_LABEL[dom] : null}
      concentration={sub && dom ? `${fmt(sub.concentration, dom === 'co' ? 2 : 1)} ${POLLUTANT_UNIT[dom]}` : null}
      weather={weather ? { temperature: weather.temperature, windKmh: weather.windSpeed === null ? null : weather.windSpeed * 3.6, humidity: weather.humidity } : null}
    />
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
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const now = useNow();
  const fresh = isLiveFresh(live, now);

  const est = useMemo(() => (fresh ? cityAqiEstimate(live.points, now) : null), [fresh, live.points, now]);
  const trend = useMemo(() => {
    if (!fresh) return null;
    const c = cityHourly(live.points);
    return c ? aqiTrend(dailyForecast(c), istDate(now / 1000)) : null;
  }, [fresh, live.points, now]);

  return (
    <div aria-label="Live city air quality" className="space-y-2">
      {fresh && est ? (
        <>
          <CityAqiCard est={est} weather={live.weather} />
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-sand-400">
            <span>
              Updated {live.lastUpdated ? fmtIstTime(live.lastUpdated) : '-'}
              {trend && <> · tomorrow {trend.direction}</>}
            </span>
            <RefreshButton />
          </div>
          <button type="button" onClick={() => setMode('current')} className="min-h-10 w-full rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400">
            Show on map
          </button>
        </>
      ) : (
        <div className="flex gap-2 rounded-2xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
          <WifiOff size={15} className="mt-0.5 shrink-0" />
          <p>{live.status === 'loading' || live.status === 'idle' ? 'Loading live air quality…' : 'Live air quality is not available right now. Please try again shortly.'}</p>
        </div>
      )}
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

  const est = useMemo(() => (fresh ? cityAqiEstimate(live.points, now) : null), [fresh, live.points, now]);

  return (
    <div className="space-y-3 py-2">
      {!fresh ? (
        <p className="flex gap-2 rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
          <WifiOff size={15} className="mt-0.5 shrink-0" />
          {live.status === 'loading' || live.status === 'idle' ? 'Loading live air quality…' : 'Live air quality is not available right now. Please try again shortly.'}
        </p>
      ) : (
        zone && (
          <>
            {est && <CityAqiCard est={est} weather={live.weather} />}
            <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-sand-400">
              <span>
                {zone.name} · updated {live.lastUpdated ? fmtIstTime(live.lastUpdated) : '-'}
              </span>
              <RefreshButton />
            </div>

            <Section title="Pollutants">
              <div className="grid grid-cols-2 gap-2">
                {records.map((r) => {
                  const active = r.pollutant === pollutant;
                  const sub = est?.subindices[r.pollutant];
                  const level = sub ? AQI_COLORS[aqiCategory(sub.value)] : '#b8a99a';
                  return (
                    <button
                      key={r.pollutant}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPollutant(r.pollutant)}
                      className={`relative overflow-hidden rounded-2xl p-3 pl-4 text-left shadow-sm transition-all hairline ${active ? 'bg-ink-900 ring-2 ring-accent-500' : 'bg-ink-850 hover:-translate-y-0.5 hover:bg-ink-900'}`}
                    >
                      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: level }} aria-hidden />
                      <div className="text-xs font-semibold text-sand-300">{r.label}</div>
                      {r.live ? (
                        <div className="mt-0.5 font-display text-xl font-bold leading-tight text-sand-50">
                          {fmt(r.live.value, r.pollutant === 'co' ? 2 : 1)}
                          <span className="ml-1 text-[10px] font-medium text-sand-400">{POLLUTANT_UNIT[r.pollutant]}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-sand-400">No reading</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title={`${POLLUTANT_LABEL[pollutant]} through the day`}>
              <div className="h-[170px] [&_*]:outline-none" aria-label="Hourly values">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hourFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a3263f" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#a3263f" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART.gridOnCream} vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(series.length / 5))} />
                    <YAxis tick={CHART.tick} tickLine={false} axisLine={false} width={40} />
                    <Tooltip {...CHART.tooltip} formatter={(v) => [`${v == null ? 'n/a' : Number(v).toFixed(1)} ${POLLUTANT_UNIT[pollutant]}`, POLLUTANT_LABEL[pollutant]]} />
                    <ReferenceLine x={series.find((s) => s.t > now)?.label} stroke="#a3263f" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="value" stroke="#a3263f" strokeWidth={2.5} fill="url(#hourFill)" dot={false} isAnimationActive={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-sand-500">The dashed line marks now. Left is the past day, right is the next hours.</p>
            </Section>

            {live.weather && (
              <Section title="Weather">
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
            <button type="button" onClick={() => setMode('current')} className="min-h-10 w-full rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400">
              Show on map
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
      <Section title={`Next days${zone ? ` · ${zone.name}` : ''}`}>
        {!fresh ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">Live air quality is not available right now, so there is no forecast to show.</p>
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
          </>
        )}
      </Section>

      <Section title={`Next 24 hours · ${POLLUTANT_LABEL[pollutant]}`}>
        {svc.status !== 'online' ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
            Station forecasts are not available right now.
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
                        <span className="text-[10px] text-sand-400">Not available</span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
        <button type="button" onClick={() => setMode('forecast')} className="mt-2 min-h-9 w-full rounded-xl bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600">
          Show on map
        </button>
      </Section>
    </div>
  );
}
