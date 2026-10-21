import * as THREE from 'three';
import type { DamageBus } from '../../combat/DamageBus';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../combat/types';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { FIXED_TIMESTEP, KNIGHT } from '../../config/constants';
import type { EnemyBody } from '../body';
import type { PlayOptions, WindowPhase } from '../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../types';
import { LEG_COUNT, LEG_SIDE, LegScript, solveLeg, STRIDE_LENGTH, type LegAngles, type LegInput } from './legs';
import { CRAWLER, crawlerDims, type CrawlerDims, type CrawlerParams } from './params';
import { makeSlagMaterial, seamColor, slagUniforms } from './slag';

/** Canonical clip names. */
export const CRAWLER_CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  rearUp: 'RearUp',
  bite: 'Bite',
  spit: 'Spit',
  hang: 'Hang',
  drop: 'Drop',
  land: 'Land',
  hit: 'Hit',
  stagger: 'Stagger',
  curl: 'Curl',
  death: 'Death',
} as const;

type Canonical = (typeof CRAWLER_CLIPS)[keyof typeof CRAWLER_CLIPS];

/** Clip lengths in seconds. Looping clips (Idle, Walk, Run, Hang) give their cycle length. */
export const CRAWLER_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Idle: 2.4,
  Walk: 0.9,
  Run: 0.5,
  RearUp: 0.5,
  Bite: 0.55,
  Spit: 0.8,
  Hang: 2,
  Drop: 0.5,
  Land: 0.4,
  Hit: 0.3,
  Stagger: 1,
  Curl: 0.8,
  Death: 1.4,
};

/** Names `Enemy.ts` uses, mapped onto the crawler clips. `currentClip` and `play` report the requested name. */
export const CRAWLER_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
  Walking_B: 'Walk',
  Walking_Backwards: 'Walk',
  Running_A: 'Run',
  Hit_A: 'Hit',
  Hit_B: 'Stagger',
  Death_A: 'Death',
  Lie_StandUp: 'Idle',
  Blocking: 'Idle',
  Sit_Floor_Down: 'Curl',
  Sit_Floor_Idle: 'Curl',
};

/** Suggested active windows (normalised) for the crawler's moves; the defs may override them. */
export const CRAWLER_ATTACKS = {
  bite: { clip: 'Bite', activeStart: 0.35, activeEnd: 0.6 },
  spit: { clip: 'Spit', activeStart: 0.4, activeEnd: 0.55 },
  drop: { clip: 'Land', activeStart: 0, activeEnd: 0.4 },
} as const;

/** Bone-multiplier keys: head x2, torso x1; legs has none (x1). */
export const CRAWLER_HURTBOXES = ['head', 'torso', 'legs'] as const;

const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
const SPEED_SMOOTHING = 10;
const MAX_ACCEL = 8;
const MAX_DECEL = 16;
const SLOPE_SMOOTHING = 8;
const MAX_SLOPE = 0.7;
/** Speeds (m/s at scale 1) the Walk and Run clips use when the owner never calls `setSpeed`. */
export const NOMINAL_WALK_SPEED = 1.2;
export const NOMINAL_RUN_SPEED = 3.4;
/** Metres of body lift at which the hang pose is fully blended in. */
export const HANG_FULL_LIFT = 0.4;
/** Resting y of the body pivot when lying belly-down or on its back (body half height above the floor). */
const LIE_Y = 0.3 - 0.5;

// ------------------------------------------------------------------------------------------------ pose

/** Everything a clip controls, all plain numbers so a pose can be blended without allocating. */
export interface CrawlerPose {
  y: number;
  pitch: number;
  roll: number;
  headX: number;
  headZ: number;
  jaw: number;
  squash: number;
  frontRaise: number;
  legUp: number;
  curl: number;
  splay: number;
  squirm: number;
  glow: number;
  drip: number;
}
const POSE_KEYS: readonly (keyof CrawlerPose)[] = [
  'y', 'pitch', 'roll', 'headX', 'headZ', 'jaw', 'squash', 'frontRaise', 'legUp', 'curl', 'splay', 'squirm', 'glow', 'drip',
];

