import * as THREE from 'three';
import type { DamageBus } from '../../../combat/DamageBus';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../../combat/types';
import { WeaponTracer } from '../../../combat/WeaponTracer';
import { FIXED_TIMESTEP, KNIGHT } from '../../../config/constants';
import type { EnemyBody } from '../../body';
import type { PlayOptions, WindowPhase } from '../../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../../types';
import { LEECH, leechDims, type LeechDims, type LeechParams } from './params';

/** Canonical clip names. */
export const LEECH_CLIPS = {
  idle: 'Idle',
  swim: 'Swim',
  coil: 'Coil',
  lunge: 'Lunge',
  bite: 'Bite',
  hit: 'Hit',
  stagger: 'Stagger',
  dive: 'Dive',
  surface: 'Surface',
  death: 'Death',
} as const;

type Canonical = (typeof LEECH_CLIPS)[keyof typeof LEECH_CLIPS];

/** Clip lengths in seconds. Looping clips (Idle, Swim) give their cycle length. */
export const LEECH_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Idle: 2,
  Swim: 0.9,
  Coil: 0.5,
  Lunge: 0.7,
  Bite: 0.55,
  Hit: 0.3,
  Stagger: 1,
  Dive: 0.6,
  Surface: 0.6,
  Death: 1.4,
};

/** Names `Enemy.ts` uses, mapped onto the leech clips. `currentClip` and `play` report the requested name. */
export const LEECH_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
  Walking_B: 'Swim',
  Running_A: 'Swim',
  Walking_Backwards: 'Swim',
  Hit_A: 'Hit',
  Hit_B: 'Stagger',
  Death_A: 'Death',
  Lie_StandUp: 'Surface',
  Blocking: 'Idle',
  Sit_Floor_Down: 'Stagger',
  Sit_Floor_Idle: 'Stagger',
};

/** Suggested active windows (normalised) for the leech's moves; the defs may override them. */
export const LEECH_ATTACKS = {
  lunge: { clip: 'Lunge', activeStart: 0.35, activeEnd: 0.6 },
  bite: { clip: 'Bite', activeStart: 0.35, activeEnd: 0.6 },
} as const;

/** Bone-multiplier keys: head x2, torso x1. */
export const LEECH_HURTBOXES = ['head', 'torso'] as const;

const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
/** Speed (m/s at scale 1) at which the Swim wave runs at its clip rate. */
export const NOMINAL_SWIM_SPEED = 1;
const SPEED_SMOOTHING = 8;
const SUBMERGE_TAU = 0.25;
const FLATTEN_SQUASH = 0.5;

// ------------------------------------------------------------------------------------------------ pose

/** Everything a clip controls, all plain numbers so a pose can be blended without allocating. */
export interface LeechPose {
  /** Yaw amplitude (rad) of the travelling wave. */
  waveAmp: number;
  /** Wave cycles per second; the body integrates it into the wave clock. */
  waveSpeed: number;
  /** 0..1 S-coil: the chain folds into an S and the front rears. */
  coil: number;
  /** 0..1: head and front segments rise off the water. */
  headRaise: number;
  /** Metres the front of the chain is thrown forward (-Z). */
  headForward: number;
  /** 0..1 maw opening. */
  jaw: number;
  /** 0..1: segments squash flat. */
  flatten: number;
  /** 0..1: fast irregular thrashing. */
  writhe: number;
  /** Metres (scale 1) the whole body is raised; negative sinks it. */
  lift: number;
}
const POSE_KEYS: readonly (keyof LeechPose)[] = [
  'waveAmp', 'waveSpeed', 'coil', 'headRaise', 'headForward', 'jaw', 'flatten', 'writhe', 'lift',
];

