// N3 heat haze (plans/act5-N3.md 1.5; spike plans/act5-N0-spike.md): a refraction-style pass on flagged meshes. One
// framebuffer copy a frame, taken when the first visible haze card draws (after the opaque pass, so there is no extra scene
// render), then every card samples it with a scrolling noise offset that fades at its bottom and top.
//
// The copy texture matches the bound render target's type and format: half float under the bloom composer (Medium and
// High), unsigned byte on the default framebuffer. A mismatch is a GL error every frame (the spike hit it first).
// Tiers: High and Medium on, Low off (no copy, cards hidden). At most HAZE_MAX_CARDS cards draw, the nearest in view.
import * as THREE from 'three';
import { HAZE_FLAG, HAZE_MAX_CARDS } from '../caldera/lava';
import { HAZE } from '../caldera/lava/tuning';
import type { QualityStep } from '../vfx/tuning';

/** The part of the renderer the pass uses (a fake in tests). */
export interface HazeRenderer {
  getRenderTarget(): { width: number; height: number; texture: { type: THREE.TextureDataType; format: THREE.AnyPixelFormat } } | null;
  getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2;
  copyFramebufferToTexture(texture: THREE.Texture, position?: THREE.Vector2 | null, level?: number): void;
}

export interface HeatHazeService {
  /** Walks `root` once; every mesh with `userData[HAZE_FLAG]` becomes a haze card. Returns the undo. */
  track(root: THREE.Object3D): () => void;
  /** A haze card from a geometry (uv.y 0 at the bottom, 1 at the top), already tracked; add it to the scene yourself. */
  card(geometry: THREE.BufferGeometry): THREE.Mesh;
  readonly enabled: boolean;
  stats(): HazeStats;
}

export interface HazeStats {
  tracked: number;
  drawn: number;
  /** Copies taken in total, and the frame counter. */
  copies: number;
  frame: number;
  /** The copy texture's type (THREE constants), or null before the first copy. */
  textureType: THREE.TextureDataType | null;
  enabled: boolean;
}

declare module '../core/Services' {
  interface GameServices {
    /** N3: provided by the heat-haze plugin (rendering/heatHaze.plugin.ts). */
    heatHaze: HeatHazeService;
  }
}

