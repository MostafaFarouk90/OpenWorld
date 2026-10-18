import * as THREE from 'three';
import { COMBAT, FIXED_TIMESTEP } from '../config/constants';
import { Brain, type BrainHooks, type Senses } from './ai/Brain';
import { Guard, type GuardHit } from './ai/guard';
import { MoveSelector } from './ai/moveSelect';
import { pairGoal } from './ai/pair';
import { stepAwareness } from './ai/awareness';
import { makeLineOfSight, perceive, type CombinedModifiers } from './ai/perception';
import { ENEMY_CLIPS } from './clips';
import { Cutpurse } from './cutpurse/Cutpurse';
import { BURNING_BITE, HOUND } from './hound/tuning';
import { bodyPitch } from './quadruped/gait';
import { readStatusData } from './statusData';
import type { EnemyBody } from './body';
import type { ActorId, ActorLike, EnemyHost, NavPort } from './ports';
import type { ObserverPose } from './perceptionHook';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
import { PathFollower } from './steering/pathFollower';
import { forwardOf, Steering, turnToward, yawTo } from './steering/steering';
import { HeightfieldMover, SwitchingMover, type EnemyMover } from './steering/movers';
import { AI } from './tuning';
import type { MemberEnd } from './spawners';
import type { AiState, EnemyDef, EnemyView, MoveDef, SpawnOptions, UnlockVerb, WeaponChannel } from './types';

/** A vfx dissolve that has not settled this long after its length still despawns the enemy. */
const DISSOLVE_GRACE_SECONDS = 0.5;
/** Margin on top of the spared walk's expected time before a stuck soldier despawns anyway. */
const SPARED_LEAVE_MARGIN_SECONDS = 3;

/** What an enemy needs from its manager (shared state across enemies). */
export interface EnemyEnv {
  host: EnemyHost;
  rng: () => number;
  neighbours(self: Enemy): { x: number; z: number }[];
  acquireToken(self: Enemy, targetId: ActorId): boolean;
  releaseToken(self: Enemy): void;
  alertPack(self: Enemy, targetId: ActorId): void;
  mercyUnlocked(verb: UnlockVerb): boolean;
  nav(): NavPort | undefined;
  /** The nearest living packmate of the same spawner within pair range, if any. */
  partnerOf(self: Enemy): Enemy | null;
  /** Living packmates of the same spawner within `HOUND.packRadius` (the `circle-rush` behaviour). */
  packNearby(self: Enemy): number;
  /** The living member in the spawner's `leaderSlot`, or null. */
  packLeaderId(spawnerId: string): ActorId | null;
  /** Combined perception modifiers for this observer vs the target; null with no providers. */
  perceptionModifiers(self: Enemy, targetId: ActorId): CombinedModifiers | null;
  /** Called once the enemy is gone from the world (after despawn). */
  gone(self: Enemy, how: MemberEnd): void;
}

export interface EnemySpawn {
  def: EnemyDef;
  slug: string;
  spawnerId: string | null;
  spawnTag: string;
  feet: { x: number; y: number; z: number };
  yaw: number;
  level: number;
  maxHealth: number;
  damageScale: number;
  patrol: { x: number; z: number }[];
  options: SpawnOptions & { leash: boolean };
}

type Phase = 'alive' | 'dying' | 'fading' | 'leaving' | 'gone';

const LOCO_RUN_SPEED = 2.0;
/** Duck-typed controls of a quadruped body (QuadrupedBody): gait speed and slope pitch, fed every tick. */
interface QuadrupedControls {
  setSpeed(mps: number): void;
  setSlopePitch(rad: number): void;
  readonly params?: { bodyLength: number; scale?: number };
}
/** Brain states in which a footman may hold its shield up. */
const GUARD_STATES: ReadonlySet<AiState> = new Set<AiState>(['notice', 'chase', 'recover']);

/**
 * One enemy in the world: its actor, brain, animator, model, mover and combat registrations.
 * The manager calls `think` (intent), `animate` (animation), `react` (afterCombat) and `render`.
 */
export class Enemy {
  readonly actor: ActorLike;
  readonly brain: Brain;
  readonly def: EnemyDef;
  readonly slug: string;
  readonly spawnerId: string | null;
  readonly damageScale: number;
  private readonly host: EnemyHost;
  private readonly mover: EnemyMover;
  private readonly steering = new Steering();
  private readonly guard: Guard | null;
  /** Alley Cutpurse rules (def.thief); null for every other kind. */
  readonly thief: Cutpurse | null;
  private readonly path: PathFollower;
  private readonly moves = new MoveSelector();
  private readonly removers: Array<() => void> = [];
  private readonly trails: Partial<Record<WeaponChannel, { setEmitting(on: boolean): void; dispose(): void }>> = {};
  private yaw: number;
  private targetYaw: number;
  private phase: Phase = 'alive';
  private phaseTime = 0;
  private fadeStarted = false;
  private damagedThisTick = false;
  private poiseIdle = 0;
  private loco: string | null = null;
  private oneShotLeft = 0;
  private speed = 0;
  /** Horizontal speed the mover actually achieved last tick (fed to a quadruped body's gait). */
  private movedSpeed = 0;
  private stuckGiveUp = false;
  /** Seconds left in which a hit counts as a dodge counter (`player.dodged` named this enemy). */
  private counterLeft = 0;
  /** The swing whose bite already ignited (once per swing). */
  private ignitedSwing = -1;
  private awareness = 0;
  private lastSees = false;
  private lastHears = false;
  private lastDistance = Infinity;
  /** Watches only: never targets, never aggros, never attacks (see `damaged`). */
  readonly observerOnly: boolean;
  private asleep = false;
  private leaveFrom: THREE.Vector3 | null = null;
  private slowRemover: (() => void) | null = null;
  private slowLeft = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly prevRoot = new THREE.Vector3();
  private readonly lineOfSight: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => boolean;

