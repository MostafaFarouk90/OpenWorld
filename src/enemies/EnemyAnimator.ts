import * as THREE from 'three';
import { FIXED_TIMESTEP, KNIGHT } from '../config/constants';
import type { AttackWindowSource } from '../combat/types';
import { ENEMY_CLIPS } from './clips';
import type { MoveDef, WeaponChannel } from './types';

/**
 * Clip time within this many seconds of the end counts as finished (as AnimationController): Knight clips
 * last whole ticks and glTF stores durations as float32, so accumulated tick time can stop a hair short.
 */
const END_EPSILON = 1e-4;
/** Slack on the window-start comparison, so the tick that lands exactly on activeStart opens it. */
const START_EPSILON = 1e-7;
/** Limits on the pre-window time scale of `playAttack`. */
export const MIN_LEAD_SCALE = 0.25;
export const MAX_LEAD_SCALE = 4;
/** Default crossfade of `play`, and into an attack. */
export const DEFAULT_FADE = KNIGHT.fadeSeconds;
export const ATTACK_FADE = KNIGHT.fadeIntoAttackSeconds;

export type WindowPhase = 'open' | 'close';

export interface PlayOptions {
  /** Loop the clip (default false: play once and hold the last frame). */
  loop?: boolean;
  /** Crossfade seconds (default DEFAULT_FADE; 0 snaps). */
  fade?: number;
  /** Playback rate (default 1). */
  timeScale?: number;
}

export interface EnemyAnimatorOptions {
  /** Missing clips are reported once each. Default: console.warn. */
  warn?: (message: string) => void;
  /** Clip used for missing clips; required. Default ENEMY_CLIPS.idle ('Idle'). */
  fallbackClip?: string;
}

export interface EnemyActiveAttack {
  move: MoveDef;
  swingId: number;
  normalizedTime: number;
  previousNormalizedTime: number;
  /** In the window on this tick (also true on the one tick of a window shorter than a tick). */
  active: boolean;
}

interface AttackRun {
  move: MoveDef;
  swingId: number;
  duration: number;
  /** Clip seconds of the pre-window part, and its playback rate. */
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

interface Playing {
  clip: string;
  loop: boolean;
  timeScale: number;
  elapsed: number;
  duration: number;
  endSent: boolean;
}

/**
 * One enemy's animation: its own AnimationMixer, advanced only in `fixedUpdate` (the fixed `animation`
 * phase, by 1/60), crossfades by linear weight ramps (as AnimationController), one-shot clips, and
 * attacks whose pre-window part is time-scaled to the telegraph lead.
 *
 * Window guarantees (contracts/animation-events.md): `open` once and `close` once per swing; a window shorter
 * than a tick opens and closes on one tick and still reports active on it; on the finishing tick normalised
 * time is exactly 1 and the attack is still visible, from the next tick it is null. Interrupted (cancelAttack,
 * or play / playAttack over it): `close` first if the window was open, then `onClipEnd(clip, true)`, and the
 * window sources return null at once.
 */
export class EnemyAnimator {
  readonly mixer: THREE.AnimationMixer;
  onWindow: ((channel: WeaponChannel, phase: WindowPhase, swingId: number) => void) | null = null;
  onClipEnd: ((clip: string, interrupted: boolean) => void) | null = null;

  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly weights = new Map<string, number>();
  private readonly warned = new Set<string>();
  private readonly warn: (message: string) => void;
  private readonly fallback: string;
  private readonly sources: Record<WeaponChannel, AttackWindowSource>;
  private current: Playing | null = null;
  private fadeRate = Infinity;
  /** The clip whose weight ramps up to 1. */
  private fadeTarget: string | null = null;
  private mixerHasPlayed = false;
  private attack: AttackRun | null = null;
  private swingCounter = 0;
  private tickCount = 0;

  /** @throws Error when `clips` lacks the fallback clip ('Idle'). */
  constructor(
    private readonly root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    options: EnemyAnimatorOptions = {},
  ) {
    this.warn = options.warn ?? ((m: string) => console.warn(m));
    this.fallback = options.fallbackClip ?? ENEMY_CLIPS.idle;
    for (const c of clips) this.clips.set(c.name, c);
    if (!this.clips.has(this.fallback)) {
      throw new Error(`EnemyAnimator: required clip "${this.fallback}" is missing`);
    }
    this.mixer = new THREE.AnimationMixer(root);
    this.sources = { right: this.makeSource('right'), left: this.makeSource('left') };
  }