export function restPose(out: LeechPose = {} as LeechPose): LeechPose {
  out.waveAmp = 0; out.waveSpeed = 0; out.coil = 0; out.headRaise = 0; out.headForward = 0;
  out.jaw = 0; out.flatten = 0; out.writhe = 0; out.lift = 0;
  return out;
}
export function copyPose(from: LeechPose, to: LeechPose): void {
  for (const k of POSE_KEYS) to[k] = from[k];
}
export function blendPose(a: LeechPose, b: LeechPose, k: number, out: LeechPose): void {
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** 0 -> 1 -> 0 hump over u in [0,1] peaking at `peak`. */
const hump = (u: number, peak: number) => (u < peak ? smoothstep(0, peak, u) : 1 - smoothstep(peak, 1, u));

/** Depth (m) the Dive clip sinks the body to, and the Surface clip rises from. */
const DIVE_DEPTH = 0.4;

/**
 * The pose of a clip at normalised time `u` (seconds `t`, global time `time` for idle motion). Writes into `p`.
 */
export function clipPose(clip: Canonical, u: number, t: number, time: number, p: LeechPose): LeechPose {
  restPose(p);
  p.waveAmp = 0.08;
  p.waveSpeed = 0.5;
  p.headRaise = 0.06 + 0.04 * Math.sin(time * 1.1);
  switch (clip) {
    case 'Idle':
      p.jaw = 0.1 + 0.1 * Math.sin(time * 1.7);
      break;
    case 'Swim':
      p.waveAmp = 0.55;
      p.waveSpeed = 1 / LEECH_CLIP_DURATIONS.Swim;
      p.headRaise = 0.1;
      break;
    case 'Coil': {
      const s = smoothstep(0, 1, u);
      p.coil = s;
      p.headRaise = 0.1 + 0.6 * s;
      p.waveAmp = 0.08;
      p.jaw = 0.3 * s;
      break;
    }
    case 'Lunge': {
      const open = 1 - smoothstep(0.1, 0.5, u);
      p.coil = open;
      p.headRaise = 0.7 * open + 0.2 * (1 - open);
      p.headForward = 0.16 * smoothstep(0.1, 0.5, u) * (1 - 0.6 * smoothstep(0.7, 1, u));
      p.jaw = smoothstep(0.1, 0.35, u) * (1 - smoothstep(0.6, 0.75, u));
      p.waveAmp = 0.3 * smoothstep(0.5, 1, u);
      p.waveSpeed = 1.2;
      p.lift = 0;
      break;
    }
    case 'Bite':
      p.coil = 0.25 * hump(u, 0.3);
      p.headRaise = 0.15 + 0.4 * hump(u, 0.3);
      p.headForward = 0.12 * hump(u, 0.45);
      p.jaw = smoothstep(0.1, 0.35, u) * (1 - smoothstep(0.55, 0.7, u));
      break;
    case 'Hit':
      p.headForward = -0.1 * hump(u, 0.3);
      p.headRaise = 0.06 + 0.3 * hump(u, 0.3);
      p.writhe = 0.5 * hump(u, 0.35);
      p.waveSpeed = 2;
      p.flatten = 0.15 * hump(u, 0.3);
      break;
    case 'Stagger': {
      const e = 1 - smoothstep(0.7, 1, u);
      p.writhe = 0.9 * e;
      p.waveSpeed = 2.4;
      p.waveAmp = 0.3;
      p.coil = 0.4 * e * (0.5 + 0.5 * Math.sin(t * 9));
      p.headRaise = 0.3 * e;
      p.jaw = 0.4 * e;
      break;
    }
    case 'Dive': {
      const s = smoothstep(0, 1, u);
      p.lift = -DIVE_DEPTH * s;
      p.flatten = 0.5 * s;
      p.waveAmp = 0.3;
      p.waveSpeed = 1.2;
      p.headRaise = 0.1 * (1 - s);
      break;
    }
    case 'Surface': {
      const s = smoothstep(0, 1, u);
      p.lift = -DIVE_DEPTH * (1 - s);
      p.flatten = 0.5 * (1 - s);
      p.headRaise = 0.1 + 0.3 * hump(u, 0.7);
      p.waveAmp = 0.3 * (1 - s) + 0.08 * s;
      p.waveSpeed = 1;
      p.jaw = 0.3 * hump(u, 0.7);
      break;
    }
    case 'Death': {
      const s = smoothstep(0.1, 1, u);
      p.writhe = 0.8 * hump(u, 0.2) * (1 - s);
      p.waveSpeed = 2 * (1 - s);
      p.waveAmp = 0.3 * (1 - s);
      p.headRaise = 0.5 * hump(u, 0.15) * (1 - s);
      p.flatten = s;
      p.jaw = 0.6 * smoothstep(0, 0.3, u);
      p.lift = -0.02 * s;
      break;
    }
  }
  return p;
}

// ------------------------------------------------------------------------------------------------ chain

/** Per-segment local placement in the rig frame: centre, and the facing along the chain. */
export interface ChainLayout {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** Yaw (rad, about Y) of the segment's +Z axis, which points towards the tail. */
  yaw: Float64Array;
  /** Pitch (rad) of the same axis, positive = rising towards the tail. */
  pitch: Float64Array;
}

export function makeChainLayout(count: number): ChainLayout {
  return {
    x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count),
    yaw: new Float64Array(count), pitch: new Float64Array(count),
  };
}

