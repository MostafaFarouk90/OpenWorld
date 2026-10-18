import * as THREE from 'three';
import type { DamageBus } from '../../combat/DamageBus';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../combat/types';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { FIXED_TIMESTEP, KNIGHT } from '../../config/constants';
import type { EnemyBody } from '../body';
import type { PlayOptions, WindowPhase } from '../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../types';
import {
  bitePose,
  blendPose,
  clonePose,
  crouchPose,
  flinchPose,
  headLowerPose,
  howlPose,
  idlePose,
  knockdownPose,
  pouncePose,
  smoothstep,
  spineHeight,
  QuadrupedGait,
  type GaitTuning,
  type Pose,
} from './gait';
import { HOUND, type QuadrupedParams } from './params';
import { QuadrupedRig, type QuadrupedJoints } from './QuadrupedRig';

/** Canonical clip names. */
export const QUADRUPED_CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  crouch: 'Crouch',
  pounce: 'Pounce',
  bite: 'Bite',
  howl: 'Howl',
  headLower: 'HeadLower',
  knockdown: 'Knockdown',
  flinch: 'Flinch',
} as const;

type Canonical = (typeof QUADRUPED_CLIPS)[keyof typeof QUADRUPED_CLIPS];

/** Clip lengths in seconds. Looping clips (Idle, Walk, Run, HeadLower) give their cycle length. */
export const QUADRUPED_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Idle: 2.4,
  Walk: 1,
  Run: 0.6,
  Crouch: 0.4,
  Pounce: 0.8,
  Bite: 0.5,
  Howl: 1.8,
  HeadLower: 1,
  Knockdown: 1.2,
  Flinch: 0.3,
};

/**
 * Names `Enemy.ts` and the humanoid defs use, mapped onto the quadruped clips so the same driver works
 * unchanged. `currentClip` and `play` report the name as it was requested.
 */
export const QUADRUPED_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
  Walking_B: 'Walk',
  Walking_Backwards: 'Walk',
  Running_A: 'Run',
  Hit_A: 'Flinch',
  Hit_B: 'Knockdown',
  Death_A: 'Knockdown',
  Lie_StandUp: 'Idle',
  Blocking: 'Idle',
  Sit_Floor_Down: 'HeadLower',
  Sit_Floor_Idle: 'HeadLower',
};

/** Suggested active windows (normalised) for the hound's moves; the defs may override them. */
export const QUADRUPED_ATTACKS = {
  pounce: { clip: 'Pounce', activeStart: 0.3, activeEnd: 0.8 },
  bite: { clip: 'Bite', activeStart: 0.35, activeEnd: 0.6 },
} as const;

/** The hurtbox names (bone-multiplier keys of COMBAT.boneMultipliers: head x2, torso x1; tail has none, so x1). */
export const QUADRUPED_HURTBOXES = ['head', 'torso', 'tail'] as const;

/** Clip time within this many seconds of the end counts as finished (as EnemyAnimator). */
const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
const SPEED_SMOOTHING = 10;
/** Limits on how fast the gait speed follows its target (m/s per second), so a jump in the owner's speed never pops the legs. */
const MAX_ACCEL = 14;
const MAX_DECEL = 24;
const SLOPE_SMOOTHING = 8;
const MAX_SLOPE = 0.7;
/** Speeds (m/s, times gaitSpeedScale) the Walk and Run clips use when the owner never calls `setSpeed`. */
export const NOMINAL_WALK_SPEED = 2;
export const NOMINAL_RUN_SPEED = 5.5;
const TAIL_FLARE_BODY = 0.25;

export interface QuadrupedBodyOptions {
  bus?: DamageBus;
  /** Missing clips are reported once each. Default: console.warn. */
  warn?: (message: string) => void;
}

