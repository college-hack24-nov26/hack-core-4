import { MapPin, TriangleAlert } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge, Toggle } from './ui';
import { RegionScenarioSection } from './RegionScenarioPanels';
import type { DrawerContent } from './drawers';
import { AQI_COLORS, aqiLabel, type AqiCategory } from '../services/cpcbAqi';
import {
  API_POLLUTANT_LABEL,
  describeWarning,
  isForecast,
  isMeasured,
  isMeasuredValue,
  isPredicted,
  isUnavailable,
  modelQuality,
  type ApiAqi,
  type ApiPollutantKey,
} from '../services/aeromatrixApi';
import { fmtIst } from '../services/pollutantData';
import { fmt } from '../utils/format';
import type { PlacedStation } from '../services/stations';

const SHORT = (s: string) => s.replace(/^[A-Z_]+_/, '').replace(/_/g, ' ').toLowerCase();

function AqiChip({ aqi, outdated }: { aqi: ApiAqi | undefined; outdated: boolean }) {
  if (!aqi || aqi.status === 'UNAVAILABLE' || aqi.value == null) {
    return <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold text-sand-300">AQI unavailable</span>;
  }
  const color = AQI_COLORS[(aqi.category ?? 'Moderate') as AqiCategory] ?? '#9aa0a6';
  return (
    <span className="flex items-center gap-1">
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: color }}>
        {aqiLabel({ status: aqi.status, value: aqi.value, category: (aqi.category ?? null) as AqiCategory | null })}
      </span>
      {outdated && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Outdated</span>}
    </span>
  );
}