/**
 * Lays the segment chain out for `pose`: pure, allocation-free. `time` is the wave clock in cycles (the body
 * integrates `pose.waveSpeed` into it). The head is segment 0 at -Z; the tail rests on y = radius, the rig
 * is centred on the chain's xz centroid. Segment gaps stay `spacing` apart except for the `headForward` shear.
 */
export function chainLayout(pose: LeechPose, time: number, dims: LeechDims, out: ChainLayout): ChainLayout {
  const n = dims.count;
  const phase = time * Math.PI * 2;
  const squash = 1 - FLATTEN_SQUASH * clamp01(pose.flatten);
  // Direction angles per segment, integrated head to tail.
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0;
    const env = 0.3 + 0.7 * f;
    const wave = pose.waveAmp * env * Math.sin(phase - i * 0.8);
    const writhe = pose.writhe * (0.35 + 0.65 * f) * (0.9 * Math.sin(phase * 1.7 - i * 1.3) + 0.5 * Math.sin(phase * 2.9 + i * 0.7));
    const coil = pose.coil * 1.25 * Math.sin(i * 0.85 + 0.35);
    const yaw = wave + writhe + coil;
    // Head raise tilts the front down towards the tail; a coil rears the front too.
    const rise = clamp01(pose.headRaise) * 1.1 * Math.max(0, 1 - i / 4.5);
    const coilRise = pose.coil * 0.5 * Math.max(0, 1 - i / 6);
    const pitch = -(rise + coilRise);
    if (i > 0) {
      px += dims.spacing * Math.sin(yaw) * Math.cos(pitch);
      py += dims.spacing * Math.sin(pitch);
      pz += dims.spacing * Math.cos(yaw) * Math.cos(pitch);
    }
    out.x[i] = px; out.y[i] = py; out.z[i] = pz;
  }
  // Throw the front forward, tapering to nothing at the sixth segment.
  for (let i = 0; i < n; i++) out.z[i]! -= pose.headForward * Math.max(0, 1 - i / 6);
  // Centre on the xz centroid; the tail sits on the floor.
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += out.x[i]!; cz += out.z[i]!; }
  cx /= n; cz /= n;
  const tailY = out.y[n - 1]!;
  for (let i = 0; i < n; i++) {
    out.x[i]! -= cx;
    out.z[i]! -= cz;
    out.y[i] = out.y[i]! - tailY + dims.radii[n - 1]! * squash + pose.lift;
  }
  // Orientation from the neighbours.
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = out.x[b]! - out.x[a]!, dy = out.y[b]! - out.y[a]!, dz = out.z[b]! - out.z[a]!;
    const len = Math.hypot(dx, dy, dz) || 1;
    out.yaw[i] = Math.atan2(dx, dz);
    out.pitch[i] = Math.asin(THREE.MathUtils.clamp(dy / len, -1, 1));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ rig

