import { useMemo, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge } from './ui';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { fmt, fmtInt, fmtSigned } from '../utils/format';
import { pathLengthKm } from '../utils/geo';
import { zoneLabel } from '../utils/zones';
import { useSiteAssessment } from '../locations/useSiteAssessment';
import type { SourceContribution } from '../types';

const SOURCES: Array<keyof SourceContribution> = ['traffic', 'industry', 'background', 'other'];

function Facts({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-xs">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
          <dt className="text-sand-400">{k}</dt>
          <dd className="font-semibold text-sand-50">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface DrawerContent {
  title: string;
  subtitle: string;
  body: React.ReactNode;
}

export function useIndustryDrawer(): DrawerContent | null {
  const id = useTwinStore((s) => s.selectedIndustryId);
  const base = useTwinStore((s) => s.base);
  const params = useTwinStore((s) => s.params);
  const removeIndustry = useTwinStore((s) => s.removeIndustry);
  const restoreIndustry = useTwinStore((s) => s.restoreIndustry);
  const rerate = useTwinStore((s) => s.rerateIndustry);
  if (!id || !base) return null;
  const ind = [...base.industries, ...params.addedIndustries].find((i) => i.id === id);
  if (!ind) return null;
  const isRemoved = params.removedIndustryIds.includes(id);
  const intensity = params.industryIntensityOverrides[id] ?? ind.emissionIntensity;
  return {
    title: ind.name,
    subtitle: `${ind.category} · ${ind.scenarioAdded ? 'added in this scenario' : 'existing unit'}`,
    body: (
      <div className="space-y-3 pt-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={ind.scenarioAdded ? 'MODELED_SCENARIO' : 'DEMO'} />
          {isRemoved && <span className="text-xs font-bold text-red-600">Removed in this scenario</span>}
        </div>
        <Facts
          items={[
            ['Category', ind.category],
            ['Intensity (0-100)', fmt(intensity, 0)],
            ['Control efficiency', `${Math.round(ind.controlEfficiency * 100)}%`],
            ['Main pollutants', ind.mainPollutants.map((p) => p.toUpperCase()).join(', ')],
            ['Status', ind.status],
            ['Location', `${ind.location[1].toFixed(4)}°N ${ind.location[0].toFixed(4)}°E`],
          ]}
        />
        <p className="text-[11px] text-sand-400">{ind.emissionProfile}. Intensities are assumptions, not reported emissions.</p>
        {!isRemoved && (
          <label className="block text-xs font-semibold text-sand-100">
            Re-rate intensity: {fmt(intensity, 0)}
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => rerate(id, Number(e.target.value))}
              className="mt-1 h-6 w-full cursor-pointer accent-accent-500"
            />
          </label>
        )}
        {isRemoved ? (
          <button
            type="button"
            onClick={() => restoreIndustry(id)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600"
          >
            <Undo2 size={14} /> Restore this unit
          </button>
        ) : (
          <button
            type="button"
            onClick={() => removeIndustry(id)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400"
          >
            <Trash2 size={14} /> Remove from the city
          </button>
        )}
      </div>
    ),
  };
}

export function useRoadDrawer(): DrawerContent | null {
  const id = useTwinStore((s) => s.selectedRoadId);
  const base = useTwinStore((s) => s.base);
  const params = useTwinStore((s) => s.params);
  const addClosure = useTwinStore((s) => s.addClosure);
  const removeClosure = useTwinStore((s) => s.removeClosure);
  const [divert, setDivert] = useState('');
  const [share, setShare] = useState(0.7);
  const road = base?.roads.find((r) => r.id === id);
  const targets = useMemo(
    () => (base && road ? base.roads.filter((r) => r.id !== road.id && r.volume >= 50).slice(0, 200) : []),
    [base, road],
  );
  if (!id || !base || !road) return null;
  const closure = params.roadClosures.find((c) => c.roadId === id);
  const length = road.lengthKm ?? road.paths.reduce((a, p) => a + pathLengthKm(p), 0);
  const traffic = base.cells.reduce((a, c) => a + (c.trafficByRoad[id] ?? 0), 0);
  return {
    title: road.name,
    subtitle: `${road.roadClass ?? 'Road'} · ${closure ? 'closed in this scenario' : 'open'}`,
    body: (
      <div className="space-y-3 pt-3">
        <StatusBadge status="DEMO" />
        <Facts
          items={[
            ['Class', road.roadClass ?? 'n/a'],
            ['Length', `${fmt(length, 1)} km`],
            ['Volume proxy (0-100)', `${road.volume} (assumed from class)`],
            ['Summed zone traffic', fmt(traffic, 0)],
          ]}
        />
        <p className="text-[11px] text-sand-400">
          Volume is estimated from the road class, not a traffic count. Closing a road moves its traffic in the model only.
        </p>
        {closure ? (
          <>
            <p className="text-xs text-sand-200">
              {closure.divertToRoadId
                ? `${Math.round(closure.diversionShare * 100)}% diverted to ${base.roads.find((r) => r.id === closure.divertToRoadId)?.name ?? 'another road'}.`
                : 'No diversion: traffic spills onto local streets.'}
            </p>
            <button
              type="button"
              onClick={() => removeClosure(id)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600"
            >
              <Undo2 size={14} /> Reopen this road
            </button>
          </>
        ) : (
          <>
            <label className="block text-[11px] text-sand-400">
              Divert to (optional)
              <select
                value={divert}
                onChange={(e) => setDivert(e.target.value)}
                className="h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline"
              >
                <option value="">No diversion</option>
                {targets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {divert && (
              <label className="block text-xs font-semibold text-sand-100">
                Diversion share: {Math.round(share * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={share}
                  onChange={(e) => setShare(Number(e.target.value))}
                  className="mt-1 h-6 w-full cursor-pointer accent-accent-500"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => addClosure({ roadId: id, divertToRoadId: divert || null, diversionShare: divert ? share : 0 })}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400"
            >
              {divert ? 'Close and divert' : 'Close this road'}
            </button>
          </>
        )}
      </div>
    ),
  };
}

function CandidateBody({ id }: { id: string }) {
  const candidates = useTwinStore((s) => s.candidates);
  const removeCandidate = useTwinStore((s) => s.removeCandidate);
  const { assessment } = useSiteAssessment();
  const cand = candidates.find((c) => c.id === id);
  const m = assessment?.sites.find((s) => s.candidate.id === id);
  if (!cand) return null;
  return (
    <div className="space-y-3 pt-3">
      <StatusBadge status="MODELED_SCENARIO" />
      <Facts
        items={[
          ['Location', `${cand.location[1].toFixed(4)}°N ${cand.location[0].toFixed(4)}°E`],
          ['Rank', m ? `${m.rank} of ${assessment?.sites.length}` : '...'],
          ['City PM2.5 change', m ? `+${fmt(m.meanIncrease, 2)} ug/m3` : '...'],
          ['People exposed', m ? fmtInt(m.exposedPopulation) : '...'],
          ['Worst zone', m?.worstZoneName ? `${m.worstZoneName} (+${fmt(m.worstZoneIncrease)})` : '...'],
          ['Downwind penalty', m ? fmt(m.downwindPenalty) : '...'],
        ]}
      />
      <button
        type="button"
        onClick={() => removeCandidate(id)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400"
      >
        <Trash2 size={14} /> Remove site {id}
      </button>
    </div>
  );
}

export function useCandidateDrawer(): DrawerContent | null {
  const id = useTwinStore((s) => s.selectedCandidateId);
  const exists = useTwinStore((s) => s.candidates.some((c) => c.id === id));
  if (!id || !exists) return null;
  return { title: `Candidate site ${id}`, subtitle: 'New industry candidate', body: <CandidateBody id={id} /> };
}

export function useResultDrawer(): DrawerContent | null {
  const open = useTwinStore((s) => s.resultOpen);
  const result = useTwinStore((s) => s.activeResult);
  const base = useTwinStore((s) => s.base);
  const names = useTwinStore((s) => s.placeNames);
  if (!open || !result || !base) return null;
  const cells = new Map(base.cells.map((c) => [c.id, c]));
  const entries = Object.entries(result.delta).map(([id, d]) => ({ id, d: d.pm25 }));
  const up = [...entries].sort((a, b) => b.d - a.d).filter((e) => e.d > 0.05).slice(0, 5);
  const down = [...entries].sort((a, b) => a.d - b.d).filter((e) => e.d < -0.05).slice(0, 5);
  const label = (id: string) => {
    const c = cells.get(id);
    return c ? zoneLabel(c, names) : id;
  };
  const s = result.summary;
  const b = result.sourceContribution.baseline;
  const sc = result.sourceContribution.scenario;
  return {
    title: result.params.name || 'Scenario result',
    subtitle: `Engine ${result.metadata.engine} ${result.metadata.engineVersion}`,
    body: (
      <div className="space-y-1 pt-3">
        <StatusBadge status="MODELED_SCENARIO" />
        <Facts
          items={[
            ['Mean PM2.5', `${fmt(s.meanBaseline)} → ${fmt(s.meanScenario)}`],
            ['Change', `${fmtSigned(s.meanDelta, 2)} (${fmtSigned(s.meanDeltaPct, 1)}%)`],
            ['Largest rise', `${fmtSigned(s.maxIncrease, 2)} ug/m3`],
            ['Largest fall', `${fmtSigned(s.maxDecrease, 2)} ug/m3`],
            ['Zones affected', String(s.affectedCount)],
            ['Exposed to rises', fmtInt(s.exposedPopulation)],
          ]}
        />
        <Section title="Mean PM2.5 by source (ug/m3)">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-sand-400">
                <th className="py-1 font-semibold">Source</th>
                <th className="py-1 font-semibold">Baseline</th>
                <th className="py-1 font-semibold">Scenario</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((k) => (
                <tr key={k} className="border-t border-sand-400/15">
                  <td className="py-1">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_COLORS[k] }} />
                    {SOURCE_LABELS[k]}
                  </td>
                  <td className="py-1 font-mono">{fmt(b[k])}</td>
                  <td className="py-1 font-mono">{fmt(sc[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        {[
          ['Biggest improvements', down],
          ['Biggest increases', up],
        ].map(([title, list]) => (
          <Section key={title as string} title={title as string}>
            {(list as typeof up).length === 0 ? (
              <p className="text-xs text-sand-400">None above 0.05 ug/m3.</p>
            ) : (
              <ul className="space-y-1">
                {(list as typeof up).map((e) => (
                  <li key={e.id} className="flex justify-between text-xs">
                    <span className="text-sand-100">{label(e.id)}</span>
                    <span className="font-mono text-sand-200">{fmtSigned(e.d, 2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ))}
        <p className="text-[11px] leading-snug text-sand-500">{result.metadata.disclaimer}</p>
      </div>
    ),
  };
}
