import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Pencil, Trash2, Upload } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { runScenario, sanitizeParams } from '../services/scenarioService';
import { exampleScenarios } from './examples';
import { Section, StatusBadge } from '../components/ui';
import { CHART } from '../components/chartTheme';
import { fmt, fmtInt, fmtSigned } from '../utils/format';
import { SOURCE_LABELS } from '../utils/colors';
import type { SavedScenario, SourceContribution } from '../types';

const SERIES_COLORS = ['#a3263f', '#2fae8b', '#d19a2a', '#6d7aa8'];
const SOURCES: Array<keyof SourceContribution> = ['traffic', 'industry', 'background', 'other'];

export function ScenariosPanel() {
  const base = useTwinStore((s) => s.base);
  const saved = useTwinStore((s) => s.savedScenarios);
  const loadScenario = useTwinStore((s) => s.loadScenario);
  const deleteScenario = useTwinStore((s) => s.deleteScenario);
  const renameScenario = useTwinStore((s) => s.renameScenario);
  const setSection = useTwinStore((s) => s.setSection);
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const examples = useMemo(() => (base ? exampleScenarios(base) : []), [base]);
  const all: Array<SavedScenario & { example?: boolean; documentation?: string }> = [...saved, ...examples];

  const compare = useMemo(() => {
    if (!base) return [];
    return picked
      .map((id) => all.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ s, r: runScenario(base, sanitizeParams(base, s.params)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, picked, saved]);

  if (!base) return null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  const chartData = SOURCES.map((k) => {
    const row: Record<string, string | number> = { source: SOURCE_LABELS[k] };
    if (compare[0]) row.Baseline = Number(compare[0].r.sourceContribution.baseline[k].toFixed(2));
    compare.forEach(({ s, r }) => {
      row[s.name] = Number(r.sourceContribution.scenario[k].toFixed(2));
    });
    return row;
  });

  const row = (s: (typeof all)[number]) => {
    const isEx = 'example' in s && s.example;
    const isPicked = picked.includes(s.id);
    return (
      <li key={s.id} className="rounded-xl bg-ink-850 p-2.5 hairline">
        <div className="flex items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={isPicked}
            aria-label={`Compare ${s.name}`}
            onClick={() => toggle(s.id)}
            disabled={!isPicked && picked.length >= 3}
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hairline md:h-8 md:w-8 ${
              isPicked ? 'bg-accent-500 text-sand-50' : 'bg-ink-950 text-transparent hover:bg-ink-700'
            } disabled:opacity-30`}
          >
            <Check size={15} />
          </button>
          <div className="min-w-0 flex-1">
            {editing === s.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  renameScenario(s.id, draft);
                  setEditing(null);
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  aria-label="Scenario name"
                  className="h-9 w-full rounded-lg bg-ink-950 px-2 text-sm text-sand-50 hairline"
                />
              </form>
            ) : (
              <div className="truncate text-sm font-bold text-sand-50">{s.name}</div>
            )}
            <div className="text-[11px] text-sand-400">
              {isEx ? 'Example' : new Date(s.createdAt).toLocaleString()} · mean {fmtSigned(s.meanDelta, 2)} ug/m3 (
              {fmtSigned(s.meanDeltaPct, 1)}%)
            </div>
            {'documentation' in s && s.documentation && (
              <p className="mt-1 text-[11px] leading-snug text-sand-300">{s.documentation}</p>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (loadScenario(s.id)) setSection('simulator');
            }}
            className="flex min-h-9 items-center gap-1 rounded-lg bg-ink-700 px-2.5 text-xs font-semibold text-sand-50 hover:bg-ink-600"
          >
            <Upload size={13} /> Load
          </button>
          {!isEx && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(s.id);
                  setDraft(s.name);
                }}
                className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-sand-200 hover:bg-ink-700"
              >
                <Pencil size={13} /> Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteScenario(s.id);
                  setPicked((p) => p.filter((x) => x !== s.id));
                }}
                className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-ink-700"
              >
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-1 py-2">
      <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        Saved scenarios are stored in this browser only. Tick up to three to compare them side by side. All results are{' '}
        <StatusBadge status="MODELED_SCENARIO" className="align-middle" />.
      </p>

      {compare.length > 0 && (
        <Section title={`Comparing ${compare.length}`}>
          <div className="overflow-x-auto rounded-xl hairline">
            <table className="w-full min-w-[360px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-ink-850 text-sand-400">
                  <th className="p-2 font-semibold">Scenario</th>
                  <th className="p-2 font-semibold">Mean PM2.5</th>
                  <th className="p-2 font-semibold">Change</th>
                  <th className="p-2 font-semibold">Zones</th>
                  <th className="p-2 font-semibold">Exposed</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(({ s, r }, i) => (
                  <tr key={s.id} className="border-t border-sand-400/15">
                    <td className="p-2 font-semibold text-sand-50">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i + 1] }} />
                      {s.name}
                    </td>
                    <td className="p-2 font-mono">{fmt(r.summary.meanScenario)}</td>
                    <td className="p-2 font-mono">
                      {fmtSigned(r.summary.meanDelta, 2)} ({fmtSigned(r.summary.meanDeltaPct, 1)}%)
                    </td>
                    <td className="p-2 font-mono">{r.summary.affectedCount}</td>
                    <td className="p-2 font-mono">{fmtInt(r.summary.exposedPopulation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 h-[230px]" aria-label="Grouped bar chart of mean PM2.5 by source for each scenario">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -14, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                <XAxis dataKey="source" tick={CHART.tick} tickLine={false} interval={0} />
                <YAxis tick={CHART.tick} tickLine={false} axisLine={false} unit="" />
                <Tooltip {...CHART.tooltip} cursor={CHART.cursor} formatter={(v) => [`${v} ug/m3`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Baseline" fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                {compare.map(({ s }, i) => (
                  <Bar key={s.id} dataKey={s.name} fill={SERIES_COLORS[i + 1]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title={`Your saved scenarios (${saved.length})`}>
        {saved.length === 0 ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">
            Nothing saved yet. Build a scenario in What-If and use "Save as scenario".
          </p>
        ) : (
          <ul className="space-y-2">{saved.map(row)}</ul>
        )}
      </Section>

      <Section title="Example scenarios A-E">
        <ul className="space-y-2">{examples.map(row)}</ul>
      </Section>
    </div>
  );
}
