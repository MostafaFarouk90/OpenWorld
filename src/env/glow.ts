// Glow for the environment pass's fires (follow-up item 1): flicker on the emissive materials the glbs already carry, and a small fixed
// pool of unshadowed point lights that sit on the nearest fires. Cosmetic only: no Warmth tie, no flags, nothing depends on it. Lives in
// the env plugin, so `?env=off` leaves it out (no lights are created, no material is touched).
//
// - Flicker is in the shader: the glb materials named Fire, FireCore and Glow (emissive strength 2.5 to 3.5 in the files) get an
//   `onBeforeCompile` that multiplies their emissive by a sum of three sines (0.6 to 1.2 of the file's value, mean 0.9). The two
//   uniforms (time, desync) are shared, so a frame costs two writes. Medium keeps every instance in step; high de-syncs each instance by
//   a hash of its translation; low freezes the time (a static glow, no per-frame work). Tier changes only change uniform values, so the
//   shaders never recompile. Coal heaps are unlit and stay dark (coordinator ruling 2026-10-31).
// - Lights: GLOW_POOL point lights are created ONCE (high 3, medium 2, low 0 visible), never added or removed afterwards (a different
//   light count recompiles every lit material), and only `visible` follows the quality step. Each slot goes to the nearest fire within
//   LIGHT_RANGE of the camera focus, with hysteresis and a 0.3 s fade so lights do not pop. `fireLights` is the tutorial's shared
//   FireLightProvider (src/tutorial/CrisisDressing.ts): a slot it acquires leaves the automatic assignment until released.
import * as THREE from 'three';
import type { FireLightProvider, FireLightSlot, Vec3Like } from '../tutorial/CrisisDressing';
import { glowRegistry, type GlowRegistry, type GlowSource } from './glowSources';
import { rowLift, type PlacementRow } from './PlacementField';
import { resolveModel } from './resolve';

export type GlowTier = 'low' | 'medium' | 'high';

/** Point lights that are visible per quality step. The pool itself always holds `POOL_MAX`. */
export const POOL_SIZE: Readonly<Record<GlowTier, number>> = { high: 3, medium: 2, low: 0 };
export const POOL_MAX = 3;
/** A fire gets a light only within this distance of the camera focus (m). A held fire keeps its light a little further out. */
export const LIGHT_RANGE = 35;
export const KEEP_MARGIN = 5;
/** A fire that is not clearly nearer than the one holding a slot does not take it (m). */
export const SWAP_MARGIN = 4;
/** Two lit fires stand at least this far apart (m): a row of braziers does not spend the whole pool on one cluster. */
export const MIN_SPACING = 6;
/** Seconds a light takes to fade out and in when it moves to another fire. */
export const FADE_SECONDS = 0.3;
/** Seconds between re-assigning the slots. */
export const ASSIGN_EVERY = 0.25;

// ---- flicker ---------------------------------------------------------------------------------------------------------------
export interface FlickerProfile {
  mean: number;
  amps: readonly [number, number, number];
  /** Radians per second. */
  freqs: readonly [number, number, number];
}
const OFFSETS = [0, 1.7, 3.1] as const;
/** Every profile stays within 0.6 to 1.2 of the model's own emissive value (mean 0.9, amplitudes sum to 0.3). */
export const PROFILES = {
  /** Flames: quick and uneven. */
  fire: { mean: 0.9, amps: [0.14, 0.1, 0.06], freqs: [9.1, 17.3, 31.7] },
  /** Coal beds and cracks: a slow breathing. */
  ember: { mean: 0.9, amps: [0.15, 0.1, 0.05], freqs: [1.3, 2.9, 5.3] },
} as const satisfies Record<string, FlickerProfile>;
export type ProfileName = keyof typeof PROFILES;
/** The flicker factor at time `t` seconds (`phase` shifts it in seconds, as the per-instance hash does in the shader). */
export function flicker(profile: ProfileName, t: number, phase = 0): number {
  const p = PROFILES[profile];
  let v = p.mean;
  for (let i = 0; i < 3; i++) v += p.amps[i] * Math.sin(p.freqs[i] * (t + phase) + OFFSETS[i]);
  return v;
}
/** Time wraps here so the sines keep their precision in a shader float (a flicker never repeats visibly in 10 minutes anyway). */
export const TIME_WRAP = 600;