  /** The clip playing (or fading in) now, or null before the first play. */
  get currentClip(): string | null {
    return this.attack && !this.attack.ended ? this.attack.move.clip : (this.current?.clip ?? null);
  }

  /** Current blend weight of a clip (0 when not playing). */
  weightOf(clip: string): number {
    return this.weights.get(clip) ?? 0;
  }

  /** Duration in seconds of a clip the animator was given, or undefined when it is missing. */
  clipDuration(clip: string): number | undefined {
    return this.clips.get(clip)?.duration;
  }

  /** The mixer action of a clip, once it has played. */
  action(clip: string): THREE.AnimationAction | undefined {
    return this.actions.get(clip);
  }

  /**
   * Crossfades to `clip`. A missing clip warns once and plays the fallback ('Idle'). Playing over an attack
   * interrupts it. Returns the clip actually played.
   */
  play(clip: string, opts: PlayOptions = {}): string {
    const name = this.resolve(clip);
    this.interruptAttack();
    const loop = opts.loop ?? false;
    const timeScale = opts.timeScale ?? 1;
    const cur = this.current;
    if (cur && cur.clip === name && cur.loop && loop) {
      cur.timeScale = timeScale;
      return name;
    }
    this.endCurrentOneShot();
    this.start(name, loop, opts.fade ?? DEFAULT_FADE);
    this.current = { clip: name, loop, timeScale, elapsed: 0, duration: this.clips.get(name)!.duration, endSent: false };
    return name;
  }

  /** Playback rate of the current non-attack clip (e.g. walk speed matching). */
  setTimeScale(scale: number): void {
    if (this.current && Number.isFinite(scale)) this.current.timeScale = scale;
  }