export function restPose(out: CrawlerPose = {} as CrawlerPose): CrawlerPose {
  out.y = 0; out.pitch = 0; out.roll = 0; out.headX = 0; out.headZ = 0; out.jaw = 0; out.squash = 1;
  out.frontRaise = 0; out.legUp = 0; out.curl = 0; out.splay = 0; out.squirm = 0; out.glow = 1; out.drip = 0;
  return out;
}
export function copyPose(from: CrawlerPose, to: CrawlerPose): void {
  for (const k of POSE_KEYS) to[k] = from[k];
}
export function blendPose(a: CrawlerPose, b: CrawlerPose, k: number, out: CrawlerPose): void {
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** 0 -> 1 -> 0 hump over u in [0,1] peaking at `peak`. */
const hump = (u: number, peak: number) => (u < peak ? smoothstep(0, peak, u) : 1 - smoothstep(peak, 1, u));

/**
 * The pose of a clip at normalised time `u` (seconds `t`, global time `time` for idle motion). Writes into `p`.
 * Walk and Run only set the stance; the legs come from the gait script.
 */
export function clipPose(clip: Canonical, u: number, t: number, time: number, p: CrawlerPose): CrawlerPose {
  restPose(p);
  p.y = Math.sin(time * 1.3) * 0.008;
  p.headX = Math.sin(time * 0.9) * 0.05;
  p.glow = 0.9 + 0.1 * Math.sin(time * 2);
  switch (clip) {
    case 'Idle':
    case 'Walk':
      break;
    case 'Run':
      p.pitch = -0.06;
      break;
    case 'RearUp': {
      const k = smoothstep(0, 0.8, u);
      p.pitch = 0.55 * k; p.y = 0.08 * k; p.frontRaise = k; p.headX = 0.3 * k; p.jaw = 0.5 * k;
      p.drip = k; p.glow = 1 + 0.8 * k;
      break;
    }
    case 'Bite': {
      const a = smoothstep(0, 0.35, u);
      const b = smoothstep(0.35, 0.45, u);
      const rec = 1 - smoothstep(0.6, 1, u);
      p.headZ = (0.12 * a - 0.5 * b) * rec;
      p.jaw = 0.9 * a * (1 - smoothstep(0.5, 0.6, u)) * rec;
      p.pitch = -0.12 * b * rec;
      p.headX = 0.2 * a * rec;
      p.glow = 1 + 0.5 * a * rec;
      break;
    }
    case 'Spit': {
      const a = smoothstep(0, 0.4, u);
      const b = smoothstep(0.4, 0.5, u);
      const rec = 1 - smoothstep(0.6, 1, u);
      p.headX = (0.7 * a * (1 - b) - 0.25 * b) * rec;
      p.pitch = (0.3 * a * (1 - b) - 0.05 * b) * rec;
      p.jaw = (0.7 * a + 0.3 * b) * rec;
      p.glow = 1 + a * rec;
      p.drip = a * rec;
      break;
    }
    case 'Hang':
      p.legUp = 1; p.squirm = 0.15; p.glow = 0.8; p.y = 0;
      break;
    case 'Drop':
      p.legUp = 1 - smoothstep(0, 0.3, u); p.splay = 1; p.pitch = -0.1; p.headX = 0.2;
      break;
    case 'Land': {
      const bump = hump(u, 0.25);
      p.squash = 1 - 0.28 * bump; p.y = -0.12 * bump; p.splay = 0.8 * (1 - u); p.glow = 1 + 0.6 * bump;
      break;
    }
    case 'Hit': {
      const bump = hump(u, 0.3);
      p.pitch = -0.25 * bump; p.y = -0.04 * bump; p.headX = 0.4 * bump; p.glow = 1 + 0.6 * bump;
      break;
    }
    case 'Stagger': {
      const f = smoothstep(0, 0.35, u);
      p.roll = Math.PI * f; p.y = LIE_Y * f + Math.sin(Math.PI * f) * 0.25; p.curl = 0.6 * f;
      p.squirm = f; p.glow = 0.7;
      break;
    }
    case 'Curl': {
      const c = smoothstep(0, 1, u);
      p.curl = c; p.y = LIE_Y * c; p.squash = 1 - 0.15 * c; p.headX = -0.4 * c; p.glow = 1 - 0.85 * c;
      break;
    }
    case 'Death': {
      const f = smoothstep(0, 0.3, u);
      p.roll = Math.PI * f; p.y = LIE_Y * f; p.curl = 0.8 * smoothstep(0.2, 0.8, u);
      p.squirm = (1 - smoothstep(0.3, 0.7, u)) * f; p.glow = 1 - 0.9 * smoothstep(0.2, 1, u);
      break;
    }
  }
  void t;
  return p;
}

// ------------------------------------------------------------------------------------------------ rig

interface CrawlerRig {
  root: THREE.Group;
  body: THREE.Group;
  bodyMesh: THREE.Mesh;
  head: THREE.Group;
  jaw: THREE.Group;
  drips: THREE.Mesh[];
  hips: THREE.Group[];
  knees: THREE.Group[];
  feet: THREE.Object3D[];
  mats: { body: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; legs: THREE.MeshStandardMaterial; drip: THREE.MeshBasicMaterial };
  dims: CrawlerDims;
}

function buildRig(params: CrawlerParams): CrawlerRig {
  const d = crawlerDims();
  const tint = new THREE.Color(params.tint);
  const emissive = new THREE.Color(params.emissive);
  const seam = seamColor(params.emissive);
  const mats = {
    body: makeSlagMaterial('crawler-body', tint.clone(), emissive.clone(), seam, 1, params.seed),
    head: makeSlagMaterial('crawler-head', tint.clone().multiplyScalar(0.9), emissive.clone(), seam, 1.3, params.seed + 3.1),
    legs: makeSlagMaterial('crawler-legs', tint.clone().multiplyScalar(0.8), emissive.clone(), seam, 0.45, params.seed + 7.7),
    drip: new THREE.MeshBasicMaterial({ name: 'crawler-drip', color: seam.clone() }),
  };

  const root = new THREE.Group();
  root.name = 'crawler';
  root.scale.setScalar(params.scale);
  const body = new THREE.Group();
  body.name = 'torso';
  body.position.y = d.bodyY;
  root.add(body);

  const r = d.bodyWidth / 2;
  const bodyGeo = new THREE.CapsuleGeometry(r, d.bodyLength - 2 * r, 4, 12);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(1, d.bodyHeight / d.bodyWidth, 1);
  const bodyMesh = new THREE.Mesh(bodyGeo, mats.body);
  bodyMesh.name = 'crawler-bodymesh';
  body.add(bodyMesh);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.05, d.headZ);
  body.add(head);
  const skullGeo = new THREE.SphereGeometry(0.17, 10, 8);
  skullGeo.scale(1, 0.8, 1.15);
  head.add(new THREE.Mesh(skullGeo, mats.head));
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.06, -0.1);
  const jawGeo = new THREE.BoxGeometry(0.2, 0.05, 0.22);
  jawGeo.translate(0, 0, -0.05);
  jaw.add(new THREE.Mesh(jawGeo, mats.head));
  head.add(jaw);
  const drips: THREE.Mesh[] = [];
  const dripGeo = new THREE.SphereGeometry(0.03, 6, 5);
  for (const x of [-0.05, 0.06]) {
    const m = new THREE.Mesh(dripGeo, mats.drip);
    m.name = 'crawler-drip';
    m.position.set(x, -0.1, -0.2);
    m.visible = false;
    jaw.add(m);
    drips.push(m);
  }

  const hips: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const feet: THREE.Object3D[] = [];
  const upperGeo = new THREE.CylinderGeometry(0.04, 0.03, d.upperLen, 6);
  upperGeo.translate(0, -d.upperLen / 2, 0);
  const lowerGeo = new THREE.CylinderGeometry(0.03, 0.015, d.lowerLen, 6);
  lowerGeo.translate(0, -d.lowerLen / 2, 0);
  for (let i = 0; i < LEG_COUNT; i++) {
    const hip = new THREE.Group();
    hip.name = `leg${i}`;
    hip.position.set(LEG_SIDE[i]! * d.hipX, d.hipY, d.hipZ[i >> 1]!);
    hip.add(new THREE.Mesh(upperGeo, mats.legs));
    const knee = new THREE.Group();
    knee.name = `leg${i}Knee`;
    knee.position.y = -d.upperLen;
    knee.add(new THREE.Mesh(lowerGeo, mats.legs));
    const foot = new THREE.Object3D();
    foot.name = `leg${i}Foot`;
    foot.position.y = -d.lowerLen;
    knee.add(foot);
    hip.add(knee);
    body.add(hip);
    hips.push(hip);
    knees.push(knee);
    feet.push(foot);
  }
  const legsNode = new THREE.Object3D();
  legsNode.name = 'legsBox';
  legsNode.position.y = -0.2;
  body.add(legsNode);
  return { root, body, bodyMesh, head, jaw, drips, hips, knees, feet, mats, dims: d };
}

