import {
  ClassificationType,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  GroundPrimitive,
  ImageryLayer,
  Material,
  RectangleGeometry,
  SingleTileImageryProvider,
  type Rectangle,
  type Viewer,
} from 'cesium';

export type OverlayMode = 'imagery' | 'ground';

/**
 * A canvas drawn over the city rectangle. Normally an imagery layer draped on terrain; with the photorealistic
 * city it becomes a ground-classification primitive so it also drapes over the 3D tiles.
 * The canvas is built lazily by a factory, only while the layer is visible.
 */
export class OverlayLayer {
  private layer: ImageryLayer | null = null;
  private ground: GroundPrimitive | null = null;
  private factory: (() => HTMLCanvasElement) | null = null;
  private dirty = false;
  private token = 0;
  private destroyed = false;
  private mode: OverlayMode = 'imagery';

  constructor(
    private viewer: Viewer,
    private rectangle: Rectangle,
    private onSwap: () => void,
    private visible = true,
    private alpha = 0.6,
  ) {}

  get imagery(): ImageryLayer | null {
    return this.layer;
  }

  set(factory: (() => HTMLCanvasElement) | null) {
    this.factory = factory;
    this.dirty = true;
    if (this.visible || !factory) void this.render();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (this.layer) this.layer.show = v;
    if (this.ground) this.ground.show = v;
    if (v && this.dirty) void this.render();
  }

  setAlpha(a: number) {
    this.alpha = a;
    if (this.layer) this.layer.alpha = a;
    const mat = this.ground?.appearance?.material;
    if (mat?.uniforms) (mat.uniforms as { color: Color }).color = new Color(1, 1, 1, a);
  }

  setMode(mode: OverlayMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.clear();
    this.dirty = true;
    if (this.visible) void this.render();
  }

  private clear() {
    if (this.layer) {
      this.viewer.imageryLayers.remove(this.layer, true);
      this.layer = null;
    }
    if (this.ground) {
      this.viewer.scene.groundPrimitives.remove(this.ground);
      this.ground = null;
    }
  }

  private async render() {
    if (this.destroyed) return;
    const mine = ++this.token;
    if (!this.factory) {
      this.clear();
      this.dirty = false;
      return;
    }
    const url = this.factory().toDataURL('image/png');
    this.dirty = false;
    try {
      if (this.mode === 'imagery') {
        const provider = await SingleTileImageryProvider.fromUrl(url, { rectangle: this.rectangle });
        if (this.destroyed || mine !== this.token) return;
        const next = new ImageryLayer(provider, { alpha: this.alpha });
        next.show = this.visible;
        this.viewer.imageryLayers.add(next);
        const old = this.layer;
        this.layer = next;
        if (old) this.viewer.imageryLayers.remove(old, true);
      } else {
        const next = new GroundPrimitive({
          geometryInstances: new GeometryInstance({
            geometry: new RectangleGeometry({
              rectangle: this.rectangle,
              vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            }),
          }),
          appearance: new EllipsoidSurfaceAppearance({
            aboveGround: false,
            material: Material.fromType('Image', { image: url, color: new Color(1, 1, 1, this.alpha) }),
          }),
          classificationType: ClassificationType.BOTH,
          asynchronous: false,
        });
        next.show = this.visible;
        if (this.destroyed || mine !== this.token) return;
        this.viewer.scene.groundPrimitives.add(next);
        const old = this.ground;
        this.ground = next;
        if (old) this.viewer.scene.groundPrimitives.remove(old);
      }
      this.onSwap();
    } catch {
      /* overlays are best-effort: the viewer and the other layers keep working */
    }
  }

  destroy() {
    this.destroyed = true;
    if (!this.viewer.isDestroyed()) this.clear();
  }
}
