import { useEffect, useRef, useState } from 'react';
import { Layers, LocateFixed, Mountain, Building2, ArrowDownToDot } from 'lucide-react';
import { TwinMap, type CursorInfo } from './TwinMap';
import { bindMapToStore } from './mapSync';
import { useTwinStore } from '../store/useTwinStore';
import { cellAtLonLat } from '../utils/grid';

function MapButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-xl text-sand-100 shadow-lg hairline backdrop-blur transition-colors ${
        active ? 'bg-accent-500 text-sand-50' : 'bg-ink-900/90 hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

export function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TwinMap | null>(null);
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [tint, setTint] = useState(false);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const mapStatus = useTwinStore((s) => s.mapStatus);
  const mapMessage = useTwinStore((s) => s.mapMessage);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const store = useTwinStore.getState();
    let map: TwinMap | null = null;
    let unbind: (() => void) | null = null;
    try {
      map = new TwinMap(el, {
        onCellClick: (lon, lat) => {
          const { base, selectCell } = useTwinStore.getState();
          if (!base) return;
          const cell = cellAtLonLat(base, lon, lat);
          if (cell) selectCell(cell.id);
        },
        onCursor: setCursor,
        onStatus: (status, message) => useTwinStore.getState().setMapStatus(status, message ?? null),
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

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 bg-ink-950" aria-label="3D map of Pune" />

      <div
        className={`absolute top-3 z-10 flex flex-col gap-2 transition-[right] duration-300 ${
          rightOpen ? 'right-3 max-md:hidden md:right-[368px] xl:right-[416px]' : 'right-3'
        }`}
      >
        <MapButton label="Reset view" onClick={() => mapRef.current?.resetView()}>
          <LocateFixed size={20} />
        </MapButton>
        <MapButton label="Top-down view" onClick={() => mapRef.current?.topDown()}>
          <ArrowDownToDot size={20} />
        </MapButton>
        <MapButton label="City 3D view" onClick={() => mapRef.current?.city3D()}>
          <Building2 size={20} />
        </MapButton>
        <MapButton
          label={tint ? 'Hide elevation tint' : 'Show elevation tint'}
          active={tint}
          onClick={() => {
            const next = !tint;
            setTint(next);
            mapRef.current?.setTint(next);
          }}
        >
          <Mountain size={20} />
        </MapButton>
      </div>

      <div
        className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-ink-950/80 px-3 py-1 font-mono text-[11px] text-sand-200 backdrop-blur max-lg:hidden"
        aria-live="off"
      >
        <Layers size={11} className="mr-1 inline -translate-y-px" />
        {cursor
          ? `${cursor.lat.toFixed(4)}°N  ${cursor.lon.toFixed(4)}°E  ${
              cursor.elevation === null ? 'elev n/a' : `${Math.round(cursor.elevation)} m`
            }`
          : 'Hover the map for coordinates'}
      </div>

      {mapStatus === 'loading' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ink-900/90 px-4 py-1.5 text-xs text-sand-200 hairline">
          Loading terrain and imagery…
        </div>
      )}
      {mapStatus === 'error' && (
        <div
          role="alert"
          className="absolute left-1/2 top-16 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-ink-900 p-4 text-sm text-sand-100 hairline"
        >
          <div className="mb-1 font-bold text-accent-300">The 3D map has a problem</div>
          <p className="text-sand-300">{mapMessage ?? 'Unknown map error.'}</p>
          <p className="mt-2 text-xs text-sand-400">
            The side panels still work with the same DEMO data. Try a browser with WebGL enabled.
          </p>
        </div>
      )}
    </>
  );
}