interface LeechRig {
  root: THREE.Group;
  /** Segment nodes, head first; the meshes hang from them. */
  segs: THREE.Group[];
  /** Back and belly meshes per segment (children of `segs`). */
  backs: THREE.Mesh[];
  bellies: THREE.Mesh[];
  maw: THREE.Mesh;
  mats: { back: THREE.MeshStandardMaterial; belly: THREE.MeshStandardMaterial; maw: THREE.MeshStandardMaterial };
  geometries: THREE.BufferGeometry[];
}

const TEETH = 10;

function buildRig(params: LeechParams, dims: LeechDims): LeechRig {
  const root = new THREE.Group();
  root.name = 'leech-rig';
  root.scale.setScalar(params.scale);
  const back = new THREE.MeshStandardMaterial({ color: params.tint, roughness: 0.55, metalness: 0.05 });
  const belly = new THREE.MeshStandardMaterial({ color: params.belly, roughness: 0.7, metalness: 0 });
  const maw = new THREE.MeshStandardMaterial({ color: 0x5a1e1e, roughness: 0.5, metalness: 0 });
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const ring = new THREE.TorusGeometry(0.12, 0.045, 8, 20);
  const tooth = new THREE.ConeGeometry(0.018, 0.06, 5);
  tooth.rotateX(-Math.PI / 2);

  const segs: THREE.Group[] = [];
  const backs: THREE.Mesh[] = [];
  const bellies: THREE.Mesh[] = [];
  for (let i = 0; i < dims.count; i++) {
    const r = dims.radii[i]!;
    const seg = new THREE.Group();
    seg.name = i === 0 ? 'head' : `seg${i}`;
    seg.rotation.order = 'YXZ';
    const b = new THREE.Mesh(sphere, back);
    b.name = `back${i}`;
    b.scale.set(r, r, dims.halfLength);
    const v = new THREE.Mesh(sphere, belly);
    v.name = `belly${i}`;
    v.scale.set(r * 0.96, r * 0.62, dims.halfLength * 0.98);
    v.position.y = -r * 0.32;
    seg.add(b, v);
    root.add(seg);
    segs.push(seg);
    backs.push(b);
    bellies.push(v);
  }
  // The maw: a toothed ring on the front of the head, facing -Z.
  const mawMesh = new THREE.Mesh(ring, maw);
  mawMesh.name = 'maw';
  mawMesh.position.set(0, -0.02, -dims.halfLength * 0.9);
  for (let k = 0; k < TEETH; k++) {
    const a = (k / TEETH) * Math.PI * 2;
    const t = new THREE.Mesh(tooth, belly);
    t.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.01);
    t.lookAt(0, 0, -1);
    mawMesh.add(t);
  }
  segs[0]!.add(mawMesh);
  return { root, segs, backs, bellies, maw: mawMesh, mats: { back, belly, maw }, geometries: [sphere, ring, tooth] };
}

function disposeRig(rig: LeechRig): void {
  for (const g of rig.geometries) g.dispose();
  for (const m of Object.values(rig.mats)) m.dispose();
  rig.root.removeFromParent();
}

// ------------------------------------------------------------------------------------------------ body

