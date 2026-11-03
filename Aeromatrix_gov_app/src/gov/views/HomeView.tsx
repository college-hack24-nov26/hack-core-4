import { Bell, Flame, RadioTower, RefreshCw, WifiOff } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { refreshLiveNow } from '../../services/liveData';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { useAlerts, SEVERITY_LABEL, type AlertSeverity } from '../lib/alerts';
import { useHotspots } from '../lib/hotspots';
import { countStations, useStations } from '../lib/stations';
import { formatIst, pollutantLabel } from '../lib/format';
import { AqiChip, Btn, EmptyState, ForecastStrip, KpiCard, PageTitle, SectionCard, StatusChip, TrendBadge } from '../ui';

const SEV_COLOR: Record<AlertSeverity, string> = { critical: '#d9372f', high: '#f08c1a', watch: '#e0b100', info: '#9a8a80' };

export function HomeView() {
  const air = useAirData();
  const stations = useStations();
  const { alerts, bySeverity, newCount } = useAlerts();
  const hot = useHotspots();
  const setView = useGovStore((s) => s.setView);
  const selectAlert = useGovStore((s) => s.selectAlert);
  const selectHotspot = useGovStore((s) => s.selectHotspot);
  const svc = useTwinStore((s) => s.modelService);
  const verified = useTwinStore((s) => s.verified);
  const industry = useTwinStore((s) => s.industry);
  const geometryInfo = useTwinStore((s) => s.geometryInfo);
  const counts = countStations(stations);
  const open = alerts.filter((a) => a.record.status !== 'resolved');
  const city = air.city;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-32">
      <PageTitle
        title="Pune and Pimpri-Chinchwad: air today"
        sub="Find the problem, understand it, decide what to do, test it, and get a costed plan."
        right={
          <Btn icon={RefreshCw} onClick={() => void refreshLiveNow(true)} title="Fetch the latest model data now">
            Refresh
          </Btn>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-1">
          {city ? (
            <KpiCard
              label="City air quality (estimate)"
              value={Math.round(city.value)}
              accent={undefined}
              chip={
                <>
                  <AqiChip category={city.category} />
                  <StatusChip kind="estimated" />
                </>
              }
              sub={
                <>
                  <div>Main pollutant {pollutantLabel(city.aqi.dominant_pollutant)}; PM2.5 {city.pm25?.toFixed(0) ?? 'n/a'} and PM10 {city.pm10?.toFixed(0) ?? 'n/a'} ug/m3</div>
                  <div className="mt-1 text-sand-400">{city.method}</div>
                  <div className="mt-1 text-sand-400">Model hour: {formatIst(city.asOf)}</div>
                </>
              }
            />
          ) : (
            <SectionCard title="City air quality">
              <EmptyState
                icon={WifiOff}
                title={air.status === 'loading' || air.status === 'idle' ? 'Loading model data' : 'No data feed'}
                reason={air.status === 'loading' || air.status === 'idle' ? 'Fetching the Open-Meteo CAMS model data for the city.' : (air.reason ?? 'Open-Meteo did not return data. Nothing is shown rather than an invented number.')}
              />
            </SectionCard>
          )}
        </div>

        <SectionCard title="Outlook" action={<StatusChip kind="forecast" />}>
          <ForecastStrip days={city?.forecast ?? []} />
          <p className="mt-2 text-[11px] text-sand-400">City-wide model outlook. Model data has no published error band here.</p>
        </SectionCard>

        <SectionCard
          title="Alerts"
          action={
            <Btn variant="ghost" icon={Bell} onClick={() => setView('alerts')} className="!px-2 text-xs">
              {newCount > 0 ? `${newCount} new` : 'Open'}
            </Btn>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {(['critical', 'high', 'watch', 'info'] as AlertSeverity[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-xs font-semibold text-sand-100 hairline">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[s] }} />
                {bySeverity[s]} {SEVERITY_LABEL[s].toLowerCase()}
              </span>
            ))}
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-sand-300">No threshold is crossed right now. An alert appears only when real data reaches Poor or worse, or station feeds go stale.</p>
          ) : (
            <ul className="space-y-2">
              {open.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectAlert(a.id);
                      setView('alerts');
                    }}
                    className="gov-tap w-full rounded-xl bg-ink-800 p-3 text-left hairline hover:bg-ink-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEV_COLOR[a.severity] }} />
                      <span className="text-sm font-bold text-sand-50">{a.title}</span>
                    </div>
                    <div className="mt-0.5 pl-4 text-xs text-sand-300">{a.record.status === 'new' ? 'New' : a.record.status}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Top hotspots (areas)"
          className="md:col-span-2"
          action={
            <Btn variant="ghost" icon={Flame} onClick={() => setView('hotspots')} className="!px-2 text-xs">
              All hotspots
            </Btn>
          }
        >
          {hot.zones.length === 0 ? (
            <EmptyState title="No area values" reason="Hotspots are ranked from the live model estimate for each area. There is no model data right now." />
          ) : (
            <ol className="space-y-2">
              {hot.zones.slice(0, 5).map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectHotspot(h.id);
                      setView('hotspots');
                    }}
                    className="gov-tap flex w-full items-center gap-3 rounded-xl bg-ink-800 p-3 text-left hairline hover:bg-ink-700"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-sand-100">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-sand-50">{h.name}</span>
                      <span className="block truncate text-xs text-sand-400">{h.subtitle}</span>
                    </span>
                    <TrendBadge trend={h.trend} pct={h.trendPct} />
                    <AqiChip aqi={h.aqi} category={h.category} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard
          title="Monitoring stations"
          action={
            <Btn variant="ghost" icon={RadioTower} onClick={() => setView('stations')} className="!px-2 text-xs">
              Stations
            </Btn>
          }
        >
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Measured now', counts.live],
              ['Outdated', counts.outdated],
              ['No data feed', counts.noFeed + counts.estimate],
              ['Not placed', counts.notPlaced],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ink-800 p-3 hairline">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-sand-400">{k}</dt>
                <dd className="font-display text-2xl font-bold text-sand-50">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-sand-300">
            {counts.total === 0
              ? (stations.notice ?? 'Sourced station coordinates not loaded.')
              : counts.live === 0
                ? 'No station has a current reading. The newest readings are old and are shown with their dates.'
                : `${counts.live} of ${counts.total} placed stations have a current reading.`}
          </p>
        </SectionCard>

        <SectionCard title="Data freshness" className="md:col-span-2 xl:col-span-3">
          <ul className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
            <li className="rounded-xl bg-ink-800 p-3 hairline">
              <div className="font-bold text-sand-100">Open-Meteo CAMS model data</div>
              <div className="text-sand-300">
                {air.lastUpdated ? `Fetched ${formatIst(air.lastUpdated)}` : 'Not fetched yet'}
                {air.status === 'offline' ? ' (offline)' : ''}
              </div>
              {air.missingZones > 0 && air.zones.length > 0 && <div className="text-sand-400">{air.missingZones} zones have no model value.</div>}
            </li>
            <li className="rounded-xl bg-ink-800 p-3 hairline">
              <div className="font-bold text-sand-100">Station-data service</div>
              <div className="text-sand-300">{svc.status === 'online' ? `Online, connected ${formatIst(svc.connectedAt)}` : svc.status === 'connecting' ? 'Connecting' : `Not reachable${svc.reason ? `: ${svc.reason}` : ''}`}</div>
            </li>
            <li className="rounded-xl bg-ink-800 p-3 hairline">
              <div className="font-bold text-sand-100">Station coordinates</div>
              <div className="text-sand-300">{verified?.status === 'loaded' ? `${verified.file.stations.length} sourced coordinates loaded` : 'Sourced station coordinates not loaded'}</div>
            </li>
            <li className="rounded-xl bg-ink-800 p-3 hairline">
              <div className="font-bold text-sand-100">Roads and industry (OpenStreetMap)</div>
              <div className="text-sand-300">{geometryInfo.source === 'osm' ? `Snapshot${geometryInfo.generated ? ` of ${geometryInfo.generated.slice(0, 10)}` : ''}` : 'Not loaded; causes cannot be shown'}</div>
            </li>
            <li className="rounded-xl bg-ink-800 p-3 hairline">
              <div className="font-bold text-sand-100">Industry dataset (MIDC)</div>
              <div className="text-sand-300">{industry?.status === 'loaded' ? 'Loaded' : 'Industry dataset not loaded'}</div>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