function disposeRig(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  root.removeFromParent();
}

const legIn: LegInput = { gaitAmp: 0, liftScale: 1, frontRaise: 0, legUp: 0, curl: 0, splay: 0, squirm: 0, pitch: 0, time: 0 };
const legOut: LegAngles = { hipX: 0, hipZ: 0, kneeZ: 0 };

interface PoseExtras {
  gaitAmp: number;
  liftScale: number;
  bob: number;
  slope: number;
  /** Extra body lift in rig-local metres. */
  hangLift: number;
  hangW: number;
  time: number;
}

/** Writes a pose onto the rig's joints and materials. No allocation. */
function applyPose(rig: CrawlerRig, script: LegScript, p: CrawlerPose, x: PoseExtras, tele: number): void {
  const d = rig.dims;
  rig.body.position.y = d.bodyY + p.y + x.bob + x.hangLift;
  rig.body.rotation.set(p.pitch + x.slope, 0, p.roll);
  rig.bodyMesh.scale.y = p.squash;
  rig.head.position.z = d.headZ + p.headZ;
  rig.head.rotation.x = p.headX;
  rig.jaw.rotation.x = -p.jaw * 0.8;
  const legUp = Math.max(p.legUp, x.hangW);
  legIn.gaitAmp = x.gaitAmp; legIn.liftScale = x.liftScale; legIn.frontRaise = p.frontRaise;
  legIn.legUp = legUp; legIn.curl = p.curl; legIn.splay = p.splay; legIn.squirm = p.squirm;
  legIn.pitch = p.pitch; legIn.time = x.time;
  for (let i = 0; i < LEG_COUNT; i++) {
    solveLeg(script, i, legIn, d.restHip, legOut);
    rig.hips[i]!.rotation.set(legOut.hipX, 0, legOut.hipZ);
    rig.knees[i]!.rotation.z = legOut.kneeZ;
  }
  const dripK = Math.max(p.drip, tele);
  const fall = (x.time * 1.5) % 1;
  for (let i = 0; i < rig.drips.length; i++) {
    const m = rig.drips[i]!;
    m.visible = dripK > 0.01;
    m.scale.setScalar(dripK);
    m.position.y = -0.1 - ((fall + i * 0.5) % 1) * 0.25 * dripK;
  }
  for (const m of [rig.mats.body, rig.mats.head, rig.mats.legs]) {
    const u = slagUniforms(m);
    u.uGlow.value = p.glow * (m.userData['glowBase'] as number | undefined ?? 1);
    u.uTele.value = dripK;
  }
}

