import { AlertTriangle, Bell, CheckCircle2, ChevronRight, RadioTower, RefreshCw } from 'lucide-react';
import { refreshLiveNow } from '../../services/liveData';
import { useGovStore } from '../govStore';
import { POLLUTANT_NAME, POLLUTANT_UNIT, colorOf, useAirData, type PollutantKey } from '../lib/airdata';
import { SEVERITY_LABEL, useAlerts, type AlertSeverity } from '../lib/alerts';
import { useHotspots } from '../lib/hotspots';
import { countStations, useStations } from '../lib/stations';
import { formatAge, formatIst } from '../lib/format';
import { ForecastChart } from '../charts';
import { GlassHome } from './GlassHome';
import { AqiChip, Btn, CategoryScale, Card, EmptyState, Gauge, Skeleton, StatusChip, TrendBadge } from '../ui';
import { AQI_LABEL } from '../../services/cpcbAqi';

const SEV_COLOR: Record<AlertSeverity, string> = { critical: '#d9372f', high: '#f08c1a', watch: '#e0b100', info: '#9a8a80' };

const timeOnly = (ms: number) => formatIst(ms).replace(/^.*?, /, '');

export function HomeView() {
  const ui = useGovStore((s) => s.settings.ui);
  return ui !== 'classic' ? <GlassHome /> : <ClassicHome />;
}

