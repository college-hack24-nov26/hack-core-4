import { useMemo, useState } from 'react';
import { FileText, SlidersHorizontal } from 'lucide-react';
import { useGovStore } from '../govStore';
import { NOT_ASSESSED } from '../lib/airdata';
import { topCause } from '../lib/alerts';
import { useHotspots, type Hotspot } from '../lib/hotspots';
import { actionFor, departmentsFor, type CauseKey } from '../lib/routing';
import { composeHotspotTask } from '../lib/instructions';
import { addDaysIst, formatIst, pollutantLabel } from '../lib/format';
import { AqiChip, Btn, EmptyState, PageTitle, SectionCard, StatusChip, Table, TrendBadge } from '../ui';
import { Sheet } from '../Sheet';
import { InstructionComposer } from './InstructionComposer';

function HotspotDetail({ h, rank, total, onClose }: { h: Hotspot; rank: number; total: number; onClose: () => void }) {
  const openReport = useGovStore((s) => s.openReport);
  const openSimulator = useGovStore((s) => s.openSimulator);
  const cause = topCause(h.causes);
  const causeKey: CauseKey = cause?.key ?? 'general';
  const deadline = useMemo(() => addDaysIst(Date.now(), 3), []);
  const zone = h.zone;
  const subs = h.kind === 'zone' ? (zone?.subindices ?? []) : [];

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
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Why it ranks here</h3>
          <p className="text-sm text-sand-100">
            Number {rank} of {total} {h.kind === 'zone' ? 'areas' : 'stations'} by {h.kind === 'zone' ? 'the live model estimate' : 'its last reading'}
            {h.aqi !== null ? ` (CPCB AQI ${Math.round(h.aqi)}, ${h.category}${h.dominant ? `, main pollutant ${pollutantLabel(h.dominant)}` : ''})` : ''}.
          </p>
          <p className="mt-1 text-xs text-sand-300">
            {h.kind === 'zone' ? `Model hour ${formatIst(h.asOf)}. Estimate from CAMS model data, not a station reading.` : `Reading from ${formatIst(h.asOf)}${h.outdated ? ', OUTDATED, not today.' : '.'}`}
          </p>
          <div className="mt-2">
            <TrendBadge trend={h.trend} pct={h.trendPct} known={h.trendKnown} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Pollutant breakdown</h3>
          {h.kind === 'zone' ? (
            subs.length > 0 ? (
              <Table head={['Pollutant', 'Sub-index', 'Concentration']} rows={subs.map((s) => [pollutantLabel(s.pollutant), Math.round(s.value), s.concentration.toFixed(s.concentration < 10 ? 2 : 0)])} />
            ) : (
              <p className="text-xs text-sand-300">No breakdown is available for this value.</p>
            )
          ) : (
            <Table head={['Pollutant', 'Value']} rows={(h.station?.readings ?? []).map((r) => [r.label, `${r.value.toFixed(r.value < 10 ? 2 : 0)} ${r.unit}`])} empty="No station readings." />
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Possible causes (only where there is evidence)</h3>
          {h.causes.length === 0 ? (
            <p className="text-sm text-sand-100">No cause could be shown with evidence for this place.</p>
          ) : (
            <ul className="space-y-3">
              {h.causes.map((c) => (
                <li key={c.key} className="rounded-xl bg-ink-800 p-3 hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-sand-50">{c.label}</span>
                    <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-bold text-sand-100">{c.strength}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-sand-300">
                    {c.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {h.kind === 'station' && h.zone && h.causes.length > 0 && <p className="mt-2 text-xs text-sand-400">Causes are taken from the nearest model area ({h.zone.place}).</p>}
          <div className="mt-3 rounded-xl border border-dashed border-sand-500/40 p-3">
            <div className="text-xs font-bold text-sand-100">Not assessed (no data connected)</div>
            <ul className="mt-1 list-disc pl-5 text-xs text-sand-300">
              {NOT_ASSESSED.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-xs text-sand-400">There is no source-contribution chart: no validated source-apportionment study exists for this city.</p>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Inspection task (ready to send)</h3>
          <InstructionComposer
            departments={departmentsFor(causeKey)}
            deadline={deadline}
            message={`${composeHotspotTask(h, deadline)}\n\nSuggested focus: ${actionFor(causeKey, h.name)}`}
            subject={`Inspection task: ${h.name}`}
          />
        </section>

        {h.zone && (
          <div className="flex flex-wrap gap-2">
            <Btn icon={SlidersHorizontal} onClick={() => openSimulator(h.zone!.id)}>
              Test an action
            </Btn>
            <Btn icon={FileText} onClick={() => openReport(h.zone!.id)}>
              Create report
            </Btn>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function HotspotsView() {
  const hot = useHotspots();
  const [tab, setTab] = useState<'zones' | 'stations'>('zones');
  const selectedId = useGovStore((s) => s.selectedHotspotId);
  const select = useGovStore((s) => s.selectHotspot);
  const list = tab === 'zones' ? hot.zones : hot.stations;
  const selected = hot.combined.find((h) => h.id === selectedId) ?? null;
  const rankList = selected ? (selected.kind === 'zone' ? hot.zones : hot.stations) : [];

  return (
    <div className="mx-auto max-w-4xl p-4 pb-32">
      <PageTitle title="Hotspots" sub="Two separate rankings: areas (live model estimate) and stations (last reading, with its date). They are never merged into one list." />
      <div role="tablist" aria-label="Hotspot lists" className="mb-4 inline-flex rounded-xl bg-ink-800 p-0.5 hairline">
        {(
          [
            ['zones', `Areas (${hot.zones.length})`],
            ['stations', `Stations (${hot.stations.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`gov-tap min-h-11 rounded-[10px] px-4 text-sm font-bold ${tab === id ? 'bg-accent-500 text-white' : 'text-sand-200 hover:bg-ink-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={tab === 'zones' ? 'No area values' : 'No station readings'}
          reason={tab === 'zones' ? 'Areas are ranked from the live Open-Meteo estimate. There is no model data right now.' : 'Stations are ranked by their last reading. No station has a reading: the station-data service is offline or the coordinates are not loaded.'}
        />
      ) : (
        <SectionCard>
          <ol className="space-y-2">
            {list.map((h, i) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => select(h.id)}
                  aria-pressed={selectedId === h.id}
                  className={`gov-tap flex w-full items-center gap-3 rounded-xl p-3 text-left hairline hover:bg-ink-700 ${selectedId === h.id ? 'bg-ink-700' : 'bg-ink-800'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-sand-100">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-sand-50">{h.name}</span>
                    <span className="block truncate text-xs text-sand-400">{h.subtitle}</span>
                    {h.kind === 'station' && <span className="block text-[11px] text-sand-400">{formatIst(h.asOf)}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <AqiChip aqi={h.aqi} category={h.category} />
                    <span className="flex items-center gap-1.5">
                      {h.kind === 'zone' ? <StatusChip kind="estimated" /> : <StatusChip kind={h.outdated ? 'outdated' : 'measured'} />}
                      <TrendBadge trend={h.trend} pct={h.trendPct} known={h.trendKnown} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
      {selected && <HotspotDetail key={selected.id} h={selected} rank={rankList.findIndex((x) => x.id === selected.id) + 1} total={rankList.length} onClose={() => select(null)} />}
    </div>
  );
}