// ------------------------------------------------------------------------------------------------ body

export interface CrawlerBodyOptions {
  bus?: DamageBus;
  /** Missing clips are reported once each. Default: console.warn. */
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
 * The Slag Crawler as an `EnemyBody`: a six-legged capsule body with a tripod gait driven by its own leg
 * script, hurtboxes head/torso/legs, a bite tracer at the maw (`right`) and an unused-but-valid second tracer
 * (`left`), and the same clip/window contracts as `QuadrupedBody`. Extra controls (duck-typed by Enemy.ts):
 * `setSpeed(mps)`, `setSlopePitch(rad)`, and `setHang(lift)` for the ceiling pose.
 */
export class CrawlerBody implements EnemyBody {
  readonly root: THREE.Group;
  /** The rig group: hurtboxes and the `right` tracer hang from it. */
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];
  readonly params: CrawlerParams;
  readonly rig: CrawlerRig;
  readonly script: LegScript;

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly baseTransparent = new Map<THREE.Material, boolean>();
  private readonly telegraphColor = new THREE.Color();
  private telegraph = 0;

  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  private frozen: { clip: Canonical; time: number } | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private disposed = false;

  private time = 0;
  private speedTarget: number | null = null;
  private speed = 0;
  private slopeTarget = 0;
  private slope = 0;
  private hangLift = 0;

