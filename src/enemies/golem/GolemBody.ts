import * as THREE from 'three';
import type { DamageBus } from '../../combat/DamageBus';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../combat/types';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { FIXED_TIMESTEP, KNIGHT } from '../../config/constants';
import type { EnemyBody } from '../body';
import type { PlayOptions, WindowPhase } from '../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../types';
import { GOLEM, GOLEM_DIMS, type GolemParams } from './params';
import { gaitPose, KEYS, newPose, P, REST, sampleKeys, smooth, type PoseArr } from './poses';
import { buildGolemRig, disposeGolemRig, type GolemRig } from './rig';

export { buildCairn, disposeCairn } from './rig';

/** Canonical clip names. */
export const GOLEM_CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  stomp: 'Stomp',
  slam: 'Slam',
  throw: 'Throw',
  hit: 'Hit',
  stagger: 'Stagger',
  death: 'Death',
} as const;

type Canonical = (typeof GOLEM_CLIPS)[keyof typeof GOLEM_CLIPS];

/** Clip lengths in seconds. Looping clips (Idle, Walk, Run) give their cycle length. */
export const GOLEM_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Idle: 3,
  Walk: 1.6,
  Run: 1,
  Stomp: 1.4,
  Slam: 1.6,
  Throw: 1.5,
  Hit: 0.4,
  Stagger: 2,
  Death: 2,
};

/** Names `Enemy.ts` and the humanoid defs use, mapped onto the golem clips. */
export const GOLEM_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
  Walking_B: 'Walk',
  Walking_Backwards: 'Walk',
  Running_A: 'Run',
  Hit_A: 'Hit',
  Hit_B: 'Stagger',
  Death_A: 'Death',
  Lie_StandUp: 'Idle',
  Blocking: 'Idle',
  Sit_Floor_Down: 'Stagger',
  Sit_Floor_Idle: 'Stagger',
};

/** Suggested active windows (normalised); the defs may override them. */
export const GOLEM_ATTACKS = {
  stomp: { clip: 'Stomp', activeStart: 0.45, activeEnd: 0.65 },
  slam: { clip: 'Slam', activeStart: 0.5, activeEnd: 0.7 },
  rockThrow: { clip: 'Throw', activeStart: 0.45, activeEnd: 0.6 },
} as const;

/** Hurtbox names (head x2 and torso x1 in COMBAT.boneMultipliers; core and arm have no entry, so x1 unless the table is extended). */
export const GOLEM_HURTBOXES = ['torso', 'head', 'core', 'arm', 'arm'] as const;

const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
const SPEED_SMOOTHING = 8;
const MAX_ACCEL = 6;
const MAX_DECEL = 10;
/** Ground metres covered per full gait cycle. */
const STRIDE = 2.4;
export const NOMINAL_WALK_SPEED = 1.2;
export const NOMINAL_RUN_SPEED = 3.5;
const BASE_GLOW = 1.2;
const CORE_INTENSITY = 1.5;

export interface GolemBodyOptions {
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
 * The Cinder Golem as an `EnemyBody`: instanced stone pieces under script-driven pivots, hurtboxes (torso, head,
 * the back `core`, two `arm`s), a `right` and a `left` fist tracer, and a clip player with the same window
 * contracts as QuadrupedBody. Forward is -Z, so the core is on the +Z side. Also takes the duck-typed
 * `setSpeed(mps)` (walk cycle follows ground speed) and `setSlopePitch(rad)` (ignored).
 */
export class GolemBody implements EnemyBody {
  readonly root: THREE.Group;
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];
  readonly params: GolemParams;
  readonly rig: GolemRig;

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly baseTransparent = new Map<THREE.Material, boolean>();
  private readonly coreBase = new THREE.Color();
  private readonly crackBase = new THREE.Color();
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
  private gaitPhase = 0;

  private readonly display: PoseArr = newPose();
  private readonly fadeFrom: PoseArr = newPose();
  private fading = false;
  private fadeTime = 0;
  private fadeDuration = 0;

