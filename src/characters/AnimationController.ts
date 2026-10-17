import * as THREE from 'three';
import { FIXED_TIMESTEP, KNIGHT, PLAYER } from '../config/constants';
import { AnimationEvents } from './AnimationEvents';
import {
  CLIP_FALLBACKS,
  GROUNDED_STATES,
  KNIGHT_ATTACKS,
  KNIGHT_CLIPS,
  KNIGHT_FOOTSTEPS,
  LOOPING_STATES,
  type AttackClipDef,
  type ClipMap,
  type Foot,
  type LocomotionState,
} from './knightClips';
import { nextState, type LocomotionInput } from './locomotionState';

export interface AnimationControllerOptions {
  clipMap?: ClipMap;
  attacks?: readonly AttackClipDef[];
  footsteps?: Readonly<Record<string, ReadonlyArray<{ phase: number; foot: Foot }>>>;
  /** Reports missing clips that fell back to another state's clip. Default: console.warn. */
  warn?: (message: string) => void;
}

export interface ActiveAttack extends AttackClipDef {
  normalizedTime: number;
  previousNormalizedTime: number;
  active: boolean;
  swingId: number;
}

interface AttackRun {
  def: AttackClipDef;
  swingId: number;
  normalizedTime: number;
  previousNormalizedTime: number;
  windowOpen: boolean;
  windowClosed: boolean;
  /** Whether the weapon counted as dangerous on the latest tick (also true for a sub-tick window). */
  active: boolean;
  ended: boolean;
  /** Tick on which the clip played to its end; the attack stays visible to combat for that tick. */
  endTick: number;
}

/**
 * Clip time within this many seconds of the end counts as finished. Knight clips last whole ticks
 * and glTF stores durations as float32, so accumulated tick time can stop a hair short of the end.
 */
const END_EPSILON = 1e-4;

type ClipState = Exclude<LocomotionState, 'attack'>;

/**
 * Drives the Knight's clips from the character controller's state.
 *
 * The mixer advances only in `fixedUpdate`, by one fixed tick, so poses and events line up with the
 * simulation (combat sweeps the weapon between consecutive ticks). Crossfades use our own weight
 * ramps, normalised to sum to 1: every action moves linearly from its current weight, so a blend
 * interrupted by another never pops (Three's fadeIn/fadeOut restart from full weight).
 */
export class AnimationController {
  readonly mixer: THREE.AnimationMixer;
  readonly events = new AnimationEvents();

  private readonly actions = new Map<string, THREE.AnimationAction>();
  /** Blend weights by clip name, summing to 1; only actions listed here are playing. */
  private readonly weights = new Map<string, number>();
  private readonly stateClips: Record<ClipState, string>;
  private readonly attackDefs = new Map<string, AttackClipDef>();
  private readonly footsteps: AnimationControllerOptions['footsteps'] & object;
  /** Normalised time of each loop after the previous tick, for footstep crossings. */
  private readonly lastPhase = new Map<string, number>();

  private _state: LocomotionState = 'idle';
  private currentClip: string;
  private fadeRate = Infinity;
  private timeInState = 0;
  /** Clip time played in the current state, scaled by playback rate. */
  private clipElapsed = 0;
  private clipEndSent = false;
  private airTime = 0;
  private minAirVerticalSpeed = 0;
  private pendingAttack: AttackClipDef | null = null;
  private attack: AttackRun | null = null;
  private swingCounter = 0;
  private tickCount = 0;