function ClassicHome() {
  const air = useAirData();
  const stations = useStations();
  const { alerts, bySeverity } = useAlerts();
  const hot = useHotspots('aqi');
  const setView = useGovStore((s) => s.setView);
  const selectAlert = useGovStore((s) => s.selectAlert);
  const selectHotspot = useGovStore((s) => s.selectHotspot);
  const city = air.city;
  const loading = !city && (air.status === 'idle' || air.status === 'loading');

  const open = alerts.filter((a) => a.record.status !== 'resolved');
  const critical = bySeverity.critical;
  const c = countStations(stations);
  const total = c.total + c.notPlaced;
  const unavailable = Math.max(0, total - c.live - c.outdated);
  const outdatedStations = stations.placed.filter((s) => s.status === 'outdated');
  const dominant = city?.aqi.dominant_pollutant as PollutantKey | null | undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-40 pt-6 sm:px-6">
      <header className="mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="gov-eyebrow">Pune and Pimpri-Chinchwad</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-sand-50 sm:text-[28px]">Needs attention now</h1>
        </div>
        <Btn variant="ghost" icon={RefreshCw} ariaLabel="Refresh data" onClick={() => void refreshLiveNow(true)} className="!px-3" />
      </header>

      <div className="gov-stagger grid gap-4 md:grid-cols-2">
        {/* A. Overall city AQI */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="gov-eyebrow">City air quality</h2>
            <StatusChip kind="estimated" />
          </div>
          {loading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="mx-auto h-28 w-56" />
              <Skeleton className="mx-auto h-4 w-40" />
            </div>
          ) : city ? (
            <div className="mt-3 flex flex-col items-center text-sand-50">
              <Gauge value={city.value} category={city.category} />
              <div className="-mt-1 text-lg font-semibold" style={{ color: colorOf(city.category) }}>
                {AQI_LABEL[city.category]}
              </div>
              <div className="mt-3">
                <CategoryScale category={city.category} />
              </div>
              <p className="mt-4 text-sm text-sand-300">
                {dominant && POLLUTANT_NAME[dominant] ? `Main pollutant ${POLLUTANT_NAME[dominant]}` : 'Main pollutant unavailable'}
                {dominant && city.aqi.subindices[dominant] ? ` · ${Math.round(city.aqi.subindices[dominant]!.concentration)} ${POLLUTANT_UNIT[dominant]}` : ''}
              </p>
              <p className="mt-1 text-xs text-sand-400">Updated {formatIst(city.asOf)}</p>
            </div>
          ) : (
            <EmptyState title="Air quality unavailable" reason={air.reason ?? 'Check the connection and refresh.'} />
          )}
        </Card>

        {/* C. Active alerts */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="gov-eyebrow">Active alerts</h2>
            {critical > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#d9372f]/12 px-2.5 py-0.5 text-xs font-semibold text-[#d9372f]">
                <AlertTriangle size={13} /> {critical} critical
              </span>
            ) : (
              <span className="text-xs text-sand-400">None critical</span>
            )}
          </div>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-6xl font-semibold leading-none tabular-nums text-sand-50">{open.length}</span>
            <span className="pb-1 text-sm text-sand-300">{open.length === 1 ? 'alert needs attention' : 'alerts need attention'}</span>
          </div>
          {open.length === 0 ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-sand-300">
              <CheckCircle2 size={17} className="text-emerald-500" /> All clear right now.
            </p>
          ) : (
            <ul className="mt-5 space-y-1">
              {open.slice(0, 3).map((a) => (
                <li key={a.id} className="gov-alert-in">
                  <button
                    type="button"
                    onClick={() => {
                      selectAlert(a.id);
                      setView('alerts');
                    }}
                    className="gov-row gov-tap flex w-full items-center gap-3 px-2 py-2 text-left"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEV_COLOR[a.severity] }} aria-label={SEVERITY_LABEL[a.severity]} />
                    <span className="min-w-0 flex-1 truncate text-sm text-sand-100">{a.title}</span>
                    <ChevronRight size={16} className="shrink-0 text-sand-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Btn variant="secondary" icon={Bell} className="mt-5 w-full" onClick={() => setView('alerts')}>
            Open alerts inbox
          </Btn>
        </Card>

        {/* B. Top pollution hotspots */}
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="gov-eyebrow">Top pollution hotspots</h2>
            <button type="button" onClick={() => setView('hotspots')} className="gov-tap inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent-400 hover:underline">
              See all <ChevronRight size={15} />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : hot.zones.length === 0 ? (
            <EmptyState title="No hotspots to rank" reason="Area readings are not available right now." />
          ) : (
            <ol>
              {hot.zones.slice(0, 5).map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectHotspot(h.id);
                      setView('hotspots');
                    }}
                    className="gov-row gov-tap flex w-full items-center gap-3 px-2 py-3 text-left sm:gap-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold tabular-nums text-sand-200">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-sand-50">{h.name}</span>
                      <span className="block truncate text-sm text-sand-300">
                        {h.dominant && POLLUTANT_NAME[h.dominant as PollutantKey] ? POLLUTANT_NAME[h.dominant as PollutantKey] : 'AQI'}
                        {h.zone && h.dominant && h.zone.values[h.dominant as PollutantKey] !== undefined ? ` ${Math.round(h.zone.values[h.dominant as PollutantKey]!)} ${POLLUTANT_UNIT[h.dominant as PollutantKey]}` : ''}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <TrendBadge trend={h.trend} pct={h.trendPct} />
                    </span>
                    <AqiChip aqi={h.aqi} category={h.category} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* D. Next 24-72 hours */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="gov-eyebrow">Next 24 to 72 hours</h2>
            <StatusChip kind="forecast" />
          </div>
          <div className="mt-3">
            {loading ? <Skeleton className="h-40" /> : city && city.forecast.length > 0 ? <ForecastChart days={city.forecast} /> : <EmptyState title="Forecast unavailable" />}
          </div>
        </Card>

        {/* E. Station health */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="gov-eyebrow">Station health</h2>
            <button type="button" onClick={() => setView('stations')} className="gov-tap inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent-400 hover:underline">
              Stations <ChevronRight size={15} />
            </button>
          </div>
          {total === 0 ? (
            <EmptyState icon={RadioTower} title="No station list" reason="Station locations are not available yet." />
          ) : (
            <>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-5xl font-semibold leading-none tabular-nums text-sand-50">{total}</span>
                <span className="pb-1 text-sm text-sand-300">monitoring stations</span>
              </div>
              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800" role="img" aria-label={`${c.live} working, ${c.outdated} outdated, ${unavailable} unavailable`}>
                <span style={{ width: `${(c.live / total) * 100}%`, background: '#2fae8b' }} />
                <span style={{ width: `${(c.outdated / total) * 100}%`, background: '#e0a100' }} />
                <span style={{ width: `${(unavailable / total) * 100}%`, background: '#9a8a80' }} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Working', c.live, '#2fae8b'],
                  ['Outdated', c.outdated, '#c98a00'],
                  ['Unavailable', unavailable, '#9a8a80'],
                ].map(([k, v, col]) => (
                  <div key={k as string}>
                    <dd className="text-2xl font-semibold tabular-nums" style={{ color: col as string }}>
                      {v}
                    </dd>
                    <dt className="text-xs text-sand-300">{k}</dt>
                  </div>
                ))}
              </dl>
              {outdatedStations.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-sand-500/15 pt-3 text-sm">
                  {outdatedStations.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sand-100">{s.name}</span>
                      <span className="shrink-0 text-xs text-amber-700">{formatAge(s.ageMs)}</span>
                    </li>
                  ))}
                  {outdatedStations.length > 3 && <li className="text-xs text-sand-400">and {outdatedStations.length - 3} more outdated</li>}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
      {city && <p className="mt-5 text-center text-xs text-sand-400">Last model update {timeOnly(city.asOf)}</p>}
    </div>
  );
}