/** Air Quality -> Monitoring stations. */
export function StationsTab() {
  const catalog = useTwinStore((s) => s.catalog);
  const svc = useTwinStore((s) => s.modelService);
  const selected = useTwinStore((s) => s.selectedStationId);
  const selectStation = useTwinStore((s) => s.selectStation);
  const flyTo = useTwinStore((s) => s.flyTo);
  const connect = useTwinStore((s) => s.connectModelService);

  const withFeed = catalog.stations.filter((s) => s.api).length;
  const placed = catalog.stations.filter((s) => s.lat !== null).length;
  const outdated = Object.values(svc.measured).filter((m) => isMeasured(m) && m.historical).length;

  const open = (s: PlacedStation) => {
    selectStation(s.id);
    if (s.lat !== null && s.lon !== null) flyTo(s.lon, s.lat, 3500);
  };

  return (
    <div className="space-y-2 py-2">
      <div className="rounded-xl bg-ink-850 p-3 text-xs hairline" role="status">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sand-50">
            Model service:{' '}
            {svc.status === 'online' ? <span className="text-emerald-600">online</span> : svc.status === 'connecting' ? 'connecting…' : <span className="text-red-600">offline</span>}
          </span>
          {svc.status !== 'online' && (
            <button type="button" onClick={() => void connect()} className="min-h-8 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700">
              Retry
            </button>
          )}
        </div>
        {svc.status === 'offline' && <p className="mt-1 text-sand-300">{svc.reason ?? 'Not reachable.'} Stations show "No data feed"; nothing is invented.</p>}
        <p className="mt-1 text-sand-400">
          {catalog.stations.length} stations listed · {placed} drawn on the map · {withFeed} with a data feed · {outdated} with an Outdated snapshot
        </p>
      </div>

      {catalog.notice && (
        <p role="note" className="flex gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          {catalog.notice}
        </p>
      )}

      <ul className="space-y-1">
        {catalog.stations.map((s) => {
          const m = svc.measured[s.id];
          const hasReading = isMeasured(m);
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={selected === s.id}
                onClick={() => open(s)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-ink-800 aria-pressed:bg-ink-800"
              >
                <MapPin size={15} className={s.lat === null ? 'text-sand-600' : 'text-accent-500'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-sand-50">{s.name}</span>
                  <span className="block truncate text-[10px] text-sand-500">
                    {[s.monitoring === 'manual' ? 'Manual (NAMP)' : 'Continuous (CAAQMS)', s.agency, s.city].filter(Boolean).join(' · ')}
                    {s.lat === null ? ' · not drawn: no sourced coordinate' : s.singleSource ? ' · single source' : ''}
                  </span>
                </span>
                {hasReading ? (
                  <AqiChip aqi={m.aqi} outdated={!!m.historical} />
                ) : s.api ? (
                  <span className="text-[10px] text-sand-400">{isUnavailable(m) ? 'No reading' : 'No data feed'}</span>
                ) : (
                  <span className="text-[10px] text-sand-400">No data feed</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {catalog.unlocated.length > 0 && (
        <Section title="Listed, not placed">
          <ul className="space-y-1.5">
            {catalog.unlocated.map((u) => (
              <li key={u.name} className="rounded-lg bg-ink-850 p-2 text-[11px] hairline">
                <span className="font-semibold text-sand-100">{u.name}</span>
                <span className="block text-sand-500">
                  {u.monitoring === 'manual' ? 'Manual (NAMP)' : 'Continuous'}
                  {u.city ? ` · ${u.city}` : ''}
                </span>
                <span className="block text-sand-400">{u.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-sand-500">These stations have no sourced coordinate, so they are never drawn.</p>
        </Section>
      )}
    </div>
  );
}

/** The right drawer for a selected monitoring station. */
export function useStationDrawer(): DrawerContent | null {
  const id = useTwinStore((s) => s.selectedStationId);
  const catalog = useTwinStore((s) => s.catalog);
  const svc = useTwinStore((s) => s.modelService);
  const allow = useTwinStore((s) => s.allowHistoricalForecast);
  const setAllow = useTwinStore((s) => s.setAllowHistoricalForecast);
  const st = catalog.stations.find((s) => s.id === id);
  if (!id || !st) return null;

  const m = svc.measured[id];
  const f = svc.forecasts[id];
  const measured = isMeasured(m) ? m : null;

  return {
    title: st.name,
    subtitle: [st.agency, st.city].filter(Boolean).join(' · ') || st.id,
    body: (
      <div className="space-y-1 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status="OBSERVED" />
          {measured?.historical && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800">Outdated</span>}
        </div>

        <Section title="Coordinates">
          {st.lat !== null ? (
            <p className="text-xs text-sand-200">
              {st.lat.toFixed(5)}°N {st.lon?.toFixed(5)}°E ·{' '}
              {st.coordSource === 'service' ? 'from the model service' : `verified from ${st.sources.length} source${st.sources.length === 1 ? '' : 's'}`}
            </p>
          ) : (
            <p className="text-xs text-sand-300">No sourced coordinate: this station is not drawn on the map.</p>
          )}
          {st.sources.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-sand-400">
              {st.sources.map((s) => (
                <li key={s} title={catalog.sourcesText[s]}>
                  {SHORT(s) === s.toLowerCase() ? s : s.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
          {st.singleSource && <p className="mt-1 text-[11px] font-semibold text-amber-800">Single-source coordinate: not cross-checked.</p>}
          {st.note && <p className="mt-1 text-[11px] text-sand-400">{st.note}</p>}
        </Section>

        {!st.api && (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
            No data feed: {svc.status === 'online' ? 'the trained model service does not cover this station.' : 'the model service is not connected.'} Nothing is shown in its place.
          </p>
        )}

        {st.api && (
          <>
            <Section title="Measured snapshot">
              {measured ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <AqiChip aqi={measured.aqi} outdated={!!measured.historical} />
                    <span className="text-[11px] text-sand-400">snapshot {fmtIst(measured.snapshot_end)}</span>
                  </div>
                  {measured.aqi.dominant_pollutant && measured.aqi.status !== 'UNAVAILABLE' && (
                    <p className="mt-1 text-[11px] text-sand-400">Dominant pollutant: {API_POLLUTANT_LABEL[measured.aqi.dominant_pollutant as ApiPollutantKey] ?? measured.aqi.dominant_pollutant.toUpperCase()} · {measured.aqi.method}</p>
                  )}
                  {measured.aqi.status === 'UNAVAILABLE' && measured.aqi.reason && <p className="mt-1 text-[11px] text-sand-400">{measured.aqi.reason}</p>}
                  <table className="mt-2 w-full text-[11px]">
                    <tbody>
                      {(Object.keys(measured.pollutants) as ApiPollutantKey[]).map((k) => {
                        const v = measured.pollutants[k];
                        return (
                          <tr key={k} className="border-t border-sand-400/15">
                            <td className="py-1 font-semibold text-sand-100">{API_POLLUTANT_LABEL[k] ?? k}</td>
                            <td className="py-1 font-mono">
                              {isMeasuredValue(v) ? `${fmt(v.value, k === 'co' ? 2 : 1)} ${v.unit}` : <span className="font-sans text-sand-500">{(v as { reason?: string })?.reason ?? 'unavailable'}</span>}
                            </td>
                            <td className="py-1 text-right text-sand-500">{isMeasuredValue(v) ? fmtIst(v.time) : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[10px] leading-snug text-sand-500">{measured.notice}</p>
                </>
              ) : (
                <p className="text-xs text-sand-300">
                  {isUnavailable(m) ? `Unavailable: ${m.reason}` : 'No snapshot was received for this station.'}
                </p>
              )}
            </Section>

            <Section title="+24 h forecast (trained model)" action={<StatusBadge status="MODEL_PREDICTION" />}>
              <Toggle label="Include historical forecast" checked={allow} onChange={(v) => void setAllow(v)} />
              {isForecast(f) ? (
                <>
                  <p className="mb-1 text-[11px] text-sand-400">Status {f.status}. {f.scenario_note}</p>
                  <ul className="space-y-1.5">
                    {(Object.keys(f.pollutants) as ApiPollutantKey[]).map((k) => {
                      const p = f.pollutants[k];
                      if (isPredicted(p)) {
                        const q = modelQuality(p);
                        return (
                          <li key={k} className="rounded-lg bg-ink-850 p-2 text-[11px] hairline">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sand-50">{API_POLLUTANT_LABEL[k] ?? k}</span>
                              <span className="font-mono text-sand-50">
                                {fmt(p.value, k === 'co' ? 2 : 1)} {p.unit}
                              </span>
                            </div>
                            <div className="text-sand-400">
                              Interval {fmt(p.lower, k === 'co' ? 2 : 1)} to {fmt(p.upper, k === 'co' ? 2 : 1)} · valid {fmtIst(p.valid_at)}
                              {p.historical ? ' · historical forecast' : ''}
                            </div>
                            <div className="text-sand-400">
                              {p.model.kind === 'statistical_baseline' ? 'Statistical baseline' : 'Fitted ML model'} ({p.model.algorithm}) · {q.label}
                            </div>
                            <div className="text-sand-500">{q.reasons.filter((r) => !r.includes('_')).join(' · ')}</div>
                            {p.reliability_warnings.map((w) => (
                              <div key={w} className="font-semibold text-amber-800">⚠ {describeWarning(w)}</div>
                            ))}
                          </li>
                        );
                      }
                      return (
                        <li key={k} className="rounded-lg bg-ink-850 p-2 text-[11px] hairline">
                          <span className="font-bold text-sand-100">{API_POLLUTANT_LABEL[k] ?? k}</span>{' '}
                          <span className="text-sand-400">UNAVAILABLE: {isUnavailable(p) ? p.reason : 'no forecast'}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="rounded-lg bg-ink-850 p-2 text-xs text-sand-300 hairline" role="status">
                  UNAVAILABLE: {isUnavailable(f) ? f.reason : 'no forecast was received.'}
                  {!allow && ' The bundled readings are historical, so a current forecast is unavailable; turn on "Include historical forecast" to see the model\'s +24 h value from that snapshot.'}
                </p>
              )}
            </Section>
          </>
        )}

        <Section title="Hypothetical scenario for this region">
          <RegionScenarioSection stationId={id} />
        </Section>
      </div>
    ),
  };
}
