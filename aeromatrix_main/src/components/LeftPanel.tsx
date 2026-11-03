import { useMemo, useState } from 'react';
import { PanelLeftOpen, PanelLeftClose, Search } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section, Segmented, Stat, StatusBadge } from './ui';
import { SECTION_LABEL } from './OrbitNav';
import {
  POLLUTANT_LABEL,
  POLLUTANT_UNIT,
  RISK_COLOR,
  RISK_LABEL,
  pollutionColor,
  riskFromPm25,
  rgbCss,
} from '../utils/colors';
import { POLLUTANTS } from '../services/pollutionModel';
import { fmt, fmtInt } from '../utils/format';
import { zoneLabel } from '../utils/zones';
import type { Pollutant, RiskLevel, Section as SectionId } from '../types';
import { WhatIfPanel } from '../simulator/WhatIfPanel';
import { ActionsPanel } from '../scenarios/ActionsPanel';
import { ScenariosPanel } from '../scenarios/ScenariosPanel';
import { LocationsPanel } from '../locations/LocationsPanel';
import { DataPanel } from './DataPanel';
import { SensorsPanel } from '../task2/SensorsPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { IndustryPanel } from './IndustryPanels';
import { ForecastTab, LiveNowTab, LiveStrip } from './LivePanels';
import { StationsTab } from './StationPanels';

const RISKS: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'];

