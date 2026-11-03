import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge } from './ui';
import { RegionScenarioSection } from './RegionScenarioPanels';
import { getModelMetrics, isForecast, isPredicted } from '../services/aeromatrixApi';
import { meanContribution } from '../services/pollutionModel';
import { isLiveFresh } from '../services/liveData';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { fmt } from '../utils/format';
import type { SourceContribution } from '../types';

const SOURCES: Array<keyof SourceContribution> = ['traffic', 'industry', 'background', 'other'];

/** Service status, model count and versions. The app never trains models. */
export function ModelStatus() {
  const svc = useTwinStore((s) => s.modelService);
  const connect = useTwinStore((s) => s.connectModelService);

  const versions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of Object.values(svc.forecasts)) {
      if (!isForecast(f)) continue;
      for (const p of Object.values(f.pollutants)) if (isPredicted(p)) seen.set(p.model.version, `${p.model.algorithm} (${p.model.kind === 'statistical_baseline' ? 'baseline' : 'ML'})`);
    }
    return [...seen.entries()];
  }, [svc.forecasts]);

  const h = svc.health as Record<string, unknown> | null;
  const reported = h && (Array.isArray(h.models) ? h.models.length : h.models && typeof h.models === 'object' ? Object.keys(h.models as object).length : null);

  return (
    <div className="rounded-xl bg-ink-850 p-3 text-xs hairline" role="status">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sand-50">
          Trained model service:{' '}
          {svc.status === 'online' ? <span className="text-emerald-600">online</span> : svc.status === 'connecting' ? 'connecting…' : <span className="text-red-600">offline</span>}
        </span>
        <button type="button" onClick={() => void connect()} className="min-h-8 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700">
          {svc.status === 'online' ? 'Reconnect' : 'Retry'}
        </button>
      </div>
      {svc.status === 'offline' ? (
        <p className="mt-1 text-sand-300">{svc.reason}. The app works without it: station panels say "No data feed".</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sand-300">
          <li>Models reported by /health: {reported === null || reported === undefined ? 'not stated' : reported}</li>
          <li>Model versions in the forecasts: {versions.length === 0 ? 'none yet' : versions.map(([v, a]) => `${a} ${v.slice(0, 8)}…`).join(', ')}</li>
          <li>Stations with a feed: {svc.stations.length}</li>
        </ul>
      )}
      <p className="mt-1 text-[11px] text-sand-500">No training happens in the app: it only reads forecasts from the service. SO2 uses a statistical baseline, not an ML model.</p>
    </div>
  );
}

function flattenMetrics(raw: Record<string, unknown>): Array<{ name: string; mae?: number; rmse?: number; r2?: number; n?: number }> {
  const rows: Array<{ name: string; mae?: number; rmse?: number; r2?: number; n?: number }> = [];
  const visit = (name: string, v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 3) return;
    const o = v as Record<string, unknown>;
    const pick = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : undefined);
    if (pick('mae') !== undefined || pick('rmse') !== undefined || pick('r2') !== undefined) {
      rows.push({ name, mae: pick('mae'), rmse: pick('rmse'), r2: pick('r2'), n: pick('n') });
      return;
    }
    for (const [k, x] of Object.entries(o)) visit(name ? `${name} / ${k}` : k, x, depth + 1);
  };
  visit('', raw, 0);
  return rows;
}

