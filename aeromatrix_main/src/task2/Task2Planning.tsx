import { useMemo, useState } from 'react';
import { Section } from '../components/ui';
import { ILLUSTRATIVE_ACTIONS, UNCERTAINTY_CASES, analyze } from '../planning/analyze';
import { formatINR } from '../plan/costModel';
import { fmt } from '../utils/format';
import type { T2Available } from './task2Api';

const CASE_LABEL = { lower: 'Lower bound', point: 'Point forecast', upper: 'Upper bound' } as const;

/** The planner on top of src/planning.analyze: which subsets of illustrative actions are feasible under a budget. */
export function Task2Planning({ prediction }: { prediction: T2Available | null }) {
  const [budget, setBudget] = useState(300000);
  const [target, setTarget] = useState(60);

  const a = useMemo(
    () => (prediction ? analyze({ value: prediction.value, lower: prediction.interval[0], upper: prediction.interval[1] }, ILLUSTRATIVE_ACTIONS, budget, target) : null),
    [prediction, budget, target],
  );

  return (
    <Section title="Planning on this prediction">
      <p className="mb-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-snug text-amber-800">
        A mathematical illustration only: the action fractions and costs below are assumed, and no causal claim is made that any action lowers PM in reality.
      </p>
      {!prediction ? (
        <p className="text-xs text-sand-400">Run a replay with an available PM2.5 prediction to see which action subsets are feasible.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs text-sand-300">
            <label>
              Budget (₹)
              <input type="number" min={0} step={50000} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} className="h-10 w-full rounded-lg bg-ink-950 px-2 text-sm text-sand-50 hairline" />
            </label>
            <label>
              Target PM2.5 (ug/m3)
              <input type="number" min={0} value={target} onChange={(e) => setTarget(Math.max(0, Number(e.target.value) || 0))} className="h-10 w-full rounded-lg bg-ink-950 px-2 text-sm text-sand-50 hairline" />
            </label>
          </div>
          <p className="mt-1 text-[11px] text-sand-400">
            Prediction {fmt(prediction.value)} (interval {fmt(prediction.interval[0])} to {fmt(prediction.interval[1])}) ug/m3.
          </p>
          {a && a.errors.length > 0 && <p role="alert" className="mt-1 text-xs text-red-600">{a.errors.join(' ')}</p>}
          {a && a.errors.length === 0 && (
            <>
              <div className="mt-2 overflow-x-auto rounded-xl hairline">
                <table className="w-full min-w-[420px] text-left text-[11px]">
                  <thead>
                    <tr className="bg-ink-850 text-sand-400">
                      <th className="p-1.5 font-semibold">Actions</th>
                      <th className="p-1.5 font-semibold">Cost</th>
                      {UNCERTAINTY_CASES.map((u) => (
                        <th key={u} className="p-1.5 font-semibold">{CASE_LABEL[u]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.subsets.map((s) => (
                      <tr key={s.ids.join()} className="border-t border-sand-400/15">
                        <td className="p-1.5 text-sand-50">{s.ids.join(' + ')}</td>
                        <td className="p-1.5 font-mono">{formatINR(s.cost)}</td>
                        {UNCERTAINTY_CASES.map((u) => (
                          <td key={u} className={`p-1.5 font-mono ${s.feasible[u] ? 'font-bold text-emerald-600' : 'text-sand-400'}`}>
                            {fmt(s.resulting[u])} {s.feasible[u] ? 'OK' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-sand-400">How feasibility changes</h4>
              <div className="overflow-x-auto rounded-xl hairline">
                <table className="w-full min-w-[380px] text-left text-[11px]">
                  <thead>
                    <tr className="bg-ink-850 text-sand-400">
                      <th className="p-1.5 font-semibold">Budget</th>
                      {UNCERTAINTY_CASES.map((u) => (
                        <th key={u} className="p-1.5 font-semibold">{CASE_LABEL[u]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.budgets.map((b) => (
                      <tr key={b} className="border-t border-sand-400/15">
                        <td className="p-1.5 font-mono font-semibold text-sand-50">{formatINR(b)}</td>
                        {UNCERTAINTY_CASES.map((u) => {
                          const cell = a.matrix.find((m) => m.budget === b && m.uncertainty === u)!;
                          return (
                            <td key={u} className="p-1.5">
                              {cell.feasibleCount} feasible
                              <span className="block text-[10px] text-sand-500">{cell.cheapest ? `cheapest: ${cell.cheapest.ids.join(' + ')}` : 'none'}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-[10px] text-sand-500">Sources of the illustrative inputs: {ILLUSTRATIVE_ACTIONS[0].source}.</p>
        </>
      )}
    </Section>
  );
}
