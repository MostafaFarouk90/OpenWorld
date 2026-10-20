// The burning-village dressing (clarity review items 2, 14, 15, 16): emissive, camera-facing additive cards at the
// fire anchors, no new PointLight. At most MAX_ACTIVE fires (the nearest to the player) show at once, at most ONE
// pooled light slot is shared by the nearest of them (medium/high only), and Low halves the cards per fire.
// Lit after `tutorial.heartshard-awakened`; the bakery fire burns until M02 completes, every other fire until M01.
import * as THREE from 'three';
import { CAPS } from '../vfx/tuning';

export const FIRE_FLAG = 'tutorial.heartshard-awakened';
export const BAKERY_FIRE = 'kettlewick.bakery-fire';
export const BRAZIER_ANCHOR = 'chapel.brazier';
export const FIRE_ANCHORS: readonly string[] = [
  BAKERY_FIRE,
  'lane.fire-cart',
  'lane.fire-house-08',
  'lane.fire-house-09',
  'kettlewick.fire-house-01',
  'kettlewick.fire-house-02',
  'chapel.fire-1',
  'chapel.fire-2',
];
/**
 * Fires the Act 1 quests put out (quests thread, density pass): lit while `litFlag` is on, out once any `outFlags`
 * is on or `outQuest` is completed. The quests own the flags; the dressing only draws them.
 */
export interface QuestFire { anchor: string; litFlag: string; outFlags: readonly string[]; outQuest: string }
export const QUEST_FIRES: readonly QuestFire[] = [
  { anchor: 'kettlewick.fire-tavern-door', litFlag: FIRE_FLAG, outFlags: ['story.m01.tavernDoused'], outQuest: 'm01' },
  { anchor: 'kettlewick.fire-bakery-door', litFlag: FIRE_FLAG, outFlags: ['story.m02.doorDoused'], outQuest: 'm02' },
  { anchor: 'r01.fire-stubble', litFlag: 'story.r01.scorched', outFlags: ['story.r01.stubbleOut'], outQuest: 'r01' },
];
export const MAX_ACTIVE = 3;
/** Cards per fire: three flame cards and a smoke card; Low halves it (one flame, one smoke). */
export const CARDS_FULL = 4;
export const CARDS_LOW = 2;
export const FIRE_LIGHT_INTENSITY = 2.2;

export type QualityName = 'low' | 'medium' | 'high';
export interface Vec3Like { x: number; y: number; z: number }

/** One persistent slot of a pooled light provider. `release()` must hand it back. */
export interface FireLightSlot {
  set(pos: Vec3Like, intensity: number): void;
  release(): void;
}
export interface FireLightProvider { acquire(): FireLightSlot | null }

export interface CrisisDeps {
  scene: THREE.Object3D;
  anchors: { find(id: string): { position: Vec3Like } | undefined };
  /** `ctx.gates`-backed reader: 'inactive' | 'active' | 'completed' | 'failed'. */
  questState: (questId: string) => string;
  flag: (key: string) => boolean;
  quality: () => QualityName;
  /** Optional: if absent (or it returns null) no light is used at all. */
  lights?: FireLightProvider;
  warn?: (message: string) => void;
}

