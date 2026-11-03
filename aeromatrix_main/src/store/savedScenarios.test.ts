import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { defaultParams, scenarioService } from '../services/scenarioService';

/** In-memory localStorage shim (the tests run in a Node environment). */
function makeShim(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
    _data: data,
  };
}

async function freshStore(shim: ReturnType<typeof makeShim>) {
  vi.resetModules();
  vi.stubGlobal('localStorage', shim);
  const mod = await import('./useTwinStore');
  const base = await demoDataProvider.getBaseState(10);
  mod.useTwinStore.setState({ base, baseline: scenarioService.baseline(base), params: defaultParams(base), loading: false });
  return { ...mod, base };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('saved scenarios', () => {
  it('saves to localStorage and survives a reload', async () => {
    const shim = makeShim();
    const { useTwinStore, SAVED_KEY } = await freshStore(shim);
    useTwinStore.getState().patchParams({ trafficMultiplier: 1.25, name: 'Busy' });
    const saved = useTwinStore.getState().saveScenario('  My busy day ')!;
    expect(saved.name).toBe('My busy day');
    expect(saved.params.trafficMultiplier).toBe(1.25);
    expect(JSON.parse(shim.getItem(SAVED_KEY)!)).toHaveLength(1);

    // "Reload": a brand-new module instance reading the same storage.
    const again = await freshStore(shim);
    const list = again.useTwinStore.getState().savedScenarios;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
    expect(list[0].params.trafficMultiplier).toBe(1.25);
  });

  it('loads a saved scenario back into the parameters and switches to the scenario view', async () => {
    const { useTwinStore, base } = await freshStore(makeShim());
    useTwinStore.getState().patchParams({ publicTransportShift: 0.3 });
    const saved = useTwinStore.getState().saveScenario('Transit')!;
    useTwinStore.getState().resetParams();
    useTwinStore.getState().setDisplayMode('baseline');
    expect(useTwinStore.getState().params.publicTransportShift).toBe(0);
    expect(useTwinStore.getState().loadScenario(saved.id)).toBe(true);
    expect(useTwinStore.getState().params.publicTransportShift).toBe(0.3);
    expect(useTwinStore.getState().displayMode).toBe('scenario');
    expect(useTwinStore.getState().params.weather).toEqual(base.weather);
    expect(useTwinStore.getState().loadScenario('missing')).toBe(false);
  });

  it('renames and deletes, persisting each change', async () => {
    const shim = makeShim();
    const { useTwinStore, SAVED_KEY } = await freshStore(shim);
    const a = useTwinStore.getState().saveScenario('A')!;
    const b = useTwinStore.getState().saveScenario('B')!;
    useTwinStore.getState().renameScenario(a.id, 'Renamed');
    useTwinStore.getState().renameScenario(b.id, '   '); // ignored
    expect(JSON.parse(shim.getItem(SAVED_KEY)!).map((s: { name: string }) => s.name).sort()).toEqual(['B', 'Renamed']);
    useTwinStore.getState().deleteScenario(a.id);
    expect(JSON.parse(shim.getItem(SAVED_KEY)!)).toHaveLength(1);
    expect(useTwinStore.getState().savedScenarios.map((s) => s.id)).toEqual([b.id]);
  });

  it('loads the documented example scenarios A-E', async () => {
    const { useTwinStore } = await freshStore(makeShim());
    expect(useTwinStore.getState().loadScenario('example-A')).toBe(true);
    expect(useTwinStore.getState().params.name).toBe('A - Rush hour');
    expect(useTwinStore.getState().params.trafficMultiplier).toBe(1.35);
    expect(useTwinStore.getState().loadScenario('example-E')).toBe(true);
    expect(useTwinStore.getState().params.vehicleEmissionControl).toBe(0.5);
  });

  it('ignores corrupt storage and keeps working when storage throws', async () => {
    const bad = makeShim({ 'enr01.savedScenarios.v1': '{not json' });
    const { useTwinStore } = await freshStore(bad);
    expect(useTwinStore.getState().savedScenarios).toEqual([]);

    const broken = { ...makeShim(), setItem: () => { throw new Error('quota'); }, getItem: () => { throw new Error('blocked'); } };
    const { useTwinStore: s2 } = await freshStore(broken as unknown as ReturnType<typeof makeShim>);
    const saved = s2.getState().saveScenario('In memory');
    expect(saved).not.toBeNull();
    expect(s2.getState().savedScenarios).toHaveLength(1);
  });

  it('editing a parameter switches the baseline view to the scenario view', async () => {
    const { useTwinStore } = await freshStore(makeShim());
    expect(useTwinStore.getState().displayMode).toBe('baseline');
    useTwinStore.getState().setParam('trafficMultiplier', 1.1);
    expect(useTwinStore.getState().displayMode).toBe('scenario');
  });

  it('adds, re-rates and removes an industry; adds and removes closures and candidates', async () => {
    const { useTwinStore } = await freshStore(makeShim());
    const s = () => useTwinStore.getState();
    const ind = s().addIndustryAt(73.9, 18.55)!;
    expect(s().params.addedIndustries).toHaveLength(1);
    expect(s().selectedIndustryId).toBe(ind.id);
    s().rerateIndustry(ind.id, 33);
    expect(s().params.addedIndustries[0].emissionIntensity).toBe(33);
    s().removeIndustry(ind.id);
    expect(s().params.addedIndustries).toHaveLength(0);
    expect(s().addIndustryAt(0, 0)).toBeNull(); // outside the analysis area

    const existing = s().base!.industries[0].id;
    s().rerateIndustry(existing, 10);
    expect(s().params.industryIntensityOverrides[existing]).toBe(10);
    s().removeIndustry(existing);
    expect(s().params.removedIndustryIds).toContain(existing);
    s().restoreIndustry(existing);
    expect(s().params.removedIndustryIds).not.toContain(existing);

    s().addClosure({ roadId: 'road-karve', divertToRoadId: null, diversionShare: 0 });
    s().addClosure({ roadId: 'road-karve', divertToRoadId: 'road-sinhagad', diversionShare: 0.6 });
    expect(s().params.roadClosures).toHaveLength(1);
    s().removeClosure('road-karve');
    expect(s().params.roadClosures).toHaveLength(0);

    for (let i = 0; i < 5; i++) expect(s().addCandidate([73.8 + i * 0.01, 18.5])).not.toBeNull();
    expect(s().addCandidate([73.9, 18.5])).toBeNull();
    expect(s().candidates.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    s().removeCandidate('B');
    expect(s().addCandidate([73.9, 18.5])!.id).toBe('B');
  });
});
