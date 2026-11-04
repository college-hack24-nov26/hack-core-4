import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BaseState } from '../../types';
import { UNKNOWN_COLOR, colorOf } from '../lib/airdata';
import type { StationRow } from '../lib/stations';

export interface Map2DProps {
  base: BaseState;
  stations: StationRow[];
  focus: { lon: number; lat: number; nonce: number } | null;
  /** the device position, when the user asked for it (never stored or sent anywhere) */
  me: { lon: number; lat: number; accuracy: number } | null;
  onSelectStation: (id: string | null) => void;
}

const PUNE: L.LatLngExpression = [18.55, 73.85];

/**
 * The map: satellite imagery with place names, and the monitoring stations as AQI-number markers (circles for continuous
 * stations, diamonds marked M for manual ones; a dashed ring means the reading is outdated).
 */
export function Map2D({ base, stations, focus, me, onSelectStation }: Map2DProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelectStation);
  select.current = onSelectStation;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: 'Basemap: Esri, HERE, Garmin, OpenStreetMap contributors',
    }).addTo(map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 18,
      className: 'gov-satellite',
      attribution: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    }).addTo(map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 18,
      pane: 'shadowPane',
    }).addTo(map);
    const b = base.city.bbox;
    map.fitBounds([[b.south, b.west], [b.north, b.east]]);
    if (!map.getBounds().isValid()) map.setView(PUNE, 11);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const t = setTimeout(() => map.invalidateSize(), 50);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el.current);
    map.on('click', () => select.current(null));
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // The map is created once; stations follow the data below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = layerRef.current;
    if (!g) return;
    g.clearLayers();
    for (const s of stations) {
      const cat = s.aqi?.category ?? s.estimate?.category;
      const col = cat ? colorOf(cat) : UNKNOWN_COLOR;
      const value = s.aqi ? Math.round(s.aqi.value) : s.estimate ? Math.round(s.estimate.aqi) : '–';
      const light = ['Poor', 'Very Poor', 'Severe'].includes(cat ?? '');
      const ring = s.status === 'outdated' ? 'outline:2px dashed #7a2a2a;outline-offset:3px;' : '';
      const manual = s.monitoring === 'manual';
      const html = manual
        ? `<div style="width:30px;height:30px;transform:rotate(45deg);background:${col};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);${ring}"></div><div style="position:absolute;inset:0;font:700 11px/30px system-ui;text-align:center;color:${light ? '#fff' : '#1c0a10'}">${value}</div>`
        : `<div style="width:34px;height:34px;border-radius:50%;background:${col};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);color:${light ? '#fff' : '#1c0a10'};font:700 12px/28px system-ui;text-align:center;${ring}">${value}</div>`;
      const m = L.marker([s.lat, s.lon], {
        keyboard: true,
        title: `${s.name}${manual ? ' (manual)' : ''}`,
        icon: L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html }),
      });
      m.bindTooltip(s.name, { direction: 'top', offset: [0, -14] });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        select.current(s.id);
      });
      g.addLayer(m);
    }
  }, [stations]);

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

  return <div ref={el} className="absolute inset-0 isolate bg-[#e8ecef]" aria-label="Map of Pune and Pimpri-Chinchwad" role="application" />;
}
