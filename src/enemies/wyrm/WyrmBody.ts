import * as THREE from 'three';
import type { DamageBus } from '../../combat/DamageBus';
import { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource, HurtboxDef } from '../../combat/types';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { FIXED_TIMESTEP } from '../../config/constants';
import type { EnemyBody } from '../body';
import type { PlayOptions, WindowPhase } from '../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../types';
import type { WyrmParams } from './builder/params';
import { LOD_DISTANCES, restPose, WYRM_JOINTS, WyrmRig, type RootFrame, type WyrmPose } from './builder/rig';

/** Canonical wyrm clips (procedural poses). */
export const WYRM_CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  spit: 'Spit',
  puff: 'Puff',
  bite: 'Bite',
  tailWhip: 'TailWhip',
  dive: 'Dive',
  flinch: 'Flinch',
  knockdown: 'Knockdown',
  headLower: 'HeadLower',
  roar: 'Roar',
  rest: 'Rest',
} as const;

type Canonical = (typeof WYRM_CLIPS)[keyof typeof WYRM_CLIPS];

/** Clip lengths in seconds; looping clips give their cycle. Knockdown holds down for its whole length (the 3 s Calm window). */
export const WYRM_CLIP_DURATIONS: Readonly<Record<Canonical, number>> = {
  Idle: 3,
  Walk: 1.1,
  Run: 0.7,
  Spit: 1.2,
  Puff: 0.6,
  Bite: 0.7,
  TailWhip: 0.9,
  Dive: 1.6,
  Flinch: 0.3,
  Knockdown: 3.4,
  HeadLower: 1,
  Roar: 1.6,
  Rest: 3,
};