export interface LeechBodyOptions {
  bus?: DamageBus;
  /** Where "clip missing" messages go. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

interface Playing {
  clip: string;
  canonical: Canonical;
  loop: boolean;
  timeScale: number;
  elapsed: number;
  duration: number;
  endSent: boolean;
}

interface AttackRun {
  move: MoveDef;
  canonical: Canonical;
  swingId: number;
  duration: number;
  windowStartTime: number;
  leadScale: number;
  clipTime: number;
  normalizedTime: number;
  previousNormalizedTime: number;
  windowOpen: boolean;
  windowClosed: boolean;
  active: boolean;
  ended: boolean;
  endTick: number;
}

/**
 * The Fen Leech as an `EnemyBody`: a chain of eight ellipsoid segments driven by a travelling wave, hurtboxes
 * head/torso (the head and the next three segments), a bite tracer at the maw (`right`) and an unused-but-valid
 * second tracer (`left`), and the same clip/window contracts as `CrawlerBody`. Extra controls (duck-typed by the
 * overlay): `setSpeed(mps)` and `setSubmerge(depth)` with the `submergeDepth` / `submergeTarget` getters.
 */
export class LeechBody implements EnemyBody {
  readonly root: THREE.Group;
  /** The rig group: hurtboxes and the `right` tracer hang from it. Submerging lowers it. */
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];
  readonly params: LeechParams;
  readonly dims: LeechDims;
  readonly rig: LeechRig;

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly baseTransparent = new Map<THREE.Material, boolean>();
  private readonly telegraphColor = new THREE.Color();

  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  private frozen: { clip: Canonical; time: number } | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private disposed = false;

  private time = 0;
  private waveClock = 0;
  private speedTarget: number | null = null;
  private speed = 0;
  private depthTarget = 0;
  private depth = 0;

  private readonly display = restPose();
  private readonly fadeFrom = restPose();
  private fading = false;
  private fadeTime = 0;
  private fadeDuration = 0;
  private readonly layout: ChainLayout;

  constructor(params: LeechParams = LEECH, options: LeechBodyOptions = {}) {
    this.params = { ...params };
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    this.dims = leechDims(1);
    this.layout = makeChainLayout(this.dims.count);
    const rig = buildRig(params, this.dims);
    this.rig = rig;
    this.owner = rig.root;
    this.waveClock = params.seed;
    this.root = new THREE.Group();
    this.root.name = 'enemy-leech';
    this.root.add(rig.root);

    this.materials = [rig.mats.back, rig.mats.belly, rig.mats.maw];
    for (const m of this.materials as THREE.MeshStandardMaterial[]) this.baseEmissive.set(m, m.emissive.clone());
    for (const m of this.materials) this.baseTransparent.set(m, m.transparent);

    const r = this.dims.radii;
    this.hurtboxes = new HurtboxSet(
      rig.root,
      [
        { name: 'head', bone: 'head', start: { x: 0, y: 0, z: -0.04 }, end: { x: 0, y: 0, z: -0.12 }, radius: r[0]! * 1.05 },
        { name: 'torso', bone: 'seg1', start: { x: 0, y: 0, z: -0.06 }, end: { x: 0, y: 0, z: 0.06 }, radius: r[1]! * 1.05 },
        { name: 'torso', bone: 'seg2', start: { x: 0, y: 0, z: -0.06 }, end: { x: 0, y: 0, z: 0.06 }, radius: r[2]! * 1.05 },
        { name: 'torso', bone: 'seg3', start: { x: 0, y: 0, z: -0.06 }, end: { x: 0, y: 0, z: 0.06 }, radius: r[3]! * 1.05 },
      ],
      rig.root,
    );
    const head = rig.segs[0]!;
    this.weapons = {
      right: this.makeChannel(head, 'bite', new THREE.Vector3(0, -0.02, -0.08), new THREE.Vector3(0, -0.02, -0.43)),
      left: this.makeChannel(rig.segs[4]!, 'unused-tracer', new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0, 0.4)),
    };
    const left = this.weapons.left!;
    const tracer = (w: typeof left, attacker: object): WeaponTracer =>
      new WeaponTracer({ attacker, weapon: w.object, hilt: w.hilt, tip: w.tip, ownHurtboxes: this.hurtboxes, bus: options.bus });
    this.tracers = { right: tracer(this.weapons.right, rig.root), left: tracer(left, left.object) };
    this.sources = { right: this.makeSource('right'), left: this.makeSource('left') };