  constructor(
    private readonly env: EnemyEnv,
    spawn: EnemySpawn,
    readonly body: EnemyBody,
  ) {
    const host = env.host;
    this.host = host;
    this.def = spawn.def;
    this.slug = spawn.slug;
    this.spawnerId = spawn.spawnerId;
    this.damageScale = spawn.damageScale * (spawn.options.damageScale ?? 1);
    this.observerOnly = spawn.options.observerOnly ?? this.def.observerOnly ?? false;
    this.path = new PathFollower(() => env.nav(), (m) => host.warn(m));
    this.guard = (spawn.options.guard ?? this.def.guard) ? new Guard() : null;
    this.yaw = this.targetYaw = spawn.yaw;
    this.mover = host.physics
      ? new SwitchingMover(host.physics, host.heightAt, spawn.feet)
      : new HeightfieldMover(host.heightAt, spawn.feet);
    this.mover.maxSpeed = Math.max(this.mover.maxSpeed, this.topSpeed(spawn.def, body));
    this.lineOfSight = host.physics
      ? makeLineOfSight(host.physics, host.player.collider, this.mover.collider)
      : () => true;

    try {
      host.scene.add(body.root);
      this.placeRoot(this.mover.feet);
      body.root.updateMatrixWorld(true);

      const maxHealth = Math.max(1, Math.round(spawn.maxHealth * (spawn.options.healthScale ?? 1)));
      this.actor = host.actors.spawn({
        kind: this.def.kind,
        // A watch guard is neutral and immortal: lock-on and hostile checks skip it, and a caught reset has no dead slot.
        team: this.def.observerOnly ? 'neutral' : 'hostile',
        immortal: this.def.observerOnly ? true : undefined,
        level: spawn.level,
        maxHealth,
        maxPoise: this.def.maxPoise,
        root: body.root,
        owner: body.owner,
        spawnTag: spawn.spawnTag,
      });
      this.actor.data['audio'] = { material: this.def.material };
      this.actor.data['enemies'] = this.view;

      this.brain = new Brain(this.def, this.hooks(), {
        home: { x: spawn.feet.x, z: spawn.feet.z },
        patrol: spawn.patrol,
        leash: spawn.options.leash,
        aggroOnSpawn: spawn.options.aggro && !this.observerOnly ? host.actors.player.id : null,
        rng: () => env.rng(),
      });
      if (spawn.options.moves) this.moveFilter = [...spawn.options.moves];
      this.thief = this.def.thief ? this.makeThief() : null;

      this.removers.push(host.combat.addTarget(body.hurtboxes, this.actor.id));
      for (const ch of ['right', 'left'] as const) {
        const tracer = body.tracers[ch];
        if (!tracer) continue;
        if (tracer.attacker !== body.owner) this.removers.push(host.actors.bindOwner(this.actor, tracer.attacker));
        this.removers.push(host.combat.addAttacker(this.actor.id, tracer, body.windowSource(ch)));
        // vfx-and-feedback.md: the trail id is the actor id; the shield gets none.
        const parts = body.weapons[ch];
        const trail = parts && ch === 'right' ? host.services.get('vfx')?.attachTrail?.(this.actor.id, parts.hilt, parts.tip) : undefined;
        if (trail) this.trails[ch] = trail;
      }
    } catch (err) {
      // Roll back what was built so a failed spawn leaves no actor, collider, scene node or registration.
      for (const remove of this.removers.splice(0)) remove();
      for (const ch of ['right', 'left'] as const) this.trails[ch]?.dispose();
      const spawned = (this as { actor?: ActorLike }).actor;
      if (spawned) host.actors.despawn(spawned.id);
      body.root.removeFromParent();
      this.mover.dispose();
      throw err;
    }

    body.onWindow = (ch, phase, swingId) => {
      this.trails[ch]?.setEmitting(phase === 'open');
      if (phase === 'open') {
        this.brain.windowOpened(swingId);
        this.startLeap();
      }
    };
    body.onClipEnd = (clip, interrupted) => {
      const move = this.brain.currentMove;
      if (move && clip === move.clip) this.brain.attackClipEnded(this.brain.currentSwing, interrupted);
    };
    if (this.brain.state === 'spawn') this.oneShot(ENEMY_CLIPS.rise, AI.riseSeconds);
    else this.setLoco(ENEMY_CLIPS.idle);
  }

