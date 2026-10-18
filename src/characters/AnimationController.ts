import * as THREE from 'three';
import { FIXED_TIMESTEP, KNIGHT, PLAYER } from '../config/constants';
import { AnimationEvents } from './AnimationEvents';
import {
  CLIP_FALLBACKS,
  GROUNDED_ACTIONS,
  GROUNDED_STATES,
  isActionKind,
  KNIGHT_ACTION_CLIPS,
  KNIGHT_ATTACKS,
  KNIGHT_CLIPS,
  KNIGHT_FOOTSTEPS,
  LOOPING_ACTIONS,
  LOOPING_STATES,
  MOVEMENT_LOCKING_ACTIONS,
  type ActionClipMap,
  type ActionKind,
  type AttackClipDef,
  type ClipMap,
  type Foot,
  type LocomotionState,
  type MovementState,
} from './knightClips';
import { nextState, type LocomotionInput } from './locomotionState';

export interface AnimationControllerOptions {
  clipMap?: ClipMap;
  /** Default clip per action kind. Default: KNIGHT_ACTION_CLIPS. */
  actionClips?: Partial<ActionClipMap>;
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

export interface EnterActionOptions {
  /** Clip to play instead of the kind's default (dodges pass their directional clip). */
  clip?: string;
  /**
   * Fixed ticks the action lasts before returning to locomotion. Shorter than the clip cuts it,
   * longer holds the last pose. Default: the clip's length; `block`, `dying` and `dead` last until
   * `exitAction` unless this is given (`dying`/`dead` ignore it).
   */
  durationTicks?: number;
}

export interface PlayOneShotOptions {
  /** Lock input movement and jumps while the clip plays. Default false. */
  lockMove?: boolean;
}

interface ActionRun {
  /** An action kind, or 'oneShot' for a clip started by playOneShot. */
  kind: ActionKind | 'oneShot';
  /** For one-shots: whether input movement is locked. */
  lockMove: boolean;
  /** Ticks to play before ending, or null for "until the clip ends" (one-shots) / "until exitAction" (loops). */
  durationTicks: number | null;
  /** Fixed ticks the action's clip has advanced. */
  ticks: number;
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

type ClipState = Exclude<MovementState, 'attack'>;

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
  private attackOrder: string[] = [];
  private attackSpeed = 1;
  private walkWhileBlocking = false;
  private attack: AttackRun | null = null;
  private swingCounter = 0;
  private tickCount = 0;
  private readonly clipsByName: Map<string, THREE.AnimationClip>;
  private readonly actionClips: ActionClipMap;
  private readonly warn: (message: string) => void;
  /** Missing action clips already reported, so each is warned about once. */
  private readonly warnedMissing = new Set<string>();
  private run: ActionRun | null = null;
  /** Events from enterAction/exitAction calls between ticks, delivered with the next tick's events. */
  private pendingEvents: Array<() => void> = [];
  /** Whether the controller reported ground contact on the latest tick. */
  private lastGrounded = true;
  private disposed = false;

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
    this.clipsByName = byName;
    this.warn = warn;
    this.actionClips = { ...KNIGHT_ACTION_CLIPS, ...options.actionClips };
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
    this.loadAttacks(options.attacks ?? KNIGHT_ATTACKS);
    this.footsteps = options.footsteps ?? KNIGHT_FOOTSTEPS;

    this.currentClip = this.stateClips.idle;
    this.startAction(this.currentClip);
    this.weights.set(this.currentClip, 1);
    this.actions.get(this.currentClip)!.setEffectiveWeight(1);
  }

  get state(): LocomotionState {
    return this._state;
  }

  /**
   * True while an attack plays or is queued for the next tick, or while an action other than
   * `flinch` is active: the player must not move or jump by input.
   */
  get movementLocked(): boolean {
    if (this.run) {
      if (this.run.kind === 'block' && this.walkWhileBlocking) return false;
      return this.run.kind === 'oneShot' ? this.run.lockMove : MOVEMENT_LOCKING_ACTIONS.has(this.run.kind);
    }
    return this._state === 'attack' || this.pendingAttack !== null;
  }

  /**
   * The active action (block, dodge, hit reaction, death), or null during locomotion and attacks.
   * Named `currentAction` because `action(clip)` already returns a clip's mixer action.
   */
  get currentAction(): ActionKind | null {
    const kind = this.run?.kind;
    return kind && kind !== 'oneShot' ? kind : null;
  }