    clipPose('Idle', 0, 0, 0, this.display);
    this.pose();
    this.root.updateMatrixWorld(true);
    this.hurtboxes.update();
  }

  // -------------------------------------------------------------------------------------------- visual

  /** The back, belly and maw emissive ramp 0..1 towards `color`. */
  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffb347): void {
    if (this.disposed) return;
    const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraphColor.set(color);
    for (const [m, base] of this.baseEmissive) m.emissive.copy(base).lerp(this.telegraphColor, k * 0.5);
  }

  setOpacity(o: number): void {
    if (this.disposed) return;
    const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
    for (const m of this.materials) {
      const transparent = v < 1 || this.baseTransparent.get(m) === true;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = v;
    }
  }

  /** The gait speed (m/s) of the Swim clip. Negative or non-finite counts as 0. */
  setSpeed(mps: number): void {
    this.speedTarget = Number.isFinite(mps) && mps > 0 ? mps : 0;
  }

  /** Lowers the whole visual (the rig, not `root`) by `depth` metres, smoothed over about 0.25 s. */
  setSubmerge(depth: number): void {
    this.depthTarget = Number.isFinite(depth) && depth > 0 ? depth : 0;
  }

  /** The smoothed submerge depth in metres. */
  get submergeDepth(): number {
    return this.depth;
  }

  /** The depth `setSubmerge` last asked for. */
  get submergeTarget(): number {
    return this.depthTarget;
  }

  /** The smoothed gait speed (m/s). */
  get gaitSpeed(): number {
    return this.speed;
  }

  // -------------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? LEECH_CLIP_DURATIONS[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `LeechBody: clip "${clip}" is missing; using "Idle"`);
      name = LEECH_CLIPS.idle;
      canonical = LEECH_CLIPS.idle;
    }
    this.interruptAttack(false);
    this.frozen = null;
    const loop = opts.loop ?? false;
    const timeScale = opts.timeScale ?? 1;
    const cur = this.current;
    if (cur && cur.clip === name && cur.loop && loop) {
      cur.timeScale = timeScale;
      return name;
    }
    this.endCurrentOneShot();
    this.startFade(opts.fade ?? KNIGHT.fadeSeconds);
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: LEECH_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `LeechBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = LEECH_CLIP_DURATIONS[canonical];
    const windowStartTime = Math.max(0, move.activeStart) * duration;
    const raw = leadSeconds > 0 && Number.isFinite(leadSeconds) ? windowStartTime / leadSeconds : 1;
    const leadScale = windowStartTime > 0 ? THREE.MathUtils.clamp(raw, MIN_LEAD_SCALE, MAX_LEAD_SCALE) : 1;
    this.startFade(KNIGHT.fadeIntoAttackSeconds);
    this.current = null;
    this.swingCounter++;
    this.attack = {
      move, canonical, swingId: this.swingCounter, duration, windowStartTime, leadScale,
      clipTime: 0, normalizedTime: 0, previousNormalizedTime: 0,
      windowOpen: false, windowClosed: false, active: false, ended: false, endTick: -1,
    };
    return this.swingCounter;
  }

  cancelAttack(): void {
    this.interruptAttack(true);
  }

  windowSource(channel: WeaponChannel): AttackWindowSource {
    return this.sources[channel];
  }

  fixedUpdate(dt: number = FIXED_TIMESTEP): void {
    if (this.disposed || !(dt > 0) || !Number.isFinite(dt)) return;
    this.tickCount++;
    this.time += dt;

    const a = this.attack && !this.attack.ended ? this.attack : null;
    let attackAdvance = 0;
    if (a) attackAdvance = this.attackAdvance(a, dt);

    const c = this.current;
    const swimming = !a && c?.canonical === 'Swim';
    const target = swimming ? (this.speedTarget ?? NOMINAL_SWIM_SPEED * this.params.scale) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
    this.depth += (this.depthTarget - this.depth) * (1 - Math.exp(-dt / SUBMERGE_TAU));

    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    const attackTime = a ? Math.min(a.duration, a.clipTime + attackAdvance) : 0;
    this.evaluate(a ? attackTime : null, this.display);
    if (swimming) {
      const f = THREE.MathUtils.clamp(this.speed / (NOMINAL_SWIM_SPEED * this.params.scale), 0.4, 2.5);
      this.display.waveSpeed *= f;
      this.display.waveAmp *= 0.6 + 0.4 * Math.min(f, 1.2);
    }
    if (this.fading) {
      this.fadeTime += dt;
      const k = this.fadeDuration > 0 ? this.fadeTime / this.fadeDuration : 1;
      if (k >= 1) this.fading = false;
      else blendPose(this.fadeFrom, this.display, smoothstep(0, 1, k), this.display);
    }
    this.waveClock += dt * this.display.waveSpeed;
    this.pose();
    this.root.updateWorldMatrix(true, true);

    if (a) this.progressAttack(a, attackAdvance);
    else if (this.current && !this.current.loop && !this.current.endSent) {
      const cur = this.current;
      if (cur.elapsed >= cur.duration - END_EPSILON) {
        cur.endSent = true;
        this.onClipEnd?.(cur.clip, false);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.attack = null;
    this.current = null;
    this.frozen = null;
    this.onWindow = null;
    this.onClipEnd = null;
    this.hurtboxes.dispose();
    disposeRig(this.rig);
    this.root.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------- pose

  private pose(): void {
    const p = this.display;
    chainLayout(p, this.waveClock, this.dims, this.layout);
    const L = this.layout;
    const squash = 1 - FLATTEN_SQUASH * clamp01(p.flatten);
    const widen = 1 + 0.25 * clamp01(p.flatten);
    const d = this.dims;
    for (let i = 0; i < d.count; i++) {
      const seg = this.rig.segs[i]!;
      seg.position.set(L.x[i]!, L.y[i]!, L.z[i]!);
      seg.rotation.set(-L.pitch[i]!, L.yaw[i]!, 0);
      const r = d.radii[i]!;
      this.rig.backs[i]!.scale.set(r * widen, r * squash, d.halfLength);
      this.rig.bellies[i]!.scale.set(r * 0.96 * widen, r * 0.62 * squash, d.halfLength * 0.98);
      this.rig.bellies[i]!.position.y = -r * 0.32 * squash;
    }
    const open = clamp01(p.jaw);
    this.rig.maw.scale.setScalar(1 + 0.5 * open);
    this.rig.root.position.y = -this.depth;
  }

  private evaluate(attackTime: number | null, out: LeechPose): void {
    if (this.attack) {
      const a = this.attack;
      this.sample(a.canonical, attackTime ?? a.clipTime, false, out);
    } else if (this.current) {
      this.sample(this.current.canonical, this.current.elapsed, this.current.loop, out);
    } else if (this.frozen) {
      this.sample(this.frozen.clip, this.frozen.time, false, out);
    } else {
      clipPose('Idle', 0, 0, this.time, out);
    }
  }

  private sample(clip: Canonical, time: number, loop: boolean, out: LeechPose): void {
    const dur = LEECH_CLIP_DURATIONS[clip];
    const t = loop ? time : Math.min(time, dur);
    const u = dur > 0 ? clamp01(t / dur) : 1;
    clipPose(clip, u, t, this.time, out);
  }

  private startFade(seconds: number): void {
    if (seconds > 0 && this.tickCount > 0) {
      copyPose(this.display, this.fadeFrom);
      this.fading = true;
      this.fadeTime = 0;
      this.fadeDuration = seconds;
    } else {
      this.fading = false;
    }
  }

  // -------------------------------------------------------------------------------------------- windows

  private makeChannel(parent: THREE.Object3D, label: string, hiltAt: THREE.Vector3, tipAt: THREE.Vector3) {
    const object = new THREE.Object3D();
    object.name = label;
    const hilt = new THREE.Object3D();
    const tip = new THREE.Object3D();
    hilt.name = `${label}-hilt`;
    tip.name = `${label}-tip`;
    hilt.position.copy(hiltAt);
    tip.position.copy(tipAt);
    object.add(hilt, tip);
    parent.add(object);
    return { object, hilt, tip };
  }

  private makeSource(channel: WeaponChannel): AttackWindowSource {
    const self = this;
    const mine = (): AttackRun | null => {
      const a = self.visibleAttack();
      return a && a.move.weapon === channel ? a : null;
    };
    return {
      get clipName() { return mine()?.move.clip ?? ''; },
      get start() { return mine()?.move.activeStart ?? 0; },
      get end() { return mine()?.move.activeEnd ?? -1; },
      get swingId() { return mine()?.swingId; },
      currentTime(): number | null {
        const a = mine();
        if (!a) return null;
        if (a.active) return Math.min(Math.max(a.normalizedTime, a.move.activeStart), a.move.activeEnd);
        return a.normalizedTime;
      },
    };
  }

  private visibleAttack(): AttackRun | null {
    const a = this.attack;
    if (!a || (a.ended && a.endTick !== this.tickCount)) return null;
    return a;
  }

  private attackAdvance(a: AttackRun, dt: number): number {
    let real = dt;
    let adv = 0;
    if (a.clipTime < a.windowStartTime) {
      const needed = (a.windowStartTime - a.clipTime) / a.leadScale;
      if (needed >= real) return real * a.leadScale;
      adv = a.windowStartTime - a.clipTime;
      real -= needed;
    }
    return adv + real;
  }

  private progressAttack(a: AttackRun, advance: number): void {
    const { move } = a;
    a.clipTime = Math.min(a.duration, a.clipTime + advance);
    if (a.clipTime >= a.duration - END_EPSILON) a.clipTime = a.duration;
    a.previousNormalizedTime = a.normalizedTime;
    a.normalizedTime = a.clipTime >= a.duration ? 1 : Math.min(1, Math.max(a.previousNormalizedTime, a.clipTime / a.duration));
    const t = a.normalizedTime;
    const reachedStart = a.clipTime >= a.windowStartTime - START_EPSILON;

    if (!a.windowOpen && reachedStart) {
      a.windowOpen = true;
      this.onWindow?.(move.weapon, 'open', a.swingId);
      if (t > move.activeEnd) {
        a.active = true;
        a.windowClosed = true;
        this.onWindow?.(move.weapon, 'close', a.swingId);
        this.finishIfDone(a);
        return;
      }
    }
    a.active = a.windowOpen && !a.windowClosed && t <= move.activeEnd;
    if (a.windowOpen && !a.windowClosed && t > move.activeEnd) {
      a.windowClosed = true;
      this.onWindow?.(move.weapon, 'close', a.swingId);
    }
    this.finishIfDone(a);
  }

  private finishIfDone(a: AttackRun): void {
    if (a.normalizedTime < 1) return;
    if (a.windowOpen && !a.windowClosed) {
      a.windowClosed = true;
      this.onWindow?.(a.move.weapon, 'close', a.swingId);
    }
    a.ended = true;
    a.endTick = this.tickCount;
    this.onClipEnd?.(a.move.clip, false);
  }

  private interruptAttack(hold: boolean): void {
    const a = this.attack;
    if (!a) return;
    this.attack = null;
    if (hold) this.frozen = { clip: a.canonical, time: a.clipTime };
    if (a.ended) return;
    a.ended = true;
    a.active = false;
    if (a.windowOpen && !a.windowClosed) {
      a.windowClosed = true;
      this.onWindow?.(a.move.weapon, 'close', a.swingId);
    }
    this.onClipEnd?.(a.move.clip, true);
  }

  private endCurrentOneShot(): void {
    const c = this.current;
    if (c && !c.loop && !c.endSent) {
      c.endSent = true;
      this.onClipEnd?.(c.clip, true);
    }
  }

  private warnOnce(clip: string, message: string): void {
    if (this.warned.has(clip)) return;
    this.warned.add(clip);
    this.warn(message);
  }
}

function canonicalOf(clip: string): Canonical | undefined {
  if (Object.prototype.hasOwnProperty.call(LEECH_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(LEECH_CLIP_ALIASES, clip) ? LEECH_CLIP_ALIASES[clip] : undefined;
}
