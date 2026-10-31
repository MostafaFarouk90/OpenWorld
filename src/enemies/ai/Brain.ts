import { CircleRush } from '../hound/circleRush';
import { HOUND } from '../hound/tuning';
import { AI } from '../tuning';
import type { ActorId } from '../ports';
import type { AiState, EnemyDef, MoveDef } from '../types';

export interface XZ {
  x: number;
  z: number;
}

/** What the enemy knows this tick, gathered by Enemy from perception and the world. */
export interface Senses {
  self: XZ;
  /** The candidate target (the player in the slice). */
  targetId: ActorId | null;
  targetAlive: boolean;
  targetPos: XZ | null;
  /** Perception says the target is noticed this tick (sight, hearing or damage). */
  notices: boolean;
  /** Target in sight with line of sight this tick (used for the lost-sight leash). */
  sees: boolean;
  /** Horizontal distance to the target (Infinity without one). */
  distance: number;
  /** Absolute angle between our facing and the direction to the target, degrees. */
  facingErrorDeg: number;
  /** Health as a fraction of max, 0..1. */
  healthFraction: number;
  /** Steering gave up (stuck for STEERING.giveUpSeconds). */
  stuckGiveUp: boolean;
  /** Spare (for `when: 'yielding'`) is unlocked. */
  yieldAllowed: boolean;
  /** Living packmates of the same spawner within `HOUND.packRadius` (the `circle-rush` behaviour; absent counts as 0). */
  packNearby?: number;
  /** Rooted by a status (a net): with `def.yieldWhenRooted` and health under `AI.yieldBelowHealth`, Spare opens at once. */
  rooted?: boolean;
}

/** Side effects the brain asks for; Enemy implements them (tests use spies). */
export interface BrainHooks {
  stateChanged(from: AiState, to: AiState): void;
  aggro(targetId: ActorId): void;
  calm(): void;
  /** Starts the attack clip so its window opens `leadSeconds` from now; returns the new swingId (< 0 on failure). */
  startAttack(move: MoveDef, leadSeconds: number): number;
  /** Stops the attack clip (an open window closes first). */
  cancelAttack(): void;
  telegraph(move: MoveDef, swingId: number, leadSeconds: number): void;
  telegraphCancelled(swingId: number): void;
  pickMove(distance: number): MoveDef | null;
  markMoveUsed(move: MoveDef): void;
  acquireToken(targetId: ActorId): boolean;
  releaseToken(): void;
  flinch(): void;
  /** Heavy hit: knock back away from the attacker. */
  knockback(): void;
  yieldStarted(seconds: number): void;
  /** Back home after a leash: refill health and poise. */
  refill(): void;
  /** Tell pack mates about a new target. */
  alertPack(targetId: ActorId): void;
  /** A thief (`def.thief`) was staggered or cornered while fleeing. */
  caught?(how: 'staggered' | 'cornered'): void;
}

/** Where the brain wants to go this tick; Steering turns it into a velocity. */
export interface BrainIntent {
  goal: XZ | null;
  speed: number;
  /** Stop when this close to the goal. */
  stopDistance: number;
  /** Turn toward this point (null: face the movement direction). */
  face: XZ | null;
}

export interface BrainOptions {
  home: XZ;
  patrol?: readonly XZ[];
  leash?: boolean;
  /** Skip the rise even for a def that rises. */
  rise?: boolean;
  /** Notice this target as soon as the spawn ends. */
  aggroOnSpawn?: ActorId | null;
  /** Random source of the `circle-rush` behaviour (circle length and direction). */
  rng?: () => number;
}

const STOP_AT_TARGET = 1.1;
/** States a net can make yield (the hunters). */
const ROOT_YIELD_STATES: ReadonlySet<AiState> = new Set<AiState>(['notice', 'chase', 'telegraph', 'attack', 'recover']);
/** States that hold a target or a swing. */
const COMBAT: ReadonlySet<AiState> = new Set<AiState>(['notice', 'chase', 'telegraph', 'attack', 'recover', 'stagger', 'yield', 'flee']);