  constructor(params: Partial<GolemParams> = {}, options: GolemBodyOptions = {}) {
    this.params = { ...GOLEM, ...params };
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    const rig = buildGolemRig(this.params);
    this.rig = rig;
    this.owner = rig.owner;
    this.root = new THREE.Group();
    this.root.name = 'enemy-golem';
    this.root.add(rig.owner);

    this.materials = [rig.stoneMaterial, rig.coreMaterial];
    for (const m of this.materials) this.baseTransparent.set(m, m.transparent);
    this.coreBase.copy(rig.coreMaterial.emissive);
    this.crackBase.copy(rig.crack.uCrackColor.value);

    const D = GOLEM_DIMS;
    const arm = (bone: string) => ({
      name: 'arm', bone, start: { x: 0, y: -0.3, z: 0 }, end: { x: 0, y: -1.4, z: 0 }, radius: 0.33,
    });
    this.hurtboxes = new HurtboxSet(
      rig.owner,
      [
        { name: 'torso', bone: 'golem-torso', start: { x: 0, y: 0.45, z: 0 }, end: { x: 0, y: 1.15, z: 0 }, radius: 0.6 },
        { name: 'head', bone: 'golem-head', start: { x: 0, y: 0.25, z: 0 }, end: { x: 0, y: 0.35, z: 0 }, radius: 0.32 },
        { name: 'core', bone: 'golem-core', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0.03 }, radius: D.core.radius + 0.06 },
        arm('golem-armR'),
        arm('golem-armL'),
      ],
      rig.owner,
    );
    this.weapons = {
      right: this.makeChannel(rig.shoulderR, 'fist-right'),
      left: this.makeChannel(rig.shoulderL, 'fist-left'),
    };
    const left = this.weapons.left!;
    const tracer = (w: typeof left, attacker: object): WeaponTracer =>
      new WeaponTracer({ attacker, weapon: w.object, hilt: w.hilt, tip: w.tip, ownHurtboxes: this.hurtboxes, bus: options.bus });
    this.tracers = { right: tracer(this.weapons.right, rig.owner), left: tracer(left, left.object) };
    this.sources = { right: this.makeSource('right'), left: this.makeSource('left') };

