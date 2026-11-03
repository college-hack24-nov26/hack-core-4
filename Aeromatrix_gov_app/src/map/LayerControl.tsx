import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { PHOTOREAL_AVAILABLE } from '../config';
import type { LayerId } from '../types';

interface Item {
  id: LayerId;
  label: string;
  hint?: string;
}

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: 'Pollution',
    items: [
      { id: 'heatmap', label: 'Pollution heatmap' },
      { id: 'grid', label: 'Grid' },
      { id: 'risk', label: '3D risk columns', hint: 'Extruded zones coloured by risk' },
    ],
  },
  {
    title: 'City',
    items: [
      { id: 'roads', label: 'Roads' },
      { id: 'traffic', label: 'Traffic corridors', hint: 'Colour by volume proxy (DEMO)' },
      { id: 'industries', label: 'Industries' },
      { id: 'green', label: 'Green cover' },
      { id: 'buildings', label: '3D buildings', hint: 'OSM blocks, zoom in to load' },
    ],
  },
  {
    title: 'Base map',
    items: [
      { id: 'terrain', label: 'Terrain' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'elevationTint', label: 'Elevation tint' },
      { id: 'shadows', label: 'Shadows (sun)' },
      ...(PHOTOREAL_AVAILABLE ? [{ id: 'photoreal' as LayerId, label: 'Photorealistic 3D city' }] : []),
    ],
  },
  {
    title: 'Stations and industry',
    items: [
      { id: 'stations', label: 'Monitoring stations', hint: 'Only stations with a sourced coordinate' },
      { id: 'midcAreas', label: 'MIDC industrial areas', hint: 'Needs the industry dataset' },
      { id: 'industrySites', label: 'Mapped industry sites', hint: 'Needs the industry dataset' },
    ],
  },
  {
    title: 'Places',
    items: [
      { id: 'labels', label: 'Labels' },
      { id: 'places', label: 'Place markers' },
    ],
  },
];

export function LayerControl({ rightOffset }: { rightOffset: string }) {
  const [open, setOpen] = useState(false);
  const layers = useTwinStore((s) => s.layers);
  const notes = useTwinStore((s) => s.layerNotes);
  const industryLoaded = useTwinStore((s) => s.industry?.status === 'loaded');
  const toggle = useTwinStore((s) => s.toggleLayer);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Map layers"
        title="Map layers"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-11 items-center justify-center rounded-xl text-sand-100 shadow-lg hairline backdrop-blur transition-colors ${
          open ? 'bg-accent-500 text-sand-50' : 'bg-ink-900/90 hover:bg-ink-700'
        }`}
      >
        <Layers size={20} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Layer toggles"
          className={`sheet-surface theme-cream hairline animate-rise panel-scroll absolute top-0 z-30 max-h-[calc(100dvh-8rem)] w-[min(264px,calc(100vw-5rem))] p-3 ${rightOffset}`}
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold text-sand-50">Map layers</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse layer panel"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-800"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="mb-2">
              <legend className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sand-400">{g.title}</legend>
              {g.items.map((it) => (
                <div key={it.id}>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-1 text-xs text-sand-100 hover:bg-ink-850 md:min-h-9">
                    <span>
                      {it.label}
                      {it.hint && <span className="block text-[10px] text-sand-500">{it.hint}</span>}
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={layers[it.id]}
                      disabled={(it.id === 'midcAreas' || it.id === 'industrySites') && !industryLoaded}
                      onChange={() => toggle(it.id)}
                      className="h-5 w-5 shrink-0 accent-accent-500 disabled:opacity-40"
                    />
                  </label>
                  {layers[it.id] && notes[it.id] && <p className="px-1 pb-1 text-[11px] text-amber-700">{notes[it.id]}</p>}
                  {(it.id === 'midcAreas' || it.id === 'industrySites') && !industryLoaded && (
                    <p className="px-1 pb-1 text-[11px] text-sand-500">Industry dataset not loaded.</p>
                  )}
                </div>
              ))}
            </fieldset>
          ))}
          <p className="text-[10px] text-sand-500">Overlays fade as you zoom in so the city stays readable.</p>
        </div>
      )}
    </div>
  );
}