  private moveFilter: string[] | undefined;

  /** The fastest the def moves: the chase, or a leap's average speed. */
  private topSpeed(def: EnemyDef, body: EnemyBody): number {
    let top = def.chaseSpeed;
    for (const m of def.moves) {
      if (!m.leap) continue;
      const seconds = (m.activeEnd - m.activeStart) * (body.clipDuration(m.clip) ?? 0.5);
      if (seconds > 0) top = Math.max(top, m.leap.maxMetres / seconds);
    }
    return top;
  }

  get id(): ActorId {
    return this.actor.id;
  }

  get state(): AiState {
    return this.brain.state;
  }

  get view(): EnemyView {
    const self = this;
    return {
      get actorId() {
        return self.actor?.id ?? '';
      },
      kind: this.def.kind,
      get state() {
        return self.brain?.state ?? 'spawn';
      },
      spawnerId: this.spawnerId,
      get level() {
        return self.actor?.level ?? 1;
      },
      get packLeader() {
        return !!self.actor && self.isPackLeader;
      },
    };
  }

  /** Simulated feet this tick. */
  get feet(): THREE.Vector3 {
    return this.mover.feet;
  }

  /** Awareness, line of sight and distance as of the last think; null once gone or while dormant. */
  perceptionState(): { awareness: number; sees: boolean; hears: boolean; distance: number } | null {
    if (this.phase === 'gone' || this.asleep) return null;
    return { awareness: this.awareness, sees: this.lastSees, hears: this.lastHears, distance: this.lastDistance };
  }

  private readonly poseCache: Mutable<ObserverPose> = {
    actorId: '',
    kind: 'ash-wraith',
    state: 'idle',
    spawnerId: null,
    level: 1,
    packLeader: false,
    feet: { x: 0, y: 0, z: 0 },
    yaw: 0,
    observerOnly: false,
  };

  /**
   * The pose handed to perception providers. One object per enemy, refilled on every call (nothing is allocated per
   * call), so a provider must read it during `modifiers` and not keep it.
   */
  pose(): ObserverPose {
    const p = this.poseCache;
    p.actorId = this.actor.id;
    p.kind = this.def.kind;
    p.state = this.brain.state;
    p.spawnerId = this.spawnerId;
    p.level = this.actor.level;
    p.packLeader = this.isPackLeader;
    p.feet.x = this.mover.feet.x;
    p.feet.y = this.mover.feet.y;
    p.feet.z = this.mover.feet.z;
    p.yaw = this.yaw;
    p.observerOnly = this.observerOnly;
    return p;
  }

  get isGone(): boolean {
    return this.phase === 'gone';
  }

  /** Alive and taking part (not dying, released or leaving). */
  get active(): boolean {
    return this.phase === 'alive';
  }

  /** The shield is up right now. */
  get guarding(): boolean {
    return this.guard?.up ?? false;
  }

