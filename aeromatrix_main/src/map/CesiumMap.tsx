import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { TwinMap, type CursorInfo } from './TwinMap';
import { bindMapToStore } from './mapSync';
import { handleMapClick } from './mapInteractions';
import { LayerControl } from './LayerControl';
import { MapTopBar } from './MapTopBar';
import { useTwinStore } from '../store/useTwinStore';
import type { InteractionMode } from '../types';

const MODE_HINT: Record<Exclude<InteractionMode, 'select'>, string> = {
  'add-industry': 'Click the map to place the new industry.',
  'select-area': 'Click zones to add or remove them. Shift-click selects a range.',
  'pick-candidate': 'Click the map to add candidate sites (up to five).',
};

export function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TwinMap | null>(null);
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const mapStatus = useTwinStore((s) => s.mapStatus);
  const mapMessage = useTwinStore((s) => s.mapMessage);
  const mode = useTwinStore((s) => s.interactionMode);
  const setMode = useTwinStore((s) => s.setInteractionMode);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const store = useTwinStore.getState();
    let map: TwinMap | null = null;
    let unbind: (() => void) | null = null;
    try {
      map = new TwinMap(el, {
        onClick: handleMapClick,
        onCursor: setCursor,
        onStatus: (status, message) => useTwinStore.getState().setMapStatus(status, message ?? null),
        onBuildingsStatus: (m) => useTwinStore.getState().setLayerNote('buildings', m),
        onPhotoreal: (status, message) =>
          useTwinStore.getState().setLayerNote('photoreal', status === 'loading' ? 'Loading the photorealistic city…' : status === 'error' ? (message ?? 'Unavailable.') : null),
      });
      mapRef.current = map;
      unbind = bindMapToStore(map);
    } catch (e) {
      store.setMapStatus(
        'error',
        e instanceof Error ? e.message : 'The 3D map could not start (WebGL may be unavailable).',
      );
    }
    return () => {
      unbind?.();
      map?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mode === 'select') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('select');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, setMode]);

  const rightOffset = rightOpen ? 'right-14' : 'right-14';

  return (
    <>
      <div
        ref={containerRef}
        className={`absolute inset-0 bg-ink-950 ${mode !== 'select' ? 'cursor-crosshair' : ''}`}
        aria-label="3D map of Pune"
      />

      <MapTopBar />

      <div
        className={`absolute top-3 z-20 flex flex-col gap-2 transition-[right] duration-300 ${
          rightOpen ? 'right-3 max-md:hidden md:right-[368px] xl:right-[416px]' : 'right-3'
        }`}
      >
        <div className="relative">
          <LayerControl rightOffset={rightOffset} />
        </div>
      </div>

      {mode !== 'select' && (
        <div
          role="status"
          className="animate-rise absolute left-1/2 top-[7.25rem] z-20 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full bg-accent-500 py-1 pl-4 pr-1 text-xs font-semibold text-sand-50 shadow-xl max-md:top-[8.5rem] md:top-16"
        >
          {MODE_HINT[mode]}
          <button
            type="button"
            onClick={() => setMode('select')}
            className="flex h-9 items-center gap-1 rounded-full bg-black/20 px-3 hover:bg-black/30"
          >
            <X size={13} /> Done
          </button>
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-ink-950/80 px-3 py-1 font-mono text-[11px] text-sand-200 backdrop-blur max-lg:hidden"
        aria-live="off"
      >
        {cursor
          ? `${cursor.lat.toFixed(4)}°N  ${cursor.lon.toFixed(4)}°E  ${
              cursor.elevation === null ? 'elev n/a' : `${Math.round(cursor.elevation)} m`
            }`
          : 'Hover the map for coordinates'}
      </div>

      {mapStatus === 'loading' && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-ink-900/90 px-4 py-1.5 text-xs text-sand-200 hairline">
          Loading terrain and imagery…
        </div>
      )}
      {mapStatus === 'error' && (
        <div
          role="alert"
          className="absolute left-1/2 top-24 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-ink-900 p-4 text-sm text-sand-100 hairline"
        >
          <div className="mb-1 font-bold text-accent-300">The 3D map has a problem</div>
          <p className="text-sand-300">{mapMessage ?? 'Unknown map error.'}</p>
          <p className="mt-2 text-xs text-sand-400">
            The side panels still work with the same data. Try a browser with WebGL enabled.
          </p>
        </div>
      )}
    </>
  );
}
