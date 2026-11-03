import { useEffect, useMemo, useState } from 'react';
import { useTwinStore } from '../store/useTwinStore';
import { compareSites, type SiteAssessment } from './locationComparison';
import { buildRecommendations, type Recommendation } from './recommendations';

export interface SiteAssessmentState {
  assessment: SiteAssessment | null;
  recommendations: Recommendation[];
  running: boolean;
  error: string | null;
}

/** Runs one scenario per candidate (debounced) whenever the base, candidates or project change. */
export function useSiteAssessment(): SiteAssessmentState {
  const base = useTwinStore((s) => s.base);
  const candidates = useTwinStore((s) => s.candidates);
  const project = useTwinStore((s) => s.siteProject);
  const names = useTwinStore((s) => s.placeNames);
  const [assessment, setAssessment] = useState<SiteAssessment | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!base || candidates.length === 0) {
      setAssessment(null);
      setRunning(false);
      setError(null);
      return;
    }
    let stale = false;
    setRunning(true);
    const t = window.setTimeout(() => {
      compareSites(base, candidates, project, names)
        .then((a) => {
          if (stale) return;
          setAssessment(a);
          setError(null);
          setRunning(false);
        })
        .catch((e: unknown) => {
          if (stale) return;
          setError(e instanceof Error ? e.message : 'Site comparison failed.');
          setRunning(false);
        });
    }, 150);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [base, candidates, project, names]);

  const recommendations = useMemo(() => (assessment ? buildRecommendations(assessment) : []), [assessment]);
  return { assessment, recommendations, running, error };
}