  /**
   * What a hit from `from` (feet position) does against this footman's shield; 'open' without a guard.
   * `heavy` is `isHeavyBlow` of the request, judged before any scaling.
   */
  guardHit(heavy: boolean, from: { x: number; z: number }): GuardHit {
    if (!this.guard || this.phase !== 'alive') return 'open';
    const self = this.mover.feet;
    const dx = from.x - self.x;
    const dz = from.z - self.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-6)) return 'open';
    const f = forwardOf(this.yaw);
    const cos = Math.max(-1, Math.min(1, (f.x * dx + f.z * dz) / len));
    return this.guard.classify(heavy, Math.acos(cos) * (180 / Math.PI));
  }

  /** A heavy hit landed on the shield: it stays down for `GUARD.brokenSeconds`. */
  breakGuard(): void {
    this.guard?.break();
  }

  get mercyOpen(): boolean {
    return this.phase === 'alive' && this.brain.mercyOpen;
  }

  /**
   * Calm is possible right now (a beast that has not begun an attack; the entry point thread 1's Calm checks).
   * Refused once a swing has started, while staggered (that is the Warm Hand's) and when not alive.
   */
  get calmOpen(): boolean {
    return this.phase === 'alive' && !this.asleep && this.brain.calmOpen;
  }

  /** The Warm Hand is possible: a staggered (knocked down) calm-type beast. */
  get warmHandOpen(): boolean {
    return this.phase === 'alive' && this.brain.warmHandOpen;
  }

  /**
   * Thread 1's Calm: the head-lowered pose while an offering is accepted (quadruped bodies only; a no-op on a humanoid).
   * `on` false returns to the idle clip.
   */
  lowerHead(on: boolean): void {
    if (this.phase !== 'alive' || this.def.body !== 'quadruped') return;
    this.body.play(on ? 'HeadLower' : 'Idle');
  }

  /** This enemy fills its spawner's `leaderSlot`; a calmed leader calms its pack. */
  get isPackLeader(): boolean {
    return !!this.spawnerId && this.env.packLeaderId(this.spawnerId) === this.id;
  }

  // ---- fixed phases ------------------------------------------------------------------------------

  /** `intent` phase: perception, brain, steering and the queued move. */
  think(dt: number): void {
    if (this.phase === 'gone') return;
    if (this.phase === 'leaving') {
      this.leave(dt);
      return;
    }
    if (this.phase !== 'alive' || this.asleep) {
      if (!this.asleep) this.mover.move({ x: 0, z: 0 }, dt);
      return;
    }
    const player = this.host.actors.player;
    const pFeet = this.host.player.feet;
    const self = this.mover.feet;
    const mods = this.env.perceptionModifiers(this, player.id);
    const p = perceive({
      selfFeet: self,
      selfYaw: this.yaw,
      targetFeet: pFeet,
      targetAlive: !player.dead,
      targetLoud: this.host.player.loud(),
      damagedBy: this.damagedThisTick,
      lineOfSight: this.lineOfSight,
      modifiers: mods,
    });
    this.damagedThisTick = false;
    this.trackAwareness(dt, p, player.id, AI.sightRange * (mods?.sightRangeScale ?? 1));
    const toTarget = yawTo(self, pFeet);
    const senses: Senses = {
      self: { x: self.x, z: self.z },
      targetId: player.id,
      targetAlive: !player.dead,
      targetPos: { x: pFeet.x, z: pFeet.z },
      // An observer-only guard never acquires a target: the brain stays calm.
      notices: p.notices && !this.observerOnly,
      sees: p.sees,
      distance: p.distance,
      facingErrorDeg: Math.abs(wrap(toTarget - this.yaw)) * (180 / Math.PI),
      healthFraction: this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0,
      stuckGiveUp: this.stuckGiveUp,
      yieldAllowed: this.env.mercyUnlocked('spare'),
      packNearby: this.def.behaviour === 'circle-rush' ? this.env.packNearby(this) : 0,
    };
    const status = readStatusData(this.actor.data['status']);
    if (status.stunSeconds > 0) this.brain.stunned(status.stunSeconds);
    const intent = this.brain.step(dt, senses);
    if (this.thief) {
      const visible = p.distance <= AI.sightRange && this.lineOfSight(pFeet, self);
      this.thief.tick(dt, this.brain.state, visible);
      if (this.phase !== 'alive') return; // it despawned itself (flee window over, or blinked out)
    }
    if (status.speedScale < 1) intent.speed *= status.speedScale;
    this.guard?.step(dt, GUARD_STATES.has(this.brain.state), this.env.rng);
    if (this.def.pairAdvance && this.brain.state === 'chase' && intent.goal && senses.targetPos && intent.goal.x === senses.targetPos.x && intent.goal.z === senses.targetPos.z) {
      // A plain chase heads straight for the target (the circling goal is somewhere else); a pair spreads onto opposite flanks instead.
      const partner = this.env.partnerOf(this);
      if (partner) intent.goal = pairGoal(self, partner.feet, intent.goal!, this.actor.id, partner.actor.id);
    }

    let velocity = { x: 0, z: 0 };
    this.stuckGiveUp = false;
    if (intent.goal && intent.speed > 0 && Math.hypot(intent.goal.x - self.x, intent.goal.z - self.z) > intent.stopDistance) {
      // Inside a nav grid (an interior), steer to the next path waypoint; outdoors this is null.
      // Observer-only guards never call nav.path: they walk their patrol in straight kinematic lines.
      const waypoint = this.observerOnly ? null : this.path.goalFor(dt, self, { x: intent.goal.x, y: pFeet.y, z: intent.goal.z });
      const out = this.steering.step({
        position: self,
        desired: waypoint ?? intent.goal,
        speed: intent.speed,
        neighbours: this.env.neighbours(this),
        heightAt: this.host.heightAt,
        castFeeler: this.castFeeler,
        dt,
      });
      velocity = out.move;
      this.stuckGiveUp = out.giveUp;
    } else {
      this.steering.reset();
    }
    const pushed = this.pushTicks > 0;
    if (pushed) {
      this.pushTicks--;
      velocity = this.pushVelocity;
    }
    if (this.thief?.holdStill) velocity = { x: 0, z: 0 };
    this.speed = pushed ? 0 : Math.hypot(velocity.x, velocity.z);
    const bx = self.x;
    const bz = self.z;
    if (pushed) {
      // facing stays while knocked back
    } else if (intent.face) this.targetYaw = yawTo(self, intent.face);
    else if (this.speed > 0.05) this.targetYaw = Math.atan2(-velocity.x, -velocity.z);
    this.yaw = turnToward(this.yaw, this.targetYaw, AI.turnRate * dt);
    this.mover.move(velocity, dt);
    this.movedSpeed = dt > 0 ? Math.hypot(this.mover.feet.x - bx, this.mover.feet.z - bz) / dt : 0;
  }

  /** `animation` phase: root at the simulated pose, mixer by one tick, matrices current for combat. */
  animate(dt: number): void {
    if (this.phase === 'gone' || this.asleep) return;
    this.placeRoot(this.mover.feet);
    if (this.oneShotLeft > 0) this.oneShotLeft -= dt;
    if (this.phase === 'alive' && this.oneShotLeft <= 0) this.chooseLoco();
    this.feedQuadruped();
    this.body.fixedUpdate(dt);
    this.body.root.updateMatrixWorld(true);
  }

  /** `afterCombat` phase: poise regen, slow timer, the death and release fades. */
  react(dt: number): void {
    if (this.phase === 'gone') return;
    this.moves.tick(dt);
    if (this.counterLeft > 0) this.counterLeft = Math.max(0, this.counterLeft - dt);
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.clearSlow();
    }
    if (this.phase === 'alive') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= AI.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
      return;
    }
    this.phaseTime += dt;
    if (this.phase === 'dying' && this.phaseTime >= this.deathClipSeconds()) this.startFade(AI.deathFadeSeconds);
    if (this.phase === 'fading' && this.fadeHandledByVfx) {
      if (this.dissolved || this.phaseTime >= this.fadeSeconds + DISSOLVE_GRACE_SECONDS) this.despawn();
      return;
    }
    if (this.phase === 'fading' && !this.fadeHandledByVfx) {
      this.body.setOpacity(Math.max(0, 1 - this.phaseTime / this.fadeSeconds));
      if (this.phaseTime >= this.fadeSeconds) this.despawn();
    }
  }

  render(alpha: number): void {
    if (this.phase === 'gone') return;
    this.mover.interpolatedFeet(alpha, this.tmp);
    this.placeRoot(this.tmp);
  }

  // ---- events (from the manager) -----------------------------------------------------------------

  /** damage.dealt on this enemy. */
  damaged(attackerId: ActorId | null, outcome: string, poiseDealt: number, staggered: boolean, killed: boolean, kind?: string): void {
    if (this.phase !== 'alive') return;
    // Status ticks (burn, poison) hurt but never flinch, stagger or provoke.
    if (kind === 'status') return;
    if (outcome === 'hit') {
      this.damagedThisTick = true;
      this.poiseIdle = 0;
    }
    // An observer-only guard flinches on a hit and its awareness jumps to 1 (one `ai.spotted`; thread 18 counts it as
    // caught), but it never provokes, staggers into mercy or chases: the brain is not told, so no `ai.aggro` follows.
    if (this.observerOnly) {
      if (outcome === 'hit') {
        if (!staggered && !killed) this.oneShot(ENEMY_CLIPS.flinch, AI.flinchSeconds);
        this.spotNow(attackerId ?? this.host.actors.player.id);
      }
      return;
    }
    if (staggered || killed) return; // actor.staggered and actor.died follow in the same batch
    this.brain.setCondition(this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0, this.env.mercyUnlocked('spare'));
    if (outcome === 'hit' && this.counterLeft > 0 && attackerId === this.host.actors.player.id) {
      // A hit right after the player dodged this enemy's attack: knocked down, poise break or not.
      this.counterLeft = 0;
      this.brain.knockedDown(attackerId);
      return;
    }
    this.brain.hit(attackerId, poiseDealt, outcome);
  }

  /** `player.dodged` named this enemy as the attacker: its next player hit within the window is a dodge counter. */
  playerDodged(): void {
    if (this.phase === 'alive' && this.def.dodgeCounterKnockdown) this.counterLeft = HOUND.dodgeCounterSeconds;
  }

  /** The current bite's burning status, once per swing; null when this move does not ignite or already did. */
  burningBite(): { id: string; dps: number; seconds: number } | null {
    const move = this.brain.currentMove;
    if (move?.onHit !== 'ignite' || !this.active) return null;
    const swing = this.brain.currentSwing;
    if (this.ignitedSwing === swing) return null;
    this.ignitedSwing = swing;
    return { id: BURNING_BITE.id, dps: BURNING_BITE.dps * this.damageScale, seconds: BURNING_BITE.seconds };
  }

  staggered(byId: ActorId | null): void {
    if (this.phase !== 'alive') return;
    this.poiseIdle = 0;
    if (this.observerOnly) {
      this.oneShot(ENEMY_CLIPS.stagger, AI.breakStaggerSeconds);
      return;
    }
    this.brain.setCondition(
      this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0,
      this.env.mercyUnlocked('spare'),
    );
    this.brain.staggered(byId);
  }

  /** actor.died: stop fighting at once, then death clip, dissolve or fade, despawn. */
  died(): void {
    // A spared soldier walking off can still be struck down (the core revokes its mercy credit).
    if (this.phase !== 'alive' && this.phase !== 'leaving') return;
    this.leaveFrom = null;
    this.thief?.died();
    this.brain.died();
    this.disarm();
    this.phase = 'dying';
    this.phaseTime = 0;
    this.goneHow = 'died';
    this.oneShot(ENEMY_CLIPS.death, Infinity);
  }

  /** Released by a mercy pulse: same as death without the clip, dissolving in gold (thread 7). */
  release(): void {
    if (this.phase !== 'alive') return;
    this.brain.released();
    this.disarm();
    this.actor.invulnerable = true;
    this.goneHow = 'released';
    this.startFade(AI.releaseDissolveSeconds);
  }

  /** Spared: disarmed, walks off and despawns; a strike before it leaves revokes (see `revoked`). */
  spare(): void {
    if (this.phase !== 'alive') return;
    this.thief?.spared();
    this.brain.spared();
    this.goneHow = 'spared';
    this.phase = 'leaving';
    this.leaveFrom = this.mover.feet.clone();
    this.setLoco(ENEMY_CLIPS.walk);
  }

  /** A thief gets away with the pouch (flee window over, blinked out, or gone dormant while fleeing): the spawner may refill its slot. */
  private escape(): void {
    if (this.phase === 'gone') return;
    this.goneHow = 'escaped';
    this.despawn();
  }

  /** Despawns without reporting the mercy exit, for a load that never saw the mercy. */
  despawnUnseen(): void {
    this.goneHow = 'despawned';
    this.despawn();
  }

  /** Leaving or dissolving after an accepted mercy. */
  get inMercyExit(): boolean {
    return this.goneHow === 'released' || this.goneHow === 'spared';
  }

  /** A packmate was spared: see `Brain.offerYield`. */
  offerYield(): boolean {
    return this.phase === 'alive' && this.brain.offerYield();
  }

  revoked(strikerId: ActorId | null): boolean {
    if (this.phase !== 'leaving' || this.actor.dead) return false;
    this.phase = 'alive';
    this.leaveFrom = null;
    this.goneHow = 'despawned';
    this.brain.revoked(strikerId);
    return true;
  }

  /** The player this enemy is chasing died or despawned. */
  targetGone(targetId: ActorId): void {
    this.brain.targetGone(targetId);
  }

  alert(targetId: ActorId): void {
    if (this.phase === 'alive' && !this.observerOnly) this.brain.alert(targetId);
  }

  /** This enemy's swing slowed the player (ash-grab). */
  applySlow(scale: number, seconds: number): void {
    this.clearSlow();
    this.slowRemover = this.host.player.addMoveModifier(`enemies.ash-grab.${this.slug}`, { speedScale: scale });
    this.slowLeft = seconds;
  }

  sleep(): void {
    if (this.asleep || this.phase !== 'alive') return;
    // Leave combat first so the token, telegraph (cancelled), open window and aggro (calm) are settled.
    this.brain.standDown();
    // A fleeing thief that goes dormant is out of play: its flee window is over.
    if (this.thief && this.thief.stolenGold > 0) return void this.escape();
    this.asleep = true;
    if (this.mover instanceof SwitchingMover) this.mover.sleep();
  }

  wake(): void {
    if (!this.asleep) return;
    this.asleep = false;
    if (this.mover instanceof SwitchingMover) this.mover.wake();
  }

  get sleeping(): boolean {
    return this.asleep;
  }

  /** Despawns the actor; `actor.despawned` then calls `cleanup`. */
  despawn(): void {
    if (this.phase === 'gone') return;
    this.host.actors.despawn(this.actor.id);
    this.cleanup();
  }

  /** Frees everything; idempotent (also used when something else despawned the actor). */
  cleanup(): void {
    if (this.phase === 'gone') return;
    if (this.brain.state !== 'dead' && !this.brain.finished) this.brain.died();
    this.disarm();
    this.phase = 'gone';
    this.body.onWindow = null;
    this.body.onClipEnd = null;
    this.body.dispose();
    this.mover.dispose();
    this.env.gone(this, this.goneHow);
  }

  // ---- internals ---------------------------------------------------------------------------------

  private goneHow: MemberEnd = 'despawned';
  private fadeSeconds: number = AI.deathFadeSeconds;
  private fadeHandledByVfx = false;
  private dissolved = false;
  private leaveTime = 0;

  /** Out of combat for good: no hurtboxes, no weapons, no slow, no trails, no token, not hittable. */
  private disarm(): void {
    for (const remove of this.removers.splice(0)) {
      try {
        remove();
      } catch (err) {
        this.host.warn(`enemies: removing ${this.actor.id} from combat failed: ${String(err)}`);
      }
    }
    this.actor.hittable = false;
    this.clearSlow();
    for (const ch of ['right', 'left'] as const) {
      this.trails[ch]?.dispose();
      delete this.trails[ch];
    }
    this.env.releaseToken(this);
  }

  private startFade(seconds: number): void {
    if (this.fadeStarted) return;
    this.fadeStarted = true;
    this.phase = 'fading';
    this.phaseTime = 0;
    this.fadeSeconds = seconds;
    const vfx = this.host.services.get('vfx');
    if (!vfx) return;
    this.fadeHandledByVfx = true;
    // The despawn happens in `react` (inside the fixed tick); a dissolve that never settles times out.
    const done = () => {
      this.dissolved = true;
    };
    try {
      vfx.dissolve(this.body.root, seconds).then(done, done);
    } catch (err) {
      this.host.warn(`enemies: vfx dissolve failed for ${this.actor.id}: ${String(err)}`);
      this.fadeHandledByVfx = false;
    }
  }

  private deathClipSeconds(): number {
    return this.body.clipDuration(ENEMY_CLIPS.death) ?? 1;
  }

  private leave(dt: number): void {
    const self = this.mover.feet;
    const p = this.host.player.feet;
    const away = { x: self.x - p.x, z: self.z - p.z };
    const len = Math.hypot(away.x, away.z) || 1;
    const v = { x: (away.x / len) * this.def.walkSpeed, z: (away.z / len) * this.def.walkSpeed };
    this.yaw = turnToward(this.yaw, Math.atan2(-v.x, -v.z), AI.turnRate * dt);
    this.mover.move(v, dt);
    this.leaveTime += dt;
    // A soldier pinned against a wall still leaves: after the walk's time plus a margin.
    const timeout = AI.sparedWalkMetres / Math.max(0.1, this.def.walkSpeed) + SPARED_LEAVE_MARGIN_SECONDS;
    if ((this.leaveFrom && self.distanceTo(this.leaveFrom) >= AI.sparedWalkMetres) || this.leaveTime >= timeout) this.despawn();
  }

  /** Steps the awareness meter and emits `ai.suspicious` / `ai.spotted` on their edges. */
  private trackAwareness(dt: number, p: { sees: boolean; hears: boolean; distance: number }, targetId: ActorId, sightRange: number): void {
    const step = stepAwareness(this.awareness, { ...p, sightRange }, dt);
    this.awareness = step.awareness;
    this.lastSees = p.sees;
    this.lastHears = p.hears;
    this.lastDistance = p.distance;
    if (step.becameSuspicious) this.host.events.emit('ai.suspicious', { actorId: this.actor.id, targetId, awareness: step.awareness });
    if (step.becameSpotted) this.host.events.emit('ai.spotted', { actorId: this.actor.id, targetId });
  }

  /** A hit on an observer: awareness goes straight to 1, and `ai.spotted` fires if it was not already there. */
  private spotNow(targetId: ActorId): void {
    const was = this.awareness;
    this.awareness = 1;
    if (was < 1) this.host.events.emit('ai.spotted', { actorId: this.actor.id, targetId });
  }

  private clearSlow(): void {
    this.slowLeft = 0;
    const r = this.slowRemover;
    this.slowRemover = null;
    r?.();
  }

  private placeRoot(feet: THREE.Vector3): void {
    this.prevRoot.copy(this.body.root.position);
    this.body.root.position.copy(feet);
    this.body.root.rotation.set(0, this.yaw, 0);
  }

  private chooseLoco(): void {
    const s = this.brain.state;
    if (s === 'telegraph' || s === 'attack') return; // the attack clip plays
    if (s === 'yield') return this.setLoco(ENEMY_CLIPS.kneelIdle);
    if (this.guard?.up) return this.setLoco(ENEMY_CLIPS.guard);
    if (this.speed > LOCO_RUN_SPEED) this.setLoco(ENEMY_CLIPS.run);
    else if (this.speed > 0.1) this.setLoco(ENEMY_CLIPS.walk);
    else this.setLoco(ENEMY_CLIPS.idle);
  }

  /** A quadruped body gets the mover's real speed (its gait) and the terrain pitch under its front and back. */
  private feedQuadruped(): void {
    const q = this.body as Partial<QuadrupedControls>;
    if (typeof q.setSpeed !== 'function') return;
    q.setSpeed(this.phase === 'alive' ? this.movedSpeed : 0);
    if (typeof q.setSlopePitch === 'function') {
      const f = this.mover.feet;
      const length = (q.params?.bodyLength ?? 0) * (q.params?.scale ?? 1);
      const half = length / 2;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      q.setSlopePitch(bodyPitch(this.host.heightAt(f.x + fx * half, f.z + fz * half), this.host.heightAt(f.x - fx * half, f.z - fz * half), length));
    }
  }

  private setLoco(clip: string): void {
    if (this.loco === clip && this.body.currentClip === clip) return;
    this.loco = clip;
    this.body.play(clip, { loop: true });
  }

  private oneShot(clip: string, seconds: number): void {
    this.loco = null;
    this.body.play(clip, { loop: false });
    const len = this.body.clipDuration(clip) ?? FIXED_TIMESTEP;
    this.oneShotLeft = Math.min(seconds, len);
  }

  private readonly castFeeler = (
    origin: { x: number; y: number; z: number },
    dir: { x: number; z: number },
    length: number,
  ): number | null => {
    const physics = this.host.physics;
    if (!physics) return null;
    const hit = physics.raycast(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: 0, z: dir.z },
      length,
      this.mover.collider as never,
    );
    // The player is a target, not an obstacle.
    if (!hit || hit.collider === this.host.player.collider) return null;
    return hit.distance;
  };

  private hooks(): BrainHooks {
    return {
      stateChanged: (from, to) => {
        this.host.events.emit('enemies.state', { actorId: this.actor.id, from, to });
        // A knocked-down hound stops mid-leap.
        if (to === 'stagger' && from === 'attack' && this.brain.currentMove?.leap) this.pushTicks = 0;
        if (to === 'stagger') this.oneShot(ENEMY_CLIPS.stagger, AI.breakStaggerSeconds);
        else if (to === 'yield') this.oneShot(ENEMY_CLIPS.kneel, AI.yieldSeconds);
        else if (from === 'yield' || from === 'stagger') this.oneShotLeft = 0;
      },
      aggro: (targetId) => this.host.events.emit('ai.aggro', { actorId: this.actor.id, targetId }),
      calm: () => this.host.events.emit('ai.calm', { actorId: this.actor.id }),
      startAttack: (move, lead) => {
        this.loco = null;
        this.oneShotLeft = 0;
        return this.body.playAttack(move, lead);
      },
      cancelAttack: () => this.body.cancelAttack(),
      telegraph: (move, swingId, lead) =>
        this.host.events.emit('telegraph', {
          actorId: this.actor.id,
          kind: move.telegraph,
          attackId: move.clip,
          moveId: move.id,
          swingId,
          leadSeconds: lead,
        }),
      telegraphCancelled: (swingId) => this.host.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId }),
      pickMove: (distance) =>
        this.moves.pick(this.thief ? this.thief.availableMoves(this.def.moves) : this.def.moves, distance, this.env.rng, this.moveFilter),
      caught: (how) => this.thief?.caught(how),
      markMoveUsed: (move: MoveDef) => this.moves.markUsed(move.id, this.def.moves),
      acquireToken: (targetId) => this.env.acquireToken(this, targetId),
      releaseToken: () => this.env.releaseToken(this),
      flinch: () => this.oneShot(ENEMY_CLIPS.flinch, AI.flinchSeconds),
      knockback: () => this.knockback(),
      yieldStarted: (seconds) => this.host.events.emit('enemies.yield', { actorId: this.actor.id, seconds }),
      refill: () => {
        this.host.damage.heal(this.actor.id, this.actor.maxHealth);
        this.actor.restorePoise();
      },
      alertPack: (targetId) => this.env.alertPack(this, targetId),
    };
  }

  private makeThief(): Cutpurse {
    const host = this.host;
    return new Cutpurse(
      {
        actorId: this.actor.id,
        feet: () => this.mover.feet,
        startFlee: () => this.brain.startFlee(),
        playClip: (clip, seconds) => this.oneShot(clip, seconds),
        setHidden: (hidden) => {
          this.body.root.visible = !hidden;
        },
        despawn: () => this.escape(),
      },
      {
        inventory: () => host.services.get('inventory'),
        vfx: () => host.services.get('vfx'),
        events: host.events,
        state: host.state,
        warn: (m) => host.warn(m),
      },
    );
  }

  /**
   * A move with `leap` (the pounce) carries the enemy forward in a straight line while its window is open: up to
   * `maxMetres`, stopping `HOUND.leapStopShort` short of the target when that is nearer.
   */
  private startLeap(): void {
    const move = this.brain.currentMove;
    if (!move?.leap || this.phase !== 'alive') return;
    const self = this.mover.feet;
    const p = this.host.player.feet;
    const toTarget = Math.hypot(p.x - self.x, p.z - self.z);
    const metres = Math.max(0, Math.min(move.leap.maxMetres, toTarget - HOUND.leapStopShort));
    const windowSeconds = (move.activeEnd - move.activeStart) * (this.body.clipDuration(move.clip) ?? 0.5);
    const ticks = Math.max(1, Math.round(windowSeconds / FIXED_TIMESTEP));
    const f = forwardOf(this.yaw);
    const speed = metres / (ticks * FIXED_TIMESTEP);
    this.pushTicks = ticks;
    this.pushVelocity = { x: f.x * speed, z: f.z * speed };
  }

  /** 1.2 m away from the player over KNOCKBACK seconds, applied as one teleport-free push per tick. */
  private knockback(): void {
    const p = this.host.player.feet;
    const self = this.mover.feet;
    const dir = { x: self.x - p.x, z: self.z - p.z };
    const len = Math.hypot(dir.x, dir.z);
    const f = len > 1e-6 ? { x: dir.x / len, z: dir.z / len } : forwardOf(this.yaw + Math.PI);
    const speed = AI.knockbackMetres / AI.knockbackSeconds;
    const ticks = Math.max(1, Math.round(AI.knockbackSeconds / FIXED_TIMESTEP));
    this.pushTicks = ticks;
    this.pushVelocity = { x: f.x * speed, z: f.z * speed };
  }

  /** Knockback runs in place of steering while it lasts. */
  private pushTicks = 0;
  private pushVelocity = { x: 0, z: 0 };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The bone damage multiplier used by the enemies' damage modifier (HitEvent.damage is ignored). */
export function boneMultiplier(bone: string | undefined): number {
  return bone ? (COMBAT.boneMultipliers[bone] ?? 1) : 1;
}