  /**
   * Plays an attack so the part of the clip before `activeStart` takes `leadSeconds` (rate
   * activeStart x duration / leadSeconds, clamped to [0.25, 4]); from `activeStart` on it plays at rate 1.
   * Interrupts a running attack. Returns the new swingId, or -1 (and plays nothing) when the clip is missing.
   */
  playAttack(move: MoveDef, leadSeconds: number): number {
    const clip = this.clips.get(move.clip);
    if (!clip) {
      this.warnOnce(move.clip, `EnemyAnimator: attack clip "${move.clip}" (${move.id}) is missing; not attacking`);
      return -1;
    }
    this.interruptAttack();
    this.endCurrentOneShot();
    const duration = clip.duration;
    const windowStartTime = Math.max(0, move.activeStart) * duration;
    const raw = leadSeconds > 0 && Number.isFinite(leadSeconds) ? windowStartTime / leadSeconds : 1;
    const leadScale = windowStartTime > 0 ? THREE.MathUtils.clamp(raw, MIN_LEAD_SCALE, MAX_LEAD_SCALE) : 1;
    this.start(move.clip, false, ATTACK_FADE);
    this.current = null;
    this.swingCounter++;
    this.attack = {
      move,
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

  /**
   * Interrupts the running attack: `close` first when its window is open, then `onClipEnd(clip, true)`; the
   * window sources report null from now on. The clip's pose holds until the next `play`. No-op without one.
   */
  cancelAttack(): void {
    this.interruptAttack();
  }

  /** The attack playing this tick (visible on its finishing tick), or null. */
  activeAttack(): EnemyActiveAttack | null {
    const a = this.visibleAttack();
    if (!a) return null;
    return {
      move: a.move,
      swingId: a.swingId,
      normalizedTime: a.normalizedTime,
      previousNormalizedTime: a.previousNormalizedTime,
      active: a.active,
    };
  }

  /** The AttackWindowSource for one weapon channel (stable object; give it to combat.addAttacker). */
  windowSource(channel: WeaponChannel): AttackWindowSource {
    return this.sources[channel];
  }

  /**
   * One fixed tick: ramps weights, advances the mixer by exactly `dt` (the only place it advances), updates
   * the root's world matrices, then fires this tick's window and clip-end callbacks.
   */
  fixedUpdate(dt: number = FIXED_TIMESTEP): void {
    this.tickCount++;
    const a = this.attack && !this.attack.ended ? this.attack : null;
    let attackAdvance = 0;
    if (a) {
      attackAdvance = this.attackAdvance(a, dt);
      this.actions.get(a.move.clip)!.timeScale = dt > 0 ? attackAdvance / dt : 0;
    } else if (this.current) {
      this.actions.get(this.current.clip)!.timeScale = this.current.timeScale;
    }
    this.rampWeights(dt);
    this.mixer.update(dt);
    this.root.updateWorldMatrix(true, true);

    if (a) this.progressAttack(a, attackAdvance);
    else if (this.current && !this.current.loop && !this.current.endSent) {
      const c = this.current;
      c.elapsed += dt * c.timeScale;
      if (c.elapsed >= c.duration - END_EPSILON) {
        c.endSent = true;
        this.onClipEnd?.(c.clip, false);
      }
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.weights.clear();
    this.attack = null;
    this.current = null;
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
        // A window shorter than a tick is skipped over but counts as active for its tick: clamp into it.
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

  /** Clip seconds this tick: the lead rate up to the window start, then rate 1. */
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

  private interruptAttack(): void {
    const a = this.attack;
    this.attack = null;
    if (!a || a.ended) return;
    a.ended = true;
    a.active = false;
    if (a.windowOpen && !a.windowClosed) {
      a.windowClosed = true;
      this.onWindow?.(a.move.weapon, 'close', a.swingId);
    }
    this.onClipEnd?.(a.move.clip, true);
  }

  /** A one-shot replaced before it finished reports an interrupted end. */
  private endCurrentOneShot(): void {
    const c = this.current;
    if (c && !c.loop && !c.endSent) {
      c.endSent = true;
      this.onClipEnd?.(c.clip, true);
    }
  }

  private resolve(clip: string): string {
    if (this.clips.has(clip)) return clip;
    this.warnOnce(clip, `EnemyAnimator: clip "${clip}" is missing; using "${this.fallback}"`);
    return this.fallback;
  }

  private warnOnce(clip: string, message: string): void {
    if (this.warned.has(clip)) return;
    this.warned.add(clip);
    this.warn(message);
  }

  private start(name: string, loop: boolean, fade: number): void {
    let action = this.actions.get(name);
    if (!action) {
      action = this.mixer.clipAction(this.clips.get(name)!);
      this.actions.set(name, action);
    }
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    // A loop that is still fading out keeps its time so it does not jump; one-shots restart.
    if (!loop || !this.weights.has(name)) {
      action.reset();
      action.enabled = true;
      action.timeScale = 1;
      action.play();
    }
    if (!this.weights.has(name)) this.weights.set(name, 0);
    this.fadeTarget = name;
    this.fadeRate = fade > 0 ? 1 / fade : Infinity;
    if (!this.mixerHasPlayed) {
      // First clip: no blend from the bind pose.
      this.mixerHasPlayed = true;
      this.fadeRate = Infinity;
    }
  }

  /**
   * Moves the target clip's weight up by one step and scales the others down so the weights sum to 1
   * (AnimationController's ramp): an interrupted fade continues from where it was, without pops.
   */
  private rampWeights(dt: number): void {
    const target = this.fadeTarget;
    if (!target) return;
    const current = this.weights.get(target) ?? 0;
    const next = this.fadeRate === Infinity ? 1 : Math.min(1, current + this.fadeRate * dt);
    const others = 1 - current;
    const scale = others > 1e-9 ? (1 - next) / others : 0;
    for (const [clip, w] of this.weights) {
      if (clip === target) {
        this.weights.set(clip, next);
      } else if (w * scale < 1e-4) {
        this.weights.delete(clip);
        this.actions.get(clip)!.stop();
      } else {
        this.weights.set(clip, w * scale);
      }
    }
    for (const [clip, w] of this.weights) this.actions.get(clip)!.setEffectiveWeight(w);
  }
}