interface Playing {
  /** The name as requested (alias or canonical). */
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

type Tintable = THREE.MeshStandardMaterial;

/**
 * The quadruped's visual and animation as an `EnemyBody`: the procedural rig, hurtboxes (head, torso, tail),
 * a bite/pounce tracer at the head (`right`) and an unused-but-valid tail tracer (`left`), and a small clip
 * player over gait.ts. It mirrors EnemyAnimator's contracts: `open`/`close` once per swing, `close` before
 * `onClipEnd(clip, true)` on an interrupt, the window sources go null at once, and the finishing tick still
 * reports the attack. Clips are procedural poses, advanced only by `fixedUpdate`.
 *
 * The owner also calls `setSpeed(mps)` (the gait speed of the Walk and Run clips; until it does, they use
 * nominal speeds) and `setSlopePitch(rad)` (positive = nose up).
 */
export class QuadrupedBody implements EnemyBody {
  readonly root: THREE.Group;
  /** The rig group: hurtboxes and the `right` tracer hang from it. */
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];
  readonly params: QuadrupedParams;
  readonly joints: QuadrupedJoints;

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly dims;
  private readonly tuning: GaitTuning;
  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly mats;
  private readonly baseEmissive = new Map<Tintable, THREE.Color>();
  private readonly baseTransparent = new Map<THREE.Material, boolean>();
  private readonly telegraphColor = new THREE.Color();

  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  /** The pose of an interrupted attack, held until the next play. */
  private frozen: { clip: Canonical; time: number } | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private disposed = false;

  private readonly gait: QuadrupedGait;
  private time = 0;
  private speedTarget: number | null = null;
  private speed = 0;
  private slopeTarget = 0;
  private slope = 0;

  private display: Pose = idlePose(0);
  private fadeFrom: Pose | null = null;
  private fadeTime = 0;
  private fadeDuration = 0;

  constructor(params: QuadrupedParams = HOUND, options: QuadrupedBodyOptions = {}) {
    this.params = { ...params };
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    const rig = QuadrupedRig.build(params);
    this.owner = rig;
    this.dims = QuadrupedRig.dims(rig);
    this.mats = QuadrupedRig.materials(rig);
    this.joints = QuadrupedRig.joints(rig);
    this.tuning = QuadrupedGait.tuningFor(params);
    this.gait = new QuadrupedGait(this.dims.legLen, this.tuning);
    this.root = new THREE.Group();
    this.root.name = 'enemy-quadruped';
    this.root.add(rig);

    this.materials = [this.mats.body, this.mats.limbs, this.mats.head, this.mats.tail];
    for (const m of this.materials as Tintable[]) {
      this.baseEmissive.set(m, m.emissive.clone());
      this.baseTransparent.set(m, m.transparent);
    }

    const d = this.dims;
    const h = d.headSize;
    // Hurtboxes in bone-local space (HurtboxSet scales the radius by the bone's world scale).
    this.hurtboxes = new HurtboxSet(
      rig,
      [
        { name: 'head', bone: 'head', start: { x: 0, y: 0, z: -h * 0.35 }, end: { x: 0, y: 0, z: -h * 0.85 }, radius: h * 0.45 },
        { name: 'torso', bone: 'spine', start: { x: 0, y: 0, z: -d.hipZBack * 0.8 }, end: { x: 0, y: 0, z: d.hipZBack * 0.8 }, radius: d.bodyRadius * 1.15 },
        { name: 'tail', bone: 'tail', start: { x: 0, y: 0, z: d.tailLen * 0.2 }, end: { x: 0, y: 0, z: d.tailLen * 0.75 }, radius: Math.max(0.07, d.bodyRadius * 0.3) },
      ],
      rig,
    );
    this.weapons = {
      right: this.makeChannel(this.joints.head, 'bite', new THREE.Vector3(0, 0, -h * 0.2), new THREE.Vector3(0, -h * 0.05, -h * 1.7)),
      left: this.makeChannel(this.joints.tail, 'tail-whip', new THREE.Vector3(0, 0, d.tailLen * 0.4), new THREE.Vector3(0, 0, d.tailLen)),
    };
    const left = this.weapons.left!;
    const tracer = (w: typeof left, attacker: object): WeaponTracer =>
      new WeaponTracer({ attacker, weapon: w.object, hilt: w.hilt, tip: w.tip, ownHurtboxes: this.hurtboxes, bus: options.bus });
    // Each channel needs its own attacker identity (the registry keys windows by it): the right tracer uses
    // the owner (as the humanoid), the left its own marker object.
    this.tracers = { right: tracer(this.weapons.right, rig), left: tracer(left, left.object) };

    this.sources = { right: this.makeSource('right'), left: this.makeSource('left') };
    this.applyPose(this.display);
    this.root.updateMatrixWorld(true);
    this.hurtboxes.update();
  }

