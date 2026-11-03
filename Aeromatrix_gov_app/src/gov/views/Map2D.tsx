import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { BaseState, LonLat } from '../../types';
import type { IndustryData } from '../../services/industryData';
import type { ZoneRow } from '../lib/airdata';
import { UNKNOWN_COLOR, colorOf } from '../lib/airdata';
import type { CoverageResult } from '../lib/coverage';
import type { Hotspot } from '../lib/hotspots';
import { simplifyRing } from '../lib/geo';
import type { StationRow } from '../lib/stations';

export type MapLayerId = 'zones' | 'stations' | 'hotspots' | 'midc' | 'industry' | 'coverage';
export type MapSelection = { kind: 'zone' | 'station' | 'hotspot' | 'midc' | 'gap'; id: string } | null;

export interface Map2DProps {
  base: BaseState;
  visible: Record<MapLayerId, boolean>;
  zones: ZoneRow[];
  stations: StationRow[];
  hotspots: Hotspot[];
  coverage: CoverageResult | null;
  industry: IndustryData | null;
  focus: { lon: number; lat: number; nonce: number } | null;
  /** the device position, when the Commissioner asked for it (never stored or sent anywhere) */
  me: { lon: number; lat: number; accuracy: number } | null;
  /** draw simpler boundaries (phones and weak devices) */
  simplify: boolean;
  onSelect: (s: MapSelection) => void;
}

const PUNE: L.LatLngExpression = [18.55, 73.85];
const ring = (r: LonLat[]): L.LatLngExpression[] => r.map(([lon, lat]) => [lat, lon]);

/**
 * The light 2D map (Leaflet, canvas renderer). Layers are built the first time they are switched on and rebuilt when
 * their data changes, so a layer the Commissioner never opens costs nothing.
 */
