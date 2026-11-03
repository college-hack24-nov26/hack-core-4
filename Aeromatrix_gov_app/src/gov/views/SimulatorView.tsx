import { useMemo, useState } from 'react';
import { Download, FileText, Save, Trash2 } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { formatINR } from '../../plan/costModel';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { useHotspots } from '../lib/hotspots';
import { TREE_CHOICES, closureChoices, hasMeasures, industryUnitsAvailable, runMeasures, type MeasureSelection, type SimOutcome } from '../lib/measures';
import { downloadText, scenariosCsv, toSavedScenario } from '../lib/scenarios';
import { formatIst, signed } from '../lib/format';
import { AqiChip, Btn, EmptyState, Field, PageTitle, SectionCard, StatusChip, Table, inputCls } from '../ui';

function Choice<T extends string | number>({ label, value, options, onChange, disabledFor }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; disabledFor?: (v: T) => boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const dis = disabledFor?.(o.value) ?? false;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={dis}
            onClick={() => onChange(o.value)}
            className={`gov-tap min-h-11 min-w-11 rounded-xl px-3.5 text-sm font-bold hairline disabled:cursor-not-allowed disabled:opacity-40 ${o.value === value ? 'bg-accent-500 text-white' : 'bg-ink-800 text-sand-100 hover:bg-ink-700'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function CostTable({ o }: { o: SimOutcome }) {
  return (
    <Table
      caption="Cost lines"
      head={['Item', 'Quantity', 'Unit price', 'Total', 'Basis']}
      rows={o.lines.map((l) => [
        <span key="i">
          {l.item}
          {l.note && <span className="block text-sand-400">{l.note}</span>}
        </span>,
        `${l.quantity.toLocaleString('en-IN')} ${l.unit}`,
        formatINR(l.unitPrice),
        formatINR(l.total),
        l.kind === 'sourced' ? 'Sourced' : 'Estimate *',
      ])}
    />
  );
}

export function SimulatorView() {
  const base = useTwinStore((s) => s.base);
  const air = useAirData();
  const hot = useHotspots();
  const simTargetId = useGovStore((s) => s.simTargetId);
  const selectedZoneId = useGovStore((s) => s.selectedZoneId);
  const setSimTarget = useGovStore((s) => s.setSimTarget);
  const measures = useGovStore((s) => s.measures);
  const setMeasures = useGovStore((s) => s.setMeasures);
  const resetMeasures = useGovStore((s) => s.resetMeasures);
  const scenarios = useGovStore((s) => s.scenarios);
  const saveScenario = useGovStore((s) => s.saveScenario);
  const deleteScenario = useGovStore((s) => s.deleteScenario);
  const setReportScenario = useGovStore((s) => s.setReportScenario);
  const setView = useGovStore((s) => s.setView);
  const [name, setName] = useState('');
  const [compare, setCompare] = useState<string[]>([]);

  const zoneById = useMemo(() => new Map(air.zones.map((z) => [z.id, z])), [air.zones]);
  const targetId = [simTargetId, selectedZoneId].find((id) => id && zoneById.has(id)) ?? hot.zones[0]?.zone?.id ?? null;
  const zone = targetId ? zoneById.get(targetId) : undefined;
  const cell = base && targetId ? base.cells.find((c) => c.id === targetId) : undefined;

  const outcome = useMemo(
    () => (base && cell && zone ? runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection: measures }) : null),
    [base, cell, zone, measures],
  );
  const closures = useMemo(() => (base && cell ? closureChoices(base, cell) : []), [base, cell]);
  const units = base && cell ? industryUnitsAvailable(base, cell) : 0;

  if (!base || air.zones.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 pb-32">
        <PageTitle title="Simulator" />
        <EmptyState title="No area values to simulate on" reason="The Simulator applies a relative change to an area's current model value. There is no live model data right now (no data feed), so nothing is shown rather than a made-up number." />
      </div>
    );
  }

  const set = (p: Partial<MeasureSelection>) => setMeasures(p);
  const saved = scenarios;
  const toCompare = saved.filter((s) => compare.includes(s.id));

  return (
    <div className="mx-auto max-w-5xl p-4 pb-32">
      <PageTitle title="Simulator" sub="Test an action before ordering it. Results are relative changes from an uncalibrated prototype model, applied to the area's current model value." right={<StatusChip kind="simulation" />} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="1. Choose the area">
          <Field label="Area or hotspot">
            <select value={targetId ?? ''} onChange={(e) => setSimTarget(e.target.value)} className={inputCls}>
              {hot.zones.map((h) => (
                <option key={h.id} value={h.zone!.id}>
                  {h.name} (AQI {h.aqi}, {h.category})
                </option>
              ))}
            </select>
          </Field>
          {zone && (
            <div className="mt-3 rounded-xl bg-ink-800 p-3 hairline">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sand-400">Existing condition</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <AqiChip aqi={zone.aqi} category={zone.category} />
                <StatusChip kind="estimated" />
              </div>
              <div className="mt-1 text-xs text-sand-300">
                PM2.5 {zone.pm25?.toFixed(1) ?? 'n/a'} ug/m3 · model hour {formatIst(zone.time)}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="2. Choose measures" action={<Btn variant="ghost" onClick={resetMeasures} className="!px-2 text-xs">Clear all</Btn>}>
          <div className="space-y-4">
            <Field label="Traffic enforcement">
              <Choice label="Traffic enforcement" value={measures.traffic} onChange={(v) => set({ traffic: v })} options={[{ value: 'off', label: 'Off' }, { value: 'standard', label: 'Standard' }, { value: 'intensive', label: 'Intensive' }]} />
            </Field>
            <Field label="Road closure" hint={closures.length === 0 ? 'No named major road passes through this area in the map data.' : 'Traffic is diverted to the nearest other road.'}>
              <select value={measures.closureRoadId ?? ''} onChange={(e) => set({ closureRoadId: e.target.value || null })} className={inputCls} disabled={closures.length === 0}>
                <option value="">No closure</option>
                {closures.map((c) => (
                  <option key={c.road.id} value={c.road.id}>
                    {c.road.name} ({c.road.roadClass}, {c.lengthKm.toFixed(1)} km here)
                  </option>
                ))}
              </select>
            </Field>
            {measures.closureRoadId && (
              <Field label={`Share of traffic diverted: ${Math.round(measures.closureDiversion * 100)}%`}>
                <input type="range" min={0} max={1} step={0.1} value={measures.closureDiversion} onChange={(e) => set({ closureDiversion: Number(e.target.value) })} className="h-8 w-full accent-accent-500" />
              </Field>
            )}
            <Field label="Industrial controls (bag filters)" hint={units === 0 ? 'No modelled industrial source lies in this area.' : `${units} modelled industrial source${units === 1 ? '' : 's'} in this area. Emission quantities are assumptions: the data has locations only.`}>
              <Choice label="Industrial units" value={measures.industry} onChange={(v) => set({ industry: v })} options={[0, 1, 2, 3].map((n) => ({ value: n as 0 | 1 | 2 | 3, label: String(n) }))} disabledFor={(v) => v > units} />
            </Field>
            <Field label="Trees to plant">
              <Choice label="Trees" value={measures.trees} onChange={(v) => set({ trees: v })} options={TREE_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'None' : n.toLocaleString('en-IN') }))} />
            </Field>
            <Field label="Dust control (water sprinkling)" hint="Costed and scheduled. Its effect on air quality is NOT modelled; it is checked by readings on Day 7 and Day 14.">
              <Choice label="Dust control" value={measures.dust ? 'on' : 'off'} onChange={(v) => set({ dust: v === 'on' })} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
            </Field>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        {!outcome ? (
          <EmptyState title="Choose at least one measure" reason="Pick a measure above to see the existing condition against the simulated change, the cost and the implementation period." />
        ) : (
          <SectionCard title="3. Result" action={<StatusChip kind="simulation" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-ink-800 p-4 hairline">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sand-400">Existing</div>
                <div className="mt-1 font-display text-3xl font-bold text-sand-50">{outcome.currentPm25?.toFixed(1) ?? 'n/a'}</div>
                <div className="text-xs text-sand-300">PM2.5 ug/m3 now</div>
                <div className="mt-2 flex gap-2">{zone && <AqiChip aqi={zone.aqi} category={zone.category} />}<StatusChip kind="estimated" /></div>
              </div>
              <div className="rounded-xl bg-ink-800 p-4 hairline">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sand-400">Simulated</div>
                {outcome.modelledEffect ? (
                  <>
                    <div className="mt-1 font-display text-3xl font-bold text-sand-50">{outcome.projectedPm25?.toFixed(1) ?? 'n/a'}</div>
                    <div className="text-xs text-sand-300">PM2.5 ug/m3 ({signed(outcome.changePct)}%)</div>
                    <div className="mt-2 text-xs text-sand-100">
                      If only half the assumed effect is achieved: <b>{outcome.lowPm25?.toFixed(1) ?? 'n/a'}</b> ({signed(outcome.lowPct)}%)
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-sand-100">No modelled change: the selected measure&apos;s effect is not modelled.</div>
                )}
                <div className="mt-2"><StatusChip kind="simulation" /></div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              {[
                ['One-time cost', formatINR(outcome.oneTime)],
                ['First-year running cost', formatINR(outcome.recurring)],
                ['Implementation period', `${outcome.weeks} week${outcome.weeks === 1 ? '' : 's'}`],
                ['Zones improved', String(outcome.zonesImproved)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-ink-800 p-3 hairline">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-sand-400">{k}</dt>
                  <dd className="font-display text-lg font-bold text-sand-50">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 space-y-1 text-xs text-sand-300">
              <p><b className="text-sand-100">Measures:</b> {outcome.measures.join('; ')}</p>
              {outcome.options.map((o) => (
                <p key={o.key}>{o.effect}</p>
              ))}
              {outcome.closure && <p>Closes {outcome.closure.roadName}; {Math.round(outcome.closure.diversion * 100)}% of its traffic is diverted{outcome.closure.divertToName ? ` to ${outcome.closure.divertToName}` : ''}. Closure cost lines are planner assumptions.</p>}
              <p>The change is the engine&apos;s relative change for this area ({signed(outcome.relative * 100)}% of the prototype value {outcome.protoBefore.toFixed(1)} → {outcome.protoAfter.toFixed(1)}), applied to the current model value. Implementation periods are planning assumptions.</p>
              {outcome.notes.map((n) => <p key={n} className="text-sand-100">{n}</p>)}
            </div>

            {outcome.dust && (
              <div className="mt-4 rounded-xl border border-sand-500/30 p-3">
                <h3 className="text-sm font-bold text-sand-50">Dust control operating plan (effect not modelled)</h3>
                {outcome.dust.roads.length === 0 ? (
                  <p className="mt-1 text-xs text-sand-300">{outcome.dust.notes[1]}</p>
                ) : (
                  <>
                    <Table head={['Road', 'Class', 'Length here', 'Water per pass']} rows={outcome.dust.roads.map((r) => [r.name, r.roadClass, `${r.lengthKm.toFixed(1)} km`, `${Math.round(r.litresPerPass).toLocaleString('en-IN')} L`])} />
                    <p className="mt-2 text-xs text-sand-300">
                      Time slots {outcome.dust.slots.join(', ')} · {Math.round(outcome.dust.litresPerDay).toLocaleString('en-IN')} L a day · {outcome.dust.tankers} tanker{outcome.dust.tankers === 1 ? '' : 's'} · {outcome.dust.tripsPerDay} trips a day · {outcome.dust.crew} crew · {outcome.dust.days} days.
                    </p>
                    <p className="mt-1 text-xs text-sand-300">Check: {outcome.dust.verification.map((v) => `Day ${v.day}`).join(' and ')} readings.</p>
                  </>
                )}
              </div>
            )}

            <div className="mt-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Cost (INR)</h3>
              <CostTable o={outcome} />
              <p className="mt-1 text-[11px] text-sand-400">* Estimate: no public price was found; the basis is stated in the Plan-It price table. Sourced prices name their source in the report.</p>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 basis-60">
                <Field label="Scenario name (optional)">
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={`${zone?.place ?? 'Area'}: ${outcome.measures[0] ?? ''}`} />
                </Field>
              </div>
              <Btn
                variant="primary"
                icon={Save}
                disabled={!hasMeasures(measures) || outcome.currentPm25 === null}
                onClick={() => {
                  const s = toSavedScenario(outcome, name);
                  if (s) {
                    saveScenario(s);
                    setName('');
                  }
                }}
              >
                Save scenario
              </Btn>
              <Btn
                icon={FileText}
                onClick={() => {
                  setReportScenario(null);
                  setView('reports');
                }}
              >
                Create report
              </Btn>
            </div>
          </SectionCard>
        )}
      </div>

      <SectionCard title={`Saved scenarios (${saved.length})`} className="mt-4" action={saved.length > 0 ? <Btn icon={Download} variant="ghost" className="!px-2 text-xs" onClick={() => downloadText('aeromatrix-scenarios.csv', scenariosCsv(saved))}>Export CSV</Btn> : undefined}>
        {saved.length === 0 ? (
          <p className="text-xs text-sand-300">Nothing saved yet. Saved scenarios stay in this browser only.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-800 p-3 hairline">
                  <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm text-sand-100">
                    <input type="checkbox" checked={compare.includes(s.id)} onChange={(e) => setCompare(e.target.checked ? [...compare, s.id] : compare.filter((x) => x !== s.id))} className="h-5 w-5 accent-accent-500" aria-label={`Compare ${s.name}`} />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{s.name}</span>
                      <span className="block truncate text-xs text-sand-400">{s.target.label} · {formatIst(Date.parse(s.savedAt))}</span>
                    </span>
                  </label>
                  <Btn variant="ghost" className="!px-2 text-xs" onClick={() => { setReportScenario(s.id); setView('reports'); }}>Use in report</Btn>
                  <Btn variant="ghost" icon={Trash2} className="!px-2 text-xs" onClick={() => deleteScenario(s.id)} title="Delete">Delete</Btn>
                </li>
              ))}
            </ul>
            {toCompare.length >= 2 && (
              <div className="mt-3">
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Side by side <StatusChip kind="simulation" /></h3>
                <Table
                  head={['', ...toCompare.map((s) => s.name)]}
                  rows={[
                    ['Area', ...toCompare.map((s) => s.target.label)],
                    ['Measures', ...toCompare.map((s) => s.measures.join('; '))],
                    ['PM2.5 now → simulated', ...toCompare.map((s) => `${s.baselinePm25.toFixed(1)} → ${s.projectedPm25.toFixed(1)}`)],
                    ['Change (half-effect)', ...toCompare.map((s) => `${signed(s.changePct)}% (${signed(s.lowPct)}%)`)],
                    ['One-time cost', ...toCompare.map((s) => formatINR(s.oneTime))],
                    ['First-year running', ...toCompare.map((s) => formatINR(s.recurring))],
                    ['Weeks', ...toCompare.map((s) => String(s.weeks))],
                    ['Zones improved', ...toCompare.map((s) => String(s.zonesImproved))],
                  ]}
                />
              </div>
            )}
            {toCompare.length < 2 && saved.length >= 2 && <p className="mt-2 text-xs text-sand-400">Tick two or more scenarios to compare them side by side.</p>}
          </>
        )}
      </SectionCard>
    </div>
  );
}
