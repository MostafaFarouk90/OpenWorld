import * as THREE from 'three';
import type { DamageBus } from '../../../combat/DamageBus';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../../combat/types';
import { WeaponTracer } from '../../../combat/WeaponTracer';
import { FIXED_TIMESTEP, KNIGHT } from '../../../config/constants';
import type { EnemyBody } from '../../body';
import type { PlayOptions, WindowPhase } from '../../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../../types';
import { HAWK, hawkDims, type HawkDims, type HawkParams } from './params';

/** Canonical clip names. */
export const HAWK_CLIPS = {
  perch: 'Perch',
  soar: 'Soar',
  flap: 'Flap',
  hover: 'Hover',
  stoop: 'Stoop',
  rake: 'Rake',
  hit: 'Hit',
  grounded: 'Grounded',
  death: 'Death',
} as const;

type Canonical = (typeof HAWK_CLIPS)[keyof typeof HAWK_CLIPS];

/** Clip lengths in seconds. Looping clips (Perch, Soar, Flap, Hover, Grounded) give their cycle length. */
export const HAWK_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Perch: 2,
  Soar: 1.2,
  Flap: 0.35,
  Hover: 0.25,
  Stoop: 0.6,
  Rake: 0.5,
  Hit: 0.3,
  Grounded: 1,
  Death: 1.2,
};

/** Names `Enemy.ts` uses, mapped onto the hawk clips. `currentClip` and `play` report the requested name. */
export const HAWK_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
  Idle: 'Perch',
  Walking_A: 'Flap',
  Walking_B: 'Flap',
  Running_A: 'Flap',
  Walking_Backwards: 'Flap',
  Hit_A: 'Hit',
  Hit_B: 'Grounded',
  Death_A: 'Death',
  Lie_StandUp: 'Flap',
  Blocking: 'Hover',
  Sit_Floor_Down: 'Grounded',
  Sit_Floor_Idle: 'Grounded',
  Rest: 'Perch',
};

/** Suggested active windows (normalised) for the hawk's moves; the defs may override them. */
export const HAWK_ATTACKS = {
  stoop: { clip: 'Stoop', activeStart: 0.3, activeEnd: 0.85 },
  rake: { clip: 'Rake', activeStart: 0.35, activeEnd: 0.7 },
} as const;

/** Bone names of the wing hurtboxes (a poise break can name them). */
export const HAWK_WING_BONES = ['wingL', 'wingR'] as const;

export type HawkFlightPose = 'perch' | 'soar' | 'flap' | 'hover' | 'stoop';
const FLIGHT_POSE_CLIP: Readonly<Record<HawkFlightPose, Canonical>> = {
  perch: 'Perch', soar: 'Soar', flap: 'Flap', hover: 'Hover', stoop: 'Stoop',
};

const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ pose

/** Everything a clip controls, plain numbers so a pose can be blended without allocating. */
export interface HawkPose {
  /** Shoulder roll (rad); positive lifts the wing above the body. */
  flapL: number;
  flapR: number;
  /** Shoulder yaw (rad); positive sweeps the wing back (+Z), negative throws it forward. */
  sweepL: number;
  sweepR: number;
  /** Outer panel yaw relative to the inner one (rad, positive folds it back). */
  bend: number;
  /** Outer panel roll relative to the inner one (rad, positive lifts the tip; negative lags a downstroke). */
  curl: number;
  /** Body pitch (rad), positive = beak up. */
  pitch: number;
  /** Body roll (rad), positive = right side down. */
  roll: number;
  /** 0..1 tail fan spread. */
  tail: number;
  /** Head pitch relative to the body (rad), positive = up. */
  headPitch: number;
  /** Metres the body centre is raised from its rest height; negative sinks it. */
  lift: number;
  /** 0..1: talons thrown forward and spread. */
  talons: number;
}
const POSE_KEYS: readonly (keyof HawkPose)[] = [
  'flapL', 'flapR', 'sweepL', 'sweepR', 'bend', 'curl', 'pitch', 'roll', 'tail', 'headPitch', 'lift', 'talons',
];

