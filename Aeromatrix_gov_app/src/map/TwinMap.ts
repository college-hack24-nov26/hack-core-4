import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  ImageryLayer,
  JulianDate,
  KeyboardEventModifier,
  Material,
  Math as CesiumMath,
  Matrix4,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  type Cesium3DTileset,
  type TerrainProvider,
} from 'cesium';
import type { BaseState, CandidateLocation, CellState, Industry, LayerId, Pollutant, Road, ScenarioParams } from '../types';
import { createTerrariumTerrain } from './terrariumTerrain';
import {
  renderGreenCanvas,
  renderGridCanvas,
  renderHeatmapCanvas,
  renderMarkupCanvas,
  renderMidcCanvas,
  renderRoadsCanvas,
  type MarkupSpec,
} from './layers/heatmapCanvas';
import { OverlayLayer } from './layers/overlayLayer';
import {
  CandidateLayer,
  IndustryLayer,
  IndustrySiteLayer,
  PlaceLayers,
  RiskColumns,
  StationLayer,
  type StationStyle,
} from './layers/entityLayers';
import { BuildingTiles } from './buildingTiles';
import { loadPhotoreal } from './photoreal';
import { PUNE } from '../data/geojson/puneDemoGeometry';
import { deltaColor, pollutionColor } from '../utils/colors';

export interface CursorInfo {
  lon: number;
  lat: number;
  elevation: number | null;
}

export interface MapClickEvent {
  lon: number;
  lat: number;
  shift: boolean;
  /** entity id under the cursor (industry / candidate markers), if any */
  pickedId: string | null;
  cameraHeight: number;
}

export interface TwinMapCallbacks {
  onClick: (e: MapClickEvent) => void;
  onCursor: (info: CursorInfo | null) => void;
  onStatus: (status: 'loading' | 'ready' | 'error', message?: string) => void;
  onBuildingsStatus: (message: string | null) => void;
  onPhotoreal: (status: 'loading' | 'ready' | 'error', message?: string) => void;
}

export type HeatSpec =
  | { kind: 'pollution'; pollutant: Pollutant }
  | { kind: 'delta'; pollutant: Pollutant; scale: number };

export interface RoadsSpecInput {
  roads: Road[];
  traffic: boolean;
  closedIds: Set<string>;
  selectedId: string | null;
}

const BASE_ELEVATION = 550;
const EXAGGERATION = 1.8;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Owns the whole Cesium lifecycle. Created once; everything else updates it imperatively. */
export class TwinMap {
  private viewer: Viewer;
  private handler: ScreenSpaceEventHandler;
  private esriLayer: ImageryLayer | null = null;
  private esriBroken = false;
  private terrarium: TerrainProvider;
  private ellipsoid = new EllipsoidTerrainProvider();
  private terrainOn = true;
  private photorealTileset: Cesium3DTileset | null = null;
  private photorealTerrain: TerrainProvider | null = null;
  private photorealOn = false;
  private destroyed = false;
  private tinted = false;
  private cursorFrame = 0;
  private lastGridSize = -1;
  private readonly rectangle = Rectangle.fromDegrees(
    PUNE.bbox.west,
    PUNE.bbox.south,
    PUNE.bbox.east,
    PUNE.bbox.north,
  );

  private heat: OverlayLayer;
  private grid: OverlayLayer;
  private green: OverlayLayer;
  private roads: OverlayLayer;
  private markup: OverlayLayer;
  private midc: OverlayLayer;
  private stations: StationLayer;
  private sites: IndustrySiteLayer;
  private industries: IndustryLayer;
  private candidates: CandidateLayer;
  private risk: RiskColumns;
  private places: PlaceLayers;
  private buildings: BuildingTiles;