  /**
   * @throws Error when `clips` lacks the idle clip, which every fallback ends at.
   */
  constructor(
    private readonly root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    options: AnimationControllerOptions = {},
  ) {
    const clipMap = options.clipMap ?? KNIGHT_CLIPS;
    const warn = options.warn ?? ((m: string) => console.warn(m));
    const byName = new Map(clips.map((c) => [c.name, c]));
    if (!byName.has(clipMap.idle)) {
      const available = clips.length ? clips.map((c) => c.name).join(', ') : 'none';
      throw new Error(`AnimationController: required clip "${clipMap.idle}" is missing (available: ${available})`);
    }

    this.mixer = new THREE.AnimationMixer(root);
    const resolve = (state: ClipState): string => {
      if (byName.has(clipMap[state]) || state === 'idle') return clipMap[state];
      return resolve(CLIP_FALLBACKS[state]);
    };
    this.stateClips = {} as Record<ClipState, string>;
    const states = Object.keys(clipMap) as ClipState[];
    for (const state of states) {
      const name = resolve(state);
      if (name !== clipMap[state]) warn(`AnimationController: clip "${clipMap[state]}" for ${state} is missing; using "${name}"`);
      this.stateClips[state] = name;
    }
    for (const state of states) {
      const name = this.stateClips[state];
      // A clip loops if any looping state plays it (e.g. Jump_Idle standing in for a missing Jump_Start).
      const loop = states.some((s) => LOOPING_STATES.has(s) && this.stateClips[s] === name);
      this.ensureAction(byName.get(name)!, loop);
    }
    for (const def of options.attacks ?? KNIGHT_ATTACKS) {
      const clip = byName.get(def.clip);
      if (!clip) continue; // Unknown attacks are refused by playAttack.
      this.attackDefs.set(def.clip, def);
      this.ensureAction(clip, false);
    }
    this.footsteps = options.footsteps ?? KNIGHT_FOOTSTEPS;

    this.currentClip = this.stateClips.idle;
    this.startAction(this.currentClip);
    this.weights.set(this.currentClip, 1);
    this.actions.get(this.currentClip)!.setEffectiveWeight(1);
  }

  get state(): LocomotionState {
    return this._state;
  }

  /** True while an attack plays or is queued for the next tick: the player must not move or jump. */
  get movementLocked(): boolean {
    return this._state === 'attack' || this.pendingAttack !== null;
  }

  /** The mixer action for a clip, or undefined if the controller does not use that clip. */
  action(clip: string): THREE.AnimationAction | undefined {
    return this.actions.get(clip);
  }

  /** Current blend weight of a clip (0 when not playing). */
  weightOf(clip: string): number {
    const action = this.actions.get(clip);
    return action ? (this.weights.get(clip) ?? 0) : 0;
  }

  /**
   * Queues an attack to start on the next fixed tick. Returns false (and does nothing) for an
   * unknown clip, while not standing on the ground, or while an attack is playing or queued.
   */
  playAttack(clip: string): boolean {
    const def = this.attackDefs.get(clip);
    if (!def || this.movementLocked || !GROUNDED_STATES.has(this._state)) return false;
    this.pendingAttack = def;
    return true;
  }

  /** The attack playing this tick, or null. */
  activeAttack(): ActiveAttack | null {
    const a = this.attack;
    if (!a || (a.ended && a.endTick !== this.tickCount)) return null;
    return {
      ...a.def,
      normalizedTime: a.normalizedTime,
      previousNormalizedTime: a.previousNormalizedTime,
      active: a.active,
      swingId: a.swingId,
    };
  }

  /**
   * Advances one fixed tick: picks the state from what the controller did, ramps blend weights,
   * advances the mixer, updates the root's world matrices, then emits this tick's events.
   */
  fixedUpdate(input: LocomotionInput, dt: number = FIXED_TIMESTEP): void {
    this.tickCount++;
    this.airTime = input.grounded ? 0 : this.airTime + dt;
    if (!input.grounded) this.minAirVerticalSpeed = Math.min(this.minAirVerticalSpeed, input.verticalSpeed);

    const queued: Array<() => void> = [];
    const pending = this.pendingAttack;
    this.pendingAttack = null;
    if (pending && GROUNDED_STATES.has(this._state) && input.grounded) {
      this.enter('attack', pending.clip, queued);
      this.swingCounter++;
      this.attack = {
        def: pending,
        swingId: this.swingCounter,
        normalizedTime: 0,
        previousNormalizedTime: 0,
        windowOpen: false,
        windowClosed: false,
        active: false,
        ended: false,
        endTick: -1,
      };
    } else {
      const clipDuration = this.actions.get(this.currentClip)!.getClip().duration;
      const next = nextState(this._state, input, {
        timeInState: this.timeInState,
        airTime: this.airTime,
        clipDone: this.clipElapsed >= clipDuration - END_EPSILON,
      });
      if (next !== this._state) {
        const wasAirborne = this._state === 'airborne' || this._state === 'jumpStart';
        this.enter(next, this.stateClips[next as ClipState], queued);
        if (next === 'land' && wasAirborne) {
          const fallSpeed = Math.max(0, -this.minAirVerticalSpeed);
          queued.push(() => this.events.emit({ type: 'land', fallSpeed }));
        }
      }
    }
    if (input.grounded) this.minAirVerticalSpeed = 0;

    // Playback rate: walk and run follow the actual speed.
    const rate = this.loopRate(input.horizontalSpeed);
    this.actions.get(this.currentClip)!.timeScale = rate;

    this.rampWeights(dt);
    this.mixer.update(dt);
    this.timeInState += dt;
    this.clipElapsed += dt * rate;
    this.root.updateWorldMatrix(true, true);

    for (const emit of queued) emit();
    this.emitAttackProgress();
    this.emitOneShotEnd();
    this.emitFootsteps(input.grounded);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.weights.clear();
  }