export function restPose(out: HawkPose = {} as HawkPose): HawkPose {
  for (const k of POSE_KEYS) out[k] = 0;
  return out;
}
export function copyPose(from: HawkPose, to: HawkPose): void {
  for (const k of POSE_KEYS) to[k] = from[k];
}
export function blendPose(a: HawkPose, b: HawkPose, k: number, out: HawkPose): void {
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** 0 -> 1 -> 0 hump over u in [0,1] peaking at `peak`. */
const hump = (u: number, peak: number) => (u < peak ? smoothstep(0, peak, u) : 1 - smoothstep(peak, 1, u));

/** Wings folded against the body. */
function folded(p: HawkPose, droop = 0.25): void {
  p.flapL = p.flapR = -droop;
  p.sweepL = p.sweepR = 1.2;
  p.bend = 0.45;
  p.curl = -0.1;
}
/** Wings spread out flat to the sides. */
function spread(p: HawkPose, flap: number, curl: number, sweep = 0.1): void {
  p.flapL = p.flapR = flap;
  p.sweepL = p.sweepR = sweep;
  p.bend = 0.05;
  p.curl = curl;
}

/**
 * The pose of a clip at normalised time `u` (seconds `t`, global time `time` for idle motion). Writes into `p`.
 */
export function clipPose(clip: Canonical, u: number, t: number, time: number, p: HawkPose): HawkPose {
  restPose(p);
  switch (clip) {
    case 'Perch':
      folded(p);
      p.pitch = 0.35;
      p.tail = 0;
      p.headPitch = 0.15 * Math.sin(u * TAU) + 0.05 * Math.sin(time * 0.9);
      p.lift = 0.01 * Math.sin(u * TAU);
      break;
    case 'Soar': {
      const s = Math.sin(u * TAU);
      spread(p, 0.12 + 0.04 * Math.cos(u * TAU), 0.12, 0.12);
      p.roll = 0.28 * s;
      p.pitch = -0.05;
      p.tail = 0.6;
      p.headPitch = -0.1 * s;
      p.lift = 0.02 * Math.cos(u * TAU);
      break;
    }
    case 'Flap': {
      const s = Math.sin(u * TAU);
      spread(p, 0.15 + 0.65 * s, 0.5 * Math.sin(u * TAU - 1), 0.12);
      p.bend = 0.05 + 0.15 * Math.max(0, -s);
      p.pitch = 0.12;
      p.tail = 0.5;
      p.lift = 0.05 * s;
      break;
    }
    case 'Hover': {
      const s = Math.sin(u * TAU);
      spread(p, 0.1 + 0.8 * s, 0.6 * Math.sin(u * TAU - 1), 0.25);
      p.pitch = 0.5;
      p.tail = 1;
      p.talons = 0.5;
      p.headPitch = -0.3;
      p.lift = 0.06 * s;
      break;
    }
    case 'Stoop': {
      const s = smoothstep(0, 0.3, u);
      folded(p, 0.1);
      p.sweepL = p.sweepR = 0.15 + 1.15 * s;
      p.bend = 0.05 + 0.3 * s;
      p.pitch = -1.1 * s;
      p.headPitch = 0.5 * s;
      p.tail = 0.2 * (1 - s);
      p.talons = smoothstep(0.5, 0.85, u);
      p.flapL = p.flapR = 0.2 * (1 - s) - 0.1 * s;
      break;
    }
    case 'Rake': {
      const s = Math.sin(u * TAU * 2);
      const h = hump(u, 0.4);
      spread(p, 0.35 * s * h, 0.2, 0.1 - 0.7 * h);
      p.bend = 0.05;
      p.pitch = 0.55 * h;
      p.headPitch = -0.3 * h;
      p.tail = 1 * h;
      p.talons = smoothstep(0.1, 0.35, u) * (1 - smoothstep(0.7, 1, u));
      p.lift = 0.05 * h;
      break;
    }
    case 'Hit': {
      const h = hump(u, 0.3);
      spread(p, 0.7 * h, 0.4 * h, 0.2);
      p.pitch = 0.4 * h;
      p.roll = 0.25 * Math.sin(u * TAU) * h;
      p.headPitch = 0.3 * h;
      p.lift = 0.04 * h;
      p.tail = 0.8 * h;
      break;
    }
    case 'Grounded': {
      // On its side: the left wing tucked under, the right laid out flat, twitching.
      const tw = Math.sin(t * 26) * Math.max(0, Math.sin(u * TAU * 2));
      p.roll = 1.25;
      p.pitch = 0.05;
      p.lift = -0.1;
      p.flapL = -0.9;
      p.sweepL = 1.0;
      p.flapR = 0.12 + 0.18 * tw;
      p.sweepR = -0.15 - 0.1 * tw;
      p.bend = 0.12 + 0.1 * tw;
      p.curl = 0.05;
      p.tail = 0.4;
      p.headPitch = -0.25 + 0.15 * tw;
      p.talons = 0.3 * Math.max(0, tw);
      break;
    }
    case 'Death': {
      const s = smoothstep(0.1, 1, u);
      const spasm = hump(u, 0.15) * (1 - s);
      p.flapL = 0.6 * spasm - 0.9 * s;
      p.flapR = 0.6 * spasm + 0.1 * s;
      p.sweepL = 0.4 * spasm + 0.9 * s;
      p.sweepR = 0.4 * spasm - 0.1 * s;
      p.bend = 0.3 * s;
      p.roll = 1.5 * s;
      p.pitch = 0.4 * spasm - 0.2 * s;
      p.headPitch = -0.7 * s;
      p.lift = -0.1 * s;
      p.tail = 0.5 * (1 - s);
      p.talons = 0.4 * s;
      break;
    }
  }
  return p;
}

// ------------------------------------------------------------------------------------------------ rig

interface Side {
  /** Shoulder pivot: named `wingL` / `wingR`. */
  shoulder: THREE.Group;
  outer: THREE.Group;
  /** -1 for the left wing (extends to -X), +1 for the right. */
  dir: -1 | 1;
}

interface HawkRig {
  /** The visual root: lifted by the altitude; the hurtboxes and the tracer hang from it. */
  visual: THREE.Group;
  /** The body group (named `body`): pitched, rolled and lifted by the pose. */
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Mesh;
  talons: THREE.Group;
  left: Side;
  right: Side;
  mats: { body: THREE.MeshStandardMaterial; wing: THREE.MeshStandardMaterial; tip: THREE.MeshStandardMaterial; beak: THREE.MeshStandardMaterial };
  geometries: THREE.BufferGeometry[];
}

function buildRig(params: HawkParams, dims: HawkDims): HawkRig {
  const visual = new THREE.Group();
  visual.name = 'hawk-visual';
  visual.scale.setScalar(params.scale);
  const body = new THREE.Group();
  body.name = 'body';
  body.rotation.order = 'YXZ';
  body.position.y = dims.bodyY;
  visual.add(body);

  const mBody = new THREE.MeshStandardMaterial({ color: params.tint, roughness: 0.8, metalness: 0 });
  const mWing = new THREE.MeshStandardMaterial({ color: params.tint, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mTip = new THREE.MeshStandardMaterial({ color: params.wingTip, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mBeak = new THREE.MeshStandardMaterial({ color: params.beak, roughness: 0.5, metalness: 0.1 });

  const gBody = new THREE.CapsuleGeometry(dims.bodyRadius, dims.bodyStraight, 4, 12);
  gBody.rotateX(Math.PI / 2);
  const gHead = new THREE.SphereGeometry(dims.headRadius, 12, 10);
  const gBeak = new THREE.ConeGeometry(dims.headRadius * 0.4, dims.beakLength, 8);
  gBeak.rotateX(-Math.PI / 2); // tip towards -Z
  const gPanel = new THREE.BoxGeometry(dims.panelLength, 0.012, dims.chord);
  const gTail = new THREE.CircleGeometry(dims.tailLength, 10, Math.PI / 2 - 0.5, 1);
  gTail.rotateX(Math.PI / 2); // fans towards +Z
  const gTalon = new THREE.ConeGeometry(0.012, 0.09, 5);
  gTalon.rotateX(-Math.PI / 2);

  const bodyMesh = new THREE.Mesh(gBody, mBody);
  bodyMesh.name = 'torso';
  body.add(bodyMesh);

  const headZ = -(dims.bodyStraight / 2 + dims.bodyRadius * 0.85);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, dims.bodyRadius * 0.45, headZ);
  head.add(new THREE.Mesh(gHead, mBody));
  const beak = new THREE.Mesh(gBeak, mBeak);
  beak.name = 'beak';
  beak.position.set(0, -dims.headRadius * 0.1, -(dims.headRadius + dims.beakLength / 2 - 0.01));
  head.add(beak);
  body.add(head);

  const tail = new THREE.Mesh(gTail, mWing);
  tail.name = 'tail';
  tail.position.set(0, 0, dims.bodyStraight / 2 + dims.bodyRadius * 0.6);
  body.add(tail);

  const talons = new THREE.Group();
  talons.name = 'talons';
  talons.position.set(0, -dims.bodyRadius * 0.8, 0.02);
  for (const x of [-0.045, 0.045]) {
    const toe = new THREE.Mesh(gTalon, mBeak);
    toe.position.set(x, -0.04, -0.03);
    talons.add(toe);
  }
  body.add(talons);

  const makeSide = (dir: -1 | 1): Side => {
    const shoulder = new THREE.Group();
    shoulder.name = dir < 0 ? 'wingL' : 'wingR';
    shoulder.rotation.order = 'ZYX';
    shoulder.position.set(dir * dims.shoulderX, dims.bodyRadius * 0.4, -dims.bodyRadius * 0.15);
    const inner = new THREE.Mesh(gPanel, mWing);
    inner.name = `${shoulder.name}-inner`;
    inner.position.x = dir * dims.panelLength / 2;
    const outer = new THREE.Group();
    outer.name = `${shoulder.name}-outer`;
    outer.rotation.order = 'ZYX';
    outer.position.x = dir * dims.panelLength;
    const outerMesh = new THREE.Mesh(gPanel, mTip);
    outerMesh.position.x = dir * dims.panelLength / 2;
    outer.add(outerMesh);
    shoulder.add(inner, outer);
    body.add(shoulder);
    return { shoulder, outer, dir };
  };
  const left = makeSide(-1);
  const right = makeSide(1);

  return {
    visual, body, head, tail, talons, left, right,
    mats: { body: mBody, wing: mWing, tip: mTip, beak: mBeak },
    geometries: [gBody, gHead, gBeak, gPanel, gTail, gTalon],
  };
}

function disposeRig(rig: HawkRig): void {
  for (const g of rig.geometries) g.dispose();
  for (const m of Object.values(rig.mats)) m.dispose();
  rig.visual.removeFromParent();
}

// ------------------------------------------------------------------------------------------------ body

export interface HawkBodyOptions {
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

const WHITE = new THREE.Color(0xffffff);

/**
 * The Rime Hawk as an `EnemyBody`: a capsule body with a head, beak, fan tail and two wings (a shoulder pivot with an
 * inner and an outer panel), hurtboxes on the body and each wing bone (`wingL`, `wingR`), a talon tracer (`right`),
 * and the same clip/window contracts as `LeechBody`. Extra controls (duck-typed by the overlay): `setAltitude(m)`,
 * `setFlash(t)` (the white wing flash) and `setFlightPose(p)`.
 */
export class HawkBody implements EnemyBody {
  readonly root: THREE.Group;
  /** The visual group: hurtboxes and the `right` tracer hang from it. Altitude lifts it. */
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];
  readonly params: HawkParams;
  readonly dims: HawkDims;
  readonly rig: HawkRig;

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private readonly baseTransparent = new Map<THREE.Material, boolean>();
  private readonly telegraphColor = new THREE.Color();
  private readonly wingMats: THREE.MeshStandardMaterial[];
  private telegraphK = 0;
  private flashK = 0;

  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  private frozen: { clip: Canonical; time: number } | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private disposed = false;

  private time = 0;
  private altitudeNow = 0;
  private flightPose: HawkFlightPose | null = null;
  private overrideElapsed = 0;

  private readonly display = restPose();
  private readonly fadeFrom = restPose();
  private fading = false;
  private fadeTime = 0;
  private fadeDuration = 0;

  constructor(params: HawkParams = HAWK, options: HawkBodyOptions = {}) {
    this.params = { ...params };
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    this.dims = hawkDims(params, 1);
    const rig = buildRig(params, this.dims);
    this.rig = rig;
    this.owner = rig.visual;
    this.root = new THREE.Group();
    this.root.name = 'enemy-hawk';
    this.root.add(rig.visual);
    this.time = params.seed;

    this.materials = [rig.mats.body, rig.mats.wing, rig.mats.tip, rig.mats.beak];
    this.wingMats = [rig.mats.wing, rig.mats.tip];
    for (const m of this.materials as THREE.MeshStandardMaterial[]) this.baseEmissive.set(m, m.emissive.clone());
    for (const m of this.materials) this.baseTransparent.set(m, m.transparent);

    const d = this.dims;
    const reach = d.panelLength * 1.8;
    this.hurtboxes = new HurtboxSet(
      rig.visual,
      [
        { name: 'body', bone: 'body', start: { x: 0, y: 0, z: -d.bodyStraight / 2 }, end: { x: 0, y: 0, z: d.bodyStraight / 2 }, radius: d.bodyRadius * 1.15 },
        { name: 'wing', bone: 'wingL', start: { x: -0.04, y: 0, z: 0 }, end: { x: -reach, y: 0, z: 0 }, radius: d.chord * 0.3 },
        { name: 'wing', bone: 'wingR', start: { x: 0.04, y: 0, z: 0 }, end: { x: reach, y: 0, z: 0 }, radius: d.chord * 0.3 },
      ],
      rig.visual,
    );
    this.weapons = {
      right: this.makeChannel(rig.talons, 'talons', new THREE.Vector3(0, -0.04, 0.02), new THREE.Vector3(0, -0.12, -0.28)),
    } as EnemyBody['weapons'];
    this.tracers = {
      right: new WeaponTracer({
        attacker: rig.visual, weapon: this.weapons.right.object, hilt: this.weapons.right.hilt, tip: this.weapons.right.tip,
        ownHurtboxes: this.hurtboxes, bus: options.bus,
      }),
    } as EnemyBody['tracers'];
    this.sources = { right: this.makeSource('right') } as Record<WeaponChannel, AttackWindowSource>;
    // `left` is not a hawk channel: it never reports a window.
    (this.sources as Record<string, AttackWindowSource>).left = this.makeSource('left');

    clipPose('Perch', 0, 0, 0, this.display);
    this.pose();
    this.root.updateMatrixWorld(true);
    this.hurtboxes.update();
  }

  // -------------------------------------------------------------------------------------------- visual

  /** Every material's emissive ramps 0..1 towards `color` (half strength, as the leech). */
  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffb347): void {
    if (this.disposed) return;
    this.telegraphK = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraphColor.set(color);
    this.applyEmissive();
  }

  /** 0..1: the wing materials lerp to pure white emissive (the white wing flash telegraph). */
  setFlash(t: number): void {
    if (this.disposed) return;
    this.flashK = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.applyEmissive();
  }

  get flash(): number {
    return this.flashK;
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

  /** Height of the visual above the feet, metres (the flight overlay owns the curve; bad input counts as 0). */
  setAltitude(m: number): void {
    this.altitudeNow = Number.isFinite(m) && m > 0 ? m : 0;
    if (!this.disposed) this.rig.visual.position.y = this.altitudeNow;
  }

  get altitude(): number {
    return this.altitudeNow;
  }

  /** Forces the looping pose (it wins over the loco clip; attacks, one-shots and held poses still play). `null` clears it. */
  setFlightPose(p: HawkFlightPose | null): void {
    const next = p && Object.prototype.hasOwnProperty.call(FLIGHT_POSE_CLIP, p) ? p : null;
    if (next === this.flightPose) return;
    this.startFade(KNIGHT.fadeSeconds);
    this.flightPose = next;
    this.overrideElapsed = 0;
  }

  get flightPoseOverride(): HawkFlightPose | null {
    return this.flightPose;
  }

  /** The pose drawn last tick (tests). */
  get lastPose(): Readonly<HawkPose> {
    return this.display;
  }

  private applyEmissive(): void {
    for (const [m, base] of this.baseEmissive) {
      m.emissive.copy(base).lerp(this.telegraphColor, this.telegraphK * 0.5);
    }
    if (this.flashK > 0) for (const m of this.wingMats) m.emissive.lerp(WHITE, this.flashK);
  }

  // -------------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? HAWK_CLIP_DURATIONS[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `HawkBody: clip "${clip}" is missing; using "Perch"`);
      name = HAWK_CLIPS.perch;
      canonical = HAWK_CLIPS.perch;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: HAWK_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `HawkBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = HAWK_CLIP_DURATIONS[canonical];
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

    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    if (this.flightPose) this.overrideElapsed += dt;
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
    disposeRig(this.rig);
    this.root.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------- pose

  private pose(): void {
    const p = this.display;
    const r = this.rig;
    const d = this.dims;
    r.visual.position.y = this.altitudeNow;
    r.body.position.y = d.bodyY + p.lift;
    r.body.rotation.set(p.pitch, 0, p.roll);
    r.head.rotation.x = p.headPitch;
    for (const [side, flap, sweep] of [[r.left, p.flapL, p.sweepL], [r.right, p.flapR, p.sweepR]] as const) {
      side.shoulder.rotation.set(0, -side.dir * sweep, side.dir * flap);
      side.outer.rotation.set(0, -side.dir * p.bend, side.dir * p.curl);
    }
    r.tail.scale.set(0.5 + 1.1 * clamp01(p.tail), 1, 1);
    r.tail.rotation.x = -0.1 * clamp01(p.tail);
    r.talons.rotation.x = -0.9 * clamp01(p.talons);
    r.talons.scale.setScalar(1 + 0.4 * clamp01(p.talons));
  }

  private evaluate(attackTime: number | null, out: HawkPose): void {
    if (this.attack) {
      this.sample(this.attack.canonical, attackTime ?? this.attack.clipTime, false, out);
    } else if (this.current && !(this.flightPose && this.current.loop)) {
      this.sample(this.current.canonical, this.current.elapsed, this.current.loop, out);
    } else if (this.flightPose) {
      const clip = FLIGHT_POSE_CLIP[this.flightPose];
      this.sample(clip, this.overrideElapsed, clip !== 'Stoop', out);
    } else if (this.frozen) {
      this.sample(this.frozen.clip, this.frozen.time, false, out);
    } else {
      clipPose('Perch', 0, 0, this.time, out);
    }
  }

  private sample(clip: Canonical, time: number, loop: boolean, out: HawkPose): void {
    const dur = HAWK_CLIP_DURATIONS[clip];
    const t = loop ? time : Math.min(time, dur);
    const u = dur > 0 ? (loop ? ((t / dur) % 1 + 1) % 1 : clamp01(t / dur)) : 1;
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
  if (Object.prototype.hasOwnProperty.call(HAWK_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(HAWK_CLIP_ALIASES, clip) ? HAWK_CLIP_ALIASES[clip] : undefined;
}