  // -------------------------------------------------------------------------------------------- visual

  /** Emissive boost 0..1 towards `color`: the tail flares fully, the hide slightly. */
  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffffff): void {
    if (this.disposed) return;
    const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraphColor.set(color);
    for (const [m, base] of this.baseEmissive) {
      m.emissive.copy(base).lerp(this.telegraphColor, m === this.mats.tail ? k : k * TAIL_FLARE_BODY);
    }
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

  /** Body pitch from the sampled terrain, radians, positive = nose up; clamped to +-0.7. Non-finite counts as 0. */
  setSlopePitch(rad: number): void {
    this.slopeTarget = Number.isFinite(rad) ? THREE.MathUtils.clamp(rad, -MAX_SLOPE, MAX_SLOPE) : 0;
  }

  // -------------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? QUADRUPED_CLIP_DURATIONS[c] : undefined;
  }

  /**
   * Crossfades to `clip` (default not looping). An unknown clip warns once and plays Idle. Playing over an
   * attack interrupts it. Returns the clip name played.
   */
  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `QuadrupedBody: clip "${clip}" is missing; using "Idle"`);
      name = QUADRUPED_CLIPS.idle;
      canonical = QUADRUPED_CLIPS.idle;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: QUADRUPED_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  /** Playback rate of the current non-attack clip. */
  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  /**
   * Plays an attack so the part of the clip before `activeStart` takes `leadSeconds` (rate clamped to
   * [0.25, 4]); from `activeStart` on it plays at rate 1. Interrupts a running attack. Returns the new
   * swingId, or -1 (and plays nothing) when the clip is unknown.
   */
  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `QuadrupedBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = QUADRUPED_CLIP_DURATIONS[canonical];
    const windowStartTime = Math.max(0, move.activeStart) * duration;
    const raw = leadSeconds > 0 && Number.isFinite(leadSeconds) ? windowStartTime / leadSeconds : 1;
    const leadScale = windowStartTime > 0 ? THREE.MathUtils.clamp(raw, MIN_LEAD_SCALE, MAX_LEAD_SCALE) : 1;
    this.startFade(KNIGHT.fadeIntoAttackSeconds);
    this.current = null;
    this.swingCounter++;
    this.attack = {
      move,
      canonical,
      swingId: this.swingCounter,
      duration,
      windowStartTime,
      leadScale,
      clipTime: 0,
      normalizedTime: 0,
      previousNormalizedTime: 0,
      windowOpen: false,
      windowClosed: false,
      active: false,
      ended: false,
      endTick: -1,
    };
    return this.swingCounter;
  }

  /** Interrupts the running attack: `close` first when its window is open, then `onClipEnd(clip, true)`. The pose holds. */
  cancelAttack(): void {
    this.interruptAttack(true);
  }

  windowSource(channel: WeaponChannel): AttackWindowSource {
    return this.sources[channel];
  }

  /** One fixed tick. A non-positive or non-finite `dt` is ignored. */
  fixedUpdate(dt: number = FIXED_TIMESTEP): void {
    if (this.disposed || !(dt > 0) || !Number.isFinite(dt)) return;
    this.tickCount++;
    this.time += dt;

    const a = this.attack && !this.attack.ended ? this.attack : null;
    let attackAdvance = 0;
    if (a) attackAdvance = this.attackAdvance(a, dt);

    // Gait: the speed eases towards its target so a jump in the owner's speed cannot pop the legs.
    const c = this.current;
    const wantsGait = c && (c.canonical === 'Walk' || c.canonical === 'Run');
    const nominal = c?.canonical === 'Run' ? NOMINAL_RUN_SPEED : NOMINAL_WALK_SPEED;
    const target = wantsGait ? (this.speedTarget ?? nominal * this.tuning.speedScale) : 0;
    const wanted = (target - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    this.speed += Math.min(MAX_ACCEL * dt, Math.max(-MAX_DECEL * dt, wanted));
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
    this.gait.step(this.speed, dt);
    this.slope += (this.slopeTarget - this.slope) * (1 - Math.exp(-SLOPE_SMOOTHING * dt));

    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    const attackTime = a ? Math.min(a.duration, a.clipTime + attackAdvance) : 0;
    this.display = this.evaluate(a ? attackTime : null);
    if (this.fadeFrom) {
      this.fadeTime += dt;
      const k = this.fadeDuration > 0 ? this.fadeTime / this.fadeDuration : 1;
      if (k >= 1) this.fadeFrom = null;
      else blendPose(this.fadeFrom, this.display, smoothstep(0, 1, k), this.display);
    }
    this.applyPose(this.display);
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
    QuadrupedRig.dispose(this.owner);
    this.root.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------- pose

  /** The pose the current source shows (before the crossfade). `attackTime` is the attack clip time after this tick. */
  private evaluate(attackTime: number | null): Pose {
    if (this.attack) {
      const a = this.attack;
      return this.clipPose(a.canonical, attackTime ?? a.clipTime, false);
    }
    if (this.current) {
      const c = this.current;
      return this.clipPose(c.canonical, c.elapsed, c.loop);
    }
    if (this.frozen) return this.clipPose(this.frozen.clip, this.frozen.time, false);
    return idlePose(this.time);
  }

  private clipPose(clip: Canonical, time: number, loop: boolean): Pose {
    const dur = QUADRUPED_CLIP_DURATIONS[clip];
    const t = loop ? time : Math.min(time, dur);
    const u = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 1;
    switch (clip) {
      case 'Idle':
        return idlePose(this.time);
      case 'Walk':
      case 'Run':
        return this.gait.pose(this.time);
      case 'Crouch':
        return crouchPose(smoothstep(0, 1, u));
      case 'Pounce':
        // Hold the coil briefly, then leap.
        return u < 0.2 ? crouchPose(0.85 + 0.15 * (u / 0.2)) : pouncePose((u - 0.2) / 0.8);
      case 'Bite':
        return bitePose(u);
      case 'Howl':
        return howlPose(smoothstep(0, 0.2, u) * (1 - smoothstep(0.85, 1, u)), t);
      case 'HeadLower':
        return headLowerPose(smoothstep(0, 0.5, u), this.time);
      case 'Knockdown':
        return knockdownPose(u);
      case 'Flinch':
        return flinchPose(u);
    }
  }

  private applyPose(pose: Pose): void {
    const j = this.joints;
    const d = this.dims;
    const p = this.slope === 0 ? pose : { ...pose, pitch: pose.pitch + this.slope };
    j.spine.position.y = spineHeight(p, d);
    j.spine.rotation.set(p.pitch, 0, p.roll);
    j.neck.rotation.x = d.restNeck + p.neck;
    j.head.rotation.x = d.restHead + p.head;
    j.tail.rotation.set(-(d.restTail + p.tail), p.tailSway, 0);
    for (const id of ['FL', 'FR', 'BL', 'BR'] as const) {
      j.legs[id].upper.rotation.x = p.legs[id].upper;
      j.legs[id].lower.rotation.x = p.legs[id].lower;
    }
  }

  private startFade(seconds: number): void {
    if (seconds > 0 && this.tickCount > 0) {
      this.fadeFrom = clonePose(this.display);
      this.fadeTime = 0;
      this.fadeDuration = seconds;
    } else {
      this.fadeFrom = null;
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
      get clipName() {
        return mine()?.move.clip ?? '';
      },
      get start() {
        return mine()?.move.activeStart ?? 0;
      },
      get end() {
        // No attack on this channel: an inverted window, which never fires.
        return mine()?.move.activeEnd ?? -1;
      },
      get swingId() {
        return mine()?.swingId;
      },
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
        // Sub-tick window: active for this tick only, closed at once.
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

  /** `hold`: keep the pose (cancelAttack); otherwise the caller replaces it. */
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
  if (Object.prototype.hasOwnProperty.call(QUADRUPED_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(QUADRUPED_CLIP_ALIASES, clip) ? QUADRUPED_CLIP_ALIASES[clip] : undefined;
}
