import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { StatusBadge } from './ui';
import { CHART } from './chartTheme';
import { displayedStates } from '../map/mapSync';
import { dataProvider } from '../services/dataProvider';
import { meanContribution } from '../services/pollutionModel';
import { POLLUTANT_LABEL, POLLUTANT_UNIT, RISK_COLOR, SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { zoneLabel } from '../utils/zones';
import type { SourceContribution, TimeSeriesPoint } from '../types';

const SOURCES: Array<keyof SourceContribution> = ['traffic', 'industry', 'background', 'other'];

/** Charts for the active selection (md and wider). */
export function BottomPanel() {
  const open = useTwinStore((s) => s.bottomOpen);
  const setOpen = useTwinStore((s) => s.setBottomOpen);
  const base = useTwinStore((s) => s.base);
  const baseline = useTwinStore((s) => s.baseline);
  const states = useTwinStore((s) => displayedStates(s));
  const mode = useTwinStore((s) => s.displayMode);
  const result = useTwinStore((s) => s.activeResult);
  const selectedCellId = useTwinStore((s) => s.selectedCellId);
  const pollutant = useTwinStore((s) => s.pollutant);
  const names = useTwinStore((s) => s.placeNames);
  const focusCell = useTwinStore((s) => s.focusCell);
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);

  const selected = useMemo(() => base?.cells.find((c) => c.id === selectedCellId), [base, selectedCellId]);
  const selState = states.find((s) => s.cellId === selectedCellId);
  const label = selected && base ? zoneLabel(selected, names) : 'City mean';

  const zones = useMemo(() => {
    if (!base) return [];
    const byId = new Map(states.map((s) => [s.cellId, s]));
    return base.cells
      .map((c) => ({ id: c.id, name: zoneLabel(c, names), value: Number((byId.get(c.id)?.pm25 ?? 0).toFixed(1)), risk: byId.get(c.id)?.risk ?? 'LOW' }))
      .sort((a, b) => b.value - a.value);
  }, [base, states, names]);

  const sourceData = useMemo(() => {
    const pick = (list: typeof states) => {
      const s = list.find((x) => x.cellId === selectedCellId);
      return s ? s.contributionAbs : meanContribution(list);
    };
    const b = pick(baseline);
    const sc = result && mode !== 'baseline' ? pick(result.scenario) : null;
    const row = (name: string, c: SourceContribution) => ({ name, ...Object.fromEntries(SOURCES.map((k) => [k, Number(c[k].toFixed(2))])) });
    return sc ? [row('Baseline', b), row('Scenario', sc)] : [row('Baseline', b)];
  }, [baseline, result, mode, selectedCellId]);

  const profileValue = selState ? selState[pollutant] : states.length ? states.reduce((a, s) => a + s[pollutant], 0) / states.length : 0;
  useEffect(() => {
    if (!open || !base) return;
    let stale = false;
    dataProvider.getTimeSeries(selectedCellId ?? 'city', pollutant, profileValue, 24).then((s) => {
      if (!stale) setSeries(s);
    });
    return () => {
      stale = true;
    };
  }, [open, base, selectedCellId, pollutant, profileValue]);

  return (
    <section
      aria-label="Charts"
      className={`relative z-10 hidden shrink-0 border-t border-sand-400/15 bg-ink-950 transition-[height] duration-300 md:block ${open ? 'h-[248px]' : 'h-10'}`}
    >
      <div className="flex h-10 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-9 items-center gap-2 text-xs font-bold text-sand-100"
        >
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          Charts · {label}
        </button>
        {open && <span className="text-[11px] text-sand-400">{mode === 'baseline' ? 'Baseline' : 'Scenario'} · {POLLUTANT_LABEL[pollutant]}</span>}
      </div>
      {open && (
        <div className="grid h-[208px] grid-cols-3 gap-3 px-4 pb-3 theme-cream" style={{ background: 'transparent' }}>
          <figure className="min-w-0 rounded-xl bg-ink-850 p-2 hairline">
            <figcaption className="mb-1 flex items-center justify-between text-[11px] font-bold text-sand-200">
              PM2.5 by zone (sorted)
              <StatusBadge status={mode === 'baseline' ? 'DEMO' : 'MODELED_SCENARIO'} />
            </figcaption>
            <div className="h-[158px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zones} margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                  <XAxis dataKey="name" hide />
                  <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
                  <Tooltip {...CHART.tooltip} cursor={CHART.cursor} formatter={(v) => [`${v} ug/m3`, 'PM2.5']} />
                  <Bar
                    dataKey="value"
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(d) => {
                      const id = (d as unknown as { id?: string }).id;
                      if (id) focusCell(id);
                    }}
                  >
                    {zones.map((z) => (
                      <Cell key={z.id} fill={RISK_COLOR[z.risk]} stroke={z.id === selectedCellId ? '#1c0a10' : undefined} strokeWidth={z.id === selectedCellId ? 2 : 0} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <figure className="min-w-0 rounded-xl bg-ink-850 p-2 hairline">
            <figcaption className="mb-1 flex items-center justify-between text-[11px] font-bold text-sand-200">
              Sources: baseline vs scenario
              <StatusBadge status={result && mode !== 'baseline' ? 'MODELED_SCENARIO' : 'DEMO'} />
            </figcaption>
            <div className="h-[158px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                  <XAxis dataKey="name" tick={CHART.tick} tickLine={false} />
                  <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
                  <Tooltip {...CHART.tooltip} cursor={CHART.cursor} formatter={(v, n) => [`${v} ug/m3`, SOURCE_LABELS[n as keyof SourceContribution] ?? n]} />
                  {SOURCES.map((k) => (
                    <Bar key={k} dataKey={k} stackId="src" fill={SOURCE_COLORS[k]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <figure className="min-w-0 rounded-xl bg-ink-850 p-2 hairline">
            <figcaption className="mb-1 flex items-center justify-between text-[11px] font-bold text-sand-200">
              24 h profile · {label}
              <StatusBadge status="DEMO" />
            </figcaption>
            <div className="h-[158px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ left: -12, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
                  <XAxis dataKey="t" tick={CHART.tick} tickLine={false} interval={5} />
                  <YAxis tick={CHART.tick} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip {...CHART.tooltip} formatter={(v) => [`${Number(v).toFixed(1)} ${POLLUTANT_UNIT[pollutant]}`, POLLUTANT_LABEL[pollutant]]} />
                  <Line type="monotone" dataKey="value" stroke="#a3263f" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
        </div>
      )}
    </section>
  );
}