function compass(deg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function digits(p: Pollutant) {
  return p === 'co' ? 2 : 1;
}

/** Shared derived data for all three sections. */
function useZoneRows() {
  const base = useTwinStore((s) => s.base);
  const baseline = useTwinStore((s) => s.baseline);
  const names = useTwinStore((s) => s.placeNames);
  return useMemo(() => {
    if (!base) return [];
    const byId = new Map(baseline.map((s) => [s.cellId, s]));
    return base.cells
      .map((cell) => {
        const state = byId.get(cell.id);
        return state ? { cell, state, name: zoneLabel(cell, names) } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [base, baseline, names]);
}

function Overview() {
  const rows = useZoneRows();
  const base = useTwinStore((s) => s.base);
  const focusCell = useTwinStore((s) => s.focusCell);
  const selectedCellId = useTwinStore((s) => s.selectedCellId);

  const stats = useMemo(() => {
    const n = Math.max(1, rows.length);
    const mean = rows.reduce((a, r) => a + r.state.pm25, 0) / n;
    const counts: Record<RiskLevel, number> = { LOW: 0, MODERATE: 0, HIGH: 0, VERY_HIGH: 0 };
    rows.forEach((r) => (counts[r.state.risk] += 1));
    const top = [...rows].sort((a, b) => b.state.pm25 - a.state.pm25).slice(0, 5);
    return { mean, counts, top, total: rows.length };
  }, [rows]);

  if (!base) return null;
  const w = base.weather;
  const meanRisk = riskFromPm25(stats.mean);

  return (
    <>
      <div className="flex items-end justify-between gap-3 pt-3">
        <Stat label="City mean PM2.5" value={fmt(stats.mean)} unit="ug/m3" />
        <span
          className="mb-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
          style={{ background: RISK_COLOR[meanRisk] }}
        >
          {RISK_LABEL[meanRisk]}
        </span>
      </div>

      <Section title="Live air quality (model data)">
        <LiveStrip />
      </Section>

      <Section title="Risk distribution">
        <ul className="space-y-1.5">
          {RISKS.map((r) => (
            <li key={r} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLOR[r] }} />
              <span className="w-20 text-sand-200">{RISK_LABEL[r]}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(stats.counts[r] / Math.max(1, stats.total)) * 100}%`, background: RISK_COLOR[r] }}
                />
              </span>
              <span className="w-8 text-right font-mono text-sand-100">{stats.counts[r]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Top 5 hotspot zones (PM2.5)">
        <ol className="space-y-1">
          {stats.top.map((r, i) => (
            <li key={r.cell.id}>
              <button
                type="button"
                onClick={() => focusCell(r.cell.id)}
                aria-pressed={selectedCellId === r.cell.id}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-ink-800 aria-pressed:bg-ink-800"
              >
                <span className="w-4 text-xs font-bold text-sand-400">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLOR[r.state.risk] }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sand-50">{r.name}</span>
                <span className="font-mono text-sm text-sand-100">{fmt(r.state.pm25)}</span>
              </button>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Weather (city mean)" action={<StatusBadge status="DEMO" />}>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {[
            ['Temperature', `${fmt(w.temperature, 0)} °C`],
            ['Wind', `${fmt(w.windSpeed)} m/s from ${compass(w.windDirection)} (${fmt(w.windDirection, 0)}°)`],
            ['Humidity', `${fmt(w.humidity, 0)} %`],
            ['Rainfall', `${fmt(w.rainfall, 0)} mm/day`],
            ['Pressure', `${fmt(w.pressure, 0)} hPa`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
              <dt className="text-sand-400">{k}</dt>
              <dd className="font-semibold text-sand-50">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <p className="mb-2 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        <strong className="text-sand-100">Data status:</strong> every value here is DEMO. Inputs are seeded demo
        features of Pune run through an uncalibrated rule-based model. They are not measurements and not a validated
        forecast.
      </p>
    </>
  );
}

function ModelTab() {
  const rows = useZoneRows();
  const pollutant = useTwinStore((s) => s.pollutant);
  const setPollutant = useTwinStore((s) => s.setPollutant);
  const focusCell = useTwinStore((s) => s.focusCell);

  const summary = useMemo(() => {
    const n = Math.max(1, rows.length);
    return POLLUTANTS.map((p) => {
      let sum = 0;
      let max = -Infinity;
      for (const r of rows) {
        sum += r.state[p];
        if (r.state[p] > max) max = r.state[p];
      }
      return { p, mean: sum / n, max: rows.length ? max : 0 };
    });
  }, [rows]);

  const top10 = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.state[pollutant] - a.state[pollutant])
        .slice(0, 10)
        .map((r) => ({
          id: r.cell.id,
          name: r.name,
          value: Number(r.state[pollutant].toFixed(digits(pollutant) + 1)),
          fill: rgbCss(pollutionColor(pollutant, r.state[pollutant])),
        })),
    [rows, pollutant],
  );

  return (
    <>
      <Section title="Pollutants" action={<StatusBadge status="DEMO" />}>
        <div className="grid grid-cols-2 gap-2">
          {summary.map(({ p, mean, max }) => {
            const active = p === pollutant;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => setPollutant(p)}
                className={`min-h-[76px] rounded-xl p-2.5 text-left transition-colors hairline ${
                  active ? 'bg-accent-500 text-sand-50' : 'bg-ink-850 hover:bg-ink-800'
                }`}
              >
                <div className={`text-xs font-bold ${active ? 'text-sand-50' : 'text-sand-100'}`}>
                  {POLLUTANT_LABEL[p]}
                </div>
                <div className={`font-display text-lg font-bold leading-tight ${active ? 'text-sand-50' : 'text-sand-50'}`}>
                  {fmt(mean, digits(p))}
                  <span className={`ml-1 text-[10px] font-medium ${active ? 'text-sand-100' : 'text-sand-400'}`}>
                    {POLLUTANT_UNIT[p]}
                  </span>
                </div>
                <div className={`text-[11px] ${active ? 'text-sand-100' : 'text-sand-400'}`}>
                  mean · max {fmt(max, digits(p))}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`Top 10 zones · ${POLLUTANT_LABEL[pollutant]}`}>
        <div className="h-[260px] w-full" aria-label={`Bar chart of the ten highest ${POLLUTANT_LABEL[pollutant]} zones`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, 'dataMax']} />
              <YAxis
                type="category"
                dataKey="name"
                width={92}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--color-sand-300)' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(163,38,63,0.08)' }}
                formatter={(v) => [`${v} ${POLLUTANT_UNIT[pollutant]}`, POLLUTANT_LABEL[pollutant]]}
                contentStyle={{
                  background: 'var(--color-ink-900)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 6, 6, 0]}
                barSize={16}
                cursor="pointer"
                onClick={(d) => {
                  const id = (d as unknown as { id?: string }).id;
                  if (id) focusCell(id);
                }}
              >
                {top10.map((d) => (
                  <Cell key={d.id} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-sand-400">Click a bar to fly to that zone.</p>
      </Section>
    </>
  );
}

function AirQuality() {
  const [tab, setTab] = useState<'now' | 'stations' | 'forecast' | 'model'>('now');
  return (
    <div className="pt-3">
      <Segmented
        ariaLabel="Air quality view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'now', label: 'Now (model data)' },
          { value: 'stations', label: 'Monitoring stations' },
          { value: 'forecast', label: 'Forecast' },
          { value: 'model', label: 'Rule model' },
        ]}
        className="max-w-full flex-wrap"
      />
      {tab === 'now' && <LiveNowTab />}
      {tab === 'stations' && <StationsTab />}
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'model' && <ModelTab />}
    </div>
  );
}

function Zones() {
  const rows = useZoneRows();
  const pollutant = useTwinStore((s) => s.pollutant);
  const focusCell = useTwinStore((s) => s.focusCell);
  const selectedCellId = useTwinStore((s) => s.selectedCellId);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'high' | 'low' | 'name'>('high');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.cell.id.toLowerCase().includes(q))
      : rows;
    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    else if (sort === 'low') sorted.sort((a, b) => a.state[pollutant] - b.state[pollutant]);
    else sorted.sort((a, b) => b.state[pollutant] - a.state[pollutant]);
    return sorted;
  }, [rows, query, sort, pollutant]);

  return (
    <>
      <div className="space-y-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Search zones</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sand-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by place or id"
            className="h-11 w-full rounded-xl bg-ink-850 pl-9 pr-3 text-sm text-sand-50 placeholder:text-sand-500 hairline"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <Segmented
            ariaLabel="Sort zones"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'high', label: 'Highest' },
              { value: 'low', label: 'Lowest' },
              { value: 'name', label: 'A-Z' },
            ]}
          />
          <span className="text-[11px] text-sand-400">
            {list.length} zones · {POLLUTANT_LABEL[pollutant]}
          </span>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 pb-3">
        {list.map((r) => (
          <li key={r.cell.id}>
            <button
              type="button"
              onClick={() => focusCell(r.cell.id)}
              aria-pressed={selectedCellId === r.cell.id}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-ink-800 aria-pressed:bg-ink-800"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RISK_COLOR[r.state.risk] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-sand-50">{r.name}</span>
                <span className="block text-[10px] text-sand-500">{r.cell.id} · {r.cell.landUse} · {fmtInt(r.cell.population)} people</span>
              </span>
              <span className="font-mono text-sm text-sand-100">{fmt(r.state[pollutant], digits(pollutant))}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-sand-400">No zones match "{query}".</li>}
      </ul>
    </>
  );
}

export function LeftPanel() {
  const leftOpen = useTwinStore((s) => s.leftOpen);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const setLeftOpen = useTwinStore((s) => s.setLeftOpen);
  const section = useTwinStore((s) => s.section);
  const base = useTwinStore((s) => s.base);

  const active: SectionId =
    section === 'air' ||
    section === 'zones' ||
    section === 'simulator' ||
    section === 'actions' ||
    section === 'locations' ||
    section === 'scenarios' ||
    section === 'industries' ||
    section === 'analytics' ||
    section === 'sensors' ||
    section === 'data'
      ? section
      : 'overview';

  if (!leftOpen) {
    return (
      <button
        type="button"
        onClick={() => setLeftOpen(true)}
        aria-label="Show panel"
        title="Show panel"
        className={`absolute left-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900/90 text-sand-100 shadow-lg hairline backdrop-blur hover:bg-ink-700 ${
          rightOpen ? 'max-md:hidden' : ''
        }`}
      >
        <PanelLeftOpen size={20} />
      </button>
    );
  }

  return (
    <aside
      aria-label={`${SECTION_LABEL[active]} panel`}
      className={`sheet-surface theme-cream hairline animate-slide-in absolute left-3 top-3 bottom-24 z-20 flex w-[332px] flex-col xl:w-[380px] max-md:animate-sheet-up max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-auto max-md:h-[46dvh] max-md:w-auto max-md:rounded-b-none ${
        rightOpen ? 'max-md:hidden' : ''
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sand-400/15 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold text-sand-50">{SECTION_LABEL[active]}</h2>
          <StatusBadge status={base?.status ?? 'DEMO'} />
        </div>
        <button
          type="button"
          onClick={() => setLeftOpen(false)}
          aria-label="Hide panel"
          title="Hide panel"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800 md:h-9 md:w-9"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div className="panel-scroll min-h-0 flex-1 px-4">
        {active === 'overview' && <Overview />}
        {active === 'air' && <AirQuality />}
        {active === 'zones' && <Zones />}
        {active === 'simulator' && <WhatIfPanel />}
        {active === 'actions' && <ActionsPanel />}
        {active === 'locations' && <LocationsPanel />}
        {active === 'scenarios' && <ScenariosPanel />}
        {active === 'data' && <DataPanel />}
        {active === 'industries' && <IndustryPanel />}
        {active === 'analytics' && <AnalyticsPanel />}
        {active === 'sensors' && <SensorsPanel />}
      </div>
    </aside>
  );
}
