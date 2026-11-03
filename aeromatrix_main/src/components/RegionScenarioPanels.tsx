import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { StatusBadge } from './ui';
import { CHART } from './chartTheme';
import { evaluateRegionScenario, type RegionScenario, type RegionScenarioRow } from '../scenarios/regionScenario';
import { API_POLLUTANT_LABEL, isMeasured, isForecast } from '../services/aeromatrixApi';
import { fmt } from '../utils/format';
import { fmtIst } from '../services/pollutantData';

/** One scenario evaluation for a monitoring region, shared by the What-If panel, the chart, the table and the drawer. */
export function useRegionScenario(stationId: string | null): { scenario: RegionScenario | null; stationName: string | null } {
  const base = useTwinStore((s) => s.base);
  const result = useTwinStore((s) => s.activeResult);
  const catalog = useTwinStore((s) => s.catalog);
  const measuredAll = useTwinStore((s) => s.modelService.measured);
  const forecastAll = useTwinStore((s) => s.modelService.forecasts);

  return useMemo(() => {
    const st = catalog.stations.find((x) => x.id === stationId);
    if (!base || !st) return { scenario: null, stationName: st?.name ?? null };
    const m = measuredAll[st.id];
    const f = forecastAll[st.id];
    return {
      stationName: st.name,
      scenario: evaluateRegionScenario(base, { lat: st.lat, lon: st.lon }, isMeasured(m) ? m : null, isForecast(f) ? f : null, result),
    };
  }, [base, result, catalog, measuredAll, forecastAll, stationId]);
}

const label = (r: RegionScenarioRow) => API_POLLUTANT_LABEL[r.pollutant] ?? r.pollutant;

export function RegionScenarioTable({ scenario }: { scenario: RegionScenario }) {
  return (
    <div className="overflow-x-auto rounded-xl hairline">
      <table className="w-full min-w-[420px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="bg-ink-850 text-sand-400">
            <th className="p-1.5 font-semibold">Pollutant</th>
            <th className="p-1.5 font-semibold">Measured (Outdated)</th>
            <th className="p-1.5 font-semibold">Model +24 h</th>
            <th className="p-1.5 font-semibold">Scenario +24 h (hypothetical)</th>
          </tr>
        </thead>
        <tbody>
          {scenario.rows.map((r) => (
            <tr key={r.pollutant} className="border-t border-sand-400/15 align-top">
              <td className="p-1.5 font-semibold text-sand-50">
                {label(r)} <span className="font-normal text-sand-500">{r.unit}</span>
              </td>
              <td className="p-1.5 font-mono">{r.reference ? fmt(r.reference.value, r.pollutant === 'co' ? 2 : 1) : '-'}</td>
              <td className="p-1.5 font-mono">
                {r.forecast ? (
                  <>
                    {fmt(r.forecast.value)}
                    <span className="block text-[10px] text-sand-500">
                      {fmt(r.forecast.lower)} to {fmt(r.forecast.upper)}
                    </span>
                  </>
                ) : (
                  '-'
                )}
              </td>
              <td className="p-1.5 font-mono">
                {r.scenarioForecast ? (
                  <>
                    {fmt(r.scenarioForecast.value)}
                    <span className="block text-[10px] text-sand-500">
                      x{fmt(r.ratio ?? 1, 3)} · {fmt(r.scenarioForecast.lower)} to {fmt(r.scenarioForecast.upper)}
                    </span>
                  </>
                ) : r.reason && r.forecast ? (
                  <span className="text-[10px] text-sand-500">{r.reason}</span>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RegionForecastChart({ scenario }: { scenario: RegionScenario }) {
  const data = scenario.rows
    .filter((r) => r.forecast || r.reference)
    .filter((r) => ['pm25', 'pm10', 'no2', 'so2', 'o3'].includes(r.pollutant))
    .map((r) => ({
      name: label(r),
      Measured: r.reference ? Number(r.reference.value.toFixed(1)) : null,
      'Model +24 h': r.forecast ? Number(r.forecast.value.toFixed(1)) : null,
      'Scenario +24 h': r.scenarioForecast ? Number(r.scenarioForecast.value.toFixed(1)) : null,
    }));
  if (data.length === 0) return null;
  return (
    <div className="h-[200px]" aria-label="Measured, modeled and hypothetical scenario values per pollutant">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -14, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.gridOnCream} vertical={false} />
          <XAxis dataKey="name" tick={CHART.tick} tickLine={false} />
          <YAxis tick={CHART.tick} tickLine={false} axisLine={false} />
          <Tooltip {...CHART.tooltip} cursor={CHART.cursor} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Measured" fill="#6d7aa8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Model +24 h" fill="#a3263f" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Scenario +24 h" fill="#2fae8b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Heading, caveat, table and chart for one region. */
export function RegionScenarioSection({ stationId }: { stationId: string | null }) {
  const { scenario, stationName } = useRegionScenario(stationId);
  const catalog = useTwinStore((s) => s.catalog);
  if (!stationId || !scenario) {
    return <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">Pick a monitoring station to compare the trained model with a hypothetical scenario.</p>;
  }
  const st = catalog.stations.find((s) => s.id === stationId);
  const firstRef = scenario.rows.find((r) => r.reference)?.reference;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-sand-50">{stationName}</span>
        <StatusBadge status="MODEL_PREDICTION" />
        <StatusBadge status="MODELED_SCENARIO" />
      </div>
      {scenario.status === 'UNAVAILABLE' ? (
        <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
          Unavailable: {scenario.reason}
        </p>
      ) : (
        <>
          <p className="text-[11px] leading-snug text-amber-800">{scenario.note}</p>
          <RegionScenarioTable scenario={scenario} />
          <RegionForecastChart scenario={scenario} />
          <p className="text-[10px] text-sand-500">
            Grid zone {scenario.cellId}
            {st?.lat != null ? ` containing ${st.lat.toFixed(4)}°N ${st.lon?.toFixed(4)}°E` : ''}. Measured values are historical
            {firstRef ? ` (${fmtIst(firstRef.time)})` : ''}.
          </p>
        </>
      )}
    </div>
  );
}