/** Haze on for High and Medium, off for Low (plan Part 5.2, the spike's tiers). */
export const hazeOnFor = (step: QualityStep): boolean => step !== 'low';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
  varying vec2 vUv; uniform sampler2D uScene; uniform vec2 uRes; uniform float uTime; uniform float uStrength;
  float hzH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hzN(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hzH(i), hzH(i + vec2(1.0, 0.0)), u.x), mix(hzH(i + vec2(0.0, 1.0)), hzH(i + vec2(1.0, 1.0)), u.x), u.y); }
  void main(){
    vec2 suv = gl_FragCoord.xy / uRes;
    float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    vec2 off = vec2(hzN(vUv * vec2(18.0, 6.0) + vec2(0.0, -uTime * 1.6)) - 0.5, hzN(vUv * vec2(14.0, 5.0) + vec2(3.1, -uTime * 2.1)) - 0.5);
    vec3 c = texture2D(uScene, clamp(suv + off * uStrength * fade, 0.0, 1.0)).rgb;
    gl_FragColor = vec4(c, fade);
  }`;

const sphere = new THREE.Sphere();
const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
const camPos = new THREE.Vector3();

export class HeatHaze implements HeatHazeService {
  private readonly cards = new Set<THREE.Mesh>();
  private readonly owned = new Map<THREE.Mesh, { material: THREE.Material | THREE.Material[]; onBeforeRender: THREE.Object3D['onBeforeRender']; renderOrder: number; visible: boolean }>();
  private readonly uniforms = {
    uScene: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStrength: { value: HAZE.strength },
  };
  readonly material: THREE.ShaderMaterial;
  private tex: THREE.FramebufferTexture | null = null;
  private readonly size = new THREE.Vector2();
  private frame = 0;
  private copiedFrame = -1;
  private copies = 0;
  private drawn = 0;
  private on: boolean;
  private camera: THREE.Camera | null = null;
  private disposed = false;

  constructor(step: QualityStep = 'medium', private readonly maxCards: number = HAZE_MAX_CARDS) {
    this.on = hazeOnFor(step);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.material.name = 'caldera-haze';
    this.material.forceSinglePass = true; // transparent and double-sided: one pass, not three's back-then-front two
  }

  get enabled(): boolean {
    return this.on;
  }

  setStep(step: QualityStep): void {
    this.on = hazeOnFor(step);
    if (!this.on) for (const c of this.cards) c.visible = false;
  }

  track(root: THREE.Object3D): () => void {
    const mine: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData?.[HAZE_FLAG] || this.cards.has(m)) return;
      this.owned.set(m, { material: m.material, onBeforeRender: m.onBeforeRender, renderOrder: m.renderOrder, visible: m.visible });
      m.material = this.material;
      m.renderOrder = 10;
      m.frustumCulled = false; // the pass culls (and caps) itself
      m.visible = false; // until the first update decides
      m.onBeforeRender = (renderer, _scene, camera) => this.beforeCard(renderer as unknown as HazeRenderer, camera);
      this.cards.add(m);
      mine.push(m);
    });
    return () => {
      for (const m of mine) this.release(m);
    };
  }

  card(geometry: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geometry);
    m.userData[HAZE_FLAG] = true;
    m.name = 'caldera-haze';
    this.track(m);
    return m;
  }

  /** Once per render frame, before the scene renders: time, tier, and the nearest cards in view. */
  update(camera: THREE.Camera | null, timeS: number): void {
    if (this.disposed) return;
    this.frame++;
    if (Number.isFinite(timeS)) this.uniforms.uTime.value = timeS;
    this.camera = camera;
    this.drawn = 0;
    if (!this.on || !camera || this.cards.size === 0) {
      for (const c of this.cards) c.visible = false;
      return;
    }
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    camera.getWorldPosition(camPos);
    const seen: { m: THREE.Mesh; d: number }[] = [];
    for (const m of this.cards) {
      m.visible = false;
      if (!m.parent || !visibleChain(m.parent)) continue;
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      m.updateWorldMatrix(true, false);
      sphere.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld);
      if (!frustum.intersectsSphere(sphere)) continue;
      seen.push({ m, d: Math.max(0, sphere.center.distanceTo(camPos) - sphere.radius) });
    }
    seen.sort((a, b) => a.d - b.d);
    for (let i = 0; i < seen.length && i < this.maxCards; i++) seen[i]!.m.visible = true;
    this.drawn = Math.min(seen.length, this.maxCards);
  }

  stats(): HazeStats {
    return { tracked: this.cards.size, drawn: this.drawn, copies: this.copies, frame: this.frame, textureType: this.tex?.type ?? null, enabled: this.on };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of [...this.cards]) this.release(m);
    this.tex?.dispose();
    this.tex = null;
    this.material.dispose();
  }

  /** The copy, once a frame, from the first card that draws for the main camera. Public for tests. */
  beforeCard(r: HazeRenderer, camera: THREE.Camera): void {
    if (!this.on || this.copiedFrame === this.frame) return;
    if (this.camera && camera !== this.camera) return; // another view (a minimap render): sample last frame's copy
    this.copiedFrame = this.frame;
    const rt = r.getRenderTarget();
    if (rt) this.size.set(rt.width, rt.height);
    else r.getDrawingBufferSize(this.size);
    if (!(this.size.x > 0 && this.size.y > 0)) return;
    const type = rt ? rt.texture.type : THREE.UnsignedByteType;
    const format = rt ? rt.texture.format : THREE.RGBAFormat;
    const t = this.tex;
    if (!t || t.image.width !== this.size.x || t.image.height !== this.size.y || t.type !== type || t.format !== format) {
      t?.dispose();
      const nt = new THREE.FramebufferTexture(this.size.x, this.size.y);
      nt.type = type;
      nt.format = format;
      this.tex = nt;
      this.uniforms.uScene.value = nt;
    }
    this.uniforms.uRes.value.copy(this.size);
    r.copyFramebufferToTexture(this.tex!, null);
    this.copies++;
  }

  private release(m: THREE.Mesh): void {
    const o = this.owned.get(m);
    if (!o) return;
    this.owned.delete(m);
    this.cards.delete(m);
    m.material = o.material;
    m.onBeforeRender = o.onBeforeRender;
    m.renderOrder = o.renderOrder;
    m.visible = o.visible;
    m.frustumCulled = true;
  }
}

function visibleChain(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