/**
 * The enemy state machine (design section 10, "Creature behaviours and AI states" and "Mercy states").
 * Pure: no scene, physics or event bus; Enemy feeds `Senses` and the event methods, and carries out
 * the hooks. Every state change goes through `enter`, which keeps the token, aggro and telegraph
 * bookkeeping in one place.
 */
export class Brain {
  private _state: AiState = 'idle';
  private stateTime = 0;
  private timer = 0;
  private aggroTarget: ActorId | null = null;
  private hasToken = false;
  private move: MoveDef | null = null;
  private swingId = -1;
  /** True from the attack clip's start until its window opened (the telegraph part). */
  private windowPending = false;
  private clipPlaying = false;
  private flinchLeft = 0;
  private unseen = 0;
  private returnAfterSwing = false;
  private patrolIndex = 0;
  private waiting = 0;
  private readonly leash: boolean;
  private readonly home: XZ;
  private readonly patrol: readonly XZ[];
  private pendingAggro: ActorId | null;
  private readonly stopAtTarget: number;
  /** The target given by a pack alert or a hit, used when senses carry no target (e.g. a revoked spare). */
  private forcedTarget: ActorId | null = null;
  /** A thief that has started to flee keeps fleeing (after a stagger or yield) until its owner despawns it. */
  private fleeLocked = false;
  /** `circle-rush` defs only (the hound). */
  private readonly rush: CircleRush | null;
  /** A swing has begun since the last time the target was dropped: Calm is refused (the pounce window is closed). */
  private attackStarted = false;
  private struckByPlayer = false;

  constructor(
    readonly def: EnemyDef,
    private readonly hooks: BrainHooks,
    opts: BrainOptions,
  ) {
    this.home = { ...opts.home };
    this.patrol = (opts.patrol ?? []).map((p) => ({ ...p }));
    this.leash = opts.leash ?? true;
    // Close in until the shortest-reaching move can start.
    const reach = Math.min(...def.moves.map((m) => m.range[1]));
    this.stopAtTarget = Number.isFinite(reach) ? Math.min(STOP_AT_TARGET, Math.max(0.6, reach * 0.85)) : STOP_AT_TARGET;
    this.pendingAggro = opts.aggroOnSpawn ?? null;
    this.rush =
      def.behaviour === 'circle-rush'
        ? new CircleRush(opts.rng ?? Math.random, { circle: HOUND.circleSpeed, approach: def.chaseSpeed })
        : null;
    const rise = opts.rise ?? def.rises;
    if (rise) this.enter('spawn');
    else this.afterSpawn();
  }

  get state(): AiState {
    return this._state;
  }

  get target(): ActorId | null {
    return this.aggroTarget;
  }

  /** Whether `id` is the target in any form: aggro, a pack alert (forced) or a noticing enemy's pending acquire. */
  holdsTarget(id: ActorId): boolean {
    return this.aggroTarget === id || this.forcedTarget === id || this.pendingAcquire === id;
  }

  get currentMove(): MoveDef | null {
    return this.move;
  }

  get currentSwing(): number {
    return this.swingId;
  }

  /** States in which nothing more happens to this enemy. */
  get finished(): boolean {
    return this._state === 'dead' || this._state === 'released' || this._state === 'spared' || this._state === 'calmed';
  }

  /** The current stagger is a status stun: no mercy window (design: a stun is not a stagger). */
  private stunMode = false;

  /** The player or an ally has landed a hit on this enemy (a status tick of theirs counts); nothing clears it. */
  get struck(): boolean {
    return this.struckByPlayer;
  }