  /**
   * Plays any clip of the file once (state `oneShot`), from a grounded idle/walk/run/land state,
   * then returns to locomotion at the clip's end with the usual crossfade. Returns false, doing
   * nothing, when the clip is missing, after dispose, while airborne, or while an attack (playing or
   * queued), an action or another one-shot is active. Events: `clipEnd` of the previous clip,
   * `stateChange` to 'oneShot', `clipStart`; at the end `clipEnd {interrupted: false}`. Any
   * `enterAction` (e.g. stagger, dying) interrupts it with `clipEnd {interrupted: true}`, as does
   * leaving the ground. `lockMove` sets `movementLocked` while it plays.
   */
  playOneShot(clip: string, opts: PlayOneShotOptions = {}): boolean {
    if (this.disposed || this.run || this.pendingAttack || !GROUNDED_STATES.has(this._state)) return false;
    const def = this.clipsByName.get(clip);
    if (!def) return false;
    this.ensureAction(def, false);
    this.enter('oneShot', clip, this.pendingEvents);
    this.run = { kind: 'oneShot', lockMove: opts.lockMove === true, durationTicks: null, ticks: 0 };
    return true;
  }

  /**
   * Switches to an action state now (its events are delivered with the next tick's). Returns false,
   * doing nothing, after dispose, for `block`/`blockHit`/`dodge` while not standing on the ground,
   * and for anything but `dying`/`dead` while dying or dead. Interrupts an attack (window `close`,
   * then `clipEnd {interrupted: true}`, then `stateChange`, `clipStart`), cancels a queued attack,
   * and replaces another action (its clip ends interrupted if it had not finished). Entering `block`
   * while blocking, `dying` while dying or dead, or `dead` while dead keeps the current state.
   * A missing clip falls back to the idle clip with one warning per clip name.
   */
  enterAction(kind: ActionKind, opts: EnterActionOptions = {}): boolean {
    if (this.disposed || !isActionKind(kind)) return false;
    const current = this.run?.kind ?? null;
    const dead = current === 'dying' || current === 'dead';
    if (dead && kind !== 'dying' && kind !== 'dead') return false;
    if ((kind === 'dying' && dead) || (kind === 'dead' && current === 'dead')) return true;
    if (kind === 'block' && current === 'block' && opts.durationTicks === undefined) return true;
    if (GROUNDED_ACTIONS.has(kind) && !this.standing()) return false;

    const clip = this.resolveActionClip(kind, opts.clip);
    const ticks = opts.durationTicks;
    const durationTicks =
      kind !== 'dying' && kind !== 'dead' && ticks !== undefined && Number.isFinite(ticks) && ticks > 0
        ? Math.max(1, Math.round(ticks))
        : null;
    this.pendingAttack = null;
    this.enter(kind, clip, this.pendingEvents);
    this.run = { kind, lockMove: false, durationTicks, ticks: 0 };
    if (kind === 'dead') {
      // Straight to the last frame of the death clip, without a clip end.
      const action = this.actions.get(clip)!;
      if (action.loop === THREE.LoopOnce) action.time = action.getClip().duration;
      this.clipEndSent = true;
    }
    return true;
  }

