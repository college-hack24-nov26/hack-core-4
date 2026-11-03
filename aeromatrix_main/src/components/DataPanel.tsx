import { Database, Loader2 } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { Section, StatusBadge } from './ui';
import { OSM_ATTRIBUTION } from '../services/osmGeometry';
import { fmtInt } from '../utils/format';

export function DataPanel() {
  const info = useTwinStore((s) => s.geometryInfo);
  const loadOsm = useTwinStore((s) => s.loadOsm);
  const useDemo = useTwinStore((s) => s.useDemoGeometry);
  const loading = info.status === 'loading';

  const btn = (active: boolean) =>
    `flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-50 md:min-h-9 ${
      active ? 'bg-accent-500 text-sand-50' : 'bg-ink-700 text-sand-50 hover:bg-ink-600'
    }`;

  return (
    <div className="space-y-1 py-2">
      <div className="rounded-xl bg-ink-850 p-3 hairline">
        <div className="flex items-center gap-2 text-sm font-bold text-sand-50">
          <Database size={16} />
          {info.source === 'osm' ? 'OpenStreetMap geometry' : 'Demo geometry'}
          {loading && <Loader2 size={14} className="animate-spin" />}
        </div>
        <p className="mt-1 text-xs text-sand-300">
          {info.source === 'osm'
            ? `Loaded from the ${info.origin === 'live' ? 'live Overpass API' : 'bundled snapshot'}${info.generated ? ` (${new Date(info.generated).toLocaleDateString()})` : ''}.`
            : 'Hand-digitised, approximate demo features of Pune.'}
        </p>
      </div>

      {info.notice && (
        <p role="note" className="rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">
          {info.notice}
        </p>
      )}
      {info.status === 'error' && info.message && (
        <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 ring-1 ring-red-500/30">
          {info.message}
        </p>
      )}

      <Section title="Counts in use">
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Roads', fmtInt(info.counts.roads)],
            ['Road length', `${fmtInt(info.counts.roadKm)} km`],
            ['Green areas', fmtInt(info.counts.green)],
            ['Industrial zones', fmtInt(info.counts.industrialZones)],
            ['Emission sources', fmtInt(info.counts.industries)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ink-850 p-2 hairline">
              <dt className="text-sand-400">{k}</dt>
              <dd className="font-semibold text-sand-50">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Load real OSM geometry">
        <div className="space-y-2">
          <button type="button" disabled={loading} onClick={() => void loadOsm('snapshot')} className={btn(info.origin === 'snapshot')}>
            Bundled snapshot (works offline)
          </button>
          <button type="button" disabled={loading} onClick={() => void loadOsm('live')} className={btn(info.origin === 'live')}>
            Live from Overpass API
          </button>
          <button type="button" disabled={loading} onClick={() => void useDemo()} className={btn(info.source === 'demo')}>
            Back to demo geometry
          </button>
        </div>
        <p className="mt-2 text-[11px] text-sand-400">
          Changing the geometry rebuilds the city model and resets the active scenario. Saved scenarios keep their own settings.
        </p>
      </Section>

      <Section title="What is real and what is not">
        <div className="space-y-2 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
          <p>
            <strong className="text-sand-100">Only the geometry is real:</strong> road lines, parks and forests, and industrial zones come from
            OpenStreetMap.
          </p>
          <p>
            Traffic volumes are a <StatusBadge status="DEMO" className="align-middle" /> proxy from the road class (motorway/trunk highest,
            secondary lowest). Emission intensities, population and weather are DEMO assumptions too.
          </p>
        </div>
      </Section>

      <p className="pb-2 text-[11px] text-sand-500">{info.attribution ?? OSM_ATTRIBUTION} Licence: ODbL 1.0.</p>
    </div>
  );
}