  private readonly display = restPose();
  private readonly fadeFrom = restPose();
  private fading = false;
  private fadeTime = 0;
  private fadeDuration = 0;
  private readonly extras: PoseExtras = { gaitAmp: 0, liftScale: 1, bob: 0, slope: 0, hangLift: 0, hangW: 0, time: 0 };

  constructor(params: CrawlerParams = CRAWLER, options: CrawlerBodyOptions = {}) {
    this.params = { ...params };
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    const rig = buildRig(params);
    this.rig = rig;
    this.owner = rig.root;
    this.script = new LegScript(STRIDE_LENGTH * params.scale);
    this.root = new THREE.Group();
    this.root.name = 'enemy-crawler';
    this.root.add(rig.root);

    this.materials = [rig.mats.body, rig.mats.head, rig.mats.legs, rig.mats.drip];
    for (const m of [rig.mats.body, rig.mats.head, rig.mats.legs]) this.baseEmissive.set(m, m.emissive.clone());
    for (const m of this.materials) this.baseTransparent.set(m, m.transparent);

    this.hurtboxes = new HurtboxSet(
      rig.root,
      [
        { name: 'head', bone: 'head', start: { x: 0, y: 0, z: -0.02 }, end: { x: 0, y: -0.03, z: -0.22 }, radius: 0.2 },
        { name: 'torso', bone: 'torso', start: { x: 0, y: 0, z: -0.3 }, end: { x: 0, y: 0, z: 0.3 }, radius: 0.38 },
        { name: 'legs', bone: 'legsBox', start: { x: 0, y: 0, z: -0.4 }, end: { x: 0, y: 0, z: 0.4 }, radius: 0.34 },
      ],
      rig.root,
    );
    this.weapons = {
      right: this.makeChannel(rig.head, 'bite', new THREE.Vector3(0, -0.02, -0.1), new THREE.Vector3(0, -0.05, -0.42)),
      left: this.makeChannel(rig.body, 'unused-tracer', new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, 0, 0.9)),
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

  /**
   * A static dimmed prop of a settled (curled) crawler, for persistence: legs tucked, belly on the floor, seams
   * almost dark. Own geometry and materials (free with `CrawlerBody.disposeProp`); matrices are baked, so it
   * costs nothing per frame. Faces -Z like the live body.
   */
  static buildCurled(params: CrawlerParams = CRAWLER): THREE.Group {
    const rig = buildRig(params);
    const p = clipPose('Curl', 1, CRAWLER_CLIP_DURATIONS.Curl, 0, restPose());
    const script = new LegScript(STRIDE_LENGTH * params.scale);
    for (const m of [rig.mats.body, rig.mats.head, rig.mats.legs]) {
      m.emissive.multiplyScalar(0.25);
      m.userData['glowBase'] = 0.2;
    }
    applyPose(rig, script, p, { gaitAmp: 0, liftScale: 1, bob: 0, slope: 0, hangLift: 0, hangW: 0, time: 0 }, 0);
    rig.root.name = 'crawler-curled';
    rig.root.userData['curled'] = true;
    rig.root.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    rig.root.updateMatrixWorld(true);
    return rig.root;
  }

  /** Frees the geometry and materials of a prop from `buildCurled` and detaches it. */
  static disposeProp(prop: THREE.Object3D): void {
    disposeRig(prop);
  }

  // -------------------------------------------------------------------------------------------- visual

  /** Slag drip and glow ramp 0..1 towards `color`: the seams and maw flare, the drips grow. */
  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffb347): void {
    if (this.disposed) return;
    const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraph = k;
    this.telegraphColor.set(color);
    for (const [m, base] of this.baseEmissive) {
      m.emissive.copy(base).lerp(this.telegraphColor, k * 0.4);
      const u = slagUniforms(m);
      u.uTele.value = k;
      u.uTeleColor.value.copy(this.telegraphColor);
    }
    this.rig.mats.drip.color.copy(this.telegraphColor).lerp(seamColor(this.params.emissive), 1 - k);
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

  /** The gait speed (m/s) of the Walk and Run clips. Negative or non-finite counts as 0. */
  setSpeed(mps: number): void {
    this.speedTarget = Number.isFinite(mps) && mps > 0 ? mps : 0;
  }

  /** Body pitch from the sampled terrain, radians, positive = nose up; clamped to +-0.7. */
  setSlopePitch(rad: number): void {
    this.slopeTarget = Number.isFinite(rad) ? THREE.MathUtils.clamp(rad, -MAX_SLOPE, MAX_SLOPE) : 0;
  }

  /**
   * Raises the whole body by `lift` metres (world units) and blends the legs up towards the ceiling
   * (`hangPose`). 0 = on the ground. The Hang clip shows the legs-up pose without any lift.
   */
  setHang(lift: number): void {
    this.hangLift = Number.isFinite(lift) && lift > 0 ? lift : 0;
  }

  /** 0..1: how far the legs-up hang pose is blended in by `setHang`. */
  get hangPose(): number {
    return clamp01(this.hangLift / HANG_FULL_LIFT);
  }

  /** The smoothed gait speed (m/s). */
  get gaitSpeed(): number {
    return this.speed;
  }

  /** World position of a foot (leg 0..5) into `out`. */
  footWorld(leg: number, out: THREE.Vector3): THREE.Vector3 {
    return this.rig.feet[leg]!.getWorldPosition(out);
  }

  // -------------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? CRAWLER_CLIP_DURATIONS[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `CrawlerBody: clip "${clip}" is missing; using "Idle"`);
      name = CRAWLER_CLIPS.idle;
      canonical = CRAWLER_CLIPS.idle;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: CRAWLER_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `CrawlerBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = CRAWLER_CLIP_DURATIONS[canonical];
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
    const wantsGait = !a && c && (c.canonical === 'Walk' || c.canonical === 'Run');
    const nominal = (c?.canonical === 'Run' ? NOMINAL_RUN_SPEED : NOMINAL_WALK_SPEED) * this.params.scale;
    const target = wantsGait ? (this.speedTarget ?? nominal) : 0;
    const wanted = (target - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    this.speed += Math.min(MAX_ACCEL * dt, Math.max(-MAX_DECEL * dt, wanted));
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
    this.script.step(this.speed, dt);
    this.slope += (this.slopeTarget - this.slope) * (1 - Math.exp(-SLOPE_SMOOTHING * dt));

    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    const attackTime = a ? Math.min(a.duration, a.clipTime + attackAdvance) : 0;
    this.evaluate(a ? attackTime : null, this.display);
    if (this.fading) {
      this.fadeTime += dt;
      const k = this.fadeDuration > 0 ? this.fadeTime / this.fadeDuration : 1;
      if (k >= 1) this.fading = false;
      else blendPose(this.fadeFrom, this.display, smoothstep(0, 1, k), this.display);
    }
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
    disposeRig(this.rig.root);
    this.root.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------- pose

  private pose(): void {
    const x = this.extras;
    const sc = this.params.scale;
    x.gaitAmp = clamp01(this.speed / (0.5 * sc));
    x.liftScale = 0.8 + 0.6 * clamp01((this.speed / sc - 1) / 3);
    x.bob = 0.02 * x.gaitAmp * (0.5 - 0.5 * Math.cos(4 * Math.PI * this.script.phase));
    x.slope = this.slope;
    x.hangLift = this.hangLift / sc;
    x.hangW = this.hangPose;
    x.time = this.time;
    applyPose(this.rig, this.script, this.display, x, this.telegraph);
  }

  private evaluate(attackTime: number | null, out: CrawlerPose): void {
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

  private sample(clip: Canonical, time: number, loop: boolean, out: CrawlerPose): void {
    const dur = CRAWLER_CLIP_DURATIONS[clip];
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
  if (Object.prototype.hasOwnProperty.call(CRAWLER_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(CRAWLER_CLIP_ALIASES, clip) ? CRAWLER_CLIP_ALIASES[clip] : undefined;
}