  /** Leaves the active action for idle (block release, respawn). Does nothing without one. */
  exitAction(): void {
    if (this.disposed || !this.run) return;
    this.run = null;
    this.enter('idle', this.stateClips.idle, this.pendingEvents);
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

  /** Iron Stance: a held block no longer locks movement (the caller scales the speed). `blockHit` still does. */
  setWalkWhileBlocking(on: boolean): void {
    this.walkWhileBlocking = on;
  }

  /** The attack clip for input slot 1..4 in the current set, or undefined. */
  attackClip(slot: number): string | undefined {
    return Number.isInteger(slot) ? this.attackOrder[slot - 1] : undefined;
  }

  /**
   * Replaces the four attacks (a class change). Refused (false) while an attack plays or is queued, or when no clip of
   * the set exists in the file; nothing changes then.
   */
  setAttackSet(defs: readonly AttackClipDef[]): boolean {
    if (this.disposed || this.attack || this.pendingAttack || this._state === 'attack') return false;
    if (!defs.some((d) => this.clipsByName.has(d.clip))) return false;
    this.loadAttacks(defs);
    return true;
  }

  /** Playback speed of attack clips (1 = authored); clamped to 0.5..2. Bad values reset to 1. */
  setAttackSpeed(mult: number): void {
    this.attackSpeed = Number.isFinite(mult) && mult > 0 ? Math.min(2, Math.max(0.5, mult)) : 1;
  }

  private loadAttacks(defs: readonly AttackClipDef[]): void {
    this.attackDefs.clear();
    this.attackOrder = defs.map((d) => d.clip);
    for (const def of defs) {
      const clip = this.clipsByName.get(def.clip);
      if (!clip) continue; // Unknown attacks are refused by playAttack.
      this.attackDefs.set(def.clip, def);
      this.ensureAction(clip, false);
    }
  }

  /**
   * Queues an attack to start on the next fixed tick. Returns false (and does nothing) for an
   * unknown clip, while not standing on the ground, or while an attack is playing or queued.
   */
  playAttack(clip: string): boolean {
    const def = this.attackDefs.get(clip);
    if (!def || this.run || this.movementLocked || !GROUNDED_STATES.has(this._state)) return false;
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
    if (this.disposed) return;
    this.tickCount++;
    this.lastGrounded = input.grounded;
    this.airTime = input.grounded ? 0 : this.airTime + dt;
    if (!input.grounded) this.minAirVerticalSpeed = Math.min(this.minAirVerticalSpeed, input.verticalSpeed);

    // Events of actions entered or left since the last tick come first.
    const queued = this.pendingEvents;
    this.pendingEvents = [];
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
    } else if (this.run) {
      this.updateAction(input, queued);
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
    const rate = this._state === 'attack' ? this.attackSpeed : this.loopRate(input.horizontalSpeed);
    this.actions.get(this.currentClip)!.timeScale = rate;

    this.rampWeights(dt);
    this.mixer.update(dt);
    this.timeInState += dt;
    this.clipElapsed += dt * rate;
    if (this.run) this.run.ticks++;
    this.root.updateWorldMatrix(true, true);

    for (const emit of queued) emit();
    this.emitAttackProgress();
    this.emitActionEnd();
    this.emitOneShotEnd();
    this.emitFootsteps(input.grounded);
  }

  dispose(): void {
    this.disposed = true;
    this.pendingEvents = [];
    this.pendingAttack = null;
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

  /** Standing on the ground: a grounded locomotion state, an attack, or a non-death action on the ground. */
  private standing(): boolean {
    const s = this._state;
    if (GROUNDED_STATES.has(s) || s === 'attack') return true;
    return (s === 'oneShot' || (isActionKind(s) && s !== 'dying' && s !== 'dead')) && this.lastGrounded;
  }

  private resolveActionClip(kind: ActionKind, requested?: string): string {
    const name = requested ?? this.actionClips[kind];
    const clip = this.clipsByName.get(name);
    if (!clip) {
      const fallback = this.stateClips.idle;
      if (!this.warnedMissing.has(name)) {
        this.warnedMissing.add(name);
        this.warn(`AnimationController: clip "${name}" for ${kind} is missing; using "${fallback}"`);
      }
      return fallback;
    }
    this.ensureAction(clip, LOOPING_ACTIONS.has(kind));
    return name;
  }

  /**
   * Decides at the start of a tick whether the action ends: after `durationTicks`, when a one-shot
   * clip has finished, or when a grounded action loses the ground. Dying and dead never end here.
   */
  private updateAction(input: LocomotionInput, queued: Array<() => void>): void {
    const run = this.run!;
    if (run.kind === 'dying' || run.kind === 'dead') return;
    const duration = this.actions.get(this.currentClip)!.getClip().duration;
    const done =
      run.durationTicks !== null
        ? run.ticks >= run.durationTicks
        : !(run.kind !== 'oneShot' && LOOPING_ACTIONS.has(run.kind)) && this.clipElapsed >= duration - END_EPSILON;
    const grounded = run.kind === 'oneShot' || GROUNDED_ACTIONS.has(run.kind);
    const leftGround = grounded && !input.grounded && this.airTime >= KNIGHT.airborneDelay;
    if (!done && !leftGround) return;
    const next = nextState('idle', input, { timeInState: 0, airTime: this.airTime, clipDone: false }) as ClipState;
    this.run = null;
    this.enter(next, this.stateClips[next], queued);
  }

  /** A one-shot action clip reports its end once; a finished `dying` becomes `dead` on the same tick. */
  private emitActionEnd(): void {
    const run = this.run;
    if (!run || this.clipEndSent) return;
    const action = this.actions.get(this.currentClip)!;
    if (this.clipElapsed < action.getClip().duration - END_EPSILON) return;
    const oneShot = action.loop === THREE.LoopOnce;
    if (!oneShot && run.kind !== 'dying') return;
    this.clipEndSent = true;
    if (oneShot) this.events.emit({ type: 'clipEnd', clip: this.currentClip, interrupted: false });
    if (run.kind === 'dying' && this.run === run) {
      run.kind = 'dead';
      this._state = 'dead';
      this.events.emit({ type: 'stateChange', from: 'dying', to: 'dead' });
    }
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
    if (this.run || this._state === 'attack' || LOOPING_STATES.has(this._state) || this.clipEndSent) return;
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
  if (to === 'blockHit' || to === 'flinch' || to === 'stagger') return KNIGHT.fadeIntoLandSeconds;
  if (isActionKind(to) || to === 'oneShot') return KNIGHT.fadeIntoAttackSeconds;
  if (isActionKind(from) || from === 'oneShot') return KNIGHT.fadeSeconds;
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