const VERT = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uPhase;
uniform float uSway;
void main() {
  vUv = uv;
  vec3 p = position;
  p.x += sin(uTime * 5.0 + uPhase + uv.y * 3.0) * uSway * uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uPhase;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  float width = mix(0.45, 0.08, vUv.y);
  float body = smoothstep(width, 0.0, abs(vUv.x - 0.5));
  float lick = 0.65 + 0.35 * sin(vUv.y * 9.0 - uTime * 7.0 + uPhase);
  float fade = smoothstep(1.0, 0.25, vUv.y);
  float flicker = 0.85 + 0.15 * sin(uTime * 23.0 + uPhase * 3.0);
  float a = body * lick * fade * flicker * uAlpha;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.9, 0.5), (1.0 - vUv.y) * 0.5) * a, a);
}`;

interface Card { mesh: THREE.Mesh; minimal: boolean }
interface Fire {
  id: string;
  pos: THREE.Vector3;
  group: THREE.Group;
  cards: Card[];
  enabled: boolean;
  active: boolean;
}

export class CrisisDressing {
  static readonly particleCap = CAPS.particlesTotal;
  static readonly lightCap = CAPS.pointLights;

  private readonly root = new THREE.Group();
  private readonly fires: Fire[] = [];
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly materials: THREE.ShaderMaterial[] = [];
  private brazierGlow: THREE.Mesh | null = null;
  private brazierPos: THREE.Vector3 | null = null;
  private smokeCard: THREE.Mesh | null = null;
  private slot: FireLightSlot | null = null;
  private time = 0;
  private disposed = false;
  private lastPlayer: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(private readonly deps: CrisisDeps) {
    this.root.name = 'crisis-dressing';
    const missing: string[] = [];
    for (const id of FIRE_ANCHORS) {
      const anchor = deps.anchors.find(id);
      if (!anchor) {
        missing.push(id);
        continue;
      }
      this.fires.push(this.buildFire(id, anchor.position));
    }
    for (const q of QUEST_FIRES) {
      const anchor = deps.anchors.find(q.anchor);
      if (anchor) this.fires.push(this.buildFire(q.anchor, anchor.position));
      else missing.push(q.anchor);
    }
    const brazier = deps.anchors.find(BRAZIER_ANCHOR);
    if (brazier) {
      this.brazierPos = new THREE.Vector3(brazier.position.x, brazier.position.y, brazier.position.z);
      this.brazierGlow = this.makeCard(0xffa040, 0.9, 0.04, 0.55, 0.9, 'ember');
      this.brazierGlow.position.set(brazier.position.x, brazier.position.y + 0.55, brazier.position.z);
      this.brazierGlow.visible = false;
      this.root.add(this.brazierGlow);
    } else missing.push(BRAZIER_ANCHOR);
    const bakery = deps.anchors.find(BAKERY_FIRE);
    if (bakery) {
      this.smokeCard = this.makeCard(0x6a6560, 0.55, 0.3, 2.4, 5, 'smoke');
      this.smokeCard.position.set(bakery.position.x, bakery.position.y + 3.2, bakery.position.z);
      this.smokeCard.visible = false;
      this.root.add(this.smokeCard);
    }
    if (missing.length) (deps.warn ?? ((m: string) => console.warn(m)))(`CrisisDressing: missing anchors skipped: ${missing.join(', ')}`);
    deps.scene.add(this.root);
    this.refresh();
  }

  /** Fires currently showing (enabled and among the nearest MAX_ACTIVE). */
  get activeFires(): number {
    return this.fires.filter((f) => f.active).length;
  }
  /** Visible cards (fires, ember, smoke); each is budgeted as one particle against the 4,000 cap. */
  get particles(): number {
    let n = 0;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && this.visibleChain(o)) n++;
    });
    return n;
  }
  /** Pooled lights held by the fires (0 or 1). */
  get lightsUsed(): number {
    return this.slot ? 1 : 0;
  }

  /** Re-read flag and quest state (call on flag.changed, quest events and save.loaded). */
  refresh(): void {
    if (this.disposed) return;
    const awakened = this.deps.flag(FIRE_FLAG);
    const m01 = this.deps.questState('m01') === 'completed';
    const m02 = this.deps.questState('m02') === 'completed';
    for (const f of this.fires) {
      const q = QUEST_FIRES.find((x) => x.anchor === f.id);
      if (q) f.enabled = this.deps.flag(q.litFlag) && !q.outFlags.some((k) => this.deps.flag(k)) && this.deps.questState(q.outQuest) !== 'completed';
      else f.enabled = awakened && (f.id === BAKERY_FIRE ? !m02 : !m01);
    }
    this.cull(this.lastPlayer);
  }

  update(dt: number, playerPos: Vec3Like): void {
    if (this.disposed) return;
    this.time += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.lastPlayer = playerPos;
    // Re-rank only when something changed: the player moved 2 m, the quality step, or a refresh (review m2).
    const moved = (playerPos.x - this.culledAt.x) ** 2 + (playerPos.z - this.culledAt.z) ** 2 > 4;
    if (moved || this.deps.quality() !== this.culledQuality) this.cull(playerPos);
    const yawTo = (p: THREE.Vector3 | Vec3Like): number => Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    if (this.brazierGlow?.visible && this.brazierPos) this.brazierGlow.rotation.y = yawTo(this.brazierPos);
    if (this.smokeCard?.visible) this.smokeCard.rotation.y = yawTo(this.smokeCard.position);
    if (!this.anyActive && !this.brazierGlow?.visible && !this.smokeCard?.visible) return;
    for (const m of this.materials) m.uniforms.uTime!.value = this.time;
    let nearest: Fire | null = null;
    let best = Infinity;
    for (const f of this.fires) {
      if (!f.active) continue;
      f.group.rotation.y = yawTo(f.pos);
      const dx = playerPos.x - f.pos.x;
      const dz = playerPos.z - f.pos.z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    this.updateLight(nearest);
  }

  /** Kindling Ember: lit in the brazier at the vow's end. */
  kindle(on: boolean): void {
    if (this.brazierGlow && !this.disposed) this.brazierGlow.visible = on;
  }

  /** World position for the T05 ember burst, or null if the brazier anchor is missing. */
  burstAtBrazier(): Vec3Like | null {
    return this.brazierPos ? { x: this.brazierPos.x, y: this.brazierPos.y + 0.5, z: this.brazierPos.z } : null;
  }

  /** T12 smoke hit over the bakery. */
  smoke(on: boolean): void {
    if (this.smokeCard && !this.disposed) this.smokeCard.visible = on;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.slot?.release();
    this.slot = null;
    this.root.removeFromParent();
    this.geo.dispose();
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.fires.length = 0;
    this.brazierGlow = null;
    this.smokeCard = null;
  }

  // ---- internals ----

  private visibleChain(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      if (!p.visible) return false;
      if (p === this.root) return true;
    }
    return false;
  }

  private makeCard(color: number, alpha: number, sway: number, w: number, h: number, name: string): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: this.materials.length * 1.7 },
        uSway: { value: sway },
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: alpha },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.set(w, h, 1);
    mesh.name = `crisis:${name}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  private buildFire(id: string, p: Vec3Like): Fire {
    const group = new THREE.Group();
    group.name = `crisis-fire:${id}`;
    group.position.set(p.x, p.y, p.z);
    const cards: Card[] = [];
    // Flame cards fan out around the camera-facing axis so the fire reads fat from any side.
    const specs = [
      { color: 0xff7a1a, w: 1.5, h: 2.4, x: 0, yaw: 0, minimal: true },
      { color: 0xffb030, w: 1.1, h: 1.8, x: -0.25, yaw: 0.9, minimal: false },
      { color: 0xff5a10, w: 1.1, h: 1.9, x: 0.25, yaw: -0.9, minimal: false },
    ];
    for (const s of specs) {
      const mesh = this.makeCard(s.color, 1, 0.12, s.w, s.h, 'flame');
      mesh.position.set(s.x, s.h / 2, 0);
      mesh.rotation.y = s.yaw;
      group.add(mesh);
      cards.push({ mesh, minimal: s.minimal });
    }
    const smoke = this.makeCard(0x4a4642, 0.5, 0.35, 2, 4, 'smoke');
    smoke.position.set(0, 3.4, 0);
    group.add(smoke);
    cards.push({ mesh: smoke, minimal: true });
    group.visible = false;
    this.root.add(group);
    return { id, pos: new THREE.Vector3(p.x, p.y, p.z), group, cards, enabled: false, active: false };
  }

  private readonly culledAt = { x: Infinity, z: Infinity };
  private culledQuality: string | null = null;
  private anyActive = false;

  private cull(player: Vec3Like): void {
    const quality = this.deps.quality();
    const low = quality === 'low';
    this.culledAt.x = player.x;
    this.culledAt.z = player.z;
    this.culledQuality = quality;
    const d2 = (f: Fire): number => (f.pos.x - player.x) ** 2 + (f.pos.z - player.z) ** 2;
    const ranked = this.fires.filter((f) => f.enabled).sort((a, b) => d2(a) - d2(b));
    const on = new Set(ranked.slice(0, MAX_ACTIVE));
    for (const f of this.fires) {
      f.active = on.has(f);
      f.group.visible = f.active;
      for (const c of f.cards) c.mesh.visible = !low || c.minimal;
    }
    this.anyActive = on.size > 0;
    if (!on.size) this.updateLight(null);
  }

  private updateLight(nearest: Fire | null): void {
    if (!nearest || this.deps.quality() === 'low' || !this.deps.lights) {
      this.slot?.release();
      this.slot = null;
      return;
    }
    if (!this.slot) this.slot = this.deps.lights.acquire();
    if (!this.slot) return;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 17) + 0.05 * Math.sin(this.time * 41);
    this.slot.set({ x: nearest.pos.x, y: nearest.pos.y + 1.4, z: nearest.pos.z }, FIRE_LIGHT_INTENSITY * flicker);
  }
}
