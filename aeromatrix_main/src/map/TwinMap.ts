import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  HeadingPitchRange,
  ImageryLayer,
  Material,
  Math as CesiumMath,
  Matrix4,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium';
import type { BaseState, CellState, Pollutant } from '../types';
import { createTerrariumTerrain } from './terrariumTerrain';
import { renderGridCanvas, renderHeatmapCanvas, renderSelectionCanvas } from './layers/heatmapCanvas';
import { PUNE } from '../data/geojson/puneDemoGeometry';

export interface CursorInfo {
  lon: number;
  lat: number;
  elevation: number | null;
}

export interface TwinMapCallbacks {
  onCellClick: (lon: number, lat: number) => void;
  onCursor: (info: CursorInfo | null) => void;
  onStatus: (status: 'loading' | 'ready' | 'error', message?: string) => void;
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
  private heatLayer: ImageryLayer | null = null;
  private gridLayer: ImageryLayer | null = null;
  private selectLayer: ImageryLayer | null = null;
  private esriLayer: ImageryLayer | null = null;
  private heatToken = 0;
  private gridToken = 0;
  private selectToken = 0;
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

  constructor(
    container: HTMLElement,
    private cb: TwinMapCallbacks,
  ) {
    cb.onStatus('loading');
    this.viewer = new Viewer(container, {
      baseLayer: false,
      terrainProvider: createTerrariumTerrain(),
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

    this.addBaseImagery();
    this.resetView(true);

    camera.percentageChanged = 0.01;
    camera.changed.addEventListener(this.updateFade);
    camera.moveEnd.addEventListener(this.updateFade);

    this.handler = new ScreenSpaceEventHandler(scene.canvas);
    this.handler.setInputAction((e: { position: Cartesian2 }) => {
      const p = this.pick(e.position);
      if (p) this.cb.onCellClick(p.lon, p.lat);
    }, ScreenSpaceEventType.LEFT_CLICK);
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

  private addBaseImagery() {
    const layers = this.viewer.imageryLayers;
    // CARTO dark matter is the fallback underneath; Esri satellite sits on top.
    const carto = new UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      maximumLevel: 18,
      credit: new Credit('Basemap: (c) CARTO, (c) OpenStreetMap contributors', true),
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
      if (errors >= 10 && this.esriLayer) this.esriLayer.show = false;
    });
    // Probe one tile so an unreachable satellite service falls back to CARTO right away.
    const probe = new Image();
    probe.onerror = () => {
      if (this.esriLayer) this.esriLayer.show = false;
    };
    probe.src = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/114/179';
  }

  private pick(pos: Cartesian2): { lon: number; lat: number; elevation: number | null } | null {
    if (this.destroyed) return null;
    const { scene, camera } = this.viewer;
    const ray = camera.getPickRay(pos);
    if (!ray) return null;
    const hit = scene.globe.pick(ray, scene);
    if (!hit) return null;
    const c = Cartographic.fromCartesian(hit);
    return {
      lon: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      elevation: Number.isFinite(c.height) ? c.height : null,
    };
  }

  /** Overlays fade with altitude so the city stays readable up close. */
  private updateFade = () => {
    if (this.destroyed) return;
    const h = this.viewer.camera.positionCartographic.height;
    const t = smoothstep(600, 9000, h);
    if (this.heatLayer) this.heatLayer.alpha = lerp(0.16, 0.66, t);
    if (this.gridLayer) this.gridLayer.alpha = lerp(0.3, 0.75, t);
  };

  private async swapLayer(
    canvas: HTMLCanvasElement,
    current: ImageryLayer | null,
    isStale: () => boolean,
  ): Promise<ImageryLayer | null> {
    const provider = await SingleTileImageryProvider.fromUrl(canvas.toDataURL('image/png'), {
      rectangle: this.rectangle,
    });
    if (this.destroyed || isStale()) return current;
    const layer = new ImageryLayer(provider, { alpha: 0.6 });
    this.viewer.imageryLayers.add(layer);
    if (current) this.viewer.imageryLayers.remove(current, true);
    return layer;
  }

  private raiseOverlays() {
    const layers = this.viewer.imageryLayers;
    if (this.gridLayer) layers.raiseToTop(this.gridLayer);
    if (this.selectLayer) layers.raiseToTop(this.selectLayer);
  }

  async setHeatmap(base: BaseState, states: CellState[], pollutant: Pollutant) {
    const token = ++this.heatToken;
    const canvas = renderHeatmapCanvas(base, states, pollutant, 512);
    try {
      this.heatLayer = await this.swapLayer(canvas, this.heatLayer, () => token !== this.heatToken);
      this.raiseOverlays();
      this.updateFade();
    } catch (e) {
      this.cb.onStatus('error', e instanceof Error ? e.message : 'Could not draw the heatmap.');
    }
  }

  async setGrid(base: BaseState) {
    if (base.gridSize === this.lastGridSize && this.gridLayer) return;
    this.lastGridSize = base.gridSize;
    const token = ++this.gridToken;
    const canvas = renderGridCanvas(base.gridSize, 1024);
    try {
      this.gridLayer = await this.swapLayer(canvas, this.gridLayer, () => token !== this.gridToken);
      this.raiseOverlays();
      this.updateFade();
    } catch {
      /* grid outline is cosmetic; the heatmap and selection still work */
    }
  }

  async setSelection(base: BaseState | null, cellId: string | null) {
    const token = ++this.selectToken;
    if (!base || !cellId) {
      if (this.selectLayer) {
        this.viewer.imageryLayers.remove(this.selectLayer, true);
        this.selectLayer = null;
      }
      return;
    }
    const cell = base.cells.find((c) => c.id === cellId);
    if (!cell) return;
    const canvas = renderSelectionCanvas(base.gridSize, cell.row, cell.col, 1024);
    try {
      this.selectLayer = await this.swapLayer(canvas, this.selectLayer, () => token !== this.selectToken);
      if (this.selectLayer) this.selectLayer.alpha = 1;
      this.raiseOverlays();
    } catch {
      /* highlight is cosmetic */
    }
  }

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

  get isTinted() {
    return this.tinted;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.cursorFrame);
    this.viewer.scene.canvas.removeEventListener('mouseleave', this.onLeave);
    this.handler.destroy();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}
