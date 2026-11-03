import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge } from './ui';
import { useCandidateDrawer, useIndustryDrawer, useResultDrawer, useRoadDrawer, type DrawerContent } from './drawers';
import { useStationDrawer } from './StationPanels';
import { useAreaDrawer, useSiteDrawer } from './IndustryPanels';
import { isLiveFresh, liveValue, zonePointId } from '../services/liveData';
import {
  POLLUTANT_LABEL,
  POLLUTANT_UNIT,
  RISK_COLOR,
  RISK_LABEL,
  SOURCE_COLORS,
  SOURCE_LABELS,
} from '../utils/colors';
import { POLLUTANTS } from '../services/pollutionModel';
import { fmt, fmtInt, fmtSigned } from '../utils/format';
import { zoneLabel } from '../utils/zones';
import { displayedStates, modeStatus } from '../map/heatSource';
import type { SourceContribution } from '../types';

const SOURCES: Array<keyof SourceContribution> = ['traffic', 'industry', 'background', 'other'];

/** Observed vs modeled for the selected zone, when more than one source exists. Each value keeps its own status. */
function CompareSection({ cellId }: { cellId: string }) {
  const base = useTwinStore((s) => s.base);
  const baseline = useTwinStore((s) => s.baseline);
  const pollutant = useTwinStore((s) => s.pollutant);
  const observed = useTwinStore((s) => s.observedField);
  const forecast = useTwinStore((s) => s.forecastLayer);
  const live = useTwinStore((s) => s.live);
  const idx = base ? base.cells.findIndex((c) => c.id === cellId) : -1;
  if (!base || idx < 0) return null;
  const rule = baseline.find((s) => s.cellId === cellId)?.[pollutant];
  const liveV = isLiveFresh(live) ? liveValue(live.points[zonePointId(cellId)], pollutant) : null;
  const rows: Array<{ label: string; status: 'DEMO' | 'OBSERVED' | 'MODEL_DATA' | 'MODEL_PREDICTION'; value: number | null; note?: string }> = [
    { label: 'Rule model', status: 'DEMO', value: rule ?? null },
    ...(observed ? [{ label: 'Observed (interpolated)', status: 'OBSERVED' as const, value: observed.values[idx] ?? null, note: `nearest imported station ${fmt(observed.nearestKm[idx] ?? 0, 1)} km away` }] : []),
    ...(liveV !== null ? [{ label: 'Open-Meteo model', status: 'MODEL_DATA' as const, value: liveV, note: '~40 km resolution' }] : []),
    ...(forecast ? [{ label: 'Trained-model forecast (interpolated)', status: 'MODEL_PREDICTION' as const, value: forecast.field.values[idx] ?? null }] : []),
  ];
  if (rows.length < 2) return null;
  return (
    <Section title={`${POLLUTANT_LABEL[pollutant]} by source`}>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start justify-between gap-2 rounded-lg bg-ink-850 p-2 text-xs hairline">
            <span className="min-w-0">
              <span className="font-semibold text-sand-100">{r.label}</span>
              {r.note && <span className="block text-[10px] text-sand-500">{r.note}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="font-mono text-sand-50">{r.value === null ? 'n/a' : fmt(r.value, pollutant === 'co' ? 2 : 1)}</span>
              <StatusBadge status={r.status} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-sand-500">Values are shown side by side and never blended.</p>
    </Section>
  );
}

function useCellDrawer(): DrawerContent | null {
  const selectedCellId = useTwinStore((s) => s.selectedCellId);
  const base = useTwinStore((s) => s.base);
  const baseline = useTwinStore((s) => s.baseline);
  const mode = useTwinStore((s) => s.displayMode);
  const activeResult = useTwinStore((s) => s.activeResult);
  const names = useTwinStore((s) => s.placeNames);

  const cell = useMemo(() => base?.cells.find((c) => c.id === selectedCellId), [base, selectedCellId]);
  const states = useTwinStore((s) => displayedStates(s));
  const state = useMemo(() => states.find((s) => s.cellId === selectedCellId), [states, selectedCellId]);
  const baseState = useMemo(() => baseline.find((s) => s.cellId === selectedCellId), [baseline, selectedCellId]);
  if (!cell || !state || !base) return null;

  const showDelta = (mode === 'scenario' || mode === 'delta') && !!activeResult && !!baseState;
  const delta = showDelta ? state.pm25 - baseState!.pm25 : 0;
  const donut = SOURCES.map((k) => ({ key: k, name: SOURCE_LABELS[k], value: state.contributionAbs[k] }));

  return {
    title: zoneLabel(cell, names),
    subtitle: `${cell.id} · ${cell.landUse} · ${fmtInt(cell.population)} people`,
    body: (
      <>
        <div className="flex items-center justify-between pt-3">
          <div>
            <div className="text-[11px] font-medium text-sand-400">PM2.5{showDelta ? ' (scenario)' : ''}</div>
            <div className="font-display text-3xl font-bold leading-none text-sand-50">
              {fmt(state.pm25)} <span className="text-xs font-medium text-sand-400">ug/m3</span>
            </div>
            {showDelta && (
              <div className={`mt-1 text-xs font-bold ${delta < 0 ? 'text-emerald-600' : delta > 0 ? 'text-red-600' : 'text-sand-300'}`}>
                {fmtSigned(delta, 2)} vs baseline {fmt(baseState!.pm25)}
              </div>
            )}
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: RISK_COLOR[state.risk] }}>
            {RISK_LABEL[state.risk]} risk
          </span>
        </div>

        <Section title="All pollutants">
          <dl className="grid grid-cols-3 gap-2">
            {POLLUTANTS.map((p) => (
              <div key={p} className="rounded-lg bg-ink-850 p-2 hairline">
                <dt className="text-[11px] font-semibold text-sand-400">{POLLUTANT_LABEL[p]}</dt>
                <dd className="font-mono text-sm font-semibold text-sand-50">{fmt(state[p], p === 'co' ? 2 : 1)}</dd>
                <dd className="text-[10px] text-sand-500">{POLLUTANT_UNIT[p]}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="What drives PM2.5 here">
          <div className="flex items-center gap-3">
            <div className="h-[132px] w-[132px] shrink-0" aria-label="Source contribution donut chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {donut.map((d) => (
                      <Cell key={d.key} fill={SOURCE_COLORS[d.key as keyof typeof SOURCE_COLORS]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {SOURCES.map((k) => (
                <li key={k} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[k] }} />
                  <span className="min-w-0 flex-1 truncate text-sand-200">{SOURCE_LABELS[k]}</span>
                  <span className="font-mono text-sand-50">{fmt(state.contributionAbs[k])}</span>
                </li>
              ))}
              <li className="border-t border-sand-400/15 pt-1 text-[11px] text-sand-400">ug/m3, sums to PM2.5</li>
            </ul>
          </div>
        </Section>

        <Section title="Local conditions">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Traffic intensity', `${fmt(Math.min(100, state.trafficIntensity), 0)} / 100`],
              ['Industrial influence', `${fmt(state.industrialInfluence)} ug/m3 PM2.5`],
              ['Green cover', `${fmt(state.greenCover, 0)} %`],
              ['Building density', fmt(state.buildingDensity, 2)],
              ['Avg building height', `${fmt(cell.avgBuildingHeight, 0)} m`],
              ['Temperature', `${fmt(state.temperature)} °C`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
                <dt className="text-sand-400">{k}</dt>
                <dd className="font-semibold text-sand-50">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <CompareSection cellId={cell.id} />

        <p className="rounded-xl bg-ink-850 p-3 text-[11px] leading-relaxed text-sand-300 hairline">
          Modelled estimates, not direct observations.
        </p>
      </>
    ),
  };
}

/** The right drawer: its content switches by what is selected (zone, industry, road, site, scenario result). */
export function RightPanel() {
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const mode = useTwinStore((s) => s.displayMode);
  const baseStatus = useTwinStore((s) => s.base?.status ?? 'DEMO');
  const clear = useTwinStore((s) => s.selectCell);

  const cell = useCellDrawer();
  const industry = useIndustryDrawer();
  const road = useRoadDrawer();
  const candidate = useCandidateDrawer();
  const result = useResultDrawer();
  const station = useStationDrawer();
  const area = useAreaDrawer();
  const site = useSiteDrawer();
  const content = station ?? area ?? site ?? industry ?? road ?? candidate ?? result ?? cell;
  const other = station || area || site || industry || road || candidate || result;
  const badge = other ? null : modeStatus(mode, baseStatus);

  useEffect(() => {
    if (!rightOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rightOpen, clear]);

  if (!rightOpen || !content) return null;

  return (
    <aside
      aria-label="Details"
      className="sheet-surface theme-cream hairline animate-slide-in absolute right-3 top-3 bottom-3 z-20 flex w-[344px] flex-col xl:w-[392px] max-md:animate-sheet-up max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-auto max-md:h-[60dvh] max-md:w-auto max-md:rounded-b-none"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-sand-400/15 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold text-sand-50">{content.title}</h2>
          <p className="text-xs text-sand-400">{content.subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {badge && <StatusBadge status={badge} />}
          <button
            type="button"
            onClick={() => clear(null)}
            aria-label="Close details"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800 md:h-9 md:w-9"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="panel-scroll min-h-0 flex-1 px-4 pb-4">{content.body}</div>
    </aside>
  );
}
