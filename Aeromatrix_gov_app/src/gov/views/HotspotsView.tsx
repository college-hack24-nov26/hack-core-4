import { useMemo, useState } from 'react';
import { ChevronRight, ClipboardList, FileText, SlidersHorizontal } from 'lucide-react';
import { useGovStore } from '../govStore';
import { POLLUTANT_KEYS, POLLUTANT_NAME, POLLUTANT_UNIT, aqiCategory, colorOf, type PollutantKey } from '../lib/airdata';
import { topCause } from '../lib/alerts';
import { useHotspots, type Hotspot, type Metric } from '../lib/hotspots';
import { summariseWeek, weekTrend } from '../lib/history';
import { useWeeklyHistory } from '../lib/useHistory';
import { actionFor, departmentsFor, type CauseKey } from '../lib/routing';
import { composeHotspotTask } from '../lib/instructions';
import { addDaysIst, formatIst } from '../lib/format';
import { WeeklyChart } from '../charts';
import { AqiChip, Btn, Card, EmptyState, PageTitle, Pills, Skeleton, StatusChip, TrendBadge } from '../ui';
import { Sheet } from '../Sheet';
import { InstructionComposer } from './InstructionComposer';

const valueText = (h: Hotspot) =>
  h.metricValue === null ? 'No value' : h.metricLabel === 'AQI' ? `AQI ${Math.round(h.metricValue)}` : `${h.metricLabel} ${h.metricValue < 10 ? h.metricValue.toFixed(1) : Math.round(h.metricValue)} ${h.metricUnit}`;

