import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, Gauge as GaugeIcon, MapPin, RadioTower, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cityHourly, liveValue, refreshLiveNow, zonePointId } from '../../services/liveData';
import { useTwinStore } from '../../store/useTwinStore';
import { useUserStore } from '../userStore';
import { POLLUTANT_KEYS, POLLUTANT_NAME, POLLUTANT_UNIT, aqiCategory, colorOf, useAirData, type AqiCategory, type ForecastDay, type PollutantKey } from '../lib/airdata';
import { countStations, useStations } from '../lib/stations';
import { formatIst } from '../lib/format';
import { PersonIllustration } from '../PersonIllustration';
import { AqiChip, Skeleton, StatusChip } from '../ui';
import { useHotspots } from '../lib/hotspots';
import { AQI_LABEL, AQI_SHORT } from '../../services/cpcbAqi';
import { Select } from '../../components/Select';
import { DeviceCard } from './DeviceCard';

const ADVICE: Record<AqiCategory, string> = {
  Good: 'Air is clean. Enjoy the outdoors.',
  Satisfactory: 'Acceptable. Very sensitive people may take it easy.',
  Moderate: 'Sensitive groups should limit time outside. Wear a mask.',
  Poor: 'Everyone should limit outdoor time and wear a mask.',
  'Very Poor': 'Avoid outdoor exercise. Wear a mask.',
  Severe: 'Stay indoors if you can. Mask outside.',
};

interface Pollutant {
  key: PollutantKey;
  concentration: number | null;
  sub: number | null;
}

type Loc = NonNullable<ReturnType<typeof useLocationAir>>;

/** The air of the place in view: the chosen zone, or the whole city. */
function useLocationAir() {
  const air = useAirData();
  const zoneId = useUserStore((s) => s.selectedZoneId);
  const live = useTwinStore((s) => s.live);
  return useMemo(() => {
    const zone = zoneId ? air.zones.find((z) => z.id === zoneId) : undefined;
    const city = air.city;
    if (!zone && !city) return null;
    const subs: Record<string, { value: number; concentration: number } | undefined> = zone
      ? Object.fromEntries(zone.subindices.map((s) => [s.pollutant, s]))
      : (city!.aqi.subindices as Record<string, { value: number; concentration: number } | undefined>);
    const values: Partial<Record<PollutantKey, number>> = zone ? zone.values : {};
    const pollutants: Pollutant[] = POLLUTANT_KEYS.map((key) => {
      const s = subs[key];
      return { key, concentration: s?.concentration ?? values[key] ?? null, sub: s?.value ?? null };
    }).filter((p) => p.concentration !== null);
    return {
      name: zone ? zone.place : 'Pune and Pimpri-Chinchwad',
      aqi: zone ? zone.aqi : city!.value,
      category: zone ? zone.category : city!.category,
      dominant: (zone ? zone.dominant : city!.aqi.dominant_pollutant) as PollutantKey | null,
      asOf: zone ? zone.time : city!.asOf,
      forecast: (zone ? zone.forecast : city!.forecast) as ForecastDay[],
      pollutants,
      weather: live.weather,
    };
  }, [air, zoneId, live.weather]);
}

