import { useMemo, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { aqiName } from '../../services/cpcbAqi';
import { POLLUTANT_KEYS, POLLUTANT_NAME, POLLUTANT_UNIT, useAirData } from '../lib/airdata';
import { nearestZone } from '../lib/hotspots';
import { useWeeklyHistory } from '../lib/useHistory';
import { STATUS_LABEL, type StationRow, type StationStatus } from '../lib/stations';
import { formatAge, formatIst } from '../lib/format';
import { WeeklyChart } from '../charts';
import { AqiChip, Btn, StatusChip, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';
import { ComplaintSheet } from './ComplaintSheet';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

/** Everything the app knows about one station, with a button to register a complaint about it. */
export function StationDetail({ s, onClose }: { s: StationRow; onClose: () => void }) {
  const air = useAirData();
  const zone = useMemo(() => nearestZone(air.zones, [s.lon, s.lat]), [air.zones, s.lon, s.lat]);
  const hist = useWeeklyHistory([{ id: s.id, location: [s.lon, s.lat] }], true);
  const [complaint, setComplaint] = useState(false);
  // no station reading: the surrounding area's model value stands in, and is marked as an estimate
  const aqi = s.aqi ?? (s.estimate ? { value: s.estimate.aqi, category: s.estimate.category } : zone ? { value: zone.aqi, category: zone.category } : null);
  const estimated = !s.aqi && !!aqi;
  const daily = hist.byId[s.id] ?? [];

  const readings: Array<{ label: string; text: string }> =
    s.readings.length > 0
      ? s.readings.map((r) => ({ label: r.label, text: `${r.value.toFixed(r.value < 10 ? 2 : 0)} ${r.unit}` }))
      : zone
        ? POLLUTANT_KEYS.filter((k) => zone.values[k] !== undefined).map((k) => ({ label: POLLUTANT_NAME[k], text: `${zone.values[k]!.toFixed(k === 'co' ? 2 : 0)} ${POLLUTANT_UNIT[k]}` }))
        : [];

  return (
    <>
      <Sheet
        full
        title={s.name}
        subtitle={[s.monitoring === 'manual' ? 'Manual station' : 'Continuous station', s.agency, s.city].filter(Boolean).join(' · ')}
        onClose={onClose}
        chips={<StatusChip kind={chipOf(s.status)} label={STATUS_LABEL[s.status]} />}
      >
        <div className="space-y-6">
          <section className="flex items-center justify-between gap-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-white/40">
            {aqi ? (
              <div>
                <div className="text-xs text-sand-300">Air quality index (US)</div>
                <div className="mt-1 flex items-center gap-2">
                  <AqiChip aqi={aqi.value} category={aqi.category} className="!px-4 !py-1.5 !text-sm" />
                </div>
                <div className="mt-1 text-xs text-sand-300">{aqiName(aqi.category)}</div>
              </div>
            ) : (
              <span className="text-sm text-sand-300">No reading yet</span>
            )}
            <div className="text-right text-xs text-sand-300">
              {estimated && <StatusChip kind="estimated" />}
              <div className="mt-1">{s.lastReadingAt ? `Updated ${formatAge(s.ageMs)}` : 'No reading received'}</div>
            </div>
          </section>

          <Btn variant="primary" icon={MessageSquareWarning} className="w-full" onClick={() => setComplaint(true)}>
            Register Complaint
          </Btn>

          {readings.length > 0 && (
            <section>
              <h3 className="gov-eyebrow mb-2">Pollutants{s.readings.length === 0 ? ' (area estimate)' : ''}</h3>
              <ul className="grid grid-cols-2 gap-2">
                {readings.map((r) => (
                  <li key={r.label} className="rounded-2xl bg-ink-800 p-3">
                    <div className="text-xs text-sand-400">{r.label}</div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums text-sand-50">{r.text}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="gov-eyebrow mb-2">Recent AQI</h3>
            {daily.length > 0 ? <WeeklyChart daily={daily} /> : <p className="text-sm text-sand-300">{hist.status === 'loading' ? 'Loading the last week…' : 'The weekly trend is not available right now.'}</p>}
          </section>

          {s.forecast && (
            <section>
              <h3 className="gov-eyebrow mb-2">PM2.5 forecast</h3>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip kind="forecast" />
                <span className="text-lg font-semibold tabular-nums text-sand-50">{s.forecast.value.toFixed(0)} µg/m³</span>
                <span className="text-sm text-sand-300">
                  range {s.forecast.lower.toFixed(0)} to {s.forecast.upper.toFixed(0)}
                </span>
              </div>
            </section>
          )}

          <section>
            <h3 className="gov-eyebrow mb-2">Station details</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-sand-400">Type</dt>
                <dd className="text-sand-50">{s.monitoring === 'manual' ? 'Manual (NAMP)' : 'Continuous (CAAQMS)'}</dd>
              </div>
              <div>
                <dt className="text-xs text-sand-400">Run by</dt>
                <dd className="text-sand-50">{s.agency ?? 'Not listed'}</dd>
              </div>
              <div>
                <dt className="text-xs text-sand-400">Connection</dt>
                <dd className="text-sand-50">{s.hasFeed ? 'Connected' : 'No data feed'}</dd>
              </div>
              <div>
                <dt className="text-xs text-sand-400">Last reading</dt>
                <dd className="text-sand-50">{s.lastReadingAt ? formatIst(s.lastReadingAt) : 'None'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-sand-400">Location</dt>
                <dd className="text-sand-50">
                  {s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E{zone ? ` · near ${zone.place}` : ''}
                </dd>
              </div>
            </dl>
            {s.status !== 'live' && <p className="mt-3 text-sm text-amber-700">This station is not reporting a current reading. Values above are estimates for the area.</p>}
          </section>
        </div>
      </Sheet>
      {complaint && <ComplaintSheet target={{ id: s.id, name: s.name }} onClose={() => setComplaint(false)} />}
    </>
  );
}