  /**
   * Open to its mercy verb: a staggered undead (Release), a yielding human (Spare), or a beast (Calm) that has
   * not been struck and has not begun a swing, or is at a poise break (the Warm Hand and offerings share windows).
   */
  get mercyOpen(): boolean {
    switch (this.def.mercy?.when) {
      case 'staggered':
        return this._state === 'stagger' && !this.stunMode;
      case 'yielding':
        return this._state === 'yield';
      case 'exposed':
        // The golem's back core, open for the whole poise-break stagger (def.breakStaggerSeconds).
        return this._state === 'stagger' && !this.stunMode;
      case 'calming':
        return (this.warmHandOpen && !this.stunMode) || (!this.struckByPlayer && this.calmOpen);
      default:
        return false;
    }
  }

  /**
   * Calm with an offering is still possible: a beast that is wary or stalking and has not begun an attack. Once
   * a swing has started (the crouch of a pounce, the lunge of a bite) the window is closed until it disengages.
   */
  get calmOpen(): boolean {
    if (this.def.mercy?.when !== 'calming' || this.attackStarted) return false;
    return this._state === 'idle' || this._state === 'patrol' || this._state === 'notice' || this._state === 'chase';
  }

  /** The Warm Hand on a staggered beast (design 3): open for the length of the knockdown, whatever it did before. */
  get warmHandOpen(): boolean {
    return this.def.mercy?.when === 'calming' && this._state === 'stagger' && !this.stunMode;
  }

  /** The `circle-rush` phase, for tests and debug; null for other behaviours. */
  get circlePhase(): 'circle' | 'rush' | null {
    return this.rush ? (this.rush.isRushing ? 'rush' : 'circle') : null;
  }

  // ---- per tick ---------------------------------------------------------------------------------

  step(dt: number, s: Senses): BrainIntent {
    if (!(dt > 0) || !Number.isFinite(dt)) return this.intent(null, 0);
    this.stateTime += dt;
    if (this.flinchLeft > 0) this.flinchLeft = Math.max(0, this.flinchLeft - dt);

    if (!this.finished && this._state !== 'spawn' && this.def.fleeAtHealth !== undefined) {
      // A caught thief (stagger, yield) is not sent running again by the health check.
      const caughtNow = this.def.thief && (this._state === 'yield' || this._state === 'stagger');
      if (this.aggroTarget && s.healthFraction < this.def.fleeAtHealth && this._state !== 'flee' && !caughtNow) this.enter('flee');
    }

    if (this.def.yieldWhenRooted && s.rooted && s.yieldAllowed && s.healthFraction < AI.yieldBelowHealth && ROOT_YIELD_STATES.has(this._state) && this.def.mercy?.when === 'yielding') {
      // A rooted hunter under half health surrenders (design 10 row 30); a staggered one already does through `staggered`.
      this.enter('yield');
      this.hooks.yieldStarted(AI.yieldSeconds);
      return this.intent(null, 0);
    }

    switch (this._state) {
      case 'spawn':
        if (this.stateTime >= AI.riseSeconds) this.afterSpawn();
        return this.intent(null, 0);
      case 'idle':
      case 'patrol':
        return this.calmTick(dt, s);
      case 'notice':
        if (!this.validTarget(s)) return this.loseTarget();
        if (this.stateTime >= AI.noticeSeconds) this.enter('chase');
        return this.intent(null, 0, s.targetPos);
      case 'chase':
        return this.chaseTick(dt, s);
      case 'telegraph':
      case 'attack':
        if (!this.validTarget(s) && this.windowPending) return this.loseTarget();
        this.trackLeash(dt, s);
        if (this.returnAfterSwing && this.windowPending) {
          // Leash before the window opened: cancel the telegraph and go home.
          this.enter('return');
          return this.intent(this.home, this.def.walkSpeed);
        }
        // Face the target during the wind-up only; committed once the window is open.
        return this.intent(null, 0, this._state === 'telegraph' ? s.targetPos : null);
      case 'recover':
        if (this.stateTime >= (this.move?.recover ?? 0)) this.afterSwing(s);
        return this.intent(null, 0);
      case 'stagger':
        if (this.stateTime >= this.timer) this.resume(s);
        return this.intent(null, 0);
      case 'yield':
        if (this.stateTime >= AI.yieldSeconds) this.resume(s);
        return this.intent(null, 0);
      case 'flee': {
        if (this.def.thief && s.stuckGiveUp && s.targetPos) {
          // Cornered: nowhere left to run.
          this.catchThief('cornered', s.yieldAllowed);
          return this.intent(null, 0);
        }
        // A thief runs until its owner despawns it (flee window, smoke); everyone else gives up when far.
        if (!s.targetPos || !this.validTarget(s) || (!this.fleeLocked && s.distance > AI.sightRange + 5)) {
          this.enter('idle');
          return this.intent(null, 0);
        }
        const away = { x: s.self.x * 2 - s.targetPos.x, z: s.self.z * 2 - s.targetPos.z };
        return this.intent(away, this.def.chaseSpeed, null, 0);
      }
      case 'return':
        if (dist(s.self, this.home) <= AI.waypointRadius) {
          this.hooks.refill();
          this.enter(this.patrol.length ? 'patrol' : 'idle');
          return this.intent(null, 0);
        }
        // Being hit on the way home re-engages (onHit); sight alone does not, so a kited enemy resets.
        return this.intent(this.home, this.def.walkSpeed * 1.5, null, AI.waypointRadius * 0.5);
      case 'released':
      case 'spared':
      case 'calmed':
      case 'dead':
        return this.intent(null, 0);
    }
  }

