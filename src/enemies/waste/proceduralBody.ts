import * as THREE from 'three';
import type { DamageBus } from '../../combat/DamageBus';
import type { HurtboxSet } from '../../combat/HurtboxSet';
import type { AttackWindowSource } from '../../combat/types';
import { WeaponTracer } from '../../combat/WeaponTracer';
import { FIXED_TIMESTEP } from '../../config/constants';
import type { EnemyBody } from '../body';
import type { PlayOptions, WindowPhase } from '../EnemyAnimator';
import type { MoveDef, WeaponChannel } from '../types';

export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
const END_EPSILON = 1e-4;
const START_EPSILON = 1e-7;

export interface ProceduralBodyOptions {
  bus?: DamageBus;
  warn?: (message: string) => void;
}

/** What the body draws this tick: the clip, its time and 0..1 progress, and whether it is an attack. */
export interface ClipSample {
  clip: string;
  time: number;
  u: number;
  attack: MoveDef | null;
}

interface Playing {
  clip: string;
  canonical: string;
  loop: boolean;
  timeScale: number;
  elapsed: number;
  duration: number;
  endSent: boolean;
}

interface AttackRun {
  move: MoveDef;
  canonical: string;
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
 * The clip and attack-window machinery the shipped procedural bodies (the hawk, the leech) each carry, shared by the Waste's
 * two bodies (Act 4 L5): a table of clip durations and the names `Enemy.ts` asks for, attack runs whose pre-window part is
 * time-scaled to the move's wind-up, and `onWindow` / `onClipEnd` in the same order as `HawkBody`. A subclass builds its
 * mesh, hurtboxes and channels, and draws a `ClipSample` in `pose()`.
 */
export abstract class ProceduralBody implements EnemyBody {
  abstract readonly root: THREE.Group;
  abstract readonly owner: THREE.Object3D;
  abstract readonly hurtboxes: HurtboxSet;
  abstract readonly materials: THREE.Material[];
  readonly tracers = {} as EnemyBody['tracers'];
  readonly weapons = {} as EnemyBody['weapons'];

  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  protected readonly warn: (message: string) => void;
  protected readonly bus: DamageBus | undefined;
  protected disposed = false;
  protected tickCount = 0;
  /** Seconds since the body was made (idle sways). */
  protected time = 0;
  protected telegraphK = 0;
  protected readonly telegraphColor = new THREE.Color();

  private readonly warned = new Set<string>();
  private readonly sources: Record<string, AttackWindowSource> = {};
  private current: Playing | null = null;
  private attack: AttackRun | null = null;
  private frozen: { clip: string; time: number } | null = null;
  private swingCounter = 0;

  protected constructor(
    protected readonly durations: Readonly<Record<string, number>>,
    protected readonly aliases: Readonly<Record<string, string>>,
    protected readonly fallbackClip: string,
    options: ProceduralBodyOptions,
  ) {
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    this.bus = options.bus;
  }

  /** Builds the weapon channel `channel` from `parent` (hilt and tip markers) with its tracer. Call from the constructor. */
  protected addChannel(channel: WeaponChannel, parent: THREE.Object3D, hiltAt: THREE.Vector3, tipAt: THREE.Vector3, attacker: THREE.Object3D): void {
    const object = new THREE.Object3D();
    object.name = `${channel}-channel`;
    const hilt = new THREE.Object3D();
    const tip = new THREE.Object3D();
    hilt.position.copy(hiltAt);
    tip.position.copy(tipAt);
    object.add(hilt, tip);
    parent.add(object);
    (this.weapons as Record<string, unknown>)[channel] = { object, hilt, tip };
    (this.tracers as Record<string, unknown>)[channel] = new WeaponTracer({ attacker, weapon: object, hilt, tip, ownHurtboxes: this.hurtboxes, bus: this.bus });
  }

  /** Draws this tick's pose. */
  protected abstract pose(sample: ClipSample, dt: number): void;
  /** Frees the subclass's meshes and materials. */
  protected abstract disposeVisual(): void;

  abstract setOpacity(o: number): void;

  setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffb347): void {
    if (this.disposed) return;
    this.telegraphK = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
    this.telegraphColor.set(color);
  }

