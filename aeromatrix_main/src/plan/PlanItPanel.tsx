import { useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Minimize2, Maximize2, MapPinned, X } from 'lucide-react';
import { planBaseKey, useTwinStore } from '../store/useTwinStore';
import { Chip, Section, Segmented, StatusBadge } from '../components/ui';
import { OBJECTIVE_LABEL, sensitivity, type Objective, type Plan } from './planEngine';
import { INTERVENTION_LABEL, PRICES, formatINR, type InterventionType } from './costModel';
import { downloadPlanPdf } from './planPdf';
import { zoneLabel } from '../utils/zones';
import { fmt } from '../utils/format';

const BUDGET_PRESETS = [500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000];
const TYPES: InterventionType[] = ['trees', 'industry', 'traffic'];
const inputCls = 'h-10 w-full rounded-lg bg-ink-950 px-2 text-sm text-sand-50 hairline';

function Form() {
  const base = useTwinStore((s) => s.base);
  const names = useTwinStore((s) => s.placeNames);
  const plan = useTwinStore((s) => s.plan);
  const patch = useTwinStore((s) => s.patchPlan);
  const run = useTwinStore((s) => s.runPlan);
  const [budgetText, setBudgetText] = useState(() => new Intl.NumberFormat('en-IN').format(plan.budget));
  const a = plan.assumptions;
  if (!base) return null;

  const setBudget = (text: string) => {
    setBudgetText(text);
    const n = Number(text.replace(/[^0-9]/g, ''));
    patch({ budget: Number.isFinite(n) ? n : 0 });
  };
  const choose = (n: number) => {
    setBudgetText(new Intl.NumberFormat('en-IN').format(n));
    patch({ budget: n });
  };
  const setA = (fn: (x: typeof a) => void) => {
    const next = { ...a, costMultiplier: { ...a.costMultiplier }, trafficReduction: { ...a.trafficReduction } };
    fn(next);
    patch({ assumptions: next });
  };

  return (
    <div className="space-y-3 pb-2">
      <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        Give a budget and a target. Plan-It tries every combination of tree planting, industrial emission control and traffic enforcement, costs each from the price
        table, and uses the same engine as What-If to estimate the PM2.5 effect. The budget is a hard limit.
      </p>

      <Section title="Budget (₹, one-time plus first-year running costs)">
        <input inputMode="numeric" aria-label="Budget in rupees" value={budgetText} onChange={(e) => setBudget(e.target.value)} className={inputCls} />
        <p className="mt-1 text-[11px] text-sand-400">= {formatINR(plan.budget)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {BUDGET_PRESETS.map((p) => (
            <Chip key={p} active={plan.budget === p} onClick={() => choose(p)} className="min-h-9">
              {formatINR(p)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Target">
        <select value={plan.targetId} onChange={(e) => patch({ targetId: e.target.value })} aria-label="Target" className={inputCls}>
          <option value="city">The whole city</option>
          {base.cells.map((c) => (
            <option key={c.id} value={c.id}>
              {zoneLabel(c, names)} ({c.id})
            </option>
          ))}
        </select>
      </Section>

      <Section title="Operational limits">
        <label className="block text-xs text-sand-300">
          Measures allowed in one plan
          <select value={plan.limits.maxInterventions} onChange={(e) => patch({ limits: { ...plan.limits, maxInterventions: Number(e.target.value) } })} className={`${inputCls} mt-1`}>
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <fieldset className="mt-2">
          <legend className="text-[11px] text-sand-400">Not available (cannot be done here)</legend>
          {TYPES.map((t) => (
            <label key={t} className="flex min-h-9 items-center gap-2 text-xs text-sand-200">
              <input
                type="checkbox"
                checked={plan.limits.unavailable.includes(t)}
                onChange={(e) =>
                  patch({ limits: { ...plan.limits, unavailable: e.target.checked ? [...plan.limits.unavailable, t] : plan.limits.unavailable.filter((x) => x !== t) } })
                }
                className="h-4 w-4 accent-accent-500"
              />
              {INTERVENTION_LABEL[t]}
            </label>
          ))}
        </fieldset>
        <label className="mt-1 block text-xs text-sand-300">
          Most trees that can be planted
          <input type="number" min={0} value={plan.limits.plantingCapacity} onChange={(e) => patch({ limits: { ...plan.limits, plantingCapacity: Math.max(0, Number(e.target.value) || 0) } })} className={`${inputCls} mt-1`} />
        </label>
      </Section>

      <Section title="Objective">
        <div className="space-y-1">
          {(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((o) => (
            <label key={o} className="flex min-h-9 items-center gap-2 text-sm text-sand-100">
              <input type="radio" name="objective" checked={plan.objective === o} onChange={() => patch({ objective: o })} className="h-4 w-4 accent-accent-500" />
              {OBJECTIVE_LABEL[o]}
            </label>
          ))}
        </div>
      </Section>

      <details className="rounded-xl bg-ink-850 p-3 hairline">
        <summary className="cursor-pointer text-sm font-semibold text-sand-100">Assumptions (editable)</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-sand-400">
          {TYPES.map((t) => (
            <label key={t}>
              {INTERVENTION_LABEL[t]} cost x
              <input type="number" step="0.05" min={0.1} value={a.costMultiplier[t]} onChange={(e) => setA((x) => void (x.costMultiplier[t] = Math.max(0.1, Number(e.target.value) || 1)))} className={inputCls} />
            </label>
          ))}
          <label>
            Tree canopy (m2)
            <input type="number" min={1} value={a.treeCanopyM2} onChange={(e) => setA((x) => void (x.treeCanopyM2 = Math.max(1, Number(e.target.value) || 40)))} className={inputCls} />
          </label>
          <label>
            Bag-filter capture (0-1)
            <input type="number" step="0.05" min={0} max={1} value={a.bagFilterCapture} onChange={(e) => setA((x) => void (x.bagFilterCapture = Math.min(1, Math.max(0, Number(e.target.value) || 0))))} className={inputCls} />
          </label>
          <label>
            Traffic reduction, standard
            <input type="number" step="0.05" min={0} max={0.9} value={a.trafficReduction.standard} onChange={(e) => setA((x) => void (x.trafficReduction.standard = Math.min(0.9, Math.max(0, Number(e.target.value) || 0))))} className={inputCls} />
          </label>
          <label>
            Traffic reduction, intensive
            <input type="number" step="0.05" min={0} max={0.9} value={a.trafficReduction.intensive} onChange={(e) => setA((x) => void (x.trafficReduction.intensive = Math.min(0.9, Math.max(0, Number(e.target.value) || 0))))} className={inputCls} />
          </label>
        </div>
      </details>

      <button type="button" onClick={run} className="h-12 w-full rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400">
        Find the best plans
      </button>
    </div>
  );
}

function CostTable({ plan }: { plan: Plan }) {
  return (
    <div className="space-y-3">
      {plan.options.map((o) => (
        <div key={o.key} className="rounded-xl bg-ink-850 p-2.5 hairline">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-sand-50">{o.label}</div>
              <div className="text-[11px] text-sand-400">{INTERVENTION_LABEL[o.type]} · {o.location}</div>
            </div>
            <div className="text-right text-sm font-bold text-sand-50">{formatINR(o.total)}</div>
          </div>
          <p className="mt-1 text-[11px] text-sand-300">{o.effect}</p>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-[11px]">
              <thead>
                <tr className="text-sand-400">
                  <th className="py-1 font-semibold">Item</th>
                  <th className="py-1 font-semibold">Qty</th>
                  <th className="py-1 font-semibold">Unit price</th>
                  <th className="py-1 text-right font-semibold">Total</th>
                  <th className="py-1 pl-2 font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l, i) => {
                  const price = PRICES[l.priceId];
                  return (
                    <tr key={`${l.priceId}-${i}`} className="border-t border-sand-400/15 align-top">
                      <td className="py-1 pr-1 text-sand-100">
                        {l.item}
                        <span className="block text-[10px] text-sand-500">{l.category} · {l.recurring ? 'first-year running' : 'one-time'}{l.note ? ` · ${l.note}` : ''}</span>
                      </td>
                      <td className="py-1 font-mono">{l.quantity.toLocaleString('en-IN')} {l.unit}</td>
                      <td className="py-1 font-mono">{formatINR(l.unitPrice)}</td>
                      <td className="py-1 text-right font-mono font-semibold">{formatINR(l.total)}</td>
                      <td className="py-1 pl-2">
                        {l.kind === 'sourced' && price?.source ? (
                          <a href={price.source.url} target="_blank" rel="noopener noreferrer" title={`${price.source.name}. ${price.source.note}`} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/40">
                            Sourced <ExternalLink size={9} />
                          </a>
                        ) : (
                          <span title={price?.basis} className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-500/40">
                            Estimate
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="mt-1 text-[10px] text-sand-500">
            <summary className="cursor-pointer font-semibold">Sources and bases</summary>
            <ul className="mt-1 space-y-0.5">
              {[...new Set(o.lines.map((l) => l.priceId))].map((id) => {
                const p = PRICES[id];
                return (
                  <li key={id}>
                    <strong>{p.item}:</strong>{' '}
                    {p.kind === 'sourced' && p.source ? (
                      <>
                        <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="underline">{p.source.name}</a> (accessed {p.source.accessed}). {p.source.note}
                      </>
                    ) : (
                      <>Estimate. {p.basis}</>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}

function Results() {
  const base = useTwinStore((s) => s.base);
  const plan = useTwinStore((s) => s.plan);
  const patch = useTwinStore((s) => s.patchPlan);
  const run = useTwinStore((s) => s.runPlan);
  const applyParams = useTwinStore((s) => s.applyParams);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const setOpen = useTwinStore((s) => s.setPlanItOpen);
  const setNotice = useTwinStore((s) => s.setNotice);
  const [sens, setSens] = useState<ReturnType<typeof sensitivity> | null>(null);
  const out = plan.outcome;
  const stale = !!base && !!out && plan.outcomeKey !== planBaseKey(base);
  const chosen = out?.plans.find((p) => p.id === plan.selected) ?? out?.plans[0];

  const preview = (p: Plan) => {
    applyParams(p.params);
    setMode('delta');
    setNotice(`Plan ${p.id} applied as the active scenario. The map shows the change; What-If now holds these settings.`);
    setOpen(false);
  };

  if (!out || !base) return null;
  return (
    <div className="space-y-3 pb-2">
      <button type="button" onClick={() => patch({ view: 'form' })} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-accent-500 hover:bg-ink-800">
        <ArrowLeft size={14} /> Change inputs
      </button>

      {stale && (
        <p role="alert" className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">
          <span>The grid or data changed since this plan was made, so the numbers are stale.</span>
          <button type="button" onClick={run} className="min-h-9 shrink-0 rounded-lg bg-amber-600 px-3 font-bold text-white">Re-run</button>
        </p>
      )}

      {out.status !== 'OK' && (
        <div role="alert" className="space-y-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-800 ring-1 ring-red-500/30">
          {out.messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
          {out.status === 'INFEASIBLE' && (
            <p className="text-[11px] text-sand-300">
              Considered {out.evaluated} combinations: {out.rejected.overBudget} over budget, {out.rejected.noReduction} with no measurable PM2.5 reduction, {out.rejected.tooMany} with too many measures.
            </p>
          )}
          {out.suggestedBudget !== undefined && (
            <button
              type="button"
              onClick={() => {
                patch({ budget: out.suggestedBudget! });
                setTimeout(run, 0);
              }}
              className="min-h-10 rounded-lg bg-accent-500 px-3 font-bold text-sand-50"
            >
              Try {formatINR(out.suggestedBudget)}
            </button>
          )}
        </div>
      )}

      {out.status === 'OK' && chosen && (
        <>
          <p className="text-xs text-sand-300">
            Target: <strong className="text-sand-100">{out.target?.label}</strong> · budget {formatINR(out.budget)} · {out.feasible} feasible of {out.evaluated} combinations ({out.rejected.overBudget} over budget, {out.rejected.noReduction} with no reduction)
          </p>
          <div role="tablist" aria-label="Plans" className="flex gap-1.5">
            {out.plans.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === chosen.id}
                onClick={() => patch({ selected: p.id })}
                className={`min-h-11 flex-1 rounded-xl px-2 text-sm font-bold hairline ${p.id === chosen.id ? 'bg-accent-500 text-sand-50' : 'bg-ink-850 text-sand-200 hover:bg-ink-800'}`}
              >
                Plan {p.id}
                <span className="block text-[10px] font-medium opacity-80">{formatINR(p.total)}</span>
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-ink-850 p-3 hairline">
            <p className="text-xs text-sand-200">{chosen.reason}</p>
            {chosen.tradeoff && <p className="mt-1 text-xs text-sand-300">{chosen.tradeoff}</p>}
          </div>

          <CostTable plan={chosen} />

          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ['One-time', formatINR(chosen.oneTime)],
              ['First-year running', formatINR(chosen.recurring)],
              ['Total', formatINR(chosen.total)],
              ['Budget left', formatINR(chosen.remaining)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
                <dt className="text-sand-400">{k}</dt>
                <dd className="font-mono font-bold text-sand-50">{v}</dd>
              </div>
            ))}
          </dl>

          <Section title="Expected PM2.5 change" action={<StatusBadge status="MODELED_SCENARIO" />}>
            <div className="rounded-xl bg-ink-850 p-3 hairline">
              <p className="text-sm text-sand-100">
                Target mean {fmt(chosen.impact.baseline)} → {fmt(chosen.impact.predicted)} ug/m3 ·{' '}
                <strong className="text-emerald-600">{fmt(chosen.impact.abs, 2)} ug/m3 ({fmt(chosen.impact.pct, 1)}%)</strong>
              </p>
              <p className="mt-1 text-xs text-sand-300">
                City mean {fmt(chosen.impact.cityBaseline)} → {fmt(chosen.impact.cityPredicted)} ug/m3 · {chosen.impact.zonesImproved} target zones improved by 0.5 ug/m3 or more · {chosen.impact.affectedZones} zones affected
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-sand-400">
                {[...new Set(chosen.options.flatMap((o) => o.limitations))].map((l) => (
                  <li key={l}>{l}</li>
                ))}
                <li>A hypothetical estimate: not a forecast and not a guarantee.</li>
              </ul>
            </div>
          </Section>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => preview(chosen)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-500 px-3 text-sm font-bold text-sand-50 hover:bg-accent-400">
              <MapPinned size={16} /> Preview on map
            </button>
            <button type="button" onClick={() => downloadPlanPdf(out, chosen)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ink-700 px-3 text-sm font-bold text-sand-50 hover:bg-ink-600">
              <Download size={16} /> PDF plan
            </button>
          </div>

          <Section title="Sensitivity analysis">
            <p className="mb-2 text-[11px] text-sand-400">Re-runs the search with costs and response assumptions changed, and shows whether the best plan changes.</p>
            <button
              type="button"
              onClick={() => base && setSens(sensitivity({ base, budget: plan.budget, targetId: plan.targetId, limits: plan.limits, objective: plan.objective, assumptions: plan.assumptions }))}
              className="min-h-10 rounded-xl bg-ink-700 px-3 text-xs font-bold text-sand-50 hover:bg-ink-600"
            >
              Run sensitivity analysis
            </button>
            {sens && (
              <div className="mt-2 overflow-x-auto rounded-xl hairline">
                <table className="w-full min-w-[420px] text-left text-[11px]">
                  <thead>
                    <tr className="bg-ink-850 text-sand-400">
                      <th className="p-1.5 font-semibold">Variant</th>
                      <th className="p-1.5 font-semibold">Plan A</th>
                      <th className="p-1.5 font-semibold">Cost</th>
                      <th className="p-1.5 font-semibold">Change</th>
                      <th className="p-1.5 font-semibold">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[sens.base, ...sens.rows].map((r, i) => (
                      <tr key={r.label} className="border-t border-sand-400/15">
                        <td className="p-1.5 font-semibold text-sand-50">{r.label}</td>
                        <td className="p-1.5 text-sand-200">{r.planKeys[0] ?? r.status}</td>
                        <td className="p-1.5 font-mono">{r.topTotal === null ? '-' : formatINR(r.topTotal)}</td>
                        <td className="p-1.5 font-mono">{r.topAbs === null ? '-' : fmt(r.topAbs, 2)}</td>
                        <td className="p-1.5">{i === 0 ? 'base' : r.changed ? <span className="font-bold text-amber-800">changes</span> : 'same'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <div className="space-y-0.5 text-[10px] text-sand-500">
        {out.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
    </div>
  );
}

/** Plan-It: a floating panel opened from Actions or the header. */
export function PlanItPanel() {
  const open = useTwinStore((s) => s.planItOpen);
  const setOpen = useTwinStore((s) => s.setPlanItOpen);
  const view = useTwinStore((s) => s.plan.view);
  const hasBase = useTwinStore((s) => s.base !== null);
  const [min, setMin] = useState(false);
  const title = useMemo(() => (view === 'form' ? 'Plan-It: budget and target' : 'Plan-It: results'), [view]);

  if (!open || !hasBase) return null;
  return (
    <section
      role="dialog"
      aria-label="Plan-It"
      className={`sheet-surface theme-cream hairline animate-rise absolute z-40 flex flex-col max-md:inset-x-0 max-md:bottom-0 max-md:rounded-b-none md:left-1/2 md:top-3 md:w-[min(720px,calc(100%-24px))] md:-translate-x-1/2 ${
        min ? 'max-md:h-14 md:h-14' : 'max-md:top-12 md:bottom-3'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sand-400/15 px-4 py-2.5">
        <h2 className="font-display text-base font-bold text-sand-50">{title}</h2>
        <div className="flex items-center gap-1">
          <Segmented ariaLabel="Panel size" value={min ? 'min' : 'max'} onChange={(v) => setMin(v === 'min')} options={[{ value: 'max', label: <Maximize2 size={13} />, title: 'Expand' }, { value: 'min', label: <Minimize2 size={13} />, title: 'Minimise' }]} />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close Plan-It" className="flex h-11 w-11 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800 md:h-9 md:w-9">
            <X size={18} />
          </button>
        </div>
      </div>
      {!min && <div className="panel-scroll min-h-0 flex-1 px-4 py-3">{view === 'form' ? <Form /> : <Results />}</div>}
    </section>
  );
}