  private enter(next: LocomotionState, clip: string, queued: Array<() => void>): void {
    const from = this._state;
    const fromClip = this.currentClip;
    const fromOneShot = this.actions.get(fromClip)!.loop === THREE.LoopOnce;
    const endSent = this.clipEndSent;
    const attack = this.attack;

    this._state = next;
    this.currentClip = clip;
    this.timeInState = 0;
    this.clipElapsed = 0;
    this.clipEndSent = false;
    this.attack = null;
    this.fadeRate = 1 / fadeSeconds(from, next);

    const action = this.actions.get(clip)!;
    // One-shots restart; a loop that is still fading out keeps its time so it does not jump.
    const oneShot = action.loop === THREE.LoopOnce;
    if (oneShot || !this.weights.has(clip)) this.startAction(clip);
    if (!this.weights.has(clip)) this.weights.set(clip, 0);
    if (!oneShot && !this.lastPhase.has(clip)) this.lastPhase.set(clip, phaseOf(action));

    queued.push(() => {
      if (attack && !attack.ended) {
        // Interrupted attack (left the ground): close an open window before ending the clip.
        if (attack.windowOpen && !attack.windowClosed) {
          attack.windowClosed = true;
          this.events.emit({
            type: 'attackWindow',
            clip: attack.def.clip,
            swingId: attack.swingId,
            phase: 'close',
            normalizedTime: attack.normalizedTime,
          });
        }
        attack.ended = true;
      }
      if (!endSent) this.events.emit({ type: 'clipEnd', clip: fromClip, interrupted: fromOneShot });
      this.events.emit({ type: 'stateChange', from, to: next });
      this.events.emit({ type: 'clipStart', clip });
    });
  }

  private startAction(clip: string): void {
    const action = this.actions.get(clip)!;
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.play();
  }

  private ensureAction(clip: THREE.AnimationClip, loop: boolean): void {
    if (this.actions.has(clip.name)) return;
    const action = this.mixer.clipAction(clip);
    if (loop) action.setLoop(THREE.LoopRepeat, Infinity);
    else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    this.actions.set(clip.name, action);
  }

  /**
   * Moves the current clip's weight up by one step and scales every other clip down so the weights
   * keep summing to 1. No weight changes by more than a step per tick, however many clips are still
   * blending, so a fade interrupted by another fade continues from where it was.
   */
  private rampWeights(dt: number): void {
    const current = this.weights.get(this.currentClip) ?? 0;
    const next = Math.min(1, current + this.fadeRate * dt);
    const others = 1 - current;
    const scale = others > 1e-9 ? (1 - next) / others : 0;
    for (const [clip, w] of this.weights) {
      if (clip === this.currentClip) {
        this.weights.set(clip, next);
      } else if (w * scale < 1e-4) {
        this.weights.delete(clip);
        this.actions.get(clip)!.stop();
        this.lastPhase.delete(clip);
      } else {
        this.weights.set(clip, w * scale);
      }
    }
    for (const [clip, w] of this.weights) this.actions.get(clip)!.setEffectiveWeight(w);
  }

  private loopRate(speed: number): number {
    const reference =
      this._state === 'walk' ? PLAYER.walkSpeed : this._state === 'run' ? PLAYER.sprintSpeed : 0;
    if (reference === 0) return 1;
    return THREE.MathUtils.clamp(speed / reference, KNIGHT.minLoopRate, KNIGHT.maxLoopRate);
  }

