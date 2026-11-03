import { useMemo, useState } from 'react';
import { BookmarkPlus, MousePointerClick, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Chip, Toggle } from '../components/ui';
import { Compass, FieldError, GroupCard, ParamSlider, errorFor } from './controls';
import { ResultsStrip } from './ResultsStrip';
import { PRESETS } from './presets';
import { builtUpCells } from '../scenarios/actions';
import { cellAreaKm2 } from '../utils/geo';
import { fmt } from '../utils/format';
import type { IndustryCategory } from '../types';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const selectCls = 'h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline';
/** Assumed mean crown cover of one mature tree (m2). A documented assumption for the trees helper. */
const CROWN_M2_PER_TREE = 25;

const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;

export function WhatIfPanel() {
  const base = useTwinStore((s) => s.base);
  const params = useTwinStore((s) => s.params);
  const errors = useTwinStore((s) => s.paramErrors);
  const mode = useTwinStore((s) => s.interactionMode);
  const pending = useTwinStore((s) => s.pendingIndustry);
  const setParam = useTwinStore((s) => s.setParam);
  const setWeather = useTwinStore((s) => s.setWeather);
  const applyParams = useTwinStore((s) => s.applyParams);
  const resetParams = useTwinStore((s) => s.resetParams);
  const runNow = useTwinStore((s) => s.runNow);
  const setDisplayMode = useTwinStore((s) => s.setDisplayMode);
  const saveScenario = useTwinStore((s) => s.saveScenario);
  const setSection = useTwinStore((s) => s.setSection);
  const setMode = useTwinStore((s) => s.setInteractionMode);
  const setPending = useTwinStore((s) => s.setPendingIndustry);
  const setTargetCells = useTwinStore((s) => s.setTargetCells);
  const addClosure = useTwinStore((s) => s.addClosure);
  const removeClosure = useTwinStore((s) => s.removeClosure);
  const removeIndustry = useTwinStore((s) => s.removeIndustry);
  const restoreIndustry = useTwinStore((s) => s.restoreIndustry);
  const rerateIndustry = useTwinStore((s) => s.rerateIndustry);
  const selectIndustry = useTwinStore((s) => s.selectIndustry);
  const setNotice = useTwinStore((s) => s.setNotice);

  const [roadFilter, setRoadFilter] = useState('');
  const [closeId, setCloseId] = useState('');
  const [divertId, setDivertId] = useState('');
  const [share, setShare] = useState(0.7);
  const [saveName, setSaveName] = useState('');
  const [trees, setTrees] = useState(0);

  const roads = useMemo(() => {
    if (!base) return [];
    const q = roadFilter.trim().toLowerCase();
    return base.roads.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 200);
  }, [base, roadFilter]);

  if (!base) return null;
  const def = {
    traffic: 1,
    area: 1,
    vec: 0,
    pt: 0,
    ic: 0,
    green: 0,
    dens: 0,
    height: 1,
    w: base.weather,
  };
  const closedIds = new Set(params.roadClosures.map((c) => c.roadId));
  const roadName = (id: string | null) => base.roads.find((r) => r.id === id)?.name ?? id ?? 'none';
  const removed = new Set(params.removedIndustryIds);
  const targetAreaKm2 =
    params.targetCells.length > 0
      ? base.cells.filter((c) => params.targetCells.includes(c.id)).reduce((a, c) => a + cellAreaKm2(c.bounds), 0)
      : base.cells.reduce((a, c) => a + cellAreaKm2(c.bounds), 0);
  const treePoints = targetAreaKm2 > 0 ? ((trees * CROWN_M2_PER_TREE) / (targetAreaKm2 * 1e6)) * 100 : 0;
  const err = (p: string) => errorFor(errors, p);

  const submitSave = () => {
    const saved = saveScenario(saveName);
    if (saved) {
      setSaveName('');
      setNotice(`Saved "${saved.name}". Find it under Scenarios.`);
    }
  };

  return (
    <div className="space-y-3 py-3">
      <ResultsStrip />

      <GroupCard title="Presets" hint="One click sets a typical situation; you can keep editing after.">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Chip key={p.id} onClick={() => applyParams(p.build(base))} className="min-h-11 md:min-h-8">
              <span title={p.description}>{p.label}</span>
            </Chip>
          ))}
        </div>
      </GroupCard>

      <GroupCard title="Traffic">
        <ParamSlider
          label="City-wide traffic"
          value={params.trafficMultiplier}
          min={0}
          max={3}
          step={0.05}
          baseline={def.traffic}
          unit="x"
          format={pct}
          hint="Multiplier on all vehicle flow (0-3)."
          error={err('Traffic multiplier')}
          onChange={(v) => setParam('trafficMultiplier', v)}
        />
        <ParamSlider
          label="Area traffic (selected zones)"
          value={params.areaTrafficMultiplier}
          min={0}
          max={3}
          step={0.05}
          baseline={def.area}
          unit="x"
          format={pct}
          hint={
            params.targetCells.length > 0
              ? `Applies to ${params.targetCells.length} selected zones.`
              : 'No zones selected: applies to the whole city.'
          }
          error={err('Area traffic multiplier')}
          onChange={(v) => setParam('areaTrafficMultiplier', v)}
        />
        <ParamSlider
          label="Vehicle emission control"
          value={params.vehicleEmissionControl}
          min={0}
          max={0.9}
          step={0.01}
          baseline={def.vec}
          format={(v) => `${Math.round(v * 100)}%`}
          hint="Cleaner vehicles: cuts tailpipe PM per vehicle (0-90%)."
          error={err('Vehicle emission control')}
          onChange={(v) => setParam('vehicleEmissionControl', v)}
        />
        <ParamSlider
          label="Public-transport shift"
          value={params.publicTransportShift}
          min={0}
          max={0.6}
          step={0.01}
          baseline={def.pt}
          format={(v) => `${Math.round(v * 100)}%`}
          hint="Share of vehicle trips moved to transit (0-60%)."
          error={err('Public transport shift')}
          onChange={(v) => setParam('publicTransportShift', v)}
        />
      </GroupCard>

      <GroupCard title="Road closures" hint="Close a road and optionally divert its traffic to another.">
        <input
          type="search"
          value={roadFilter}
          onChange={(e) => setRoadFilter(e.target.value)}
          placeholder="Filter roads by name"
          aria-label="Filter roads"
          className="mb-1.5 h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline"
        />
        <label className="block text-[11px] text-sand-400">
          Road to close
          <select value={closeId} onChange={(e) => setCloseId(e.target.value)} className={selectCls}>
            <option value="">Choose a road…</option>
            {roads
              .filter((r) => !closedIds.has(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.roadClass ?? 'road'})
                </option>
              ))}
          </select>
        </label>
        <label className="mt-1.5 block text-[11px] text-sand-400">
          Divert traffic to (optional)
          <select value={divertId} onChange={(e) => setDivertId(e.target.value)} className={selectCls}>
            <option value="">No diversion (traffic spills onto local streets)</option>
            {base.roads
              .filter((r) => r.id !== closeId && !closedIds.has(r.id) && r.volume >= 50)
              .slice(0, 200)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.roadClass ?? 'road'})
                </option>
              ))}
          </select>
        </label>
        {divertId && (
          <ParamSlider
            label="Diversion share"
            value={share}
            min={0}
            max={1}
            step={0.05}
            baseline={0.7}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setShare}
          />
        )}
        <button
          type="button"
          disabled={!closeId}
          onClick={() => {
            addClosure({ roadId: closeId, divertToRoadId: divertId || null, diversionShare: divertId ? share : 0 });
            setCloseId('');
            setDivertId('');
          }}
          className="mt-2 h-11 w-full rounded-xl bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400 disabled:opacity-40 md:h-9"
        >
          Close this road
        </button>
        {params.roadClosures.length > 0 && (
          <ul className="mt-2 space-y-1">
            {params.roadClosures.map((c) => (
              <li key={c.roadId} className="flex items-center gap-2 rounded-lg bg-ink-950 p-2 text-xs hairline">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-sand-50">{roadName(c.roadId)}</span>
                  <span className="block truncate text-[11px] text-sand-400">
                    {c.divertToRoadId
                      ? `${Math.round(c.diversionShare * 100)}% diverted to ${roadName(c.divertToRoadId)}`
                      : 'no diversion'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeClosure(c.roadId)}
                  aria-label={`Reopen ${roadName(c.roadId)}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700 md:h-8 md:w-8"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GroupCard>

      <GroupCard title="Industry">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-sand-400">
            New unit type
            <select
              value={pending.category}
              onChange={(e) => setPending({ category: e.target.value as IndustryCategory })}
              className={selectCls}
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
              value={pending.intensity}
              onChange={(e) => setPending({ intensity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className={selectCls}
            />
          </label>
        </div>
        <button
          type="button"
          aria-pressed={mode === 'add-industry'}
          onClick={() => setMode(mode === 'add-industry' ? 'select' : 'add-industry')}
          className={`mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold md:h-9 ${
            mode === 'add-industry' ? 'bg-accent-500 text-sand-50' : 'bg-ink-700 text-sand-50 hover:bg-ink-600'
          }`}
        >
          <MousePointerClick size={15} />
          {mode === 'add-industry' ? 'Click the map to place it (tap to cancel)' : 'Add industry, then click the map'}
        </button>
        <ul className="mt-2 space-y-1">
          {[...base.industries, ...params.addedIndustries].map((i) => {
            const isRemoved = removed.has(i.id);
            const intensity = params.industryIntensityOverrides[i.id] ?? i.emissionIntensity;
            return (
              <li key={i.id} className="rounded-lg bg-ink-950 p-2 hairline">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectIndustry(i.id)}
                    className={`min-w-0 flex-1 truncate text-left text-xs font-semibold ${isRemoved ? 'text-sand-500 line-through' : 'text-sand-50'}`}
                  >
                    {i.scenarioAdded ? '+ ' : ''}
                    {i.name}
                  </button>
                  <span className="font-mono text-[11px] text-sand-300">{Math.round(intensity)}</span>
                  {isRemoved ? (
                    <button
                      type="button"
                      onClick={() => restoreIndustry(i.id)}
                      aria-label={`Restore ${i.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700 md:h-8 md:w-8"
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeIndustry(i.id)}
                      aria-label={`Remove ${i.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700 md:h-8 md:w-8"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {!isRemoved && (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensity}
                    aria-label={`Intensity of ${i.name}`}
                    onChange={(e) => rerateIndustry(i.id, Number(e.target.value))}
                    className="h-6 w-full cursor-pointer accent-accent-500"
                  />
                )}
              </li>
            );
          })}
          {base.industries.length + params.addedIndustries.length === 0 && (
            <li className="text-[11px] text-sand-400">No industries in the current city model.</li>
          )}
        </ul>
        <ParamSlider
          label="Industrial control"
          value={params.industrialControl}
          min={0}
          max={0.95}
          step={0.01}
          baseline={0}
          format={(v) => `${Math.round(v * 100)}%`}
          hint="Extra control efficiency on every unit (filters / scrubbers), 0-95%."
          error={err('Industrial control')}
          onChange={(v) => setParam('industrialControl', v)}
        />
        <Toggle
          label="Green buffer around added industries"
          checked={params.greenBuffer}
          onChange={(v) => setParam('greenBuffer', v)}
        />
      </GroupCard>

      <GroupCard title="Land">
        <ParamSlider
          label="Green cover change"
          value={params.greenCoverDelta}
          min={-60}
          max={60}
          step={1}
          baseline={def.green}
          unit="pts"
          format={(v) => `${v > 0 ? '+' : ''}${v}`}
          hint="Percentage points of tree / grass cover, city-wide."
          error={err('Green cover change')}
          onChange={(v) => setParam('greenCoverDelta', v)}
        />
        <div className="mb-1 rounded-lg bg-ink-950 p-2 hairline">
          <label className="flex items-center justify-between gap-2 text-[11px] text-sand-300">
            Trees helper: trees planted
            <input
              type="number"
              min={0}
              value={trees || ''}
              onChange={(e) => setTrees(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-24 rounded-lg bg-ink-850 px-1.5 text-right font-mono text-xs text-sand-50 hairline"
            />
          </label>
          <p className="mt-1 text-[11px] text-sand-400">
            {trees > 0
              ? `${trees.toLocaleString('en-IN')} trees x ${CROWN_M2_PER_TREE} m2 crown over ${fmt(targetAreaKm2, 0)} km2 = +${fmt(treePoints, 2)} pts`
              : `Assumes ${CROWN_M2_PER_TREE} m2 of crown cover per mature tree, over ${params.targetCells.length > 0 ? 'the selected zones' : 'the whole city'}.`}
          </p>
          <button
            type="button"
            disabled={trees <= 0}
            onClick={() => setParam('greenCoverDelta', Math.min(60, Math.round((params.greenCoverDelta + treePoints) * 100) / 100))}
            className="mt-1 h-9 w-full rounded-lg bg-ink-700 text-xs font-semibold text-sand-50 hover:bg-ink-600 disabled:opacity-40"
          >
            Add to green cover change
          </button>
        </div>
        <ParamSlider
          label="Building density change"
          value={params.buildingDensityDelta}
          min={-0.6}
          max={0.6}
          step={0.02}
          baseline={def.dens}
          hint="Denser blocks trap more street-level pollution."
          error={err('Building density change')}
          onChange={(v) => setParam('buildingDensityDelta', v)}
        />
        <ParamSlider
          label="Building height multiplier"
          value={params.buildingHeightMultiplier}
          min={0.2}
          max={5}
          step={0.1}
          baseline={def.height}
          unit="x"
          hint="Taller buildings deepen street canyons."
          error={err('Building height multiplier')}
          onChange={(v) => setParam('buildingHeightMultiplier', v)}
        />
      </GroupCard>

      <GroupCard title="Area selection" hint="Pick zones for the area traffic control. Click toggles a zone; shift-click selects a range.">
        <button
          type="button"
          aria-pressed={mode === 'select-area'}
          onClick={() => setMode(mode === 'select-area' ? 'select' : 'select-area')}
          className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold md:h-9 ${
            mode === 'select-area' ? 'bg-accent-500 text-sand-50' : 'bg-ink-700 text-sand-50 hover:bg-ink-600'
          }`}
        >
          <MousePointerClick size={15} />
          {mode === 'select-area' ? 'Selecting zones: click the map (tap to finish)' : 'Select area'}
        </button>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-sand-300">
          <span>{params.targetCells.length} zones selected</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => setTargetCells(builtUpCells(base))}
              className="min-h-8 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700"
            >
              Built-up zones
            </button>
            <button
              type="button"
              disabled={params.targetCells.length === 0}
              onClick={() => setTargetCells([])}
              className="min-h-8 rounded-lg px-2 text-[11px] font-semibold text-sand-300 hover:bg-ink-700 disabled:opacity-40"
            >
              Clear
            </button>
          </span>
        </div>
      </GroupCard>

      <GroupCard title="Weather">
        <div className="flex items-start gap-3">
          <Compass value={params.weather.windDirection} onChange={(v) => setWeather({ windDirection: v })} />
          <div className="min-w-0 flex-1">
            <ParamSlider
              label="Wind direction"
              value={params.weather.windDirection}
              min={0}
              max={360}
              step={5}
              baseline={def.w.windDirection}
              unit="deg"
              hint="Direction the wind blows FROM."
              error={err('Wind direction')}
              onChange={(v) => setWeather({ windDirection: v })}
            />
          </div>
        </div>
        <ParamSlider label="Wind speed" value={params.weather.windSpeed} min={0} max={25} step={0.1} baseline={def.w.windSpeed} unit="m/s" error={err('Wind speed')} onChange={(v) => setWeather({ windSpeed: v })} />
        <ParamSlider label="Temperature" value={params.weather.temperature} min={-5} max={50} step={0.5} baseline={def.w.temperature} unit="°C" error={err('Temperature')} onChange={(v) => setWeather({ temperature: v })} />
        <ParamSlider label="Humidity" value={params.weather.humidity} min={0} max={100} step={1} baseline={def.w.humidity} unit="%" error={err('Humidity')} onChange={(v) => setWeather({ humidity: v })} />
        <ParamSlider label="Rainfall" value={params.weather.rainfall} min={0} max={300} step={1} baseline={def.w.rainfall} unit="mm/d" error={err('Rainfall')} onChange={(v) => setWeather({ rainfall: v })} />
        <ParamSlider label="Pressure" value={params.weather.pressure} min={900} max={1100} step={1} baseline={def.w.pressure} unit="hPa" error={err('Pressure')} onChange={(v) => setWeather({ pressure: v })} />
        <button
          type="button"
          onClick={() => setWeather({ ...base.weather })}
          className="mt-1 h-9 w-full rounded-lg bg-ink-700 text-xs font-semibold text-sand-50 hover:bg-ink-600"
        >
          Reset to current weather
        </button>
      </GroupCard>

      <FieldError message={errors.find((e) => !/^(Traffic|Area|Vehicle|Public|Industrial|Green|Building|Wind|Rain|Temp|Humid|Pressure)/.test(e)) ?? null} />

      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl bg-ink-950/95 p-2 backdrop-blur">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              runNow();
              setDisplayMode('scenario');
            }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400"
          >
            <Play size={16} /> Run scenario
          </button>
          <button
            type="button"
            onClick={() => {
              resetParams();
              setDisplayMode('baseline');
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ink-700 px-4 text-sm font-semibold text-sand-50 hover:bg-ink-600"
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSave();
            }}
            placeholder="Scenario name"
            aria-label="Scenario name"
            className="h-11 min-w-0 flex-1 rounded-xl bg-ink-850 px-3 text-sm text-sand-50 hairline"
          />
          <button
            type="button"
            onClick={submitSave}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-ink-700 px-3 text-xs font-bold text-sand-50 hover:bg-ink-600"
          >
            <BookmarkPlus size={15} /> Save as scenario
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSection('scenarios')}
          className="min-h-8 w-full text-center text-[11px] font-semibold text-accent-500 hover:underline"
        >
          Open saved scenarios and examples
        </button>
      </div>
    </div>
  );
}