  // ---- events from the world ---------------------------------------------------------------------

  /** The attack window opened (animator callback). */
  windowOpened(swingId: number): void {
    if (swingId !== this.swingId || !this.windowPending) return;
    this.windowPending = false;
    if (this._state === 'telegraph') this.enter('attack');
  }

  /** The attack clip ended (animator callback); `interrupted` clips were cancelled by us. */
  attackClipEnded(swingId: number, interrupted: boolean): void {
    if (swingId !== this.swingId) return;
    this.clipPlaying = false;
    if (interrupted) return;
    if (this._state === 'attack' || this._state === 'telegraph') {
      this.windowPending = false;
      this.enter('recover');
    }
  }

  /**
   * A damage.dealt on this enemy that did not break poise (`staggered` false). Poise breaks come
   * through `staggered` (actor.staggered), which also covers parries and Second Wind.
   */
  hit(attackerId: ActorId | null, poiseDealt: number, outcome: string): void {
    if (this.finished || this._state === 'spawn') return;
    if (outcome !== 'hit') return;
    if (this._state === 'yield') {
      // A hit during the yield ends it (no revocation: nothing was accepted yet).
      this.resumeWithTarget(attackerId);
      return;
    }
    this.provoke(attackerId);
    if (this._state === 'stagger') return;
    if (this.aggroTarget && (this._state === 'idle' || this._state === 'patrol' || this._state === 'return' || this._state === 'notice')) {
      this.enter('chase');
    }
    if (poiseDealt >= AI.heavyPoise) {
      this.hooks.knockback();
      if (this.def.thief && this._state === 'flee') this.catchThief('staggered', this.yieldAllowedNow);
      else this.stagger(AI.heavyStaggerSeconds);
      return;
    }
    // A light hit flinches; it never interrupts a swing whose window is already open.
    if (this._state === 'attack' && !this.windowPending) return;
    if (this._state === 'telegraph') {
      this.cancelSwing();
      this.enter('chase');
    }
    this.flinchLeft = AI.flinchSeconds;
    this.hooks.flinch();
  }