// ---- what glows ------------------------------------------------------------------------------------------------------------
export interface GlowLight {
  color: number;
  /** Intensity at flicker factor 1 (candela; the game's other pooled lights use 1.4 to 2.2 at 9 to 12 m, these are for eye-level spill). */
  peak: number;
  distance: number;
  /** Metres above the placement's ground where the light sits (the flame), times the row's scale. */
  height: number;
  profile: ProfileName;
}
export interface GlowKind {
  light?: GlowLight;
  /** Emissive material names of the glb that flicker, and how. */
  materials: Readonly<Record<string, ProfileName>>;
}
export const GLOW: Readonly<Record<string, GlowKind>> = {
  'forge-hearth-a': {
    light: { color: 0xff7a2a, peak: 7, distance: 14, height: 1.3, profile: 'fire' },
    materials: { Fire: 'fire', FireCore: 'fire', Glow: 'ember' },
  },
  'brazier-standing-a': {
    light: { color: 0xff8a30, peak: 5, distance: 11, height: 1.5, profile: 'fire' },
    materials: { Fire: 'fire', FireCore: 'fire' },
  },
  // The clamp smoulders: a dim, slow glow (no flame materials).
  'charcoal-clamp-a': {
    light: { color: 0xff5a1a, peak: 5.5, distance: 11, height: 1.1, profile: 'ember' },
    materials: { Glow: 'ember' },
  },
  // The slag stand-in's cracks flicker slowly; they cast no light. coal-heap-a is deliberately absent: unlit coal stays dark.
  'slag-heap': { materials: { Glow: 'ember' } },
  // Not an env row: the 21 Keep-road braziers of "Smoke Over Harrowmark" register themselves under this kind (their flames are their own meshes).
  'keep-brazier': { light: { color: 0xff8a30, peak: 5, distance: 11, height: 0, profile: 'fire' }, materials: {} },
};

/** The fires among `rows`: one source per row whose id has a light. Light height scales with the row; a roof-deck `dy` lifts it. */
export function collectSources(tile: string, rows: readonly PlacementRow[], heightAt: (x: number, z: number) => number): GlowSource[] {
  const out: GlowSource[] = [];
  rows.forEach((r, i) => {
    const kind = GLOW[r.id];
    if (!kind?.light) return;
    if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) return;
    const y = heightAt(r.x, r.z) + rowLift(r.dy) + kind.light.height * (r.scale ?? 1);
    if (!Number.isFinite(y)) return;
    out.push({ id: `${tile}:${r.id}:${i}`, kind: r.id, x: r.x, y, z: r.z });
  });
  return out;
}

// ---- shader flicker --------------------------------------------------------------------------------------------------------
export interface GlowUniforms {
  uGlowTime: { value: number };
  uGlowDesync: { value: number };
}
export const newGlowUniforms = (): GlowUniforms => ({ uGlowTime: { value: 0 }, uGlowDesync: { value: 0 } });

const f = (n: number): string => n.toFixed(4);
/** GLSL for one profile (the same constants as `flicker`). */
export function flickerGlsl(profile: ProfileName): string {
  const p = PROFILES[profile];
  const terms = [0, 1, 2].map((i) => `${f(p.amps[i])} * sin(${f(p.freqs[i])} * t + ${f(OFFSETS[i])})`).join(' + ');
  return `float glowFlicker(float t) { return ${f(p.mean)} + ${terms}; }`;
}

/** Materials patched so far, with what to put back (a WeakMap, not userData: a cloned material copies userData but not its hooks). */
const PATCHED = new WeakMap<THREE.Material, { profile: ProfileName; previous: THREE.MeshStandardMaterial['onBeforeCompile']; previousKey: () => string }>();

/**
 * Makes `material`'s emissive flicker with `profile`, driven by the shared `uniforms`. Idempotent per material. The vertex shader derives
 * a phase from the instance translation (0 for a plain mesh); the fragment shader scales the emissive radiance by the flicker.
 */
