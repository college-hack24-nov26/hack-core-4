import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Chip, Section, StatusBadge, Toggle } from './ui';
import type { DrawerContent } from './drawers';
import {
  EMISSION_SPECIES,
  SEASON_LABEL,
  SPECIES_LABEL,
  sitesInArea,
  type IndustryData,
  type IndustrySite,
  type MidcArea,
} from '../services/industryData';
import {
  ASSUMPTION_NOTE,
  applyIndustryAction,
  districtTotals,
  estimateEmissions,
  modeledSourcesNearArea,
  modeledSourcesNearSite,
  seasonalWeather,
  seasonsFor,
  type IndustryAction,
} from '../services/industryScenarios';
import { RELOCATION_SITE } from '../scenarios/actions';
import { fmt, fmtInt } from '../utils/format';
import type { Industry } from '../types';

function useIndustry(): IndustryData | null {
  return useTwinStore((s) => (s.industry?.status === 'loaded' ? s.industry.data : null));
}

/** Reduce / shut down / relocate the modeled sources near a selected estate or site (prototype engine). */
function ActionBox({ sources, areaCode }: { sources: Industry[]; areaCode: number | null }) {
  const data = useIndustry();
  const params = useTwinStore((s) => s.params);
  const applyParams = useTwinStore((s) => s.applyParams);
  const setNotice = useTwinStore((s) => s.setNotice);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const [percent, setPercent] = useState(40);
  const [fuel, setFuel] = useState('');
  const [qty, setQty] = useState(0);

  const run = (a: IndustryAction) => {
    applyParams(applyIndustryAction(params, sources, a));
    setMode('delta');
    setNotice(
      a.kind === 'reduce' ? `Reduced ${sources.length} modeled source(s) by ${a.percent}%. Showing the change on the map.` : a.kind === 'shutdown' ? `Shut down ${sources.length} modeled source(s). Showing the change on the map.` : `Relocated ${sources.length} modeled source(s) to the south-east periphery.`,
    );
  };

  const seasons = data && areaCode !== null ? seasonsFor(data, areaCode) : [];
  const fuels = data?.emissionFactors ?? [];
  const est = useMemo(() => (data && fuel && qty > 0 ? estimateEmissions([{ fuel, quantity: qty }], data.emissionFactors) : null), [data, fuel, qty]);
  const factor = fuels.find((f) => f.fuel === fuel);

  return (
    <div className="space-y-3">
      <Section title={`Modeled sources in or within 1 km (${sources.length})`} action={<StatusBadge status="MODELED_SCENARIO" />}>
        {sources.length === 0 ? (
          <p className="text-xs text-sand-300">No modeled source of the prototype engine lies in or within 1 km of this location, so there is nothing to change here.</p>
        ) : (
          <>
            <ul className="mb-2 space-y-0.5 text-[11px] text-sand-300">
              {sources.map((s) => (
                <li key={s.id}>{s.name} · assumed intensity {fmt(params.industryIntensityOverrides[s.id] ?? s.emissionIntensity, 0)}</li>
              ))}
            </ul>
            <label className="block text-xs font-semibold text-sand-100">
              Reduce by {percent}%
              <input type="range" min={5} max={100} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="mt-1 h-6 w-full cursor-pointer accent-accent-500" />
            </label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => run({ kind: 'reduce', percent })} className="min-h-10 rounded-lg bg-accent-500 text-xs font-bold text-sand-50 hover:bg-accent-400">Reduce</button>
              <button type="button" onClick={() => run({ kind: 'shutdown' })} className="min-h-10 rounded-lg bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600">Shut down</button>
              <button type="button" onClick={() => run({ kind: 'relocate', to: RELOCATION_SITE })} className="min-h-10 rounded-lg bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600">Relocate</button>
            </div>
          </>
        )}
        <p className="mt-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-snug text-amber-800">{ASSUMPTION_NOTE}</p>
      </Section>

      {seasons.length > 0 && (
        <Section title="ERA5 seasonal weather (2024-25, modelled)">
          <div className="flex flex-wrap gap-1.5">
            {seasons.map((c) => (
              <Chip
                key={c.season}
                onClick={() => {
                  const w = seasonalWeather(data!, c.areaCode, c.season);
                  if (!w) return;
                  applyParams({ ...params, weather: w.weather });
                  setMode('scenario');
                  setNotice(`Applied the ${SEASON_LABEL[c.season as keyof typeof SEASON_LABEL] ?? c.label} ERA5 weather for ${c.areaName}.`);
                }}
                className="min-h-9"
              >
                {SEASON_LABEL[c.season as keyof typeof SEASON_LABEL] ?? c.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-sand-500">Seasonal medians from ERA5 reanalysis (not station measurements). Applies temperature, wind, humidity, rain and pressure to the scenario.</p>
        </Section>
      )}

      {fuels.length > 0 && (
        <Section title="Emitted mass from fuel use (ARAI/TERI factors)">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-sand-400">
              Fuel
              <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline">
                <option value="">Choose…</option>
                {fuels.map((f) => (
                  <option key={f.fuel} value={f.fuel}>{f.fuel}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-sand-400">
              Quantity {factor ? `(${factor.denominator.split('/')[1] ?? 'units'})` : ''}
              <input type="number" min={0} value={qty || ''} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} className="h-9 w-full rounded-lg bg-ink-950 px-2 text-xs text-sand-50 hairline" />
            </label>
          </div>
          {est && (
            <>
              <table className="mt-2 w-full text-[11px]">
                <tbody>
                  {EMISSION_SPECIES.map((sp) => (
                    <tr key={sp} className="border-t border-sand-400/15">
                      <td className="py-1 font-semibold text-sand-100">{SPECIES_LABEL[sp]}</td>
                      <td className="py-1 text-right font-mono">{est.kg[sp] === null ? 'no factor' : `${fmt(est.kg[sp] as number, 2)} kg`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] leading-snug text-sand-500">{est.note}</p>
            </>
          )}
        </Section>
      )}
    </div>
  );
}

export function useAreaDrawer(): DrawerContent | null {
  const code = useTwinStore((s) => s.selectedAreaCode);
  const data = useIndustry();
  const base = useTwinStore((s) => s.base);
  if (code === null || !data || !base) return null;
  const area = data.areas.find((a) => a.code === code);
  if (!area) return null;
  const sources = modeledSourcesNearArea(base, area);
  const sites = sitesInArea(data, area);
  const p = area.plots;
  return {
    title: area.name,
    subtitle: `MIDC ${area.code}${area.fieldType ? ` · ${area.fieldType}` : ''}${area.district ? ` · ${area.district}` : ''}`,
    body: (
      <div className="space-y-1 pt-3">
        <div className="flex gap-1.5">
          <StatusBadge status="DEMO" />
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold text-sand-300">{area.analysisArea} the analysis area</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Area', area.areaHa === null ? 'n/a' : `${fmt(area.areaHa, 0)} ha`],
            ['Mapped area', area.mappedAreaHa === null ? 'n/a' : `${fmt(area.mappedAreaHa, 0)} ha`],
            ['Plots', p ? fmtInt(p.total ?? 0) : 'n/a'],
            ['Mapped OSM sites', fmtInt(sites.length)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
              <dt className="text-sand-400">{k}</dt>
              <dd className="font-semibold text-sand-50">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10px] text-sand-500">MIDC estate boundaries and plot status. This is not a company or emissions registry.</p>
        <ActionBox sources={sources} areaCode={area.code} />
      </div>
    ),
  };
}

export function useSiteDrawer(): DrawerContent | null {
  const id = useTwinStore((s) => s.selectedSiteId);
  const data = useIndustry();
  const base = useTwinStore((s) => s.base);
  if (!id || !data || !base) return null;
  const site = data.sites.find((s) => s.id === id);
  if (!site) return null;
  const sources = modeledSourcesNearSite(base, site);
  const estate = data.areas.find((a) => a.code === site.midcCode);
  return {
    title: site.name,
    subtitle: `Mapped OSM site · ${site.kind}`,
    body: (
      <div className="space-y-1 pt-3">
        <StatusBadge status="DEMO" />
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Kind', site.kind],
            ['Operator', site.operator ?? 'not mapped'],
            ['Inside MIDC estate', estate ? estate.name : 'no'],
            ['Location', `${site.location[1].toFixed(4)}°N ${site.location[0].toFixed(4)}°E`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
              <dt className="text-sand-400">{k}</dt>
              <dd className="font-semibold text-sand-50">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10px] text-sand-500">A partial OpenStreetMap snapshot: a candidate site, not a verified factory list.</p>
        <ActionBox sources={sources} areaCode={site.midcCode} />
      </div>
    ),
  };
}

/** Launcher "Industries". */
export function IndustryPanel() {
  const industry = useTwinStore((s) => s.industry);
  const layers = useTwinStore((s) => s.layers);
  const toggle = useTwinStore((s) => s.toggleLayer);
  const selectArea = useTwinStore((s) => s.selectArea);
  const selectSite = useTwinStore((s) => s.selectSite);
  const flyTo = useTwinStore((s) => s.flyTo);
  const loadIndustry = useTwinStore((s) => s.loadIndustry);
  const [q, setQ] = useState('');
  const [showSites, setShowSites] = useState(false);

  if (!industry) {
    return <p className="py-4 text-sm text-sand-300" role="status">Checking for the industry dataset…</p>;
  }
  if (industry.status === 'not-loaded') {
    return (
      <div className="space-y-2 py-3">
        <p className="rounded-xl bg-ink-850 p-3 text-sm text-sand-200 hairline" role="status">
          <strong>Industry dataset not loaded.</strong>
          <span className="mt-1 block text-xs text-sand-400">{industry.reason} The MIDC and industry-site map layers are disabled until the file public/data/industry/industry_data.json is present, then reload.</span>
        </p>
        <Toggle label="MIDC industrial areas (needs the dataset)" checked={false} onChange={() => undefined} />
        <Toggle label="Mapped industry sites (needs the dataset)" checked={false} onChange={() => undefined} />
        <button type="button" onClick={() => void loadIndustry()} className="min-h-10 w-full rounded-xl bg-ink-700 text-xs font-bold text-sand-50 hover:bg-ink-600">Check again</button>
        <p className="text-[11px] text-sand-500">The modeled industries of the What-If simulator (from OpenStreetMap zones) still work without it.</p>
      </div>
    );
  }
  const data = industry.data;
  const t = q.trim().toLowerCase();
  const areas = data.areas.filter((a) => !t || a.name.toLowerCase().includes(t) || String(a.code).includes(t));
  const sites = data.sites.filter((s) => s.inAnalysisArea && (!t || s.name.toLowerCase().includes(t))).slice(0, 80);
  const totals = districtTotals(data);

  const openArea = (a: MidcArea) => {
    selectArea(a.code);
    if (a.centroid) flyTo(a.centroid[0], a.centroid[1], 6000);
  };
  const openSite = (s: IndustrySite) => {
    selectSite(s.id);
    flyTo(s.location[0], s.location[1], 2500);
  };

  return (
    <div className="space-y-1 py-2">
      <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        {data.areas.length} MIDC estates and {data.sites.length} partial OSM industry points. Boundaries and mapped sites only: <strong>no facility emissions</strong>, so any effect shown uses assumed intensities in the prototype engine.
      </p>
      <Toggle label="MIDC industrial areas" checked={layers.midcAreas} onChange={() => toggle('midcAreas')} />
      <Toggle label="Mapped industry sites" checked={layers.industrySites} onChange={() => toggle('industrySites')} />

      <label className="relative block">
        <span className="sr-only">Search estates and sites</span>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sand-400" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search estates and sites" className="h-11 w-full rounded-xl bg-ink-850 pl-9 pr-3 text-sm text-sand-50 placeholder:text-sand-500 hairline" />
      </label>

      <Section title={`MIDC estates (${areas.length})`}>
        <ul className="space-y-0.5">
          {areas.map((a) => {
            return (
              <li key={a.code}>
                <button type="button" onClick={() => openArea(a)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-ink-800">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.analysisArea === 'outside' ? 'bg-sand-600' : 'bg-amber-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-sand-50">{a.name}</span>
                    <span className="block text-[10px] text-sand-500">MIDC {a.code} · {a.analysisArea}{a.areaHa ? ` · ${fmt(a.areaHa, 0)} ha` : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={`Mapped industry sites (${sites.length}${data.sites.length > sites.length ? ' shown' : ''})`} action={
        <button type="button" onClick={() => setShowSites((v) => !v)} className="min-h-8 px-2 text-[11px] font-semibold text-accent-500">{showSites ? 'Hide' : 'Show'}</button>
      }>
        {showSites && (
          <ul className="space-y-0.5">
            {sites.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => openSite(s)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-ink-800">
                  <span className="min-w-0 flex-1 truncate text-sm text-sand-50">{s.name}</span>
                  <span className="text-[10px] text-sand-500">{s.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {totals.length > 0 && (
        <Section title="Pune district inventory (2021)">
          <div className="overflow-x-auto rounded-xl hairline">
            <table className="w-full min-w-[320px] text-left text-[11px]">
              <thead>
                <tr className="bg-ink-850 text-sand-400">
                  <th className="p-1.5 font-semibold">Sector</th>
                  {(['pm25', 'so2', 'nox'] as const).map((k) => (
                    <th key={k} className="p-1.5 font-semibold">{SPECIES_LABEL[k]} t/yr</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals.map((r) => (
                  <tr key={r.code} className="border-t border-sand-400/15">
                    <td className="p-1.5 font-semibold text-sand-50">{r.sector}</td>
                    {(['pm25', 'so2', 'nox'] as const).map((k) => (
                      <td key={k} className="p-1.5 font-mono">{r.tonnes[k] == null ? '-' : fmtInt(r.tonnes[k] as number)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-sand-500">District aggregates (ARAI/TERI). Not allocated to estates or sites.</p>
        </Section>
      )}
      {data.warnings.length > 0 && (
        <details className="rounded-xl bg-ink-850 p-2 text-[11px] text-sand-400 hairline">
          <summary className="cursor-pointer font-semibold text-sand-200">{data.warnings.length} dataset warnings</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