  /** actor.staggered for this enemy: a poise break (or a parry / Second Wind stagger). */
  staggered(byId: ActorId | null): void {
    if (this.finished || this._state === 'spawn') return;
    this.provoke(byId);
    if (this.def.thief && this._state === 'flee') {
      this.catchThief('staggered', this.yieldAllowedNow);
      return;
    }
    if (this.def.mercy?.when === 'yielding' && this.yieldAllowedNow && this.healthFractionNow < AI.yieldBelowHealth) {
      this.enter('yield');
      this.hooks.yieldStarted(AI.yieldSeconds);
      return;
    }
    this.stagger(this.def.breakStaggerSeconds ?? AI.breakStaggerSeconds);
  }

  /**
   * Knocked down without a poise break (the hound's dodge counter): down for `HOUND.knockdownSeconds`, the
   * attacker becomes the target. Ignored once finished or while spawning.
   */
  knockedDown(byId: ActorId | null): void {
    if (this.finished || this._state === 'spawn') return;
    this.provoke(byId);
    this.stagger(HOUND.knockdownSeconds);
  }

  /** Stunned (an `actor.data['status']` entry): staggered for the remaining stun. */
  stunned(seconds: number): void {
    if (this.finished || this._state === 'spawn' || this._state === 'yield' || !(seconds > 0)) return;
    this.stagger(seconds, true);
  }

  /** Pack alert, or a scripted aggro. */
  alert(targetId: ActorId): void {
    if (this.finished) return;
    if (this._state === 'spawn') {
      this.pendingAggro = targetId;
      return;
    }
    if (this._state === 'idle' || this._state === 'patrol' || this._state === 'return') {
      this.forcedTarget = targetId;
      this.aggroTarget = null;
      this.enter('notice');
      this.pendingAcquire = targetId;
    }
  }

  /** The current target died or despawned. */
  targetGone(targetId: ActorId): void {
    if (this.aggroTarget !== targetId && this.forcedTarget !== targetId && this.pendingAcquire !== targetId) return;
    if (this.finished) return;
    this.forcedTarget = null;
    this.pendingAcquire = null;
    if (this._state === 'stagger' || this._state === 'yield') {
      this.dropAggro();
      return;
    }
    this.loseTarget();
  }

  /**
   * Swap whichever target the brain holds (aggro, pending acquire or forced) for `targetId` without leaving the current state. No-op
   * when it holds none or already has this one. Used by the taunt choice; a plain game never calls it.
   */
  retarget(targetId: ActorId): void {
    if (this.finished) return;
    if (this.aggroTarget && this.aggroTarget !== targetId) {
      this.aggroTarget = targetId;
      this.unseen = 0;
      this.hooks.aggro(targetId);
    }
    if (this.pendingAcquire && this.pendingAcquire !== targetId) this.pendingAcquire = targetId;
    if (this.forcedTarget && this.forcedTarget !== targetId) this.forcedTarget = targetId;
  }

  /**
   * Calls off a telegraph that has not reached its window and goes back to the chase, keeping the target (K6b: a hawk's hover
   * called off because its target went into water). False when not telegraphing.
   */
  abortSwing(): boolean {
    if (this._state !== 'telegraph') return false;
    this.cancelSwing();
    this.enter('chase');
    return true;
  }

  /** Out of combat now (going dormant): drops the target, cancelling any swing, token and aggro through `enter`. */
  standDown(): void {
    if (this.finished || this._state === 'dead') return;
    this.forcedTarget = null;
    this.pendingAcquire = null;
    if (this.aggroTarget || COMBAT.has(this._state)) {
      this.enter(this.leash ? 'return' : this.patrol.length ? 'patrol' : 'idle');
    }
    this.dropAggro();
  }

  died(): void {
    if (this._state === 'dead') return;
    this.enter('dead');
  }