  constructor(
    container: HTMLElement,
    private cb: TwinMapCallbacks,
  ) {
    cb.onStatus('loading');
    this.terrarium = createTerrariumTerrain();
    this.viewer = new Viewer(container, {
      baseLayer: false,
      terrainProvider: this.terrarium,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      shouldAnimate: false,
    });

    const { scene, camera } = this.viewer;
    scene.globe.baseColor = Color.fromCssColorString('#1c0a10');
    scene.backgroundColor = Color.fromCssColorString('#1c0a10');
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.enableLighting = false;
    scene.verticalExaggeration = EXAGGERATION;
    scene.verticalExaggerationRelativeHeight = BASE_ELEVATION;
    const ctrl = scene.screenSpaceCameraController;
    ctrl.minimumZoomDistance = 25;
    ctrl.maximumZoomDistance = 120000;
    ctrl.enableCollisionDetection = true;
    // Mid-afternoon sun in Pune for the optional lighting / shadows.
    this.viewer.clock.currentTime = JulianDate.fromIso8601('2026-02-10T09:30:00Z');

    this.addBaseImagery();

    const swap = () => this.restack();
    this.heat = new OverlayLayer(this.viewer, this.rectangle, swap, true, 0.6);
    this.green = new OverlayLayer(this.viewer, this.rectangle, swap, false, 0.5);
    this.roads = new OverlayLayer(this.viewer, this.rectangle, swap, true, 1);
    this.grid = new OverlayLayer(this.viewer, this.rectangle, swap, true, 0.7);
    this.markup = new OverlayLayer(this.viewer, this.rectangle, swap, true, 1);
    this.midc = new OverlayLayer(this.viewer, this.rectangle, swap, false, 0.8);
    this.stations = new StationLayer(this.viewer);
    this.sites = new IndustrySiteLayer(this.viewer);
    this.industries = new IndustryLayer(this.viewer);
    this.candidates = new CandidateLayer(this.viewer);
    this.risk = new RiskColumns(this.viewer);
    this.places = new PlaceLayers(this.viewer);
    this.buildings = new BuildingTiles(this.viewer, (m) => cb.onBuildingsStatus(m));

    this.resetView(true);

    camera.percentageChanged = 0.01;
    camera.changed.addEventListener(this.updateFade);
    camera.moveEnd.addEventListener(this.updateFade);

    this.handler = new ScreenSpaceEventHandler(scene.canvas);
    const click = (shift: boolean) => (e: { position: Cartesian2 }) => this.handleClick(e.position, shift);
    this.handler.setInputAction(click(false), ScreenSpaceEventType.LEFT_CLICK);
    this.handler.setInputAction(click(true), ScreenSpaceEventType.LEFT_CLICK, KeyboardEventModifier.SHIFT);
    this.handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      if (this.cursorFrame) return;
      const pos = e.endPosition;
      this.cursorFrame = requestAnimationFrame(() => {
        this.cursorFrame = 0;
        if (this.destroyed) return;
        const p = this.pick(pos);
        this.cb.onCursor(p ? { lon: p.lon, lat: p.lat, elevation: p.elevation } : null);
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);
    scene.canvas.addEventListener('mouseleave', this.onLeave);

    const removeTileListener = scene.globe.tileLoadProgressEvent.addEventListener((n) => {
      if (n === 0 && !this.destroyed) {
        this.cb.onStatus('ready');
        removeTileListener();
      }
    });
    // Never leave the status stuck on "loading" if the network is slow.
    window.setTimeout(() => {
      if (!this.destroyed) this.cb.onStatus('ready');
    }, 12000);
  }

  private onLeave = () => this.cb.onCursor(null);

  private handleClick(pos: Cartesian2, shift: boolean) {
    if (this.destroyed) return;
    const picked = this.viewer.scene.pick(pos) as { id?: { id?: unknown } } | undefined;
    const rawId = picked?.id?.id;
    const pickedId =
      typeof rawId === 'string' && (rawId.startsWith('ind:') || rawId.startsWith('cand:') || rawId.startsWith('stn:') || rawId.startsWith('site:'))
        ? rawId
        : null;
    const p = this.pick(pos);
    if (!p && !pickedId) return;
    this.cb.onClick({
      lon: p?.lon ?? 0,
      lat: p?.lat ?? 0,
      shift,
      pickedId,
      cameraHeight: this.viewer.camera.positionCartographic.height,
    });
  }

  private addBaseImagery() {
    const layers = this.viewer.imageryLayers;
    // Esri street map is the fallback underneath (no key needed); Esri satellite sits on top.
    const carto = new UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 18,
      credit: new Credit('Basemap: Esri, HERE, Garmin, OpenStreetMap contributors', true),
    });
    layers.add(new ImageryLayer(carto));