  private emitAttackProgress(): void {
    const a = this.attack;
    if (!a || a.ended || this._state !== 'attack') return;
    const action = this.actions.get(a.def.clip)!;
    a.previousNormalizedTime = a.normalizedTime;
    const duration = action.getClip().duration;
    const time = action.time >= duration - END_EPSILON ? duration : action.time;
    a.normalizedTime = Math.min(1, Math.max(a.previousNormalizedTime, time / duration));
    const { clip } = a.def;
    const t = a.normalizedTime;

    if (!a.windowOpen && t >= a.def.activeStart) {
      a.windowOpen = true;
      this.events.emit({ type: 'attackWindow', clip, swingId: a.swingId, phase: 'open', normalizedTime: t });
      // A window shorter than one tick is skipped over: it still counts as active for this tick.
      if (t > a.def.activeEnd) {
        a.active = true;
        this.emitProgress(a, true);
        a.windowClosed = true;
        this.events.emit({ type: 'attackWindow', clip, swingId: a.swingId, phase: 'close', normalizedTime: t });
        this.finishAttackIfDone(a);
        return;
      }
    }
    a.active = isInWindow(a);
    this.emitProgress(a, a.active);
    if (a.windowOpen && !a.windowClosed && t > a.def.activeEnd) {
      a.windowClosed = true;
      this.events.emit({ type: 'attackWindow', clip, swingId: a.swingId, phase: 'close', normalizedTime: t });
    }
    this.finishAttackIfDone(a);
  }

  private emitProgress(a: AttackRun, active: boolean): void {
    this.events.emit({
      type: 'attackProgress',
      clip: a.def.clip,
      swingId: a.swingId,
      normalizedTime: a.normalizedTime,
      previousNormalizedTime: a.previousNormalizedTime,
      active,
    });
  }

  private finishAttackIfDone(a: AttackRun): void {
    if (a.normalizedTime < 1) return;
    if (a.windowOpen && !a.windowClosed) {
      a.windowClosed = true;
      this.events.emit({ type: 'attackWindow', clip: a.def.clip, swingId: a.swingId, phase: 'close', normalizedTime: 1 });
    }
    a.ended = true;
    a.endTick = this.tickCount;
    this.clipEndSent = true;
    this.events.emit({ type: 'clipEnd', clip: a.def.clip, interrupted: false });
  }

  /** Non-attack one-shots (jump start, land) report their end when the clip completes. */
  private emitOneShotEnd(): void {
    if (this._state === 'attack' || LOOPING_STATES.has(this._state) || this.clipEndSent) return;
    const duration = this.actions.get(this.currentClip)!.getClip().duration;
    if (this.clipElapsed < duration - END_EPSILON) return;
    this.clipEndSent = true;
    this.events.emit({ type: 'clipEnd', clip: this.currentClip, interrupted: false });
  }

  private emitFootsteps(grounded: boolean): void {
    for (const [clip, prev] of this.lastPhase) {
      const action = this.actions.get(clip)!;
      const now = phaseOf(action);
      this.lastPhase.set(clip, now);
      const steps = this.footsteps[clip];
      if (!steps || !grounded) continue;
      if (this._state !== 'walk' && this._state !== 'run') continue;
      if (action.getEffectiveWeight() < KNIGHT.footstepMinWeight) continue;
      for (const { phase, foot } of steps) {
        if (crossed(prev, now, phase)) this.events.emit({ type: 'footstep', foot, clip, normalizedTime: phase });
      }
    }
  }
}

function fadeSeconds(from: LocomotionState, to: LocomotionState): number {
  if (to === 'jumpStart') return KNIGHT.fadeIntoJumpSeconds;
  if (to === 'land') return KNIGHT.fadeIntoLandSeconds;
  if (to === 'attack') return KNIGHT.fadeIntoAttackSeconds;
  if (from === 'attack') return KNIGHT.fadeOutOfAttackSeconds;
  return KNIGHT.fadeSeconds;
}

function isInWindow(a: AttackRun): boolean {
  return a.normalizedTime >= a.def.activeStart && a.normalizedTime <= a.def.activeEnd;
}

/** Normalised position of a looping action within its cycle, 0 <= phase < 1. */
function phaseOf(action: THREE.AnimationAction): number {
  const d = action.getClip().duration;
  if (!(d > 0)) return 0;
  const p = (action.time % d) / d;
  return p < 0 ? p + 1 : p;
}

/** True if moving forward from `prev` to `now` (wrapping at 1) passes `phase` (prev < phase <= now). */
export function crossed(prev: number, now: number, phase: number): boolean {
  if (now >= prev) return phase > prev && phase <= now;
  return phase > prev || phase <= now;
}