/** The names `Enemy.ts` asks for, mapped onto wyrm clips (`currentClip` reports the name requested). */
export const WYRM_CLIP_ALIASES: Readonly<Record<string, Canonical>> = {
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

/** Active windows (normalised) for the wyrm moves. */
export const WYRM_ATTACKS = {
  spit: { clip: 'Spit', activeStart: 0.55, activeEnd: 0.85 },
  puff: { clip: 'Puff', activeStart: 0.5, activeEnd: 0.8 },
  bite: { clip: 'Bite', activeStart: 0.45, activeEnd: 0.68 },
  tailWhip: { clip: 'TailWhip', activeStart: 0.42, activeEnd: 0.75 },
  dive: { clip: 'Dive', activeStart: 0.5, activeEnd: 0.85 },
} as const;

const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;
const MIN_LEAD_SCALE = 0.25;
const MAX_LEAD_SCALE = 4;
/** Above this altitude (m) the body draws its flight pose. */
const FLYING_ABOVE = 0.3;
/** Seconds of one wingbeat in flight. */
const FLAP_SECONDS = 0.8;

export interface WyrmBodyOptions {
  bus?: DamageBus;
  warn?: (message: string) => void;
  /** Flame jet reach (metres) of the Spit and Puff clips; a clip without one breathes no jet. */
  jets?: Partial<Record<'Spit' | 'Puff', number>>;
  /** Low quality (vfx `low`): half the breath, no smoke. */
  lowQuality?: boolean;
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
  windowOpen: boolean;
  windowClosed: boolean;
  active: boolean;
  ended: boolean;
  endTick: number;
}

/**
 * The procedural wyrm as an `EnemyBody` (Ember Wyrm, Wyrmling; Orsk's rig uses `WyrmRig` directly). Same contracts as
 * `QuadrupedBody`: clips advance only in `fixedUpdate`; `open`/`close` once per swing; an interrupt closes an open
 * window before `onClipEnd(clip, true)`; window sources go null at once. The spline, segments, wings and hurtbox joints
 * are all solved on the fixed tick (the render step only moves the root). The owner feeds `setSpeed` and
 * `setAltitude` every tick (duck-typed, like the quadruped's controls).
 *
 * Telegraph looks (design 11.6) come from the attack clip itself, so they do not depend on who calls `setTelegraph`:
 * the Spit's inhale ramps the mouth glow and fills the cone decal, the Puff swells and glows, the Dive folds the wings
 * and flashes them white, the TailWhip lights the tail.
 */
export class WyrmBody implements EnemyBody {
  readonly rig: WyrmRig;
  readonly root: THREE.Group;
  readonly owner: THREE.Group;
  readonly hurtboxes: HurtboxSet;
  readonly tracers: EnemyBody['tracers'];
  readonly weapons: EnemyBody['weapons'];
  readonly materials: THREE.Material[];

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private readonly jets: Partial<Record<Canonical, number>>;
  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  private frozen: { clip: Canonical; time: number } | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private disposed = false;
  private time = 0;
  private speed = 0;
  private altitudeNow = 0;
  private legPhase = 0;
  private telegraphBoost = 0;
  private opacity = 1;
  private cameraDistance = 0;
  private readonly pose: WyrmPose = restPose();
  private readonly headTmp = { x: 0, y: 0, z: 0 };

  constructor(params: Partial<WyrmParams>, options: WyrmBodyOptions = {}) {
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    this.rig = new WyrmRig(params, { lowQuality: options.lowQuality });
    this.root = this.rig.root;
    this.owner = this.rig.owner;
    this.jets = { ...(options.jets ?? {}) };
    this.materials = [this.rig.materials.scales, this.rig.materials.membrane];
    const defs: HurtboxDef[] = WYRM_JOINTS.map((name) => {
      const size = this.rig.jointSize[name];
      return { name, bone: name, start: { x: 0, y: 0, z: -size.half }, end: { x: 0, y: 0, z: size.half }, radius: size.radius };
    });
    this.hurtboxes = new HurtboxSet(this.owner, defs, this.owner);
    this.weapons = { right: this.rig.mouth, left: this.rig.tailTip };
    const tracer = (w: { object: THREE.Object3D; hilt: THREE.Object3D; tip: THREE.Object3D }, attacker: object): WeaponTracer =>
      new WeaponTracer({ attacker, weapon: w.object, hilt: w.hilt, tip: w.tip, ownHurtboxes: this.hurtboxes, bus: options.bus });
    // Each channel needs its own attacker identity: the mouth uses the owner (as every body), the tail its own object.
    this.tracers = { right: tracer(this.rig.mouth, this.owner), left: tracer(this.rig.tailTip, this.rig.tailTip.object) };
    this.sources = { right: this.makeSource('right'), left: this.makeSource('left') };
    // The camera distance for the LOD comes from the spine's own render callback (the body has no camera).
    this.rig.spineMesh.onBeforeRender = (_r, _s, camera) => {
      const p = camera.getWorldPosition(new THREE.Vector3());
      this.cameraDistance = Math.hypot(p.x - this.root.position.x, p.y - this.root.position.y, p.z - this.root.position.z);
    };
    this.hurtboxes.update();
  }

  // ---------------------------------------------------------------------------------------- controls

  /** Gait speed in m/s (non-finite or negative counts as 0). */
  setSpeed(mps: number): void {
    this.speed = Number.isFinite(mps) && mps > 0 ? mps : 0;
  }

  /** Height of the body above the feet, metres (the flight overlay owns the curve; non-finite counts as 0). */
  setAltitude(m: number): void {
    this.altitudeNow = Number.isFinite(m) && m > 0 ? m : 0;
  }

  get altitude(): number {
    return this.altitudeNow;
  }

  /** The chest joint in world space (the actor position the lock-on marker uses while airborne). */
  chestWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.joints.torso.getWorldPosition(out);
  }

  /** Chain the collar to a post (world), or null to free it. */
  setChain(post: { x: number; y: number; z: number } | null): void {
    this.rig.setChain(post);
  }

  /** Camera distance last seen by the renderer (0 headless), for the LOD. */
  set lastCameraDistance(d: number) {
    this.cameraDistance = Number.isFinite(d) ? d : 0;
  }

  get lod(): number {
    return this.rig.lod;
  }

  /** Emissive boost 0..1: the whole rim brightens toward the telegraph colour (the clip drives the mouth and wings itself). */
  setTelegraph(t: number, _color?: THREE.ColorRepresentation): void {
    if (this.disposed) return;
    this.telegraphBoost = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.rig.uniforms.uRimStrength.value = this.rig.palette.rimStrength * (1 + this.telegraphBoost);
  }

  setOpacity(o: number): void {
    if (this.disposed) return;
    const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
    if (v === this.opacity) return;
    this.opacity = v;
    for (const m of [this.rig.materials.scales, this.rig.materials.membrane]) {
      const transparent = v < 1;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = v;
    }
  }

  // ---------------------------------------------------------------------------------------- clips

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  clipDuration(clip: string): number | undefined {
    const c = canonicalOf(clip);
    return c ? WYRM_CLIP_DURATIONS[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `WyrmBody: clip "${clip}" is missing; using "Idle"`);
      name = WYRM_CLIPS.idle;
      canonical = WYRM_CLIPS.idle;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: WYRM_CLIP_DURATIONS[canonical], endSent: false };
    return name;
  }

  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `WyrmBody: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = WYRM_CLIP_DURATIONS[canonical];
    const windowStartTime = Math.max(0, move.activeStart) * duration;
    const raw = leadSeconds > 0 && Number.isFinite(leadSeconds) ? windowStartTime / leadSeconds : 1;
    const leadScale = windowStartTime > 0 ? THREE.MathUtils.clamp(raw, MIN_LEAD_SCALE, MAX_LEAD_SCALE) : 1;
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
      windowOpen: false,
      windowClosed: false,
      active: false,
      ended: false,
      endTick: -1,
    };
    return this.swingCounter;
  }

  cancelAttack(): void {
    this.interruptAttack(true);
  }

  windowSource(channel: WeaponChannel): AttackWindowSource {
    return this.sources[channel];
  }

  /** One fixed tick: clips, then the pose, the spine and the rig. Non-positive or non-finite `dt` is ignored. */
  fixedUpdate(dt: number = FIXED_TIMESTEP): void {
    if (this.disposed || !(dt > 0) || !Number.isFinite(dt)) return;
    this.tickCount++;
    this.time += dt;
    const a = this.attack && !this.attack.ended ? this.attack : null;
    const advance = a ? this.attackAdvance(a, dt) : 0;
    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    const attackTime = a ? Math.min(a.duration, a.clipTime + advance) : 0;
    this.evaluate(a, attackTime, dt);

    // LOD from the last rendered camera distance (0 when nothing renders: full detail).
    this.rig.lod = this.cameraDistance > LOD_DISTANCES[1] ? 2 : this.cameraDistance > LOD_DISTANCES[0] ? 1 : 0;
    const frame = this.rootFrame();
    const head = this.rig.headWorld(frame, this.altitudeNow, this.pose, this.headTmp);
    this.rig.spine.step(dt, head, { speed: this.speed, flying: this.altitudeNow > FLYING_ABOVE });
    const visual = this.rig.lod < 2 || this.tickCount % 2 === 0;
    this.rig.apply(frame, this.pose, dt, visual);

    if (a) this.progressAttack(a, advance);
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
    this.onWindow = null;
    this.onClipEnd = null;
    this.rig.spineMesh.onBeforeRender = () => {};
    this.hurtboxes.dispose();
    this.rig.dispose();
  }

  /** The pose drawn last tick (tests). */
  get lastPose(): Readonly<WyrmPose> {
    return this.pose;
  }

  // ---------------------------------------------------------------------------------------- pose

  private rootFrame(): RootFrame {
    const r = this.root;
    return { x: r.position.x, y: r.position.y, z: r.position.z, yaw: r.rotation.y };
  }

  private evaluate(a: AttackRun | null, attackTime: number, dt: number): void {
    const p = this.pose;
    Object.assign(p, restPose());
    const flying = this.altitudeNow > FLYING_ABOVE;
    // Base: flight or ground locomotion.
    if (flying) {
      const beat = (this.time / FLAP_SECONDS) * Math.PI * 2;
      p.flap = 0.15 + 0.55 * Math.sin(beat);
      p.fold = 0;
      p.billow = 1;
      p.legTuck = 1;
      p.headPitch = -0.1;
    } else {
      p.flap = -0.15;
      p.fold = 0.85;
      p.legTuck = 0;
      this.legPhase += dt * (1.5 + this.speed * 2.2);
      p.legPhase = this.legPhase;
    }
    const clip = a ? a.canonical : this.current ? this.current.canonical : this.frozen ? this.frozen.clip : 'Idle';
    const dur = WYRM_CLIP_DURATIONS[clip];
    const t = a ? attackTime : this.current ? (this.current.loop ? this.current.elapsed % dur : Math.min(this.current.elapsed, dur)) : this.frozen?.time ?? 0;
    const u = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 1;
    const ws = a ? a.move.activeStart : 0.5;
    const we = a ? a.move.activeEnd : 0.8;
    const pre = ws > 0 ? Math.min(1, u / ws) : 1;
    const inWindow = u >= ws && u <= we;
    const post = u > we ? Math.min(1, (u - we) / Math.max(1e-6, 1 - we)) : 0;
    switch (clip) {
      case 'Idle':
        p.headPitch += 0.05 * Math.sin(this.time * 0.9);
        p.headYaw = 0.15 * Math.sin(this.time * 0.37);
        break;
      case 'Walk':
      case 'Run':
        p.headPitch -= 0.05;
        break;
      case 'Spit': {
        const jet = this.jets.Spit ?? 0;
        p.mouth = u < ws ? pre : inWindow ? 1 : 1 - post;
        p.headPitch += u < ws ? 0.35 * pre : -0.15;
        p.jaw = u < ws ? 0.2 * pre : inWindow ? 1 : 1 - post;
        p.cone = u < ws ? pre : inWindow ? 1 : 0;
        p.coneReach = jet;
        if (inWindow && jet > 0) {
          p.breath = 1;
          p.breathReach = jet;
        }
        break;
      }
      case 'Puff': {
        const jet = this.jets.Puff ?? 0;
        // The 0.3 s cheek puff: the jaw stays shut and the mouth core swells, then a short jet.
        p.mouth = u < ws ? pre : inWindow ? 1 : 1 - post;
        p.jaw = u < ws ? 0 : inWindow ? 0.7 : 0.7 * (1 - post);
        p.headPitch += u < ws ? 0.2 * pre : -0.1;
        if (inWindow && jet > 0) {
          p.breath = 1;
          p.breathReach = jet;
        }
        break;
      }
      case 'Bite':
        p.jaw = u < ws ? pre : inWindow ? 1 - (u - ws) / Math.max(1e-6, we - ws) : 0;
        p.headPitch += u < ws ? 0.25 * pre : -0.35;
        break;
      case 'TailWhip':
        p.tailGlow = u < ws ? pre : inWindow ? 1 : 1 - post;
        p.headYaw = u < ws ? 0.4 * pre : 0.4 - 0.8 * Math.min(1, (u - ws) / Math.max(1e-6, we - ws));
        if (inWindow) p.whip = -1.1 + 2.2 * ((u - ws) / Math.max(1e-6, we - ws));
        break;
      case 'Dive':
        // The 0.9 s fold and wing flash, then the stoop.
        p.fold = u < ws ? Math.max(p.fold, pre) : 1;
        p.flap = u < ws ? 0.35 * (1 - pre) + 0.2 : 0.2;
        p.flash = u < ws ? pre : inWindow ? 1 - (u - ws) / Math.max(1e-6, we - ws) : 0;
        p.headPitch = u < ws ? -0.2 * pre : -0.5;
        p.billow = 0;
        break;
      case 'Flinch':
        p.headPitch += 0.25 * Math.sin(Math.PI * u);
        break;
      case 'Knockdown': {
        // Down on its side in 0.3 s and held there.
        const k = Math.min(1, t / 0.3);
        p.roll = 1.1 * k;
        p.fold = 0.6;
        p.flap = -0.6;
        p.headPitch = -0.3 * k;
        p.legTuck = 0;
        break;
      }
      case 'HeadLower':
        p.headPitch = -0.5;
        break;
      case 'Roar':
        p.headPitch = 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.4));
        p.jaw = u > 0.3 && u < 0.85 ? 1 : 0.2;
        p.mouth = u < 0.3 ? u / 0.3 * 0.6 : u < 0.85 ? 0.8 : 0.2;
        p.fold = flying ? 0 : 0.3;
        p.flap = flying ? p.flap : 0.4;
        break;
      case 'Rest':
        p.headPitch = -0.6;
        p.fold = 1;
        p.flap = -0.25;
        break;
    }
    // A telegraph flash on top lifts the rim (setTelegraph); the mouth never dims below the clip's own value.
    p.mouth = Math.max(p.mouth, 0);
  }

  // ---------------------------------------------------------------------------------------- windows

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
    const prev = a.normalizedTime;
    a.normalizedTime = a.clipTime >= a.duration ? 1 : Math.min(1, Math.max(prev, a.clipTime / a.duration));
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
  if (Object.prototype.hasOwnProperty.call(WYRM_CLIP_DURATIONS, clip)) return clip as Canonical;
  return Object.prototype.hasOwnProperty.call(WYRM_CLIP_ALIASES, clip) ? WYRM_CLIP_ALIASES[clip] : undefined;
}