  /**
   * A packmate was spared (design section 10, "a pack shares one state"). A partner at a poise break
   * kneels for a fresh window whatever its health; one already kneeling has its window refreshed; any
   * other state is left alone. Returns whether it is now yielding.
   */
  offerYield(): boolean {
    if (this.finished || this.def.mercy?.when !== 'yielding') return false;
    if (this._state === 'yield') {
      this.stateTime = 0;
      this.hooks.yieldStarted(AI.yieldSeconds);
      return true;
    }
    if (this._state !== 'stagger' || this.stunMode) return false;
    this.enter('yield');
    this.hooks.yieldStarted(AI.yieldSeconds);
    return true;
  }

  /** The thief's grab landed: run away now, whatever its health. */
  startFlee(): void {
    if (this.finished || !this.aggroTarget || this._state === 'flee') return;
    this.enter('flee');
  }

  released(): void {
    if (this.finished) return;
    this.enter('released');
  }

  spared(): void {
    if (this.finished) return;
    this.enter('spared');
  }

  /** Calm accepted (an offering or the Warm Hand): from any live state, the swing and the aggro end at once. */
  calmed(): void {
    if (this.finished) return;
    this.enter('calmed');
  }

  /** A hit from the player or an ally landed (`Enemy.struckByPlayer`, from damage.dealt): no more Calm unless it staggers. */
  markStruck(): void {
    this.struckByPlayer = true;
  }

  /** mercy.revoked on a spared or calmed enemy that has not left yet: hostile again, chasing the striker. */
  revoked(strikerId: ActorId | null): void {
    if (this._state !== 'spared' && this._state !== 'calmed') return;
    this.struckByPlayer = true;
    this.forcedTarget = strikerId;
    this.enter('chase');
  }

  // ---- internals --------------------------------------------------------------------------------

  private pendingAcquire: ActorId | null = null;
  private yieldAllowedNow = false;
  private healthFractionNow = 1;

  /** Called by Enemy before `staggered` so the yield rule sees current values. */
  setCondition(healthFraction: number, yieldAllowed: boolean): void {
    this.healthFractionNow = healthFraction;
    this.yieldAllowedNow = yieldAllowed;
  }

  private calmTick(dt: number, s: Senses): BrainIntent {
    if (this.pendingAggro && s.targetId === this.pendingAggro && s.targetAlive) {
      this.pendingAggro = null;
      this.forcedTarget = s.targetId;
      this.enter('chase');
      return this.intent(s.targetPos, this.def.chaseSpeed, s.targetPos, this.stopAtTarget);
    }
    if (s.notices && s.targetId && s.targetAlive) {
      this.pendingAcquire = s.targetId;
      this.enter('notice');
      return this.intent(null, 0, s.targetPos);
    }
    if (!this.patrol.length) {
      if (dist(s.self, this.home) > AI.waypointRadius * 2) return this.intent(this.home, this.def.walkSpeed);
      return this.intent(null, 0);
    }
    if (this._state !== 'patrol') this.enter('patrol');
    if (s.stuckGiveUp && this.waiting <= 0) {
      // An unreachable waypoint: skip it.
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
    }
    const wp = this.patrol[this.patrolIndex % this.patrol.length];
    if (this.waiting > 0) {
      this.waiting -= dt;
      if (this.waiting <= 0) this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      return this.intent(null, 0);
    }
    if (dist(s.self, wp) <= AI.waypointRadius) {
      this.waiting = AI.waypointWaitSeconds;
      return this.intent(null, 0);
    }
    return this.intent(wp, this.def.walkSpeed, null, AI.waypointRadius * 0.5);
  }

