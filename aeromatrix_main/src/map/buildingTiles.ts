import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import {
  Cartesian3,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  Rectangle,
  type Viewer,
} from 'cesium';
import { PUNE } from '../data/geojson/puneDemoGeometry';

/**
 * OSM 3D building blocks from open vector tiles (OpenFreeMap, OpenMapTiles schema, layer "building").
 * Tiles are loaded only around the current view and only when the camera is low enough.
 */
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const ZOOM = 14;
const MAX_VIEW_TILES = 12;
const MAX_FEATURES_PER_TILE = 3500;
const MAX_CAMERA_HEIGHT = 7000;
export const BUILDINGS_ATTRIBUTION = 'Buildings: (c) OpenStreetMap contributors via OpenFreeMap / OpenMapTiles';

const lonToTileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const tileToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

type Ring = number[][];

export class BuildingTiles {
  private tiles = new Map<string, Primitive | 'loading' | 'empty'>();
  private visible = false;
  private template: Promise<string> | null = null;
  private destroyed = false;

  constructor(
    private viewer: Viewer,
    private onStatus: (message: string | null) => void,
  ) {
    viewer.camera.moveEnd.addEventListener(this.refresh);
  }

  setVisible(v: boolean) {
    this.visible = v;
    for (const t of this.tiles.values()) if (typeof t !== 'string') t.show = v;
    if (v) this.refresh();
    else this.onStatus(null);
  }

  private resolveTemplate(): Promise<string> {
    if (!this.template) {
      this.template = fetch(TILEJSON_URL)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ tiles?: string[] }>;
        })
        .then((j) => {
          const t = j.tiles?.[0];
          if (!t) throw new Error('no tile template');
          return t;
        });
      this.template.catch(() => {
        this.template = null;
      });
    }
    return this.template;
  }

  refresh = () => {
    if (!this.visible || this.destroyed) return;
    const { camera } = this.viewer;
    const height = camera.positionCartographic.height;
    if (height > MAX_CAMERA_HEIGHT) {
      this.onStatus('Zoom in closer to load 3D buildings.');
      return;
    }
    const city = Rectangle.fromDegrees(PUNE.bbox.west, PUNE.bbox.south, PUNE.bbox.east, PUNE.bbox.north);
    let view = camera.computeViewRectangle();
    if (!view) {
      const p = camera.positionCartographic;
      view = new Rectangle(p.longitude - 0.01, p.latitude - 0.01, p.longitude + 0.01, p.latitude + 0.01);
    }
    const r = Rectangle.intersection(view, city);
    if (!r) {
      this.onStatus('No buildings in view (outside the Pune analysis area).');
      return;
    }
    const west = CesiumMath.toDegrees(r.west);
    const east = CesiumMath.toDegrees(r.east);
    const south = CesiumMath.toDegrees(r.south);
    const north = CesiumMath.toDegrees(r.north);
    const x0 = lonToTileX(west, ZOOM);
    const x1 = lonToTileX(east, ZOOM);
    const y0 = latToTileY(north, ZOOM);
    const y1 = latToTileY(south, ZOOM);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > MAX_VIEW_TILES) {
      this.onStatus('Zoom in closer to load 3D buildings.');
      return;
    }
    this.onStatus(null);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) void this.loadTile(x, y);
    }
  };

  private async loadTile(x: number, y: number) {
    const key = `${ZOOM}/${x}/${y}`;
    if (this.tiles.has(key)) return;
    this.tiles.set(key, 'loading');
    try {
      const template = await this.resolveTemplate();
      const url = template.replace('{z}', String(ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
      const layer = tile.layers.building;
      if (!layer || this.destroyed) {
        this.tiles.set(key, 'empty');
        return;
      }
      const centerLon = (tileToLon(x, ZOOM) + tileToLon(x + 1, ZOOM)) / 2;
      const centerLat = (tileToLat(y, ZOOM) + tileToLat(y + 1, ZOOM)) / 2;
      const ground = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(centerLon, centerLat)) ?? 550;
      const instances: GeometryInstance[] = [];
      const n = Math.min(layer.length, MAX_FEATURES_PER_TILE);
      for (let i = 0; i < n; i++) {
        const f = layer.feature(i);
        const h = Number(f.properties.render_height ?? f.properties.height ?? 8) || 8;
        const gj = f.toGeoJSON(x, y, ZOOM).geometry;
        const polys: Ring[][] =
          gj.type === 'Polygon' ? [gj.coordinates as Ring[]] : gj.type === 'MultiPolygon' ? (gj.coordinates as Ring[][]) : [];
        const shade = Math.min(1, h / 60);
        const color = Color.fromCssColorString('#cdb8a6').brighten(-0.1 * shade, new Color());
        for (const rings of polys) {
          const outer = rings[0];
          if (!outer || outer.length < 4) continue;
          const holes = rings.slice(1).map((ring) => new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flat())));
          instances.push(
            new GeometryInstance({
              geometry: new PolygonGeometry({
                polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(outer.flat()), holes),
                height: ground,
                extrudedHeight: ground + Math.max(3, h),
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
            }),
          );
        }
      }
      if (instances.length === 0 || this.destroyed) {
        this.tiles.set(key, 'empty');
        return;
      }
      const prim = new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true,
      });
      prim.show = this.visible;
      this.viewer.scene.primitives.add(prim);
      this.tiles.set(key, prim);
    } catch (e) {
      this.tiles.delete(key);
      this.onStatus(`3D buildings are unavailable right now (${e instanceof Error ? e.message : 'network error'}).`);
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.viewer.isDestroyed()) return;
    this.viewer.camera.moveEnd.removeEventListener(this.refresh);
    for (const t of this.tiles.values()) if (typeof t !== 'string') this.viewer.scene.primitives.remove(t);
    this.tiles.clear();
  }
}