    this.display.splice(0, P.COUNT, ...REST);
    this.applyPose(this.display);
    this.root.updateMatrixWorld(true);
    this.hurtboxes.update();
  }

  // -------------------------------------------------------------------------------------------- visual

  /** Ramps the core emissive towards `color` over t (0..1) and flashes the cracks. */
  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffffff): void {
    if (this.disposed) return;
    const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraph = k;
    this.telegraphColor.set(color);
    const cm = this.rig.coreMaterial;
    cm.emissive.copy(this.coreBase).lerp(this.telegraphColor, k);
    cm.emissiveIntensity = CORE_INTENSITY + 3 * k;
    this.rig.crack.uCrackColor.value.copy(this.crackBase).lerp(this.telegraphColor, k * 0.5);
    this.rig.crack.uGlow.value = BASE_GLOW + 1.5 * k;
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

  /** Ground speed (m/s) the walk cycle follows. Negative or non-finite counts as 0. */
  setSpeed(mps: number): void {
    this.speedTarget = Number.isFinite(mps) && mps > 0 ? mps : 0;
  }

  /** Accepted for parity with the quadruped; the golem does not tilt. */
  setSlopePitch(_rad: number): void {}

  /** The back core's world position (the Calm prompt anchor). */
  coreWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.core.getWorldPosition(out);
  }

  // -------------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? GOLEM_CLIP_DURATIONS[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `GolemBody: clip "${clip}" is missing; using "Idle"`);
      name = GOLEM_CLIPS.idle;
      canonical = GOLEM_CLIPS.idle;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: GOLEM_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  /** As QuadrupedBody.playAttack: the pre-window part takes `leadSeconds` (rate clamped to [0.25, 4]). Returns the swingId, or -1. */
  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `GolemBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = GOLEM_CLIP_DURATIONS[canonical];
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
    const gaitClip = c && !a && (c.canonical === 'Walk' || c.canonical === 'Run');
    const nominal = c?.canonical === 'Run' ? NOMINAL_RUN_SPEED : NOMINAL_WALK_SPEED;
    const target = gaitClip ? (this.speedTarget ?? nominal) : 0;
    const wanted = (target - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING * dt));
    this.speed += Math.min(MAX_ACCEL * dt, Math.max(-MAX_DECEL * dt, wanted));
    if (this.speed < 1e-4 && target === 0) this.speed = 0;
    this.gaitPhase += (this.speed / STRIDE) * Math.PI * 2 * dt;

    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    const attackTime = a ? Math.min(a.duration, a.clipTime + attackAdvance) : 0;
    this.evaluate(a ? attackTime : null, this.display);
    if (this.fading) {
      this.fadeTime += dt;
      const k = this.fadeDuration > 0 ? this.fadeTime / this.fadeDuration : 1;
      if (k >= 1) this.fading = false;
      else {
        const f = smooth(k);
        for (let i = 0; i < P.COUNT; i++) this.display[i] = this.fadeFrom[i]! + (this.display[i]! - this.fadeFrom[i]!) * f;
      }
    }
    this.applyPose(this.display);
    this.rig.crack.uGlow.value = (BASE_GLOW + 1.5 * this.telegraph) * (1 + 0.12 * Math.sin(this.time * 3));
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
    disposeGolemRig(this.rig);
    this.root.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------- pose

  private evaluate(attackTime: number | null, out: PoseArr): void {
    if (this.attack) {
      const a = this.attack;
      this.clipPose(a.canonical, attackTime ?? a.clipTime, false, out);
    } else if (this.current) {
      this.clipPose(this.current.canonical, this.current.elapsed, this.current.loop, out);
    } else if (this.frozen) {
      this.clipPose(this.frozen.clip, this.frozen.time, false, out);
    } else {
      this.clipPose('Idle', 0, true, out);
    }
  }

  private clipPose(clip: Canonical, time: number, loop: boolean, out: PoseArr): void {
    const dur = GOLEM_CLIP_DURATIONS[clip];
    const t = loop ? time : Math.min(time, dur);
    const u = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 1;
    switch (clip) {
      case 'Idle':
        for (let i = 0; i < P.COUNT; i++) out[i] = REST[i]!;
        out[P.TX] = 0.02 * Math.sin(this.time * 2.1);
        out[P.HX] = 0.03 * Math.sin(this.time * 1.3);
        out[P.ARX] += 0.03 * Math.sin(this.time * 2.1 + 1);
        out[P.ALX] += 0.03 * Math.sin(this.time * 2.1 + 2);
        return;
      case 'Walk':
        gaitPose(this.gaitPhase, 0.45 * Math.min(1.5, this.speed / NOMINAL_WALK_SPEED), 0.05, out);
        return;
      case 'Run':
        gaitPose(this.gaitPhase, 0.8 * Math.min(1.5, this.speed / NOMINAL_RUN_SPEED), 0.25, out);
        return;
      case 'Stomp': sampleKeys(KEYS.Stomp, u, out); return;
      case 'Slam': sampleKeys(KEYS.Slam, u, out); return;
      case 'Throw': sampleKeys(KEYS.Throw, u, out); return;
      case 'Hit': sampleKeys(KEYS.Hit, u, out); return;
      case 'Stagger': sampleKeys(KEYS.Stagger, u, out); return;
      case 'Death': sampleKeys(KEYS.Death, u, out); return;
    }
  }

  private applyPose(p: PoseArr): void {
    const r = this.rig;
    r.torso.rotation.set(p[P.TX]!, p[P.TY]!, p[P.TZ]!);
    r.head.rotation.x = p[P.HX]!;
    r.shoulderR.rotation.set(p[P.ARX]!, 0, p[P.ARZ]!);
    r.shoulderL.rotation.set(p[P.ALX]!, 0, -p[P.ALZ]!);
    r.hipR.rotation.x = p[P.LRH]!;
    r.kneeR.rotation.x = p[P.LRK]!;
    r.hipL.rotation.x = p[P.LLH]!;
    r.kneeL.rotation.x = p[P.LLK]!;
    // The standing leg (the one reaching lowest) sets the hip height, so feet stay on the ground in every pose.
    const { thigh, shin } = GOLEM_DIMS;
    const extR = thigh * Math.cos(p[P.LRH]!) + shin * Math.cos(p[P.LRH]! + p[P.LRK]!);
    const extL = thigh * Math.cos(p[P.LLH]!) + shin * Math.cos(p[P.LLH]! + p[P.LLK]!);
    r.hips.position.y = Math.max(extR, extL) + p[P.DROP]!;
  }

  private startFade(seconds: number): void {
    if (seconds > 0 && this.tickCount > 0) {
      for (let i = 0; i < P.COUNT; i++) this.fadeFrom[i] = this.display[i]!;
      this.fading = true;
      this.fadeTime = 0;
      this.fadeDuration = seconds;
    } else {
      this.fading = false;
    }
  }

  // -------------------------------------------------------------------------------------------- windows

  private makeChannel(parent: THREE.Object3D, label: string) {
    const object = new THREE.Object3D();
    object.name = label;
    const hilt = new THREE.Object3D();
    const tip = new THREE.Object3D();
    hilt.name = `${label}-hilt`;
    tip.name = `${label}-tip`;
    hilt.position.set(0, -1.1, 0);
    tip.position.set(0, -1.8, 0);
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
  if (Object.prototype.hasOwnProperty.call(GOLEM_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(GOLEM_CLIP_ALIASES, clip) ? GOLEM_CLIP_ALIASES[clip] : undefined;
}