  private chaseTick(dt: number, s: Senses): BrainIntent {
    if (!this.validTarget(s)) return this.loseTarget();
    this.trackLeash(dt, s);
    if (this.returnAfterSwing || (s.stuckGiveUp && this.leash)) {
      this.returnAfterSwing = false;
      this.enter('return');
      return this.intent(this.home, this.def.walkSpeed);
    }
    if (this.flinchLeft > 0) return this.intent(null, 0, s.targetPos);
    const target = s.targetPos!;
    if (this.rush) {
      const ring = this.rush.step(dt, { self: s.self, targetPos: target, distance: s.distance, packNearby: s.packNearby ?? 0 });
      if (ring) return this.intent(ring.goal, ring.speed, target, 0.3);
    }
    if (s.facingErrorDeg <= AI.attackFacingDegrees && this.aggroTarget) {
      const move = this.hooks.pickMove(s.distance);
      if (move) {
        if (this.hasToken || this.hooks.acquireToken(this.aggroTarget)) {
          this.hasToken = true;
          if (this.beginSwing(move)) return this.intent(null, 0, target);
        } else if (this.rush) {
          // The pack's pounces start one after another: wait facing the target for the next slot.
          return this.intent(null, 0, target);
        } else {
          // Two already attack this target: circle at a distance.
          const away = { x: s.self.x - target.x, z: s.self.z - target.z };
          const len = Math.hypot(away.x, away.z) || 1;
          const side = { x: -away.z / len, z: away.x / len };
          const goal = {
            x: target.x + (away.x / len) * AI.circleRadius + side.x * 0.8,
            z: target.z + (away.z / len) * AI.circleRadius + side.z * 0.8,
          };
          return this.intent(goal, this.def.walkSpeed, target, 0.3);
        }
      }
    }
    return this.intent(target, this.def.chaseSpeed, target, this.stopAtTarget);
  }

  private beginSwing(move: MoveDef): boolean {
    const lead = move.windup;
    const swing = this.hooks.startAttack(move, lead);
    if (swing < 0) return false;
    this.move = move;
    this.swingId = swing;
    this.attackStarted = true;
    this.windowPending = true;
    this.clipPlaying = true;
    this.hooks.markMoveUsed(move);
    this.enter('telegraph');
    this.hooks.telegraph(move, swing, lead);
    return true;
  }

  /** Stops a swing in progress; a telegraph that never reached its window is announced as cancelled. */
  private cancelSwing(): void {
    if (!this.clipPlaying && !this.windowPending) return;
    const pending = this.windowPending;
    this.windowPending = false;
    this.clipPlaying = false;
    this.hooks.cancelAttack();
    if (pending) this.hooks.telegraphCancelled(this.swingId);
  }

  private afterSwing(s: Senses): void {
    if (this.hasToken) {
      this.hasToken = false;
      this.hooks.releaseToken();
    }
    if (this.returnAfterSwing) {
      this.returnAfterSwing = false;
      this.enter('return');
      return;
    }
    if (this.validTarget(s)) this.enter('chase');
    else this.loseTarget();
  }

  private trackLeash(dt: number, s: Senses): void {
    if (!this.leash) return;
    this.unseen = s.sees ? 0 : this.unseen + dt;
    const far = s.targetPos ? dist(s.targetPos, this.home) > AI.leashRadius : false;
    if (far || this.unseen >= AI.lostSightSeconds) this.returnAfterSwing = true;
  }

  private validTarget(s: Senses): boolean {
    const want = this.aggroTarget ?? this.pendingAcquire ?? this.forcedTarget;
    return !!want && s.targetId === want && s.targetAlive && !!s.targetPos;
  }

  /** Drop the target: calm, then go home (leashed) or back to idle or patrol. */
  private loseTarget(): BrainIntent {
    this.forcedTarget = null;
    this.pendingAcquire = null;
    this.enter(this.leash ? 'return' : this.patrol.length ? 'patrol' : 'idle');
    return this.intent(null, 0);
  }

  private provoke(attackerId: ActorId | null): void {
    if (!attackerId || this.aggroTarget) return;
    this.forcedTarget = attackerId;
    this.pendingAcquire = attackerId;
    this.acquire(attackerId);
  }

  private acquire(targetId: ActorId): void {
    if (this.aggroTarget === targetId) return;
    if (this.aggroTarget) this.dropAggro();
    this.aggroTarget = targetId;
    this.pendingAcquire = null;
    this.forcedTarget = null;
    this.unseen = 0;
    this.returnAfterSwing = false;
    this.hooks.aggro(targetId);
    this.hooks.alertPack(targetId);
  }

