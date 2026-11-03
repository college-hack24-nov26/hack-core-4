import { useMemo, useState } from 'react';
import { ChevronRight, FileText, RadioTower } from 'lucide-react';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { nearestZone } from '../lib/hotspots';
import { countStations, useStations, type StationRow, type StationStatus } from '../lib/stations';
import { formatAge, formatIst } from '../lib/format';
import { AqiChip, Btn, Card, EmptyState, PageTitle, Pills, StatusChip, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');
const STATE_LABEL: Record<StationStatus, string> = { live: 'Working', outdated: 'Outdated', estimate: 'Unavailable', no_feed: 'Unavailable' };

function StationDetail({ s, onClose }: { s: StationRow; onClose: () => void }) {
  const air = useAirData();
  const openReport = useGovStore((x) => x.openReport);
  const zone = nearestZone(air.zones, [s.lon, s.lat]);
  return (
    <Sheet
      title={s.name}
      subtitle={[s.monitoring === 'manual' ? 'Manual station (NAMP)' : 'Continuous station (CAAQMS)', s.agency, s.city].filter(Boolean).join(' · ')}
      onClose={onClose}
      chips={<StatusChip kind={chipOf(s.status)} label={STATE_LABEL[s.status]} />}
    >
      <div className="space-y-7">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <div>
            <dt className="text-xs font-medium text-sand-400">Last updated</dt>
            <dd className="mt-0.5 text-[15px] text-sand-50">{s.lastReadingAt ? formatIst(s.lastReadingAt) : 'No reading'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-sand-400">Freshness</dt>
            <dd className="mt-0.5 text-[15px] text-sand-50">{s.lastReadingAt ? formatAge(s.ageMs) : 'No reading'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-medium text-sand-400">Location</dt>
            <dd className="mt-0.5 text-[15px] text-sand-50">
              {s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E{zone ? ` · near ${zone.place}` : ''}
            </dd>
          </div>
        </dl>

        {s.readings.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="gov-eyebrow">Latest readings</h3>
              {s.aqi && <AqiChip aqi={s.aqi.value} category={s.aqi.category} />}
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {s.readings.map((r) => (
                <li key={r.key} className="rounded-xl bg-ink-800 p-3">
                  <div className="text-xs text-sand-400">{r.label}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-sand-50">
                    {r.value.toFixed(r.value < 10 ? 2 : 0)} <span className="text-xs font-normal text-sand-300">{r.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
            {s.status !== 'live' && <p className="mt-3 text-sm text-amber-700">This reading is from {formatIst(s.lastReadingAt)} and is not current.</p>}
          </section>
        ) : (
          <EmptyState title="No readings" reason="This station has not reported." />
        )}

        {s.status !== 'live' && s.estimate && (
          <section className="rounded-xl bg-ink-800 p-4">
            <h3 className="gov-eyebrow mb-2">Estimate for this place</h3>
            <div className="flex flex-wrap items-center gap-2">
              <AqiChip aqi={s.estimate.aqi} category={s.estimate.category} />
              <StatusChip kind="estimated" />
            </div>
            <p className="mt-2 text-sm text-sand-300">Estimated from model data. It is not a station measurement.</p>
          </section>
        )}

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

        {zone && (
          <Btn icon={FileText} onClick={() => openReport(zone.id)} className="w-full">
            Create report for {zone.place}
          </Btn>
        )}
      </div>
    </Sheet>
  );
}

export function StationsView() {
  const st = useStations();
  const selectedId = useGovStore((s) => s.selectedStationId);
  const select = useGovStore((s) => s.selectStation);
  const [filter, setFilter] = useState<'all' | 'working' | 'outdated' | 'unavailable'>('all');
  const c = countStations(st);
  const selected = st.placed.find((s) => s.id === selectedId) ?? null;
  const shown = useMemo(
    () =>
      st.placed.filter((s) => (filter === 'all' ? true : filter === 'working' ? s.status === 'live' : filter === 'outdated' ? s.status === 'outdated' : s.status === 'estimate' || s.status === 'no_feed')),
    [st.placed, filter],
  );

  return (
    <div className={`mx-auto max-w-3xl px-4 pb-40 pt-6 transition-[margin] duration-300 sm:px-6 ${!!selected ? 'lg:ml-8 lg:mr-[460px] lg:max-w-none' : ''}`}>
      <PageTitle title="Stations" />

      {st.placed.length === 0 && st.notPlaced.length === 0 ? (
        <Card>
          <EmptyState icon={RadioTower} title="No stations to show" reason="The station list is not available yet." />
        </Card>
      ) : (
        <>
          <div className="mb-5">
            <Pills
              label="Station status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: c.total },
                { value: 'working', label: 'Working', count: c.live },
                { value: 'outdated', label: 'Outdated', count: c.outdated },
                { value: 'unavailable', label: 'Unavailable', count: c.estimate + c.noFeed },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <Card>
              <EmptyState title="No stations here" reason="No station matches this filter." />
            </Card>
          ) : (
            <ul className="gov-stagger space-y-3">
              {shown.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s.id)} className="gov-card gov-tap flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-sand-50">{s.name}</span>
                      <span className="mt-0.5 block text-sm text-sand-300">
                        {s.monitoring === 'manual' ? 'Manual' : 'Continuous'} · {s.lastReadingAt ? `Updated ${formatAge(s.ageMs)}` : 'No reading'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      {s.aqi ? <AqiChip aqi={s.aqi.value} category={s.aqi.category} /> : s.estimate ? <AqiChip aqi={s.estimate.aqi} category={s.estimate.category} /> : null}
                      <StatusChip kind={s.aqi ? chipOf(s.status) : s.estimate ? 'estimated' : 'nofeed'} label={s.aqi ? STATE_LABEL[s.status] : s.estimate ? 'Estimated' : 'Unavailable'} />
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-sand-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {st.notPlaced.length > 0 && (
            <div className="mt-8">
              <h2 className="gov-eyebrow mb-3">Location not available ({st.notPlaced.length})</h2>
              <Card className="!p-0">
                <ul className="divide-y divide-sand-500/12">
                  {st.notPlaced.map((n) => (
                    <li key={n.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] text-sand-100">{n.name}</span>
                        <span className="block text-xs text-sand-400">
                          {n.monitoring === 'manual' ? 'Manual (NAMP)' : 'Continuous'}
                          {n.city ? ` · ${n.city}` : ''}
                        </span>
                      </span>
                      <StatusChip kind="nofeed" />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </>
      )}

      {selected && <StationDetail key={selected.id} s={selected} onClose={() => select(null)} />}
    </div>
  );
}
