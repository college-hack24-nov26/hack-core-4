import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  DistanceDisplayCondition,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import type { BaseState, CandidateLocation, CellState, Industry, IndustryCategory, ScenarioParams } from '../../types';
import { RISK_COLOR } from '../../utils/colors';
import { PUNE_LOCALITIES } from '../../data/geojson/puneLocalities';

const CATEGORY_COLOR: Record<IndustryCategory, string> = {
  Manufacturing: '#d19a2a',
  Chemical: '#a855f7',
  Power: '#ef4444',
  Metal: '#64748b',
  Processing: '#2fae8b',
};
const CATEGORY_GLYPH: Record<IndustryCategory, string> = {
  Manufacturing: 'M',
  Chemical: 'C',
  Power: 'P',
  Metal: 'Mt',
  Processing: 'Pr',
};

const iconCache = new Map<string, string>();

function industryIcon(category: IndustryCategory, intensity: number, state: 'base' | 'added' | 'removed', selected: boolean) {
  const bucket = Math.round(intensity / 10);
  const key = `${category}|${bucket}|${state}|${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const s = 72;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const cx = s / 2;
  ctx.globalAlpha = state === 'removed' ? 0.45 : 1;
  // intensity ring
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(28,10,16,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cx, 29, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = state === 'removed' ? '#94a3b8' : '#fbf5e9';
  ctx.beginPath();
  ctx.arc(cx, cx, 29, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, intensity)) / 100);
  ctx.stroke();
  // body
  ctx.fillStyle = state === 'removed' ? '#64748b' : CATEGORY_COLOR[category];
  ctx.beginPath();
  if (state === 'added') {
    ctx.moveTo(cx, cx - 21);
    ctx.lineTo(cx + 21, cx);
    ctx.lineTo(cx, cx + 21);
    ctx.lineTo(cx - 21, cx);
    ctx.closePath();
  } else {
    ctx.arc(cx, cx, 20, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.lineWidth = selected ? 5 : 2.5;
  ctx.strokeStyle = selected ? '#a3263f' : '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state === 'added' ? '+' : CATEGORY_GLYPH[category], cx, cx + 1);
  if (state === 'removed') {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cx + 24);
    ctx.lineTo(cx + 24, cx - 24);
    ctx.stroke();
  }
  const url = c.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}

function letterIcon(letter: string, selected: boolean): string {
  const key = `cand|${letter}|${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const s = 72;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(36, 68);
  ctx.bezierCurveTo(4, 40, 10, 8, 36, 8);
  ctx.bezierCurveTo(62, 8, 68, 40, 36, 68);
  ctx.fill();
  ctx.lineWidth = selected ? 5 : 3;
  ctx.strokeStyle = selected ? '#a3263f' : '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 36, 33);
  const url = c.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}

const NO_DEPTH = Number.POSITIVE_INFINITY;

/** Industry markers: category colour, intensity ring; scenario-added are diamonds, removed are struck through. */
export class IndustryLayer {
  readonly ds = new CustomDataSource('industries');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
  }

  setData(base: BaseState, params: ScenarioParams, selectedId: string | null) {
    const removed = new Set(params.removedIndustryIds);
    this.ds.entities.suspendEvents();
    this.ds.entities.removeAll();
    const add = (i: Industry, state: 'base' | 'added' | 'removed') => {
      const intensity = params.industryIntensityOverrides[i.id] ?? i.emissionIntensity;
      this.ds.entities.add({
        id: `ind:${i.id}`,
        position: Cartesian3.fromDegrees(i.location[0], i.location[1]),
        billboard: {
          image: industryIcon(i.category, intensity, state, selectedId === i.id),
          width: 36,
          height: 36,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: NO_DEPTH,
          scaleByDistance: new NearFarScalar(1500, 1.15, 40000, 0.6),
        },
        label: {
          text: i.name,
          font: '600 12px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString('#1c0a10'),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.TOP,
          pixelOffset: new Cartesian2(0, 22),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: NO_DEPTH,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 7000),
        },
      });
    };
    for (const i of base.industries) add(i, removed.has(i.id) ? 'removed' : 'base');
    for (const i of params.addedIndustries) add(i, 'added');
    this.ds.entities.resumeEvents();
  }

  setVisible(v: boolean) {
    this.ds.show = v;
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
  }
}

/** Candidate-site markers A..E. */
export class CandidateLayer {
  readonly ds = new CustomDataSource('candidates');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
  }

  setData(list: CandidateLocation[], selectedId: string | null) {
    this.ds.entities.suspendEvents();
    this.ds.entities.removeAll();
    for (const c of list) {
      this.ds.entities.add({
        id: `cand:${c.id}`,
        position: Cartesian3.fromDegrees(c.location[0], c.location[1]),
        billboard: {
          image: letterIcon(c.id, selectedId === c.id),
          width: 38,
          height: 38,
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: NO_DEPTH,
          scaleByDistance: new NearFarScalar(1500, 1.15, 40000, 0.65),
        },
      });
    }
    this.ds.entities.resumeEvents();
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
  }
}