  private dropAggro(): void {
    if (!this.aggroTarget) return;
    this.aggroTarget = null;
    this.attackStarted = false;
    this.hooks.calm();
  }

  /** `stun`: a status stun holds the enemy still like a stagger but opens no mercy window. */
  private stagger(seconds: number, stun = false): void {
    if (this._state === 'stagger') {
      this.timer = stun && !this.stunMode ? Math.max(this.timer, seconds) : seconds;
      this.stateTime = 0;
      if (!stun) this.stunMode = false;
      return;
    }
    this.timer = seconds;
    this.enter('stagger');
    this.stunMode = stun;
  }

  /** A fleeing thief is caught: it yields (Spare opens) when Spare is unlocked, else it just staggers. */
  private catchThief(how: 'staggered' | 'cornered', yieldAllowed: boolean): void {
    this.hooks.caught?.(how);
    if (yieldAllowed && this.def.mercy?.when === 'yielding') {
      this.enter('yield');
      this.hooks.yieldStarted(AI.yieldSeconds);
    } else {
      this.stagger(AI.breakStaggerSeconds);
    }
  }

  private resume(s: Senses): void {
    if (this.fleeLocked && this.aggroTarget && this.validTarget(s)) this.enter('flee');
    else if (this.aggroTarget && this.validTarget(s)) this.enter('chase');
    else if (this.aggroTarget) this.loseTarget();
    else this.enter(this.patrol.length ? 'patrol' : 'idle');
  }

  private resumeWithTarget(attackerId: ActorId | null): void {
    this.provoke(attackerId);
    this.enter(this.aggroTarget ? (this.fleeLocked ? 'flee' : 'chase') : 'idle');
  }

  private afterSpawn(): void {
    const target = this.pendingAggro;
    if (target) {
      this.pendingAggro = target; // consumed by calmTick once senses carry that target
      this.enter('idle');
      return;
    }
    this.enter(this.patrol.length ? 'patrol' : 'idle');
  }

  /** The one place states change; leaving combat states releases the token, the swing and aggro. */
  private enter(next: AiState): void {
    const prev = this._state;
    const combat = next === 'telegraph' || next === 'attack' || next === 'recover';
    if (!combat) {
      if (prev === 'telegraph' || prev === 'attack') this.cancelSwing();
      if (this.hasToken) {
        this.hasToken = false;
        this.hooks.releaseToken();
      }
    }
    const keepsAggro =
      next === 'notice' || next === 'chase' || combat || next === 'stagger' || next === 'yield' || next === 'flee';
    if (!keepsAggro) this.dropAggro();
    if (next === 'chase' && !this.aggroTarget) {
      const t = this.pendingAcquire ?? this.forcedTarget;
      if (t) this.acquire(t);
    }
    if (next === 'chase' && prev !== 'chase') this.rush?.reset();
    if (next === 'return' || next === 'idle' || next === 'patrol') this.unseen = 0;
    if (next === 'flee') this.fleeLocked = this.def.thief === true;
    else if (next !== 'yield' && next !== 'stagger' && next !== 'dead' && next !== 'released' && next !== 'spared') this.fleeLocked = false;
    if (next !== 'chase') this.flinchLeft = 0;
    this._state = next;
    this.stateTime = 0;
    if (next !== 'stagger') this.stunMode = false;
    if (prev !== next) this.hooks.stateChanged(prev, next);
  }

  private intent(goal: XZ | null, speed: number, face: XZ | null = null, stopDistance = STOP_AT_TARGET): BrainIntent {
    return { goal: goal ? { x: goal.x, z: goal.z } : null, speed, stopDistance, face: face ? { x: face.x, z: face.z } : null };
  }
}

function dist(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
