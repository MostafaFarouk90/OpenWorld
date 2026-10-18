import * as THREE from 'three';

/** A replacement for the plain render call (bloom composer, thread 7). */
export interface PostPass {
  render(): void;
  /** CSS pixels; called when the pass is installed and on every canvas resize. */
  setSize?(width: number, height: number): void;
  /** The renderer's pixel ratio; called when the pass is installed and whenever the render scale changes. */
  setPixelRatio?(ratio: number): void;
}

export type ShadowMode = 'off' | 'half' | 'full';

/** Quality knobs for the three-step toggle (contracts/vfx-and-feedback.md section 4). */
export interface GraphicsService {
  /** The scene's renderer, for building a post pass (an EffectComposer). Do not resize it or render with it yourself. */
  readonly renderer: THREE.WebGLRenderer;
  readonly renderScale: number;
  readonly shadows: ShadowMode;
  readonly viewDistanceOffset: number;
  readonly postPass: PostPass | null;
  /** 0.5 to 1 of the device pixel ratio (capped at 2). */
  setRenderScale(scale: number): void;
  /** Shadow map 1024 (half) or 2048 (full) covering `distanceM` around the player; off disables the sun's shadow. */
  setShadows(mode: ShadowMode, distanceM?: number): void;
  /** Metres added to (or taken from) the fog and camera far plane; terrain LOD is not affected yet. */
  setViewDistanceOffset(metres: number): void;
  /** Installs the pass and immediately forwards the current size and pixel ratio to it. */
  setPostPass(pass: PostPass | null): void;
}

export interface GraphicsDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  /** Base view distance (fog end) in metres. */
  viewDistance: number;
  devicePixelRatio?: () => number;
  warn?: (message: string) => void;
}

const MIN_VIEW = 200;

export class Graphics implements GraphicsService {
  private _renderScale = 1;
  private _shadows: ShadowMode = 'full';
  private _offset = 0;
  private _pass: PostPass | null = null;
  private readonly warn: (message: string) => void;

  constructor(private readonly deps: GraphicsDeps) {
    this.warn = deps.warn ?? ((m) => console.warn(m));
  }

  get renderer(): THREE.WebGLRenderer {
    return this.deps.renderer;
  }

  get renderScale(): number {
    return this._renderScale;
  }

  get shadows(): ShadowMode {
    return this._shadows;
  }

  get viewDistanceOffset(): number {
    return this._offset;
  }

  get postPass(): PostPass | null {
    return this._pass;
  }

  setRenderScale(scale: number): void {
    if (!Number.isFinite(scale)) return this.warn(`Graphics: invalid render scale ${scale}`);
    this._renderScale = Math.min(1, Math.max(0.5, scale));
    const dpr = this.deps.devicePixelRatio?.() ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio);
    this.deps.renderer.setPixelRatio(Math.min(dpr, 2) * this._renderScale);
    this.forward((p) => p.setPixelRatio?.(this.deps.renderer.getPixelRatio()));
  }

  /** The scene loop calls this after the renderer was resized; forwards the new size to the post pass. */
  resize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) return;
    this.forward((p) => p.setSize?.(width, height));
  }

  setShadows(mode: ShadowMode, distanceM?: number): void {
    if (mode !== 'off' && mode !== 'half' && mode !== 'full') return this.warn(`Graphics: unknown shadow mode ${String(mode)}`);
    const sun = this.deps.sun;
    this._shadows = mode;
    sun.castShadow = mode !== 'off';
    if (mode === 'off') return;
    const size = mode === 'half' ? 1024 : 2048;
    const half = Number.isFinite(distanceM) && distanceM! > 0 ? distanceM! : mode === 'half' ? 20 : 40;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; // rebuilt at the new size on the next render
    }
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
  }

  setViewDistanceOffset(metres: number): void {
    if (!Number.isFinite(metres)) return this.warn(`Graphics: invalid view distance offset ${metres}`);
    this._offset = metres;
    const view = Math.max(MIN_VIEW, this.deps.viewDistance + metres);
    const fog = this.deps.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = view * 0.15;
      fog.far = view * 0.95;
    }
    this.deps.camera.far = view * 1.05;
    this.deps.camera.updateProjectionMatrix();
  }

  setPostPass(pass: PostPass | null): void {
    this._pass = pass;
    if (!pass) return;
    const size = this.deps.renderer.getSize(new THREE.Vector2());
    this.forward((p) => p.setPixelRatio?.(this.deps.renderer.getPixelRatio()));
    if (size.x > 0 && size.y > 0) this.forward((p) => p.setSize?.(size.x, size.y));
  }

  /** Calls into the pass; a throwing pass is removed so the plain render takes over. */
  private forward(call: (pass: PostPass) => void): void {
    if (!this._pass) return;
    try {
      call(this._pass);
    } catch (err) {
      this.warn(`Graphics: post pass failed, removed (${err instanceof Error ? err.message : String(err)})`);
      this._pass = null;
    }
  }

  /** Draws the frame through the post pass when one is set. A failing pass falls back to a plain render. */
  render(): void {
    if (this._pass) {
      try {
        this._pass.render();
        return;
      } catch (err) {
        this.warn(`Graphics: post pass failed, removed (${err instanceof Error ? err.message : String(err)})`);
        this._pass = null;
      }
    }
    this.deps.renderer.render(this.deps.scene, this.deps.camera);
  }
}