export function Map2D(props: Map2DProps) {
  const { base, visible, zones, stations, hotspots, coverage, industry, focus, me, simplify, onSelect } = props;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<L.Canvas | null>(null);
  const svgRef = useRef<L.SVG | null>(null);
  const groups = useRef<Partial<Record<MapLayerId, L.Layer>>>({});
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, preferCanvas: true, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const b = base.city.bbox;
    map.fitBounds([[b.south, b.west], [b.north, b.east]]);
    if (!map.getBounds().isValid()) map.setView(PUNE, 11);
    canvasRef.current = L.canvas({ padding: 0.3 });
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 50);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el.current);
    map.on('click', () => select.current(null));
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      groups.current = {};
      svgRef.current = null;
    };
    // The map is created once; layers follow the data below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Show or hide one layer, building it lazily. */
  const sync = (id: MapLayerId, on: boolean, build: () => L.Layer | null, depsIn: unknown) => {
    const deps = Array.isArray(depsIn) ? depsIn : [depsIn];
    const map = mapRef.current;
    if (!map) return;
    const prev = groups.current[id];
    const old = (prev as (L.Layer & { __deps?: unknown[] }) | undefined)?.__deps;
    if (prev && (!old || old.length !== deps.length || old.some((d, i) => d !== deps[i]))) {
      map.removeLayer(prev);
      delete groups.current[id];
    }
    if (!on) {
      const cur = groups.current[id];
      if (cur && map.hasLayer(cur)) map.removeLayer(cur);
      return;
    }
    let layer = groups.current[id];
    if (!layer) {
      const built = build();
      if (!built) return;
      (built as L.Layer & { __deps?: unknown[] }).__deps = deps;
      groups.current[id] = built;
      layer = built;
    }
    if (!map.hasLayer(layer)) map.addLayer(layer);
  };

  // zones coloured by the CAMS estimate
  useEffect(() => {
    sync('zones', visible.zones, () => {
      const g = L.layerGroup();
      const byId = new Map(zones.map((z) => [z.id, z]));
      for (const c of base.cells) {
        const z = byId.get(c.id);
        if (!z) continue;
        const r = L.rectangle([[c.bounds.south, c.bounds.west], [c.bounds.north, c.bounds.east]], {
          renderer: canvasRef.current ?? undefined,
          weight: 0.6,
          color: '#ffffff',
          fillColor: colorOf(z.category),
          fillOpacity: 0.42,
        });
        r.bindTooltip(`${z.place}: AQI ${z.aqi} ${z.category} (estimate)`, { sticky: true });
        r.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          select.current({ kind: 'zone', id: z.id });
        });
        g.addLayer(r);
      }
      return g;
    }, zones);
  }, [visible.zones, zones, base]);

  // verified stations: coloured by their last AQI category, an Outdated ring when the reading is not current
  useEffect(() => {
    sync('stations', visible.stations, () => {
      const g = L.layerGroup();
      for (const s of stations) {
        const col = s.aqi ? colorOf(s.aqi.category) : UNKNOWN_COLOR;
        if (s.status === 'outdated') {
          g.addLayer(L.circleMarker([s.lat, s.lon], { renderer: canvasRef.current ?? undefined, radius: 15, color: '#7a2a2a', weight: 2, dashArray: '4 4', fill: false, interactive: false }));
        }
        const manual = s.monitoring === 'manual';
        // manual (NAMP) stations are diamonds marked M; continuous (CAAQMS) stations are circles
        const m = manual
          ? L.marker([s.lat, s.lon], {
              keyboard: true,
              title: `${s.name} (manual)`,
              icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div style="width:16px;height:16px;margin:3px;transform:rotate(45deg);background:${col};border:2px solid #1c0a10;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div><div style="position:absolute;inset:0;font:700 10px/22px system-ui;text-align:center;color:#1c0a10">M</div>` }),
            })
          : L.circleMarker([s.lat, s.lon], { renderer: canvasRef.current ?? undefined, radius: 9, color: '#1c0a10', weight: 2, fillColor: col, fillOpacity: 1 });
        m.bindTooltip(`${s.name}${manual ? ' (manual)' : ''}: ${s.status === 'live' ? 'measured' : s.status === 'outdated' ? 'OUTDATED reading' : 'no current reading'}`, { sticky: true });
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          select.current({ kind: 'station', id: s.id });
        });
        g.addLayer(m);
      }
      return g;
    }, stations);
  }, [visible.stations, stations]);

  // top hotspots (numbered)
  useEffect(() => {
    sync('hotspots', visible.hotspots, () => {
      const g = L.layerGroup();
      hotspots.slice(0, 5).forEach((h, i) => {
        const icon = L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="width:30px;height:30px;border-radius:50%;background:${colorOf(h.category)};border:3px solid #1c0a10;color:${h.category === 'Moderate' || h.category === 'Satisfactory' || h.category === 'Good' ? '#1c0a10' : '#fff'};font:700 13px/24px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">${i + 1}</div>`,
        });
        const m = L.marker([h.location[1], h.location[0]], { icon, keyboard: true, title: `Hotspot ${i + 1}: ${h.name}` });
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          select.current({ kind: 'hotspot', id: h.id });
        });
        g.addLayer(m);
      });
      return g;
    }, hotspots);
  }, [visible.hotspots, hotspots]);

  // MIDC estates (only when the drop-in dataset is loaded)
  useEffect(() => {
    sync('midc', visible.midc && !!industry, () => {
      if (!industry) return null;
      const g = L.layerGroup();
      for (const a of industry.areas) {
        for (const r of a.rings) {
          const p = L.polygon(ring(simplify ? simplifyRing(r, 60) : r), { renderer: canvasRef.current ?? undefined, color: '#7a4a1a', weight: 1.5, fillColor: '#c28a3a', fillOpacity: 0.3 });
          p.bindTooltip(`${a.name} (MIDC estate)`, { sticky: true });
          p.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            select.current({ kind: 'midc', id: String(a.code) });
          });
          g.addLayer(p);
        }
      }
      return g;
    }, [industry, simplify]);
  }, [visible.midc, industry, simplify]);

  // industry markers, clustered
  useEffect(() => {
    sync('industry', visible.industry, () => {
      const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true });
      const icon = L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div style="width:14px;height:14px;background:#6b4a2a;border:2px solid #fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>' });
      for (const i of base.industries) {
        cluster.addLayer(L.marker([i.location[1], i.location[0]], { icon, title: i.name }).bindTooltip(`${i.name} (${i.category}, mapped in OpenStreetMap)`));
      }
      for (const s of industry?.sites ?? []) {
        cluster.addLayer(L.marker([s.location[1], s.location[0]], { icon, title: s.name }).bindTooltip(`${s.name} (${s.kind}, candidate site)`));
      }
      return cluster;
    }, [base.industries, industry]);
  }, [visible.industry, base.industries, industry]);

  // coverage gaps: hatched where no station with a data feed lies within the radius
  useEffect(() => {
    sync('coverage', visible.coverage && !!coverage && !coverage.disabledReason, () => {
      const map = mapRef.current;
      if (!map || !coverage) return null;
      if (!svgRef.current) {
        const svg = L.svg({ padding: 0.3 });
        svg.addTo(map);
        const root = (svg as unknown as { _container?: SVGSVGElement })._container;
        if (root && !root.querySelector('#gov-hatch')) {
          const ns = 'http://www.w3.org/2000/svg';
          const defs = document.createElementNS(ns, 'defs');
          defs.innerHTML = '<pattern id="gov-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(255,255,255,0.35)"/><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(122,42,42,0.75)" stroke-width="3"/></pattern>';
          root.prepend(defs);
        }
        svgRef.current = svg;
      }
      const g = L.layerGroup();
      for (const c of coverage.gaps) {
        const r = L.rectangle([[c.bounds.south, c.bounds.west], [c.bounds.north, c.bounds.east]], {
          renderer: svgRef.current ?? undefined,
          className: 'gov-gap',
          color: '#7a2a2a',
          weight: 0.8,
          fillColor: 'url(#gov-hatch)',
          fillOpacity: 1,
        });
        r.bindTooltip(`No station with a data feed within ${coverage.radiusKm} km${c.nearest ? ` (nearest: ${c.nearest.name}, ${c.nearest.km.toFixed(1)} km)` : ''}`, { sticky: true });
        r.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          select.current({ kind: 'gap', id: c.id });
        });
        g.addLayer(r);
      }
      return g;
    }, coverage);
  }, [visible.coverage, coverage]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo([focus.lat, focus.lon], 14, { duration: 0.8 });
  }, [focus]);

  // "You are here"
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    const g = L.layerGroup();
    g.addLayer(L.circle([me.lat, me.lon], { radius: Math.min(me.accuracy, 2000), color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.12, interactive: false }));
    g.addLayer(L.circleMarker([me.lat, me.lon], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }));
    g.addTo(map);
    return () => {
      g.remove();
    };
  }, [me]);

  return <div ref={el} className="absolute inset-0 isolate bg-[#f3efe6]" aria-label="Map of Pune and Pimpri-Chinchwad" role="application" />;
}