function HotspotDetail({ h, rank, total, onClose }: { h: Hotspot; rank: number; total: number; onClose: () => void }) {
  const openReport = useGovStore((s) => s.openReport);
  const openSimulator = useGovStore((s) => s.openSimulator);
  const [task, setTask] = useState(false);
  const cause = topCause(h.causes);
  const causeKey: CauseKey = cause?.key ?? 'general';
  const deadline = useMemo(() => addDaysIst(Date.now(), 3), []);
  const zone = h.zone;
  const week = useWeeklyHistory(zone ? [{ id: zone.id, location: zone.location }] : [], !!zone);
  const daily = zone ? week.byId[zone.id] : undefined;
  const summary = daily ? summariseWeek(daily) : null;
  const trend = daily ? weekTrend(daily) : null;
  const subs = zone?.subindices ?? [];
  const maxSub = Math.max(1, ...subs.map((s) => s.value));

  const reasons: string[] = [`Number ${rank} of ${total} by ${h.metricLabel}`];
  if (h.category) reasons.push(`Air quality is ${h.category}${h.aqi !== null ? ` (AQI ${Math.round(h.aqi)})` : ''}`);
  if (h.trendKnown && h.trend === 'up') reasons.push(`Rising: PM2.5 up ${Math.round(h.trendPct)}% in six hours`);
  if (summary && summary.poorDays > 0) reasons.push(`Poor or worse on ${summary.poorDays} of the last ${summary.days} days`);
  else if (summary && summary.moderateDays >= 4) reasons.push(`Moderate or worse on ${summary.moderateDays} of the last ${summary.days} days`);
  if (cause) reasons.push(`${cause.label} is the strongest likely factor`);

  return (
    <Sheet
      title={h.name}
      subtitle={h.subtitle}
      onClose={onClose}
      chips={
        <>
          <AqiChip aqi={h.aqi} category={h.category} />
          {h.kind === 'zone' ? <StatusChip kind="estimated" /> : <StatusChip kind={h.outdated ? 'outdated' : 'measured'} />}
        </>
      }
    >
      <div className="space-y-7">
        <section>
          <h3 className="gov-eyebrow mb-3">Why it is a priority</h3>
          <ul className="space-y-1.5 text-[15px] text-sand-100">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {h.kind === 'station' && <p className="mt-2 text-sm text-sand-300">Reading from {formatIst(h.asOf)}{h.outdated ? ', not current.' : '.'}</p>}
        </section>

        {zone && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="gov-eyebrow">This week</h3>
              {trend && (
                <span className="text-sm text-sand-300">
                  {trend.direction === 'flat' ? 'Steady' : `${trend.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(Math.round(trend.pct))}%`}
                </span>
              )}
            </div>
            {week.status === 'loading' && <Skeleton className="h-36" />}
            {week.status === 'error' && <p className="text-sm text-sand-300">Weekly data is unavailable right now.</p>}
            {daily && week.status !== 'error' && (
              <>
                <WeeklyChart daily={daily} />
                <p className="mt-1 text-xs text-sand-400">Daily PM2.5 (µg/m³), estimated from model data</p>
              </>
            )}
          </section>
        )}

        <section>
          <h3 className="gov-eyebrow mb-3">Pollutants</h3>
          {zone && subs.length > 0 ? (
            <ul className="space-y-3">
              {subs.map((s) => {
                const key = s.pollutant as PollutantKey;
                return (
                  <li key={s.pollutant}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-sand-100">{POLLUTANT_NAME[key] ?? s.pollutant}</span>
                      <span className="tabular-nums text-sand-300">
                        {s.concentration < 10 ? s.concentration.toFixed(1) : Math.round(s.concentration)} {POLLUTANT_UNIT[key] ?? ''}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
                      <div className="h-full rounded-full" style={{ width: `${(s.value / maxSub) * 100}%`, background: colorOf(aqiCategory(s.value)) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : h.station && h.station.readings.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2">
              {h.station.readings.map((r) => (
                <li key={r.key} className="rounded-xl bg-ink-800 p-3">
                  <div className="text-xs text-sand-400">{r.label}</div>
                  <div className="text-lg font-semibold tabular-nums text-sand-50">
                    {r.value.toFixed(r.value < 10 ? 2 : 0)} <span className="text-xs font-normal text-sand-300">{r.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-sand-300">No pollutant detail is available.</p>
          )}
        </section>

        <section>
          <h3 className="gov-eyebrow mb-3">Likely contributing factors</h3>
          {h.causes.length === 0 ? (
            <p className="text-sm text-sand-300">No factor is supported by the available data.</p>
          ) : (
            <ul className="space-y-3">
              {h.causes.map((c) => (
                <li key={c.key} className="rounded-xl bg-ink-800 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-medium text-sand-50">{c.label}</span>
                    <span className="rounded-full bg-ink-700 px-2.5 py-0.5 text-xs font-medium text-sand-100">{c.strength}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-sand-300">
                    {c.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-sand-400">Construction, RMC plants and waste burning are not assessed: no data is available.</p>
        </section>

        <section className="space-y-3 border-t border-sand-500/15 pt-5">
          {!task ? (
            <Btn variant="primary" icon={ClipboardList} className="w-full" onClick={() => setTask(true)}>
              Create inspection task
            </Btn>
          ) : (
            <InstructionComposer
              departments={departmentsFor(causeKey)}
              deadline={deadline}
              message={`${composeHotspotTask(h, deadline)}\n\nSuggested focus: ${actionFor(causeKey, h.name)}`}
              subject={`Inspection task: ${h.name}`}
            />
          )}
          {zone && (
            <div className="flex flex-wrap gap-2">
              <Btn icon={SlidersHorizontal} onClick={() => openSimulator(zone.id)}>
                Test an action
              </Btn>
              <Btn icon={FileText} onClick={() => openReport(zone.id)}>
                Create report
              </Btn>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

export function HotspotsView() {
  const [metric, setMetric] = useState<Metric>('aqi');
  const hot = useHotspots(metric);
  const base = useHotspots('aqi');
  const [tab, setTab] = useState<'zones' | 'stations' | 'repeated'>('zones');
  const selectedId = useGovStore((s) => s.selectedHotspotId);
  const select = useGovStore((s) => s.selectHotspot);

  // "Repeated": the ten worst areas today, ranked by how many of the last seven days they were also at Moderate or worse.
  const top = useMemo(() => base.zones.slice(0, 10), [base.zones]);
  const week = useWeeklyHistory(
    top.map((h) => ({ id: h.zone!.id, location: h.zone!.location })),
    tab === 'repeated',
  );
  const repeated = useMemo(
    () =>
      top
        .map((h) => {
          const daily = week.byId[h.zone!.id];
          return { h, summary: daily ? summariseWeek(daily) : null };
        })
        .filter((r) => r.summary !== null)
        .sort((a, b) => b.summary!.poorDays - a.summary!.poorDays || b.summary!.moderateDays - a.summary!.moderateDays || (b.summary!.meanAqi ?? 0) - (a.summary!.meanAqi ?? 0)),
    [top, week.byId],
  );

  const list = tab === 'stations' ? hot.stations : hot.zones;
  const selected = hot.combined.find((h) => h.id === selectedId) ?? base.combined.find((h) => h.id === selectedId) ?? null;
  const rankList = selected ? (selected.kind === 'zone' ? hot.zones : hot.stations) : [];

  return (
    <div className={`mx-auto max-w-3xl px-4 pb-40 pt-6 transition-[margin] duration-300 sm:px-6 ${!!selected ? 'lg:ml-8 lg:mr-[460px] lg:max-w-none' : ''}`}>
      <PageTitle title="Hotspots" />
      <div className="mb-4">
        <Pills
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'zones', label: 'Areas' },
            { value: 'stations', label: 'Stations' },
            { value: 'repeated', label: 'Repeated' },
          ]}
        />
      </div>
      {tab !== 'repeated' && (
        <div className="mb-5">
          <Pills
            label="Rank by"
            value={metric}
            onChange={setMetric}
            options={[{ value: 'aqi' as Metric, label: 'AQI' }, ...POLLUTANT_KEYS.map((k) => ({ value: k as Metric, label: POLLUTANT_NAME[k] }))]}
          />
        </div>
      )}

      {tab === 'repeated' ? (
        week.status === 'loading' || week.status === 'idle' ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : week.status === 'error' || repeated.length === 0 ? (
          <Card>
            <EmptyState title="Weekly data unavailable" reason="Try again in a moment." />
          </Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-sand-300">Areas that stayed affected over the last seven days.</p>
            <ol className="gov-stagger space-y-3">
              {repeated.map(({ h, summary }, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => select(h.id)}
                    className="gov-card gov-tap flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold tabular-nums text-sand-200">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-sand-50">{h.name}</span>
                      <span className="mt-0.5 block text-sm text-sand-300">
                        {summary!.poorDays > 0 ? `Poor or worse on ${summary!.poorDays} of ${summary!.days} days` : `Moderate or worse on ${summary!.moderateDays} of ${summary!.days} days`}
                      </span>
                    </span>
                    <AqiChip aqi={summary!.meanAqi} category={summary!.meanAqi === null ? null : aqiCategory(summary!.meanAqi)} />
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-sand-400">Chip shows the average AQI for the week.</p>
          </>
        )
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'zones' ? 'No area values' : 'No station readings'} reason={tab === 'zones' ? 'Area readings are not available right now.' : 'No station has a reading for this view.'} />
        </Card>
      ) : (
        <ol className="gov-stagger space-y-3">
          {list.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => select(h.id)}
                aria-pressed={selectedId === h.id}
                className={`gov-card gov-tap flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5 ${selectedId === h.id ? '!bg-ink-800' : ''}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold tabular-nums text-sand-200">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-sand-50">{h.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-sand-300">
                    {valueText(h)}
                    {h.kind === 'station' ? ` · ${h.outdated ? 'last reading' : 'current'}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <AqiChip aqi={h.aqi} category={h.category} />
                  {h.kind === 'zone' ? <TrendBadge trend={h.trend} pct={h.trendPct} /> : <StatusChip kind={h.outdated ? 'outdated' : 'measured'} />}
                </span>
                <ChevronRight size={18} className="shrink-0 text-sand-500" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {selected && <HotspotDetail key={selected.id} h={selected} rank={Math.max(1, rankList.findIndex((x) => x.id === selected.id) + 1)} total={rankList.length || 1} onClose={() => select(null)} />}
    </div>
  );
}