  get telegraph(): number {
    return this.telegraphK;
  }

  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  /** The canonical clip drawn now (tests). */
  get drawnClip(): string {
    if (this.attack && !this.attack.ended) return this.attack.canonical;
    return this.current?.canonical ?? this.frozen?.clip ?? this.fallbackClip;
  }

  clipDuration(clip: string): number | undefined {
    const c = this.canonicalOf(clip);
    return c ? this.durations[c] : undefined;
  }

  play(clip: string, opts: PlayOptions = {}): string {
    let name = clip;
    let canonical = this.canonicalOf(clip);
    if (!canonical) {
      this.warnOnce(clip, `${this.constructor.name}: clip "${clip}" is missing; using "${this.fallbackClip}"`);
      name = this.fallbackClip;
      canonical = this.fallbackClip;
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
    this.current = { clip: name, canonical, loop, timeScale, elapsed: 0, duration: this.durations[canonical] ?? 1, endSent: false };
    return name;
  }

  playAttack(move: MoveDef, leadSeconds: number): number {
    const canonical = this.canonicalOf(move.clip);
    if (!canonical) {
      this.warnOnce(move.clip, `${this.constructor.name}: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack(false);
    this.endCurrentOneShot();
    this.frozen = null;
    const duration = this.durations[canonical] ?? 1;
    const windowStartTime = Math.max(0, move.activeStart) * duration;
    const raw = leadSeconds > 0 && Number.isFinite(leadSeconds) ? windowStartTime / leadSeconds : 1;
    const leadScale = windowStartTime > 0 ? THREE.MathUtils.clamp(raw, MIN_LEAD_SCALE, MAX_LEAD_SCALE) : 1;
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
    let s = this.sources[channel];
    if (!s) {
      s = this.makeSource(channel);
      this.sources[channel] = s;
    }
    return s;
  }

  fixedUpdate(dt: number = FIXED_TIMESTEP): void {
    if (this.disposed || !(dt > 0) || !Number.isFinite(dt)) return;
    this.tickCount++;
    this.time += dt;
    const a = this.attack && !this.attack.ended ? this.attack : null;
    const advance = a ? this.attackAdvance(a, dt) : 0;
    if (this.current && !a) this.current.elapsed += dt * this.current.timeScale;
    let sample: ClipSample;
    if (a) {
      const t = Math.min(a.duration, a.clipTime + advance);
      sample = { clip: a.canonical, time: t, u: a.duration > 0 ? t / a.duration : 1, attack: a.move };
    } else if (this.current) {
      const c = this.current;
      const t = c.loop ? c.elapsed : Math.min(c.elapsed, c.duration);
      const u = c.duration > 0 ? (c.loop ? (((t / c.duration) % 1) + 1) % 1 : Math.min(1, t / c.duration)) : 1;
      sample = { clip: c.canonical, time: t, u, attack: null };
    } else if (this.frozen) {
      const d = this.durations[this.frozen.clip] ?? 1;
      sample = { clip: this.frozen.clip, time: this.frozen.time, u: d > 0 ? Math.min(1, this.frozen.time / d) : 1, attack: null };
    } else {
      sample = { clip: this.fallbackClip, time: this.time, u: 0, attack: null };
    }
    this.pose(sample, dt);
    this.root.updateWorldMatrix(true, true);
    this.hurtboxes.update();

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
    this.frozen = null;
    this.onWindow = null;
    this.onClipEnd = null;
    this.hurtboxes.dispose();
    this.disposeVisual();
    this.root.removeFromParent();
  }

  protected canonicalOf(clip: string): string | undefined {
    if (Object.prototype.hasOwnProperty.call(this.durations, clip)) return clip;
    return Object.prototype.hasOwnProperty.call(this.aliases, clip) ? this.aliases[clip] : undefined;
  }

  private makeSource(channel: WeaponChannel): AttackWindowSource {
    const self = this;
    const mine = (): AttackRun | null => {
      const a = self.attack;
      if (!a || (a.ended && a.endTick !== self.tickCount)) return null;
      return a.move.weapon === channel ? a : null;
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

  protected warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }
}