    const esri = new UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 18,
      credit: new Credit('Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community', true),
    });
    this.esriLayer = new ImageryLayer(esri, { brightness: 0.82, saturation: 0.9 });
    layers.add(this.esriLayer);

    let errors = 0;
    esri.errorEvent.addEventListener(() => {
      errors += 1;
      if (errors >= 10) this.breakEsri();
    });
    // Probe one tile so an unreachable satellite service falls back to CARTO right away.
    const probe = new Image();
    probe.onerror = () => this.breakEsri();
    probe.src = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/114/179';
  }

  private breakEsri() {
    this.esriBroken = true;
    if (this.esriLayer) this.esriLayer.show = false;
  }

  private pick(pos: Cartesian2): { lon: number; lat: number; elevation: number | null } | null {
    if (this.destroyed) return null;
    const { scene, camera } = this.viewer;
    const ray = camera.getPickRay(pos);
    if (!ray) return null;
    const hit = scene.globe.show ? scene.globe.pick(ray, scene) : scene.pickPosition(pos);
    if (!hit) return null;
    const c = Cartographic.fromCartesian(hit);
    return {
      lon: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      elevation: Number.isFinite(c.height) ? c.height : null,
    };
  }

  /** Keep the draped overlays in a fixed order above the base imagery. */
  private restack() {
    if (this.destroyed) return;
    const layers = this.viewer.imageryLayers;
    for (const o of [this.heat, this.green, this.midc, this.roads, this.grid, this.markup]) {
      const l = o.imagery;
      if (l && layers.contains(l)) layers.raiseToTop(l);
    }
    this.updateFade();
  }

  /** Overlays fade with altitude so the city stays readable up close. */
  private updateFade = () => {
    if (this.destroyed) return;
    const h = this.viewer.camera.positionCartographic.height;
    const t = smoothstep(600, 9000, h);
    this.heat.setAlpha(lerp(0.16, 0.66, t));
    this.grid.setAlpha(lerp(0.3, 0.75, t));
    this.green.setAlpha(lerp(0.3, 0.55, t));
  };

  // ---- overlays ----

  /** null values clear the heatmap: there is nothing honest to draw. */
  setHeatmap(base: BaseState, values: number[] | null, spec: HeatSpec) {
    if (values === null) {
      this.heat.set(null);
      return;
    }
    const colorAt =
      spec.kind === 'pollution'
        ? (v: number) => pollutionColor(spec.pollutant, v)
        : (v: number) => deltaColor(v, spec.scale);
    this.heat.set(() => renderHeatmapCanvas(base, values, colorAt, 512));
  }

  setGrid(base: BaseState) {
    if (base.gridSize === this.lastGridSize) return;
    this.lastGridSize = base.gridSize;
    const n = base.gridSize;
    this.grid.set(() => renderGridCanvas(n, 1024));
  }

  setMarkup(spec: MarkupSpec) {
    this.markup.set(() => renderMarkupCanvas(spec, 1024));
  }

  setRoads(input: RoadsSpecInput) {
    this.roads.set(() =>
      renderRoadsCanvas({ ...input, bbox: PUNE.bbox }, 2048),
    );
  }

  setGreen(areas: Array<{ polygon: Array<[number, number]> }>) {
    this.green.set(() => renderGreenCanvas(areas, PUNE.bbox, 2048));
  }

  setStations(
    stations: Array<{ id: string; name: string; lat: number | null; lon: number | null }>,
    style: Record<string, StationStyle & { outdated: boolean }>,
    selectedId: string | null,
  ) {
    this.stations.setData(stations, style, selectedId);
  }

  setMidc(areas: Array<{ code: number; rings: Array<Array<[number, number]>>; analysisArea: string }> | null, selectedCode: number | null) {
    if (!areas) {
      this.midc.set(null);
      return;
    }
    this.midc.set(() => renderMidcCanvas(areas, PUNE.bbox, selectedCode, 2048));
  }

  setSites(sites: Array<{ id: string; name: string; location: [number, number]; midcCode: number | null }>, selectedId: string | null) {
    this.sites.setData(sites, selectedId);
  }

  setIndustries(base: BaseState, params: ScenarioParams, selectedId: string | null) {
    this.industries.setData(base, params, selectedId);
  }

  setCandidates(list: CandidateLocation[], selectedId: string | null) {
    this.candidates.setData(list, selectedId);
  }

  setRisk(base: BaseState, states: CellState[]) {
    this.risk.setData(base, states);
  }

  setLayerVisible(id: LayerId, on: boolean) {
    switch (id) {
      case 'heatmap':
        this.heat.setVisible(on);
        break;
      case 'grid':
        this.grid.setVisible(on);
        break;
      case 'roads':
        this.roads.setVisible(on);
        break;
      case 'green':
        this.green.setVisible(on);
        break;
      case 'industries':
        this.industries.ds.show = on;
        break;
      case 'risk':
        this.risk.setVisible(on);
        break;
      case 'stations':
        this.stations.setVisible(on);
        break;
      case 'midcAreas':
        this.midc.setVisible(on);
        break;
      case 'industrySites':
        this.sites.setVisible(on);
        break;
      case 'labels':
        this.places.labels.show = on;
        break;
      case 'places':
        this.places.places.show = on;
        break;
      case 'buildings':
        this.buildings.setVisible(on);
        break;
      case 'terrain':
        this.terrainOn = on;
        if (!this.photorealOn) this.viewer.terrainProvider = on ? this.terrarium : this.ellipsoid;
        break;
      case 'satellite':
        if (this.esriLayer) this.esriLayer.show = on && !this.esriBroken;
        break;
      case 'elevationTint':
        this.setTint(on);
        break;
      case 'shadows':
        this.setShadows(on);
        break;
      case 'photoreal':
        void this.setPhotoreal(on);
        break;
      case 'traffic':
        break;
    }
  }

  private setShadows(on: boolean) {
    const { scene } = this.viewer;
    scene.globe.enableLighting = on;
    this.viewer.shadows = on;
    scene.globe.shadows = on ? 1 : 0; // ShadowMode.RECEIVE_ONLY keeps terrain from casting onto itself
  }

  private async setPhotoreal(on: boolean) {
    if (this.destroyed) return;
    const overlays = [this.heat, this.green, this.midc, this.roads, this.grid, this.markup];
    if (!on) {
      this.photorealOn = false;
      if (this.photorealTileset) this.photorealTileset.show = false;
      this.viewer.scene.globe.show = true;
      this.viewer.terrainProvider = this.terrainOn ? this.terrarium : this.ellipsoid;
      overlays.forEach((o) => o.setMode('imagery'));
      this.cb.onPhotoreal('ready');
      return;
    }
    this.cb.onPhotoreal('loading');
    try {
      if (!this.photorealTileset) {
        const h = await loadPhotoreal(this.viewer);
        this.photorealTileset = h.tileset;
        this.photorealTerrain = h.terrain;
      }
      if (this.destroyed) return;
      this.photorealTileset.show = true;
      this.photorealOn = true;
      if (this.photorealTerrain) this.viewer.terrainProvider = this.photorealTerrain;
      this.viewer.scene.globe.show = false;
      overlays.forEach((o) => o.setMode('ground'));
      this.cb.onPhotoreal('ready');
    } catch (e) {
      this.photorealOn = false;
      this.cb.onPhotoreal('error', e instanceof Error ? e.message : 'Could not load the photorealistic city.');
    }
  }

  // ---- camera ----

  private lookAt(lon: number, lat: number, range: number, pitchDeg: number, headingDeg: number, instant: boolean) {
    const { camera, scene } = this.viewer;
    const ground = scene.globe.getHeight(Cartographic.fromDegrees(lon, lat)) ?? BASE_ELEVATION;
    const target = new BoundingSphere(Cartesian3.fromDegrees(lon, lat, ground), 1);
    const offset = new HeadingPitchRange(
      CesiumMath.toRadians(headingDeg),
      CesiumMath.toRadians(pitchDeg),
      range,
    );
    if (instant) {
      camera.lookAt(target.center, offset);
      camera.lookAtTransform(Matrix4.IDENTITY);
    } else {
      camera.flyToBoundingSphere(target, { offset, duration: 1.3 });
    }
  }

  resetView(instant = false) {
    this.lookAt(PUNE.center[0], PUNE.center[1], 24000, -42, 0, instant);
  }

  topDown() {
    this.lookAt(PUNE.center[0], PUNE.center[1], 30000, -90, 0, false);
  }

  city3D() {
    this.lookAt(73.855, 18.515, 8500, -30, 18, false);
  }

  flyToCell(base: BaseState, cellId: string) {
    const cell = base.cells.find((c) => c.id === cellId);
    if (!cell) return;
    const widthKm = (cell.bounds.east - cell.bounds.west) * 105;
    this.lookAt(cell.center[0], cell.center[1], Math.max(1400, widthKm * 1500), -48, 0, false);
  }

  flyToLonLat(lon: number, lat: number, range = 4500) {
    this.lookAt(lon, lat, range, -48, 0, false);
  }

  /** Optional elevation tint over the imagery. */
  setTint(on: boolean) {
    if (on === this.tinted) return;
    this.tinted = on;
    const globe = this.viewer.scene.globe;
    if (!on) {
      globe.material = undefined as unknown as Material;
      return;
    }
    const ramp = document.createElement('canvas');
    ramp.width = 128;
    ramp.height = 1;
    const ctx = ramp.getContext('2d');
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(47,174,139,0.50)');
      g.addColorStop(0.35, 'rgba(250,204,21,0.45)');
      g.addColorStop(0.7, 'rgba(201,120,60,0.50)');
      g.addColorStop(1, 'rgba(251,245,233,0.60)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 1);
    }
    globe.material = Material.fromType('ElevationRamp', {
      image: ramp,
      minimumHeight: 480,
      maximumHeight: 1050,
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.cursorFrame);
    this.viewer.scene.canvas.removeEventListener('mouseleave', this.onLeave);
    this.handler.destroy();
    this.buildings.destroy();
    this.industries.destroy();
    this.stations.destroy();
    this.sites.destroy();
    this.candidates.destroy();
    this.risk.destroy();
    this.places.destroy();
    for (const o of [this.heat, this.green, this.midc, this.roads, this.grid, this.markup]) o.destroy();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}

export type { Industry };