function ValidationTable() {
  const svc = useTwinStore((s) => s.modelService);
  const [rows, setRows] = useState<ReturnType<typeof flattenMetrics> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (svc.status !== 'online') {
      setRows(null);
      return;
    }
    let stale = false;
    getModelMetrics()
      .then((m) => !stale && (setRows(flattenMetrics(m)), setErr(null)))
      .catch((e: unknown) => !stale && setErr(e instanceof Error ? e.message : 'Could not read /model/metrics'));
    return () => {
      stale = true;
    };
  }, [svc.status]);

  if (svc.status !== 'online') {
    return <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">Model service offline: held-out validation metrics are unavailable.</p>;
  }
  if (err) return <p className="text-xs text-red-600" role="alert">{err}</p>;
  if (!rows) return <p className="text-xs text-sand-400">Loading metrics…</p>;
  if (rows.length === 0) return <p className="text-xs text-sand-400">The service returned no per-model metrics in a format this table can read.</p>;
  return (
    <div className="overflow-x-auto rounded-xl hairline">
      <table className="w-full min-w-[320px] text-left text-[11px]">
        <thead>
          <tr className="bg-ink-850 text-sand-400">
            <th className="p-1.5 font-semibold">Model</th>
            <th className="p-1.5 font-semibold">MAE</th>
            <th className="p-1.5 font-semibold">RMSE</th>
            <th className="p-1.5 font-semibold">R2</th>
            <th className="p-1.5 font-semibold">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-sand-400/15">
              <td className="p-1.5 font-semibold text-sand-50">{r.name || 'all'}</td>
              <td className="p-1.5 font-mono">{r.mae === undefined ? '-' : fmt(r.mae, 2)}</td>
              <td className="p-1.5 font-mono">{r.rmse === undefined ? '-' : fmt(r.rmse, 2)}</td>
              <td className="p-1.5 font-mono">{r.r2 === undefined ? '-' : fmt(r.r2, 2)}</td>
              <td className="p-1.5 font-mono">{r.n ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Data-source status list: every source with its true state. */
function SourceStatus() {
  const s = useTwinStore();
  const items: Array<{ name: string; ok: boolean | null; text: string }> = [
    { name: 'Trained model service', ok: s.modelService.status === 'online', text: s.modelService.status === 'online' ? `online, ${s.modelService.stations.length} stations` : (s.modelService.reason ?? s.modelService.status) },
    { name: 'Verified station coordinates', ok: s.verified?.status === 'loaded', text: s.verified?.status === 'loaded' ? `${s.verified.file.stations.length} stations, ${s.verified.file.unlocated.length} not placed` : (s.verified?.reason ?? 'not checked yet') },
    { name: 'Open-Meteo live model data', ok: isLiveFresh(s.live), text: isLiveFresh(s.live) ? `${Object.keys(s.live.points).length} points` : (s.live.reason ?? s.live.status) },
    { name: 'Imported observations', ok: !!s.observations, text: s.observations ? `${s.observations.stations.length} stations, ${s.observations.readings.length} hourly rows` : 'none imported' },
    { name: 'Industry dataset', ok: s.industry?.status === 'loaded', text: s.industry?.status === 'loaded' ? `${s.industry.data.areas.length} estates, ${s.industry.data.sites.length} sites` : (s.industry?.reason ?? 'not checked yet') },
    { name: 'City geometry', ok: s.geometryInfo.source === 'osm', text: s.geometryInfo.source === 'osm' ? `OpenStreetMap (${s.geometryInfo.origin})` : 'demo geometry' },
    { name: 'Model calibration', ok: s.calibration ? true : null, text: s.calibration ? `fitted to ${s.calibration.stations} stations` : 'uncalibrated prototype model' },
  ];
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.name} className="flex items-start gap-2 rounded-lg bg-ink-850 p-2 text-[11px] hairline">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i.ok === true ? 'bg-emerald-500' : i.ok === false ? 'bg-red-500' : 'bg-sand-500'}`} aria-hidden />
          <span className="min-w-0">
            <span className="font-semibold text-sand-50">{i.name}</span>
            <span className="block text-sand-400">{i.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsPanel() {
  const baseline = useTwinStore((s) => s.baseline);
  const catalog = useTwinStore((s) => s.catalog);
  const selected = useTwinStore((s) => s.selectedStationId);
  const selectStation = useTwinStore((s) => s.selectStation);
  const [stationId, setStationId] = useState<string | null>(selected);
  const mean = useMemo(() => meanContribution(baseline), [baseline]);
  const donut = SOURCES.map((k) => ({ key: k, name: SOURCE_LABELS[k], value: mean[k] }));
  const feeds = catalog.stations.filter((s) => s.api);

  return (
    <div className="space-y-1 py-2">
      <ModelStatus />

      <Section title="Source contribution (prototype model)" action={<StatusBadge status="DEMO" />}>
        <div className="flex items-center gap-3">
          <div className="h-[120px] w-[120px] shrink-0" aria-label="Mean source contribution donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={34} outerRadius={55} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {donut.map((d) => (
                    <Cell key={d.key} fill={SOURCE_COLORS[d.key]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-1 text-xs">
            {SOURCES.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[k] }} />
                <span className="min-w-0 flex-1 truncate text-sand-200">{SOURCE_LABELS[k]}</span>
                <span className="font-mono text-sand-50">{fmt(mean[k])}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-snug text-amber-800">
          No validated source-apportionment study exists for Pune, so these shares are model estimates, not measurements.
        </p>
      </Section>

      <Section title="Held-out validation (/model/metrics)" action={<StatusBadge status="MODEL_PREDICTION" />}>
        <ValidationTable />
      </Section>

      <Section title="Station forecast and hypothetical scenario">
        {feeds.length === 0 ? (
          <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">No station has a data feed, so there is no forecast chart.</p>
        ) : (
          <>
            <select
              value={stationId ?? ''}
              onChange={(e) => {
                setStationId(e.target.value || null);
                if (e.target.value) selectStation(e.target.value);
              }}
              aria-label="Station"
              className="mb-2 h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline"
            >
              <option value="">Choose a station…</option>
              {feeds.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <RegionScenarioSection stationId={stationId} />
          </>
        )}
      </Section>

      <Section title="How the forecasts are made">
        <div className="space-y-1.5 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
          <p>Station models were trained offline on CPCB / IITM monitoring data: one model per pollutant per station group, predicting the hourly mean 24 hours ahead from the latest hours.</p>
          <p>Each forecast carries an empirical interval and the model's held-out test metrics. SO2 uses a statistical baseline (persistence), not an ML model.</p>
          <p>The bundled readings are historical, so forecasts are UNAVAILABLE unless "Include historical forecast" is on. The app never trains or retrains models.</p>
          <p>The trained models forecast pollution; they do not model interventions. Scenarios scale the model by the prototype engine's relative change and are hypothetical.</p>
        </div>
      </Section>

      <Section title="Data-source status">
        <SourceStatus />
      </Section>
    </div>
  );
}
