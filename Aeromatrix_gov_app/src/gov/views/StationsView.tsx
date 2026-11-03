import { useMemo, useState } from 'react';
import { ChevronRight, RadioTower } from 'lucide-react';
import { useGovStore } from '../govStore';
import { countStations, useStations, type StationStatus } from '../lib/stations';
import { formatAge } from '../lib/format';
import { AqiChip, Card, EmptyState, PageTitle, Pills, StatusChip, type ChipKind } from '../ui';
import { StationDetail } from './StationDetail';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');
const STATE_LABEL: Record<StationStatus, string> = { live: 'Working', outdated: 'Outdated', estimate: 'Unavailable', no_feed: 'Unavailable' };

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
