import { Loader2, MapPin, Trash2 } from 'lucide-react';
import { MAX_CANDIDATES, useTwinStore } from '../store/useTwinStore';
import { useSiteAssessment } from './useSiteAssessment';
import { Section, StatusBadge, Toggle } from '../components/ui';
import { fmt, fmtInt } from '../utils/format';
import type { IndustryCategory } from '../types';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];

export function LocationsPanel() {
  const candidates = useTwinStore((s) => s.candidates);
  const project = useTwinStore((s) => s.siteProject);
  const mode = useTwinStore((s) => s.interactionMode);
  const setMode = useTwinStore((s) => s.setInteractionMode);
  const setProject = useTwinStore((s) => s.setSiteProject);
  const removeCandidate = useTwinStore((s) => s.removeCandidate);
  const clearCandidates = useTwinStore((s) => s.clearCandidates);
  const selectCandidate = useTwinStore((s) => s.selectCandidate);
  const { assessment, recommendations, running, error } = useSiteAssessment();

  return (
    <div className="space-y-1 py-2">
      <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        Compare up to {MAX_CANDIDATES} candidate points for a <strong>new</strong> industrial unit. Each site is run as its own scenario and ranked on
        city PM2.5 impact, people exposed, the worst-hit zone and the downwind residential penalty.{' '}
        <StatusBadge status="MODELED_SCENARIO" className="align-middle" />
      </p>

      <Section title="The project">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-sand-400">
            Unit type
            <select
              value={project.category}
              onChange={(e) => setProject({ category: e.target.value as IndustryCategory })}
              className="h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-sand-400">
            Intensity (0-100)
            <input
              type="number"
              min={0}
              max={100}
              value={project.intensity}
              onChange={(e) => setProject({ intensity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className="h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline"
            />
          </label>
        </div>
        <Toggle label="Green buffer around the unit" checked={project.greenBuffer} onChange={(v) => setProject({ greenBuffer: v })} />
      </Section>

      <Section title={`Candidate sites (${candidates.length}/${MAX_CANDIDATES})`}>
        <button
          type="button"
          aria-pressed={mode === 'pick-candidate'}
          disabled={candidates.length >= MAX_CANDIDATES && mode !== 'pick-candidate'}
          onClick={() => setMode(mode === 'pick-candidate' ? 'select' : 'pick-candidate')}
          className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold disabled:opacity-40 md:h-9 ${
            mode === 'pick-candidate' ? 'bg-accent-500 text-sand-50' : 'bg-ink-700 text-sand-50 hover:bg-ink-600'
          }`}
        >
          <MapPin size={15} />
          {mode === 'pick-candidate' ? 'Click the map to add sites (tap when done)' : 'Pick sites on the map'}
        </button>
        {candidates.length > 0 && (
          <ul className="mt-2 space-y-1">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg bg-ink-850 p-2 text-xs hairline">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{c.id}</span>
                <button type="button" onClick={() => selectCandidate(c.id)} className="min-w-0 flex-1 truncate text-left font-mono text-sand-200">
                  {c.location[1].toFixed(4)}°N {c.location[0].toFixed(4)}°E
                </button>
                <button
                  type="button"
                  onClick={() => removeCandidate(c.id)}
                  aria-label={`Remove site ${c.id}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700 md:h-8 md:w-8"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 1 && (
          <button type="button" onClick={clearCandidates} className="mt-1 min-h-8 text-[11px] font-semibold text-sand-300 hover:underline">
            Remove all sites
          </button>
        )}
      </Section>

      {candidates.length === 0 && (
        <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">Pick at least two points on the map to compare sites.</p>
      )}
      {running && (
        <div role="status" className="flex items-center gap-2 text-xs text-sand-300">
          <Loader2 size={14} className="animate-spin" /> Running one scenario per site…
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      {assessment && (
        <>
          <Section title="Ranking">
            <div className="overflow-x-auto rounded-xl hairline">
              <table className="w-full min-w-[430px] border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-ink-850 text-sand-400">
                    <th className="p-2 font-semibold">#</th>
                    <th className="p-2 font-semibold">Site</th>
                    <th className="p-2 font-semibold">City PM2.5</th>
                    <th className="p-2 font-semibold">Exposed</th>
                    <th className="p-2 font-semibold">Worst zone</th>
                    <th className="p-2 font-semibold">Downwind</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.sites.map((s) => (
                    <tr key={s.candidate.id} className="border-t border-sand-400/15">
                      <td className="p-2 font-bold text-sand-50">{s.rank}</td>
                      <td className="p-2">
                        <button type="button" onClick={() => selectCandidate(s.candidate.id)} className="font-bold text-accent-500 hover:underline">
                          {s.candidate.id}
                        </button>
                      </td>
                      <td className="p-2 font-mono">+{fmt(s.meanIncrease, 2)}</td>
                      <td className="p-2 font-mono">{fmtInt(s.exposedPopulation)}</td>
                      <td className="p-2">
                        <span className="block truncate font-semibold text-sand-50">{s.worstZoneName ?? '-'}</span>
                        <span className="font-mono text-[11px] text-sand-400">+{fmt(s.worstZoneIncrease)}</span>
                      </td>
                      <td className="p-2 font-mono">{fmt(s.downwindPenalty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-sand-500">
              City PM2.5 in ug/m3 (mean change). Exposed = people in zones with a PM2.5 rise. Downwind = rise x population (thousands) in downwind
              residential zones. Lower is better.
            </p>
          </Section>

          <Section title="Recommendations">
            <ol className="space-y-2">
              {recommendations.map((r) => (
                <li key={r.candidateId} className="rounded-xl bg-ink-850 p-3 hairline">
                  <p className="text-sm font-bold text-sand-50">{r.headline}</p>
                  <p className="mt-0.5 text-xs text-sand-300">{r.detail}</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-sand-400">
                    {r.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </div>
  );
}