function LocationPicker({ zones }: { zones: Array<{ id: string; place: string }> }) {
  const zoneId = useUserStore((s) => s.selectedZoneId);
  const select = useUserStore((s) => s.selectZone);
  const options = useMemo(() => {
    const seen = new Set<string>();
    return zones.filter((z) => (seen.has(z.place) ? false : (seen.add(z.place), true))).sort((a, b) => a.place.localeCompare(b.place));
  }, [zones]);
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <span className="sr-only">Location</span>
      <MapPin size={16} className="pointer-events-none absolute left-3.5 text-accent-500" />
      <Select
        value={zoneId ?? ''}
        onChange={(e) => select(e.target.value || null)}
        className="gov-tap h-11 w-full truncate rounded-2xl border border-white/60 bg-ink-900 pl-10 pr-3.5 text-sm font-semibold text-sand-50 shadow-sm backdrop-blur"
      >
        <option value="">All Pune and Pimpri-Chinchwad</option>
        {options.map((z) => (
          <option key={z.id} value={z.id}>
            {z.place}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Hero({ loc }: { loc: Loc }) {
  const color = colorOf(loc.category);
  const main = loc.dominant ? POLLUTANT_NAME[loc.dominant] : null;
  return (
    <section className="glass-hero glass-swap p-5 sm:p-7" aria-label="Air quality index" key={`${loc.name}-${loc.category}`}>
      <div className="flex items-center gap-2">
        <h2 className="gov-eyebrow">Air quality now</h2>
        <StatusChip kind="estimated" />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="min-w-0">
          <div className="font-display text-[68px] font-bold leading-none tracking-tight tabular-nums sm:text-[84px]" style={{ color }}>
            {loc.aqi}
          </div>
          <div className="mt-1 text-xl font-semibold text-sand-50">{AQI_LABEL[loc.category]}</div>
          <p className="mt-1 text-sm text-sand-200">{main ? `Mostly ${main}` : 'Air quality index'}</p>
          <p className="mt-3 inline-block rounded-2xl bg-white/45 px-3 py-2 text-sm font-medium text-sand-100 backdrop-blur">{ADVICE[loc.category]}</p>
        </div>
        <PersonIllustration category={loc.category} />
      </div>
      <p className="mt-3 text-xs text-sand-300">Updated {formatIst(loc.asOf)}</p>
    </section>
  );
}

/** The most polluted places first (the hotspots), with the pollutant breakdown of the place in view one tap away. */
function Hotspots({ loc }: { loc: Loc }) {
  const [tab, setTab] = useState<'places' | 'pollutants'>('places');
  const hot = useHotspots('aqi');
  const setView = useUserStore((s) => s.setView);
  const focusMap = useUserStore((s) => s.focusMap);
  const [more, setMore] = useState(false);
  const places = hot.zones.slice(0, more ? 10 : 5);
  const pollutants = useMemo(() => [...loc.pollutants].sort((a, b) => (b.sub ?? 0) - (a.sub ?? 0) || (b.concentration ?? 0) - (a.concentration ?? 0)), [loc.pollutants]);
  return (
    <section className="gov-card p-5" aria-label="Top pollutant hotspots">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sand-50">Top Pollutant Hotspots</h2>
        <button type="button" onClick={() => setMore((v) => !v)} className="gov-tap min-h-9 text-sm font-semibold text-accent-500">
          {more ? 'Show less' : 'View all'}
        </button>
      </div>
      <div role="tablist" aria-label="Hotspot view" className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-ink-800 p-1">
        {([['places', 'Places'], ['pollutants', 'Pollutants']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`gov-tap min-h-9 rounded-xl text-sm font-semibold transition-all ${tab === id ? 'bg-accent-500 text-white shadow' : 'text-sand-200 hover:bg-white/40'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'places' ? (
        places.length === 0 ? (
          <p className="text-sm text-sand-300">No places to rank right now.</p>
        ) : (
          <ol className="glass-swap space-y-1.5">
            {places.map((h, i) => {
              const dom = h.dominant as PollutantKey | null;
              const val = dom && h.zone ? h.zone.values[dom] : undefined;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      focusMap(h.location[0], h.location[1]);
                      setView('map');
                    }}
                    className="gov-tap flex w-full items-center gap-3 rounded-2xl bg-ink-850 px-3 py-2.5 text-left ring-1 ring-white/40 transition-colors hover:bg-ink-800"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: colorOf(h.category) }}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-sand-50">{h.name}</span>
                      <span className="block truncate text-xs text-sand-300">
                        {dom ? POLLUTANT_NAME[dom] : 'AQI'}
                        {val !== undefined && dom ? ` ${val.toFixed(dom === 'co' ? 2 : 0)} ${POLLUTANT_UNIT[dom]}` : ''}
                      </span>
                    </span>
                    <AqiChip aqi={h.aqi} category={h.category} />
                  </button>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <ul className="glass-swap space-y-3">
          {pollutants.slice(0, 6).map((p) => {
            const cat = p.sub !== null ? aqiCategory(p.sub) : null;
            const col = colorOf(cat);
            const pctBar = Math.max(6, Math.min(100, ((p.sub ?? 0) / 300) * 100));
            return (
              <li key={p.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-sand-50">{POLLUTANT_NAME[p.key]}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-sand-100">
                      {p.concentration!.toFixed(p.key === 'co' ? 2 : 0)} <span className="text-xs text-sand-400">{POLLUTANT_UNIT[p.key]}</span>
                    </span>
                    {cat && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${col}26`, color: col }}>
                        {AQI_SHORT[cat]}
                      </span>
                    )}
                  </span>
                </div>
                <div className="glass-bar mt-1.5">
                  <span style={{ width: `${pctBar}%`, background: col }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Spark({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const y = (v: number) => 28 - ((v - min) / span) * 22 - 3;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * 100;
  return (
    <svg viewBox="0 0 100 30" className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill={color} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Forecast({ loc }: { loc: Loc }) {
  const [hours, setHours] = useState<24 | 48 | 72>(24);
  const days = loc.forecast;
  const cur = days.find((d) => d.hours === hours);
  const series = [loc.aqi, ...[24, 48, 72].map((h) => days.find((d) => d.hours === h)?.aqi).filter((v): v is number => typeof v === 'number')];
  const delta = cur ? cur.aqi - loc.aqi : 0;
  const Icon = delta > 5 ? ArrowUpRight : delta < -5 ? ArrowDownRight : ArrowRight;
  const trendColor = delta > 5 ? '#ef4444' : delta < -5 ? '#16a34a' : '#64748b';
  const w = loc.weather;
  return (
    <section className="gov-card p-5" aria-label="Air quality forecast">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sand-50">Air Quality Forecast</h2>
        <StatusChip kind="forecast" />
      </div>
      <div role="tablist" aria-label="Forecast period" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-ink-800 p-1">
        {([24, 48, 72] as const).map((h) => (
          <button
            key={h}
            type="button"
            role="tab"
            aria-selected={hours === h}
            onClick={() => setHours(h)}
            className={`gov-tap min-h-10 rounded-xl text-sm font-semibold transition-all ${hours === h ? 'bg-accent-500 text-white shadow' : 'text-sand-200 hover:bg-white/40'}`}
          >
            +{h} Hours
          </button>
        ))}
      </div>
      {cur ? (
        <div key={hours} className="glass-swap mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
          <div>
            <div className="font-display text-5xl font-bold leading-none tabular-nums" style={{ color: colorOf(cur.category) }}>
              {cur.aqi}
            </div>
            <div className="mt-1 text-sm font-semibold text-sand-50">{AQI_LABEL[cur.category]}</div>
          </div>
          <div className="min-w-0">
            <Spark points={series} color={colorOf(cur.category)} />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-sand-300">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: trendColor }}>
                <Icon size={14} /> {delta === 0 ? 'Steady' : `${delta > 0 ? '+' : ''}${delta} vs now`}
              </span>
              <span>
                {cur.pm25 !== null ? `PM2.5 ${Math.round(cur.pm25)}` : ''}
                {w && w.temperature !== null ? ` · ${Math.round(w.temperature)}°C` : ''}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-sand-300">No forecast for this period yet.</p>
      )}
    </section>
  );
}

/** Temperature, humidity, wind, pressure and rain, in small glass tiles. */
function Conditions({ loc }: { loc: Loc }) {
  const w = loc.weather;
  if (!w) return null;
  const tiles: Array<{ icon: typeof Wind; label: string; value: string }> = [
    { icon: Thermometer, label: 'Temperature', value: w.temperature === null ? '-' : `${w.temperature.toFixed(1)} °C` },
    { icon: Droplets, label: 'Humidity', value: w.humidity === null ? '-' : `${Math.round(w.humidity)} %` },
    { icon: Wind, label: 'Wind', value: w.windSpeed === null ? '-' : `${Math.round(w.windSpeed * 3.6)} km/h` },
    { icon: GaugeIcon, label: 'Pressure', value: w.pressure === null ? '-' : `${Math.round(w.pressure)} hPa` },
    { icon: CloudRain, label: 'Rain (24 h)', value: w.rainfall24h === null ? '-' : `${w.rainfall24h.toFixed(1)} mm` },
  ];
  return (
    <section className="gov-card p-5" aria-label="Current conditions">
      <h2 className="mb-3 text-base font-semibold text-sand-50">Current Conditions</h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl bg-ink-850 p-3 shadow-sm ring-1 ring-white/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/12 text-accent-500">
              <Icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-sand-300">{label}</span>
              <span className="block truncate text-sm font-bold tabular-nums text-sand-50">{value}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** PM2.5 over the last 24 hours for the place in view. */
function Trend24({ zoneId }: { zoneId: string | null }) {
  const live = useTwinStore((s) => s.live);
  const air = useAirData();
  const data = useMemo(() => {
    const src = zoneId ? live.points[zonePointId(zoneId)] : cityHourly(live.points);
    if (!src) return [];
    // the zone's local variation, so the chart ends at the same PM2.5 the card above shows
    const row = zoneId ? air.zones.find((z) => z.id === zoneId) : undefined;
    const raw = zoneId ? liveValue(live.points[zonePointId(zoneId)], 'pm25') : null;
    const scale = row?.pm25 && raw ? row.pm25 / raw : 1;
    const now = Date.now() / 1000;
    const out: Array<{ label: string; value: number }> = [];
    src.times.forEach((tm, i) => {
      const v = src.hourly.pm25[i];
      if (tm <= now && tm > now - 24 * 3600 && typeof v === 'number') {
        out.push({ label: new Date(tm * 1000 + 330 * 60000).toISOString().slice(11, 16), value: Math.round(v * scale * 10) / 10 });
      }
    });
    return out;
  }, [live.points, zoneId, air.zones]);
  if (data.length < 3) return null;
  return (
    <section className="gov-card p-5" aria-label="PM2.5 trend">
      <h2 className="mb-2 text-base font-semibold text-sand-50">PM2.5 Trend (Last 24 Hours)</h2>
      <div className="h-[170px] [&_*]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gov-aqi)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--gov-aqi)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(100,124,163,.25)" vertical={false} strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-sand-400)' }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / 5))} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-sand-400)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} µg/m³`, 'PM2.5']} contentStyle={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.7)', background: 'rgba(255,255,255,.9)', fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke="var(--gov-aqi)" strokeWidth={2.5} fill="url(#trendFill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function StationHealth() {
  const st = useStations();
  const setView = useUserStore((s) => s.setView);
  const c = countStations(st);
  const total = c.total + c.notPlaced;
  const active = c.live + c.estimate;
  const offline = Math.max(0, total - active - c.outdated);
  const health = total > 0 ? Math.round(((active + c.outdated) / total) * 100) : 0;
  const tone = health >= 70 ? { t: 'Healthy', c: '#16a34a' } : health >= 40 ? { t: 'Fair', c: '#d97706' } : { t: 'Needs attention', c: '#dc2626' };
  return (
    <section className="gov-card p-5" aria-label="Station health">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sand-50">Station Health</h2>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${tone.c}22`, color: tone.c }}>
          {tone.t}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-sand-300">Station list not available yet.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-4xl font-bold tabular-nums text-sand-50">{total}</div>
              <div className="text-xs text-sand-300">monitoring stations</div>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl font-bold tabular-nums" style={{ color: tone.c }}>
                {health}%
              </div>
              <div className="text-xs text-sand-300">network health</div>
            </div>
          </div>
          <div className="glass-bar mt-3 flex !h-2.5">
            <span style={{ width: `${(active / total) * 100}%`, background: '#22c55e', borderRadius: 0 }} />
            <span style={{ width: `${(c.outdated / total) * 100}%`, background: '#f59e0b', borderRadius: 0 }} />
            <span style={{ width: `${(offline / total) * 100}%`, background: '#94a3b8', borderRadius: 0 }} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Active', active, '#16a34a'],
              ['Needs upkeep', c.outdated, '#d97706'],
              ['Offline', offline, '#64748b'],
            ].map(([k, v, col]) => (
              <div key={k as string} className="rounded-2xl bg-ink-850 py-2.5">
                <dd className="text-xl font-bold tabular-nums" style={{ color: col as string }}>
                  {v}
                </dd>
                <dt className="text-[11px] text-sand-300">{k}</dt>
              </div>
            ))}
          </dl>
          {c.estimate > 0 && <p className="mt-3 text-xs text-sand-300">{c.live} measured now, {c.estimate} showing estimated values.</p>}
        </>
      )}
      <button type="button" onClick={() => setView('stations')} className="gov-tap mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl bg-ink-800 text-sm font-semibold text-sand-50 hover:bg-white/60">
        <RadioTower size={16} /> Station details
      </button>
    </section>
  );
}

/** The glass Home: one scrollable dashboard with the AQI card first. */
export function GlassHome() {
  const loc = useLocationAir();
  const air = useAirData();
  const zoneId = useUserStore((s) => s.selectedZoneId);
  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-4 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <LocationPicker zones={air.zones} />
        <button type="button" onClick={() => void refreshLiveNow(true)} aria-label="Refresh data" className="gov-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-ink-900 text-sand-200 shadow-sm backdrop-blur">
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="space-y-4">
        {loc ? <Hero loc={loc} /> : <Skeleton className="h-64" />}
        <DeviceCard />
        {loc ? (
          <>
            <Hotspots loc={loc} />
            <Forecast loc={loc} />
            <Conditions loc={loc} />
            <Trend24 zoneId={zoneId} />
          </>
        ) : (
          <>
            <Skeleton className="h-40" />
            <p className="px-1 text-center text-sm text-sand-300">{air.status === 'offline' ? 'Air quality is not available right now. Try refreshing in a moment.' : 'Loading air quality…'}</p>
          </>
        )}
        <StationHealth />
      </div>
    </div>
  );
}