export function patchGlowMaterial(material: THREE.Material, profile: ProfileName, uniforms: GlowUniforms): boolean {
  const m = material as THREE.MeshStandardMaterial;
  if (!(m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) return false;
  if (PATCHED.has(m)) return false;
  PATCHED.set(m, { profile, previous: m.onBeforeCompile, previousKey: m.customProgramCacheKey });
  const previous = m.onBeforeCompile;
  const glsl = flickerGlsl(profile);
  m.onBeforeCompile = (shader, renderer) => {
    previous.call(m, shader, renderer);
    shader.uniforms.uGlowTime = uniforms.uGlowTime;
    shader.uniforms.uGlowDesync = uniforms.uGlowDesync;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vGlowPhase;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vGlowPhase = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
#else
  vGlowPhase = 0.0;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float uGlowTime;\nuniform float uGlowDesync;\nvarying float vGlowPhase;\n${glsl}\nvoid main() {`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= glowFlicker(uGlowTime + vGlowPhase * uGlowDesync);');
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key.call(m)}|env-glow-${profile}`;
  m.needsUpdate = true;
  return true;
}

export function unpatchGlowMaterial(material: THREE.Material): void {
  const m = material as THREE.MeshStandardMaterial;
  const p = PATCHED.get(m);
  if (!p) return;
  m.onBeforeCompile = p.previous;
  m.customProgramCacheKey = p.previousKey;
  PATCHED.delete(m);
  m.needsUpdate = true;
}

// ---- which fire gets which light -------------------------------------------------------------------------------------------
export interface Ref2 {
  x: number;
  z: number;
}
const dist = (a: Ref2, b: Ref2): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Chooses a source for each slot. `current[i]` is the source slot i holds (or null). The nearest fires within LIGHT_RANGE of `ref` win,
 * at most one per slot, at least MIN_SPACING apart; a held fire keeps its slot while it is within KEEP_MARGIN beyond the range and not
 * SWAP_MARGIN further than the farthest wanted one. Pure: the same inputs give the same answer.
 */
export function assignSlots(sources: readonly GlowSource[], ref: Ref2, current: ReadonlyArray<GlowSource | null>): Array<GlowSource | null> {
  const n = current.length;
  const out: Array<GlowSource | null> = new Array(n).fill(null);
  if (n === 0 || sources.length === 0) return out;
  const near = sources
    .map((s) => ({ s, d: dist(s, ref) }))
    .filter((e) => e.d <= LIGHT_RANGE)
    .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1));
  const chosen: GlowSource[] = [];
  const far = (s: GlowSource): boolean => chosen.every((c) => dist(c, s) >= MIN_SPACING);
  const wanted: Array<{ s: GlowSource; d: number }> = [];
  for (const e of near) {
    if (wanted.length === n) break;
    if (far(e.s)) {
      wanted.push(e);
      chosen.push(e.s);
    }
  }
  const limit = wanted.length === n ? wanted[n - 1].d + SWAP_MARGIN : Infinity;
  const taken = new Set<GlowSource>();
  // Held fires stay where they are while they are still good enough, so a light does not hop between two equally near fires.
  const held: GlowSource[] = [];
  current.forEach((c, i) => {
    if (!c) return;
    const d = dist(c, ref);
    const stillListed = sources.includes(c);
    if (stillListed && d <= LIGHT_RANGE + KEEP_MARGIN && d <= Math.min(limit, LIGHT_RANGE + KEEP_MARGIN) && held.every((h) => dist(h, c) >= MIN_SPACING)) {
      out[i] = c;
      taken.add(c);
      held.push(c);
    }
  });
  for (const e of wanted) {
    if (taken.has(e.s)) continue;
    if (!held.every((h) => dist(h, e.s) >= MIN_SPACING)) continue;
    const i = out.indexOf(null);
    if (i < 0) break;
    out[i] = e.s;
    taken.add(e.s);
    held.push(e.s);
  }
  return out;
}

// ---- the light pool --------------------------------------------------------------------------------------------------------
interface Slot {
  light: THREE.PointLight;
  source: GlowSource | null;
  /** The fire this light is heading for: it moves there once it has faded out. */
  target: GlowSource | null;
  /** Fade 0..1 (multiplies the flickering intensity). */
  k: number;
  /** Held by the tutorial's FireLightProvider: excluded from the automatic assignment. */
  reserved: boolean;
}

/** A stable 0..1 hash of an id, so each fire flickers on its own phase. */
export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export class GlowLights {
  private readonly slots: Slot[] = [];
  private sinceAssign = Infinity;
  private disposed = false;

  constructor(scene: THREE.Object3D) {
    for (let i = 0; i < POOL_MAX; i++) {
      // Unshadowed, created once and kept in the scene for the whole session: another light count recompiles every lit material.
      const light = new THREE.PointLight(0xff8a30, 0, 12, 2);
      light.castShadow = false;
      light.name = 'env.glow';
      light.visible = false;
      scene.add(light);
      this.slots.push({ light, source: null, target: null, k: 0, reserved: false });
    }
  }

  get lights(): readonly THREE.PointLight[] {
    return this.slots.map((s) => s.light);
  }

  /** Only `visible` changes with the tier (3, 2 or 0 of the pool). A light that goes dark forgets its fire. */
  setTier(tier: GlowTier): void {
    const n = POOL_SIZE[tier];
    this.slots.forEach((s, i) => {
      const on = i < n && !this.disposed;
      s.light.visible = on;
      if (!on) {
        s.light.intensity = 0;
        s.source = null;
        s.target = null;
        s.k = 0;
      }
    });
    this.sinceAssign = Infinity;
  }

  update(dt: number, time: number, ref: Ref2, sources: readonly GlowSource[]): void {
    if (this.disposed) return;
    const visible = this.slots.filter((s) => s.light.visible);
    if (visible.length === 0) return;
    this.sinceAssign += dt;
    const auto = visible.filter((s) => !s.reserved);
    if (this.sinceAssign >= ASSIGN_EVERY && auto.length > 0) {
      this.sinceAssign = 0;
      const next = assignSlots(sources, ref, auto.map((s) => s.target));
      auto.forEach((s, i) => {
        s.target = next[i];
      });
    }
    const step = dt / FADE_SECONDS;
    for (const s of auto) {
      if (s.target !== s.source && s.k <= 0) {
        // Faded out: move to the new fire (or stay dark when there is none).
        s.source = s.target;
        if (s.source) this.aim(s, s.source);
      }
      const goal = s.source && s.target === s.source ? 1 : 0;
      s.k = goal > s.k ? Math.min(goal, s.k + step) : Math.max(goal, s.k - step);
      if (s.source) {
        const kind = GLOW[s.source.kind]?.light;
        const peak = kind?.peak ?? 0;
        s.light.intensity = kind ? peak * flicker(kind.profile, time, hash01(s.source.id) * 6.2831853) * s.k : 0;
      } else s.light.intensity = 0;
    }
  }

  private aim(s: Slot, src: GlowSource): void {
    const kind = GLOW[src.kind]?.light;
    s.light.position.set(src.x, src.y, src.z);
    if (kind) {
      s.light.color.setHex(kind.color);
      s.light.distance = kind.distance;
    }
  }

  /** The tutorial's shared fire light (CrisisDressing): one slot of the pool, or null when the tier has none free (low, or all taken). */
  readonly provider: FireLightProvider = {
    acquire: (): FireLightSlot | null => {
      if (this.disposed) return null;
      const free = [...this.slots].reverse().find((s) => s.light.visible && !s.reserved);
      if (!free) return null;
      free.reserved = true;
      free.source = null;
      free.target = null;
      free.k = 0;
      free.light.intensity = 0;
      free.light.color.setHex(0xff9a40);
      free.light.distance = 12;
      let released = false;
      return {
        set: (pos: Vec3Like, intensity: number): void => {
          if (released || this.disposed || !free.light.visible) return;
          if (![pos.x, pos.y, pos.z, intensity].every(Number.isFinite)) return;
          free.light.position.set(pos.x, pos.y, pos.z);
          free.light.intensity = Math.max(0, intensity);
        },
        release: (): void => {
          if (released) return;
          released = true;
          free.reserved = false;
          free.light.intensity = 0;
        },
      };
    },
  };

  counts(): { created: number; visible: number; lit: number; reserved: number } {
    return {
      created: this.slots.length,
      visible: this.slots.filter((s) => s.light.visible).length,
      lit: this.slots.filter((s) => s.light.visible && s.light.intensity > 0.01).length,
      reserved: this.slots.filter((s) => s.reserved).length,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.setTier('low');
    this.disposed = true;
    for (const s of this.slots) {
      s.light.removeFromParent();
      s.light.dispose();
    }
    this.slots.length = 0;
  }
}

// ---- the system ------------------------------------------------------------------------------------------------------------
export interface EnvGlowOptions {
  scene: THREE.Object3D;
  /** The env model library: loaded templates are looked up with `peek`. */
  lib: { peek(id: string): { parts: ReadonlyArray<{ material: THREE.Material }> } | null };
  tier: () => GlowTier | undefined;
  heightAt: (x: number, z: number) => number;
  registry?: GlowRegistry;
}

export interface GlowCounts {
  tier: GlowTier;
  /** Point lights the pool holds (always POOL_MAX), visible now, and actually lit now. */
  lights: number;
  visibleLights: number;
  litLights: number;
  reserved: number;
  /** Fires known: from the tile rows and from the registry. */
  sources: number;
  /** Glb materials that flicker. */
  materials: number;
}

export class EnvGlow {
  readonly lights: GlowLights;
  readonly uniforms = newGlowUniforms();
  private readonly registry: GlowRegistry;
  private readonly tiles = new Map<string, GlowSource[]>();
  private readonly patched = new Set<THREE.Material>();
  private merged: readonly GlowSource[] = [];
  private mergedKey = '';
  private tilesVersion = 0;
  private tierNow: GlowTier = 'medium';
  private time = 0;
  private disposed = false;

  constructor(private readonly opts: EnvGlowOptions) {
    this.registry = opts.registry ?? glowRegistry;
    this.lights = new GlowLights(opts.scene);
    this.setTier(opts.tier() ?? 'medium');
  }

  get fireLights(): FireLightProvider {
    return this.lights.provider;
  }

  /**
   * A tile's rows have been built: take its fires as light sources, and make the emissive materials of the glowing models flicker.
   * Safe to call again for the same tile (its sources are replaced). Returns how many fires the tile has.
   */
  addTile(tile: string, rows: readonly PlacementRow[]): number {
    if (this.disposed) return 0;
    const sources = collectSources(tile, rows, this.opts.heightAt);
    this.tiles.set(tile, sources);
    this.tilesVersion++;
    const ids = new Set(rows.map((r) => r.id));
    for (const id of ids) {
      const kind = GLOW[id];
      if (!kind || Object.keys(kind.materials).length === 0) continue;
      const ref = resolveModel(id);
      if (ref.source !== 'env') continue;
      const template = this.opts.lib.peek(ref.model);
      if (!template) continue;
      for (const part of template.parts) {
        const profile = kind.materials[part.material.name];
        if (profile && !this.patched.has(part.material) && patchGlowMaterial(part.material, profile, this.uniforms)) this.patched.add(part.material);
      }
    }
    return sources.length;
  }

  setTier(tier: GlowTier): void {
    this.tierNow = tier;
    this.lights.setTier(tier);
  }

  private sources(): readonly GlowSource[] {
    const key = `${this.registry.version}|${this.tilesVersion}`;
    if (key !== this.mergedKey) {
      this.mergedKey = key;
      this.merged = [...[...this.tiles.values()].flat(), ...this.registry.list()];
    }
    return this.merged;
  }

  /** Once per frame. `dt` in seconds; `ref` is the camera focus (the player, or the shot harness's focus point). */
  update(dt: number, ref: Ref2, tier = this.opts.tier()): void {
    if (this.disposed) return;
    const dtc = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.5) : 0;
    if (tier && tier !== this.tierNow) this.setTier(tier);
    if (this.tierNow === 'low') return; // static glow, no lights: nothing to do per frame
    this.time = (this.time + dtc) % TIME_WRAP;
    this.uniforms.uGlowTime.value = this.time;
    this.uniforms.uGlowDesync.value = this.tierNow === 'high' ? 1 : 0;
    this.lights.update(dtc, this.time, ref, this.sources());
  }

  counts(): GlowCounts {
    const c = this.lights.counts();
    return { tier: this.tierNow, lights: c.created, visibleLights: c.visible, litLights: c.lit, reserved: c.reserved, sources: this.sources().length, materials: this.patched.size };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const m of this.patched) unpatchGlowMaterial(m);
    this.patched.clear();
    this.tiles.clear();
    this.lights.dispose();
  }
}
