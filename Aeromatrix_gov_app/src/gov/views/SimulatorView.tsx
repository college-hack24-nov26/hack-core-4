import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Download, FileText, Save, Trash2 } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { formatINR } from '../../plan/costModel';
import { useGovStore } from '../govStore';
import { colorOf, aqiCategory, useAirData } from '../lib/airdata';
import { costBreakdown, runningRates } from '../lib/costs';
import { useHotspots } from '../lib/hotspots';
import { TREE_CHOICES, closureChoices, hasMeasures, industryUnitsAvailable, runMeasures, type MeasureSelection } from '../lib/measures';
import { downloadText, scenariosCsv, toSavedScenario } from '../lib/scenarios';
import { formatIst, signed } from '../lib/format';
import { CompareChart } from '../charts';
import { AqiChip, Btn, Card, EmptyState, Field, PageTitle, SectionCard, StatusChip, Table, inputCls } from '../ui';

function Choice<T extends string | number>({ label, value, options, onChange, disabledFor }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; disabledFor?: (v: T) => boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const dis = disabledFor?.(o.value) ?? false;
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={dis}
            onClick={() => onChange(o.value)}
            className={`gov-tap min-h-11 min-w-12 rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-accent-500 text-white shadow-sm' : 'bg-ink-800 text-sand-100 hover:bg-ink-700'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-sand-500/15">
      <summary className="gov-tap flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-sand-100 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown size={16} className="text-sand-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-sand-500/12 p-4">{children}</div>
    </details>
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

  const outcome = useMemo(() => (base && cell && zone ? runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection: measures }) : null), [base, cell, zone, measures]);
  const closures = useMemo(() => (base && cell ? closureChoices(base, cell) : []), [base, cell]);
  const units = base && cell ? industryUnitsAvailable(base, cell) : 0;
  const costs = useMemo(() => (outcome ? costBreakdown(outcome.lines) : null), [outcome]);
  const rates = outcome ? runningRates(outcome.recurring, outcome.dust) : null;

  if (!base || air.zones.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
        <PageTitle title="Simulator" />
        <Card>
          <EmptyState title="Nothing to simulate yet" reason="Area readings are not available right now." />
        </Card>
      </div>
    );
  }

  const set = (p: Partial<MeasureSelection>) => setMeasures(p);
  const toCompare = scenarios.filter((s) => compare.includes(s.id));
  const compareRows = outcome && outcome.modelledEffect && outcome.currentPm25 !== null && outcome.projectedPm25 !== null && outcome.lowPm25 !== null
    ? [
        { name: 'Existing', value: outcome.currentPm25, color: '#9a8a80' },
        { name: 'If half the effect', value: outcome.lowPm25, color: '#d9a441' },
        { name: 'Simulated', value: outcome.projectedPm25, color: '#2fae8b' },
      ]
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Simulator" />

      <div className="space-y-4">
        <SectionCard title="Area">
          <Field label="Where">
            <select value={targetId ?? ''} onChange={(e) => setSimTarget(e.target.value)} className={inputCls}>
              {hot.zones.map((h) => (
                <option key={h.id} value={h.zone!.id}>
                  {h.name} · AQI {h.aqi}
                </option>
              ))}
            </select>
          </Field>
          {zone && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink-800 p-4">
              <span className="text-sm text-sand-300">Existing</span>
              <AqiChip aqi={zone.aqi} category={zone.category} />
              <span className="text-sm text-sand-100">PM2.5 {zone.pm25?.toFixed(1) ?? 'n/a'} µg/m³</span>
              <StatusChip kind="estimated" />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Interventions" action={<Btn variant="ghost" onClick={resetMeasures} className="!px-3 text-sm">Clear</Btn>}>
          <div className="space-y-6">
            <Field label="Reduce traffic">
              <Choice label="Traffic" value={measures.traffic} onChange={(v) => set({ traffic: v })} options={[{ value: 'off', label: 'Off' }, { value: 'standard', label: 'Standard' }, { value: 'intensive', label: 'Intensive' }]} />
            </Field>
            <Field label="Close a road" hint={closures.length === 0 ? 'No major road in this area.' : undefined}>
              <select value={measures.closureRoadId ?? ''} onChange={(e) => set({ closureRoadId: e.target.value || null })} className={inputCls} disabled={closures.length === 0}>
                <option value="">None</option>
                {closures.map((c) => (
                  <option key={c.road.id} value={c.road.id}>
                    {c.road.name} · {c.lengthKm.toFixed(1)} km
                  </option>
                ))}
              </select>
            </Field>
            {measures.closureRoadId && (
              <Field label={`Traffic diverted: ${Math.round(measures.closureDiversion * 100)}%`}>
                <input type="range" min={0} max={1} step={0.1} value={measures.closureDiversion} onChange={(e) => set({ closureDiversion: Number(e.target.value) })} className="h-8 w-full accent-accent-500" />
              </Field>
            )}
            <Field label="Industrial units" hint={units === 0 ? 'No industrial unit in this area.' : `${units} in this area`}>
              <div className="space-y-3">
                <Choice label="Industrial units" value={measures.industry} onChange={(v) => set({ industry: v })} options={[0, 1, 2, 3].map((n) => ({ value: n as 0 | 1 | 2 | 3, label: String(n) }))} disabledFor={(v) => v > units} />
                {measures.industry > 0 && (
                  <Choice
                    label="Industrial measure"
                    value={measures.industryMode}
                    onChange={(v) => set({ industryMode: v })}
                    options={[
                      { value: 'controls', label: 'Fit filters' },
                      { value: 'restrict', label: 'Restrict output' },
                    ]}
                  />
                )}
              </div>
            </Field>
            <Field label="Green cover">
              <Choice label="Trees" value={measures.trees} onChange={(v) => set({ trees: v })} options={TREE_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'None' : n.toLocaleString('en-IN') + ' trees' }))} />
            </Field>
            <Field label="Dust control" hint="Water sprinkling on the main roads. Costed and scheduled; its effect is not modelled.">
              <Choice label="Dust control" value={measures.dust ? 'on' : 'off'} onChange={(v) => set({ dust: v === 'on' })} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
            </Field>
          </div>
        </SectionCard>

        {!outcome ? (
          <Card>
            <EmptyState title="Choose an intervention" reason="The result appears here." />
          </Card>
        ) : (
          <SectionCard title="Result" action={<StatusChip kind="simulation" />}>
            {compareRows ? (
              <>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-semibold tabular-nums" style={{ color: colorOf(aqiCategory(zone?.aqi ?? 0)) }}>
                    {signed(outcome.changePct, 0)}%
                  </span>
                  <span className="pb-1 text-sm text-sand-300">PM2.5, range {signed(outcome.lowPct, 0)}% to {signed(outcome.changePct, 0)}%</span>
                </div>
                <CompareChart rows={compareRows} unit="µg/m³" />
              </>
            ) : (
              <p className="text-[15px] text-sand-100">The selected intervention has no modelled effect on PM2.5. It is costed and scheduled below.</p>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              {[
                ['Time to implement', `${outcome.weeks} week${outcome.weeks === 1 ? '' : 's'}`],
                ['One-time cost', outcome.oneTime > 0 ? formatINR(outcome.oneTime) : outcome.costNotes.length > 0 ? 'Not available' : '₹0'],
                ['Running cost', outcome.recurring > 0 ? `${formatINR(outcome.recurring)} / year` : '₹0'],
                ['Areas improved', String(outcome.zonesImproved)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium text-sand-400">{k}</dt>
                  <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-sand-50">{v}</dd>
                </div>
              ))}
            </dl>
            {outcome.costNotes.map((n) => (
              <p key={n} className="mt-3 text-sm text-sand-300">
                {n}
              </p>
            ))}
            <p className="mt-4 text-xs text-sand-400">A modelled estimate, not a guaranteed result. Measured readings should confirm any change.</p>

            <div className="mt-5 space-y-3">
              <Details title="Assumptions">
                <ul className="space-y-2 text-sm text-sand-200">
                  {outcome.options.map((o) => (
                    <li key={o.key}>{o.effect}</li>
                  ))}
                  {outcome.closure && (
                    <li>
                      Closing {outcome.closure.roadName}; {Math.round(outcome.closure.diversion * 100)}% of its traffic moves to {outcome.closure.divertToName ?? 'other roads'}.
                    </li>
                  )}
                  {outcome.options.flatMap((o) => o.limitations.slice(0, 2)).map((l) => (
                    <li key={l} className="text-sand-300">
                      {l}
                    </li>
                  ))}
                  {outcome.notes.map((n) => (
                    <li key={n} className="text-sand-300">
                      {n}
                    </li>
                  ))}
                </ul>
              </Details>

              {outcome.dust && outcome.dust.roads.length > 0 && (
                <Details title="Dust control plan">
                  <Table head={['Road', 'Length', 'Water per round']} rows={outcome.dust.roads.map((r) => [r.name, `${r.lengthKm.toFixed(1)} km`, `${Math.round(r.litresPerPass).toLocaleString('en-IN')} L`])} />
                  <p className="mt-3 text-sm text-sand-300">
                    {outcome.dust.slots.length} rounds a day ({outcome.dust.slots.join(', ')}) · {Math.round(outcome.dust.litresPerDay).toLocaleString('en-IN')} L a day · {outcome.dust.tankers} tanker{outcome.dust.tankers === 1 ? '' : 's'} · crew of {outcome.dust.crew} · {outcome.dust.days} days. Check readings on Day 7 and Day 14.
                  </p>
                </Details>
              )}

              {costs && costs.groups.length > 0 && (
                <Details title="Cost details">
                  <Table
                    head={['Item', 'Amount']}
                    rows={[
                      ...costs.groups.map((g) => [g.group, formatINR(g.total)]),
                      [<b key="t">Total (one-time + first year)</b>, <b key="v">{formatINR(costs.total)}</b>],
                    ]}
                  />
                  {rates && (rates.perDay > 0) && (
                    <p className="mt-3 text-sm text-sand-300">
                      Running cost: {formatINR(rates.perDay)} a day · {formatINR(rates.perWeek)} a week · {formatINR(rates.perMonth)} a month
                    </p>
                  )}
                  <p className="mt-2 text-xs text-sand-400">Items marked as estimates in the report have no published price; sourced prices are listed there.</p>
                </Details>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <Field label="Save as">
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
                Save
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

        <SectionCard
          title={`Saved scenarios${scenarios.length ? ` (${scenarios.length})` : ''}`}
          action={scenarios.length > 0 ? <Btn icon={Download} variant="ghost" className="!px-3 text-sm" onClick={() => downloadText('aeromatrix-scenarios.csv', scenariosCsv(scenarios))}>Export</Btn> : undefined}
        >
          {scenarios.length === 0 ? (
            <p className="text-sm text-sand-300">Saved scenarios appear here.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-800 p-3">
                    <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm text-sand-100">
                      <input type="checkbox" checked={compare.includes(s.id)} onChange={(e) => setCompare(e.target.checked ? [...compare, s.id] : compare.filter((x) => x !== s.id))} className="h-5 w-5 accent-accent-500" aria-label={`Compare ${s.name}`} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-sand-400">{s.target.label} · {formatIst(Date.parse(s.savedAt), false)}</span>
                      </span>
                    </label>
                    <Btn variant="ghost" className="!px-3 text-sm" onClick={() => { setReportScenario(s.id); setView('reports'); }}>Report</Btn>
                    <Btn variant="ghost" icon={Trash2} className="!px-3" ariaLabel={`Delete ${s.name}`} onClick={() => deleteScenario(s.id)} />
                  </li>
                ))}
              </ul>
              {toCompare.length >= 2 ? (
                <div className="mt-4">
                  <Table
                    head={['', ...toCompare.map((s) => s.name)]}
                    rows={[
                      ['Area', ...toCompare.map((s) => s.target.label)],
                      ['PM2.5 now → simulated', ...toCompare.map((s) => `${s.baselinePm25.toFixed(1)} → ${s.projectedPm25.toFixed(1)}`)],
                      ['Change', ...toCompare.map((s) => `${signed(s.changePct, 0)}% (${signed(s.lowPct, 0)}%)`)],
                      ['One-time cost', ...toCompare.map((s) => formatINR(s.oneTime))],
                      ['Running cost / year', ...toCompare.map((s) => formatINR(s.recurring))],
                      ['Weeks', ...toCompare.map((s) => String(s.weeks))],
                    ]}
                  />
                </div>
              ) : (
                scenarios.length >= 2 && <p className="mt-3 text-xs text-sand-400">Tick two or more to compare.</p>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