/** Extruded risk columns: one per grid cell, coloured by PM2.5 risk, height from PM2.5. */
export class RiskColumns {
  readonly ds = new CustomDataSource('risk');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
    this.ds.show = false;
  }

  setData(base: BaseState, states: CellState[]) {
    const byId = new Map(states.map((s) => [s.cellId, s]));
    this.ds.entities.suspendEvents();
    this.ds.entities.removeAll();
    for (const c of base.cells) {
      const s = byId.get(c.id);
      if (!s) continue;
      const { west, south, east, north } = c.bounds;
      const mx = (east - west) * 0.07;
      const my = (north - south) * 0.07;
      const col = Color.fromCssColorString(RISK_COLOR[s.risk]).withAlpha(0.62);
      this.ds.entities.add({
        id: `risk:${c.id}`,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray([
            west + mx, south + my,
            east - mx, south + my,
            east - mx, north - my,
            west + mx, north - my,
          ]),
          material: col,
          height: 0,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
          extrudedHeight: 120 + Math.min(1.2, s.pm25 / 120) * 1500,
          extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
          outline: false,
        },
      });
    }
    this.ds.entities.resumeEvents();
  }

  setVisible(v: boolean) {
    this.ds.show = v;
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
  }
}

/** Locality names (labels) and small place markers (places). */
export class PlaceLayers {
  readonly labels = new CustomDataSource('labels');
  readonly places = new CustomDataSource('places');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.labels);
    void viewer.dataSources.add(this.places);
    for (const p of PUNE_LOCALITIES) {
      const position = Cartesian3.fromDegrees(p.center[0], p.center[1]);
      this.labels.entities.add({
        id: `label:${p.name}`,
        position,
        label: {
          text: p.name,
          font: '600 13px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString('#1c0a10'),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: NO_DEPTH,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 30000),
          scaleByDistance: new NearFarScalar(2000, 1.1, 30000, 0.75),
        },
      });
      this.places.entities.add({
        id: `place:${p.name}`,
        position,
        point: {
          pixelSize: 8,
          color: Color.fromCssColorString('#fbf5e9'),
          outlineColor: Color.fromCssColorString('#a3263f'),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: NO_DEPTH,
        },
      });
    }
    this.places.show = false;
  }

  destroy() {
    if (this.viewer.isDestroyed()) return;
    this.viewer.dataSources.remove(this.labels, true);
    this.viewer.dataSources.remove(this.places, true);
  }
}

// ---- V3: monitoring stations and mapped industry sites ----

export interface StationStyle {
  /** CPCB category colour of the last AQI, or grey when the station has no reading */
  color: string;
}

const stationIconCache = new Map<string, string>();

function stationIcon(color: string, selected: boolean, outdated: boolean): string {
  const key = `${color}|${selected}|${outdated}`;
  const hit = stationIconCache.get(key);
  if (hit) return hit;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(32, 32, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = selected ? 6 : 4;
  ctx.strokeStyle = selected ? '#a3263f' : '#ffffff';
  ctx.stroke();
  // inner antenna mark: a monitoring station
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(30, 20, 4, 24);
  ctx.beginPath();
  ctx.arc(32, 20, 5, 0, Math.PI * 2);
  ctx.fill();
  if (outdated) {
    // a clock tick on the rim marks "Outdated"
    ctx.strokeStyle = '#1c0a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 27, -Math.PI / 2, 0);
    ctx.stroke();
  }
  const url = c.toDataURL('image/png');
  stationIconCache.set(key, url);
  return url;
}

export class StationLayer {
  readonly ds = new CustomDataSource('stations');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
  }

  /** Only stations that have a sourced coordinate are drawn. */
  setData(
    stations: Array<{ id: string; name: string; lat: number | null; lon: number | null }>,
    style: Record<string, StationStyle & { outdated: boolean }>,
    selectedId: string | null,
  ) {
    this.ds.entities.suspendEvents();
    this.ds.entities.removeAll();
    for (const s of stations) {
      if (s.lat === null || s.lon === null) continue;
      const st = style[s.id] ?? { color: '#9aa0a6', outdated: false };
      this.ds.entities.add({
        // Imported-observation markers (obsmark:) are display only: they are not selectable stations.
        id: s.id.startsWith('obsmark:') ? s.id : `stn:${s.id}`,
        position: Cartesian3.fromDegrees(s.lon, s.lat),
        billboard: {
          image: stationIcon(st.color, selectedId === s.id, st.outdated),
          width: 34,
          height: 34,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(1500, 1.15, 40000, 0.65),
        },
        label: {
          text: s.name,
          font: '600 12px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString('#1c0a10'),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.TOP,
          pixelOffset: new Cartesian2(0, 20),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 9000),
        },
      });
    }
    this.ds.entities.resumeEvents();
  }

  setVisible(v: boolean) {
    this.ds.show = v;
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
  }
}

/** Mapped OSM industry points (candidate sites, not a verified factory list). */
export class IndustrySiteLayer {
  readonly ds = new CustomDataSource('industry-sites');

  constructor(private viewer: Viewer) {
    void viewer.dataSources.add(this.ds);
    this.ds.show = false;
  }

  setData(sites: Array<{ id: string; name: string; location: [number, number]; midcCode: number | null }>, selectedId: string | null) {
    this.ds.entities.suspendEvents();
    this.ds.entities.removeAll();
    for (const s of sites) {
      this.ds.entities.add({
        id: `site:${s.id}`,
        position: Cartesian3.fromDegrees(s.location[0], s.location[1]),
        point: {
          pixelSize: selectedId === s.id ? 13 : 8,
          color: Color.fromCssColorString(s.midcCode !== null ? '#d19a2a' : '#8a6a68'),
          outlineColor: Color.fromCssColorString(selectedId === s.id ? '#a3263f' : '#fbf5e9'),
          outlineWidth: selectedId === s.id ? 3 : 1.5,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    this.ds.entities.resumeEvents();
  }

  setVisible(v: boolean) {
    this.ds.show = v;
  }

  destroy() {
    if (!this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
  }
}
