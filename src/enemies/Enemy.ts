import * as THREE from 'three';
import { COMBAT, FIXED_TIMESTEP } from '../config/constants';
import { Brain, type BrainHooks, type Senses } from './ai/Brain';
import { makeBehaviour, type BehaviourOverlay } from './behaviours';
import { Guard, type GuardHit } from './ai/guard';
import { MoveSelector } from './ai/moveSelect';
import { pairGoal } from './ai/pair';
import { stepAwareness } from './ai/awareness';
import { canSeeChest, makeLineOfSight, perceive, type CombinedModifiers } from './ai/perception';
import { ENEMY_CLIPS } from './clips';
import { Cutpurse } from './cutpurse/Cutpurse';
import { BURNING_BITE, HOUND } from './hound/tuning';
import { bodyPitch } from './quadruped/gait';
import { readStatusData, STATUS_DATA_KEY } from './statusData';
import type { EnemyBody } from './body';
import type { GroundAttacks } from './ranged/GroundAttacks';
import type { Shooter } from './ranged/EnemyProjectiles';
import { CeilingDrop, type CeilingEnv } from './crawler/ceiling';
import { FoxGuide } from './fox/guide';
import { CRAWLER_DROP } from './crawler/def';
import { TELEGRAPH_STYLE } from './defs';
import type { ActorId, ActorLike, EnemyHost, MercyStateLike as MercyState, NavPort } from './ports';
import type { ObserverPose } from './perceptionHook';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
import { PathFollower, type PathBudget } from './steering/pathFollower';
import { forwardOf, Steering, turnToward, yawTo } from './steering/steering';
import { HeightfieldMover, SwitchingMover, type EnemyMover } from './steering/movers';
import { AI, AWARENESS } from './tuning';
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
  /** Shared per-tick cap on `nav.path` queries; absent means uncapped. */
  pathBudget?: PathBudget;
  /** The nearest living packmate of the same spawner within pair range, if any. */
  partnerOf(self: Enemy): Enemy | null;
  /** Living packmates of the same spawner within `HOUND.packRadius` (the `circle-rush` behaviour). */
  packNearby(self: Enemy): number;
  /** The living member in the spawner's `leaderSlot`, or null. */
  packLeaderId(spawnerId: string): ActorId | null;
  /** Combined perception modifiers for this observer vs the target; null with no providers. */
  perceptionModifiers(self: Enemy, targetId: ActorId): CombinedModifiers | null;
  /** The taunter this enemy should target this tick (nearest in range), or null/absent for the player. Bosses and opted-out kinds get null. */
  taunt?(self: Enemy): { id: ActorId; feet: { x: number; y: number; z: number } } | null;
  /** Called once the enemy is gone from the world (after despawn). */
  gone(self: Enemy, how: MemberEnd): void;
  /** A6b: ranged and area effects of a move's window (absent in hosts without ground attacks). */
  attacks?: GroundAttacks;
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
  /** The spawner slot this member fills (behaviour overlays key per-slot state on it: a wyrmling's chain). */
  slot?: number;
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
  /** Calm's head-lowered pose is held (looped) until `lowerHead(false)` or any state change. */
  private headLowered = false;
  private speed = 0;
  /** Horizontal speed the mover actually achieved last tick (fed to a quadruped body's gait). */
  private movedSpeed = 0;
  private stuckGiveUp = false;
  /** Seconds left in which a hit counts as a dodge counter (`player.dodged` named this enemy). */
  private counterLeft = 0;
  /** The swing whose bite already ignited (once per swing). */
  private ignitedSwing = -1;
  private awareness = 0;
  private spottedArmed = true;
  private emitsStealth = false;
  private lastSees = false;
  private lastHears = false;
  private lastDistance = Infinity;
  /** Watches only: never targets, never aggros, never attacks (see `damaged`). */
  readonly observerOnly: boolean;
  private asleep = false;
  /** Stealth's hold: while `faceHeld`, an observer-only guard stands still facing `facePoint` (preallocated; see `faceToward`). */
  private faceHeld = false;
  private readonly facePoint = { x: 0, z: 0 };
  private leaveFrom: THREE.Vector3 | null = null;
  private slowRemover: (() => void) | null = null;
  private slowLeft = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly prevRoot = new THREE.Vector3();
  private readonly lineOfSight: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => boolean;
  /** The def's behaviour overlay (behaviours.ts); null for every Act 1 kind. */
  private readonly overlay: BehaviourOverlay | null;
  /** A peaceful spawn (the resting den wyrm) notices nothing until it is hit. */
  private peaceful: boolean;

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
    this.peaceful = spawn.options.peaceful === true;
    this.path = new PathFollower(() => env.nav(), (m) => host.warn(m), env.pathBudget);
    this.guard = (spawn.options.guard ?? this.def.guard) ? new Guard() : null;
    this.yaw = this.targetYaw = spawn.yaw;
    this.mover = host.physics
      ? new SwitchingMover(host.physics, host.heightAt, spawn.feet)
      : new HeightfieldMover(host.heightAt, spawn.feet);
    this.mover.maxSpeed = Math.max(this.mover.maxSpeed, this.topSpeed(spawn.def, body));
    this.baseMaxSpeed = this.mover.maxSpeed;
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
        team: this.observerOnly || this.def.behaviour === 'guide' ? 'neutral' : 'hostile',
        immortal: this.observerOnly || this.def.behaviour === 'guide' ? true : undefined,
        // The fox is untargetable: lock-on, swings and bolts pass through it.
        hittable: this.def.behaviour === 'guide' ? false : undefined,
        level: spawn.level,
        maxHealth,
        maxPoise: this.def.maxPoise,
        root: body.root,
        owner: body.owner,
        spawnTag: spawn.spawnTag,
      });
      this.actor.data['audio'] = { material: this.def.material };
      this.actor.data['enemies'] = this.view;
      this.actor.mercyState = () => this.mercyState();

      this.brain = new Brain(this.def, this.hooks(), {
        home: { x: spawn.feet.x, z: spawn.feet.z },
        patrol: spawn.patrol,
        leash: spawn.options.leash,
        aggroOnSpawn: spawn.options.aggro && !this.observerOnly ? host.actors.player.id : null,
        rng: () => env.rng(),
      });
      if (spawn.options.moves) this.moveFilter = [...spawn.options.moves];
      this.thief = this.def.thief ? this.makeThief() : null;
      this.overlay = this.makeOverlay(spawn);
      if (this.overlay?.actorPosition) {
        // The overlay's position (a flier's body in the air) for lock-on and aims; the feet stay the simulated position.
        const overlay = this.overlay;
        const base = this.actor.worldPosition.bind(this.actor);
        this.actor.worldPosition = (out) => {
          base(out);
          overlay.actorPosition!(out);
          return out;
        };
      }
      this.fox = this.def.behaviour === 'guide' ? new FoxGuide({ x: spawn.feet.x, z: spawn.feet.z }) : null;
      this.ceiling = this.def.behaviour === 'ceiling' && spawn.options.hanging !== false ? new CeilingDrop(this.ceilingEnv(), this.mover.feet) : null;

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
      (this as unknown as { overlay?: BehaviourOverlay | null }).overlay?.dispose?.();
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
        this.windowEffects();
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

  // ---- A6b: ground-enemy state --------------------------------------------------------------------

  /** A cooling hit has it staggered (the crawler's free Calm window); cleared when the stagger ends. */
  private cooled = false;
  /** The Cinder Golem's core was just hit (set by the manager's damage modifier, consumed by the poise break it causes). */
  private coreArmed = false;
  /** The crawler's ceiling state, or null for every other kind. */
  readonly ceiling: CeilingDrop | null;
  /** The Kindling Fox's guiding brain (no Brain moves, no perception), or null for every other kind. */
  readonly fox: FoxGuide | null;

  /** True from a cooling hit until the stagger it caused ends. */
  get isCooled(): boolean {
    return this.cooled;
  }

  /** The golem's back core was hit this tick. */
  markCoreHit(): void {
    if (this.def.behaviour === 'back-core') this.coreArmed = true;
  }

  /**
   * A cooling hit (the thrown Cooling Draught's splash, Gust Step, valve spray) through the `cooling` service: staggers
   * regardless of poise, provokes its source, and does not mark the enemy struck, so Calm stays open ("cooling hit then
   * hold T"). Only kinds with a `freeCalm: 'cooled'` row or a ceiling form react. False when it had no effect.
   */
  coolingHit(sourceId: ActorId | null): boolean {
    if (this.phase !== 'alive' || this.observerOnly) return false;
    if (this.def.mercy?.freeCalm !== 'cooled') return false;
    this.ceiling?.wake(true);
    this.cooled = true;
    this.brain.knockedDown(sourceId);
    return true;
  }

  private ceilingEnv(): CeilingEnv {
    const self = this;
    return {
      playerFeet: () => (this.host.actors.player.dead ? null : this.host.player.feet),
      feet: () => this.mover.feet,
      ceilingHeight: () => {
        const f = this.mover.feet;
        const hit = this.host.physics?.raycast({ x: f.x, y: f.y + 0.5, z: f.z }, { x: 0, y: 1, z: 0 }, 6, this.mover.collider as never);
        return hit ? Math.max(0, hit.point.y - f.y - 0.3) : 3;
      },
      telegraph: (t) => this.body.setTelegraph(t, TELEGRAPH_STYLE['slag-crawler'].color),
      dripStarted: (lead) =>
        this.host.events.emit('telegraph', { actorId: this.actor.id, kind: 'dodge', attackId: 'Drop', moveId: CRAWLER_DROP.id, swingId: -1, leadSeconds: lead }),
      landed: () => {
        // A cooled crawler lands harmless: the cooling hit that dropped it is what staggers it.
        if (!self.cooled) self.env.attacks?.hitArea(self.shooter, CRAWLER_DROP);
        self.brain.alert(self.host.actors.player.id);
      },
    };
  }

  /** Facing yaw (0 faces -Z). */
  get facing(): number {
    return this.yaw;
  }

  /** Where the mercy hold's prompt sits: the golem's exposed back core, else the feet. */
  mercyAnchor(out: THREE.Vector3): THREE.Vector3 {
    const core = (this.body as { coreWorldPosition?: (o: THREE.Vector3) => THREE.Vector3 }).coreWorldPosition;
    if (this.def.behaviour === 'back-core' && core) return core.call(this.body, out);
    return out.copy(this.mover.feet);
  }

  /** The attacker as the ranged and area helpers see it. */
  get shooter(): Shooter {
    const self = this;
    return {
      get id() {
        return self.actor.id;
      },
      damageScale: this.damageScale,
      feet: this.mover.feet,
      get yaw() {
        return self.yaw;
      },
    };
  }

  /** A6b: a move with `ranged` or `area` does its extra effect as its window opens (the tracer still sweeps). */
  private windowEffects(): void {
    const move = this.brain.currentMove;
    if (!move || (!move.ranged && !move.area) || this.phase !== 'alive' || !this.env.attacks) return;
    this.env.attacks.windowOpened(this.shooter, move);
  }

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

  /**
   * Pauses an observer-only guard's patrol and turns it toward `at` (at `AI.turnRate`) until the next call; `null`
   * releases it, and the patrol resumes from where it stands. Idempotent and allocation-free. False (nothing
   * happens) for a gone, dormant, dying or non-observer-only enemy and for a non-finite point.
   */
  faceToward(at: { x: number; y: number; z: number } | null): boolean {
    if (!this.observerOnly || this.phase !== 'alive' || this.asleep) return false;
    if (at === null) {
      this.faceHeld = false;
      return true;
    }
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) return false;
    this.facePoint.x = at.x;
    this.facePoint.z = at.z;
    this.faceHeld = true;
    return true;
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
    if (this.phase !== 'alive') return false;
    const open = this.brain.mercyOpen;
    return this.overlay?.mercyOpen ? this.overlay.mercyOpen(open) : open;
  }

  /**
   * Calm is possible right now (a beast that has not begun an attack; the entry point thread 1's Calm checks).
   * Refused once a swing has started, while staggered (that is the Warm Hand's) and when not alive.
   */
  get calmOpen(): boolean {
    if (this.phase !== 'alive' || this.asleep) return false;
    const open = this.brain.calmOpen;
    return this.overlay?.calmOpen ? this.overlay.calmOpen(open) : open;
  }

  /**
   * v0.6 ally rules (actors-and-damage.md section 11): yielding (kneeling), staggered with a mercy window open,
   * calming (calmed, walking off), leaving (spared, walking off) or releasing (dissolving).
   */
  mercyState(): MercyState {
    if (this.phase === 'leaving') return this.goneHow === 'calmed' ? 'calming' : 'leaving';
    if (this.phase === 'fading' && this.goneHow === 'released') return 'releasing';
    if (this.phase === 'fading' && this.goneHow === 'calmed') return 'calming';
    if (this.phase !== 'alive') return 'none';
    if (this.brain.state === 'yield') return 'yielding';
    if (this.brain.state === 'stagger' && this.mercyOpen) return 'staggered';
    return 'none';
  }

  /** The Warm Hand is possible: a staggered (knocked down) calm-type beast. */
  get warmHandOpen(): boolean {
    if (this.phase !== 'alive') return false;
    const open = this.brain.warmHandOpen;
    return this.overlay?.warmHandOpen ? this.overlay.warmHandOpen(open) : open;
  }

  /**
   * Thread 1's Calm: the head-lowered pose while an offering is accepted (quadruped and wyrm bodies; a no-op on a
   * humanoid). `on` false returns to the idle clip.
   */
  lowerHead(on: boolean): void {
    if (this.phase !== 'alive' || (this.def.body !== 'quadruped' && this.def.body !== 'wyrm')) return;
    this.headLowered = on;
    this.setLoco(on ? 'HeadLower' : ENEMY_CLIPS.idle);
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
    if (this.fox) return this.thinkFox(dt);
    if (this.ceiling && !this.ceiling.landed) {
      // Hanging, dripping or falling: no perception, no brain, no movement until it lands.
      this.coreArmed = false;
      this.ceiling.step(dt);
      this.mover.move({ x: 0, z: 0 }, dt);
      return;
    }
    this.coreArmed = false;
    const player = this.host.actors.player;
    const self = this.mover.feet;
    const taunt = this.chooseTaunt(player.id);
    // A taunter stands in for the player in every read below; with none, `pFeet` and `tid` are the player's, as ever.
    const pFeet = taunt ? taunt.feet : this.host.player.feet;
    const tid = taunt ? taunt.id : player.id;
    const tAlive = taunt ? true : !player.dead;
    const mods = taunt ? null : this.env.perceptionModifiers(this, player.id);
    const p = perceive({
      selfFeet: self,
      selfYaw: this.yaw,
      targetFeet: pFeet,
      targetAlive: tAlive,
      targetLoud: taunt ? true : this.host.player.loud(),
      damagedBy: this.damagedThisTick,
      lineOfSight: this.lineOfSight,
      modifiers: mods,
    });
    this.damagedThisTick = false;
    if (!taunt) this.trackAwareness(dt, p, player.id, AI.sightRange * (mods?.sightRangeScale ?? 1), mods != null);
    const toTarget = yawTo(self, pFeet);
    const senses: Senses = {
      self: { x: self.x, z: self.z },
      targetId: tid,
      targetAlive: tAlive,
      targetPos: { x: pFeet.x, z: pFeet.z },
      // An observer-only guard never acquires a target: the brain stays calm. A taunter in range is always noticed.
      notices: (taunt ? true : p.notices) && !this.observerOnly && !this.peaceful,
      sees: p.sees,
      distance: p.distance,
      facingErrorDeg: Math.abs(wrap(toTarget - this.yaw)) * (180 / Math.PI),
      healthFraction: this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0,
      stuckGiveUp: this.stuckGiveUp,
      yieldAllowed: this.env.mercyUnlocked('spare'),
      packNearby: this.def.behaviour === 'circle-rush' ? this.env.packNearby(this) : 0,
    };
    if (this.overlay?.notices) senses.notices = this.overlay.notices(senses.notices, senses);
    const status = readStatusData(this.actor.data[STATUS_DATA_KEY]);
    if (status.rooted) senses.rooted = true;
    if (status.stunSeconds > 0 && !this.overlay?.stunned?.(status.stunSeconds)) this.brain.stunned(status.stunSeconds);
    const intent = this.brain.step(dt, senses);
    this.overlay?.intent?.(dt, intent, senses);
    if (this.thief) {
      if (status.stunSeconds > 0) this.thief.stunned();
      const visible = p.distance <= AI.sightRange && canSeeChest(this.lineOfSight, self, pFeet, mods?.targetHeight);
      this.thief.tick(dt, this.brain.state, visible);
      if (this.phase !== 'alive') return; // it despawned itself (flee window over, or blinked out)
    }
    if (this.faceHeld) {
      // Stealth holds the guard: stand and turn toward the point; the brain keeps its state, so patrol resumes where it stood.
      intent.goal = null;
      intent.speed = 0;
      intent.face = this.facePoint;
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
      // The goal's own height: the target's for a chase goal, otherwise this enemy's level (flee, return, patrol).
      const goalIsTarget = intent.goal.x === pFeet.x && intent.goal.z === pFeet.z;
      const waypoint = this.observerOnly ? null : this.path.goalFor(dt, self, { x: intent.goal.x, y: goalIsTarget ? pFeet.y : self.y, z: intent.goal.z });
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
      // A thief whose path ended short of an unreachable flee goal is cornered, same as one that cannot move on.
      this.stuckGiveUp = out.giveUp || (!!this.thief && this.path.endedShort);
    } else {
      this.steering.reset();
    }
    const pushed = this.pushTicks > 0;
    // A shove is faster than any walk: lift the mover's cap for its duration only.
    this.mover.maxSpeed = pushed ? Math.max(this.baseMaxSpeed, Math.hypot(this.pushVelocity.x, this.pushVelocity.z)) : this.baseMaxSpeed;
    if (pushed) {
      this.pushTicks--;
      velocity = this.pushVelocity;
    }
    if (this.thief?.holdStill) velocity = { x: 0, z: 0 };
    if (this.overlay?.clampVelocity) {
      velocity = { x: velocity.x, z: velocity.z };
      this.overlay.clampVelocity(velocity, dt);
    }
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

  /** The fox: a guide, no perception or fighting; walks `FoxGuide`'s goal with the ordinary steering. */
  private thinkFox(dt: number): void {
    const self = this.mover.feet;
    const player = this.host.actors.player;
    const p = this.host.player.feet;
    const step = this.fox!.step(dt, self, player.dead ? null : { x: p.x, z: p.z }, this.def.walkSpeed);
    let velocity = { x: 0, z: 0 };
    if (step.goal && step.speed > 0 && Math.hypot(step.goal.x - self.x, step.goal.z - self.z) > 0.8) {
      velocity = this.steering.step({
        position: self,
        desired: { x: step.goal.x, z: step.goal.z },
        speed: step.speed,
        neighbours: this.env.neighbours(this),
        heightAt: this.host.heightAt,
        castFeeler: this.castFeeler,
        dt,
      }).move;
    } else {
      this.steering.reset();
    }
    this.speed = Math.hypot(velocity.x, velocity.z);
    const bx = self.x;
    const bz = self.z;
    if (step.face && this.speed < 0.05) this.targetYaw = yawTo(self, step.face);
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
    this.overlay?.animate?.(dt);
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
      this.peaceful = false;
      this.overlay?.hit?.(attackerId);
      // A hit on a hanging crawler drops it at once.
      if (this.ceiling && !this.ceiling.landed) this.ceiling.wake(true);
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
    // The Cinder Golem staggers only when its back core was hit (a parry, a shield bash or `damage.stagger` from the front
    // does nothing): the damage modifier arms `coreArmed` before the break event arrives.
    if (this.def.behaviour === 'back-core') {
      if (!this.coreArmed) {
        this.actor.restorePoise();
        return;
      }
      this.coreArmed = false;
    }
    this.poiseIdle = 0;
    if (this.observerOnly) {
      this.oneShot(ENEMY_CLIPS.stagger, AI.breakStaggerSeconds);
      return;
    }
    this.brain.setCondition(
      this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0,
      this.env.mercyUnlocked('spare'),
    );
    this.peaceful = false;
    if (this.overlay?.staggered?.(byId)) return;
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

  /**
   * Calmed (an offering or the Warm Hand): drops its head, stops attacking and walks off like a spared soldier;
   * a strike before it leaves revokes (see `revoked`). Takes any live state, so a calmed pack leader's packmates
   * scatter whatever they were doing.
   */
  calm(): void {
    if (this.phase !== 'alive') return;
    if (this.def.settles) return this.settle();
    this.lowerHead(true); // before the phase leaves 'alive'
    this.brain.calmed();
    this.goneHow = 'calmed';
    this.phase = 'leaving';
    this.leaveFrom = this.mover.feet.clone();
    this.leaveTime = 0;
    this.scatter = (this.env.rng() - 0.5) * 1.4;
    this.setLoco(ENEMY_CLIPS.walk);
  }

  /**
   * Leaves the fight without a mercy (a wyrmling flying off, `wyrms.flyAway`): out of combat, walks or flies off as
   * the overlay says, then despawns as 'retired' (its slot is spent, no credit, no loot). Alive enemies only.
   */
  retire(): boolean {
    if (this.phase !== 'alive') return false;
    // A dormant enemy wakes so the overlay's leave (altitude, fade) reaches the drawn body.
    if (this.asleep) this.wake();
    this.brain.standDown();
    this.disarm();
    this.goneHow = 'retired';
    this.phase = 'leaving';
    this.leaveFrom = this.mover.feet.clone();
    this.leaveTime = 0;
    this.setLoco(ENEMY_CLIPS.walk);
    return true;
  }

  /** Calm accepted by a kind that settles (golem cairn, crawler curl): no walk-off; the static form is built by ground/settled.ts. */
  private settle(): void {
    this.ceiling?.settleToFloor();
    this.brain.calmed();
    this.goneHow = 'calmed';
    this.actor.invulnerable = true;
    this.startFade(0.6);
  }

  /** The player or an ally struck this enemy (damage.dealt, outcome hit, not a script): Calm closes unless it staggers. */
  markStruck(): void {
    this.brain.markStruck();
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
  /** Leaving after a mercy, or retired (a wyrmling flying off): a load the leave never reached refills the slot. */
  get inMercyExit(): boolean {
    return this.goneHow === 'released' || this.goneHow === 'spared' || this.goneHow === 'calmed' || this.goneHow === 'retired';
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
    this.thief?.spareRevoked();
    this.lowerHead(false);
    this.brain.revoked(strikerId);
    return true;
  }

  /**
   * The taunter this enemy was last drawn to (null when it targets the player). Set only by `chooseTaunt`, so a game with no
   * taunters never leaves null.
   */
  private tauntedId: ActorId | null = null;

  /**
   * Per-tick target choice. Returns the taunter to target (and points the brain at it), or null for the player. When a taunt
   * ends the brain is pointed back at the player here.
   */
  private chooseTaunt(playerId: ActorId): { id: ActorId; feet: { x: number; y: number; z: number } } | null {
    const pick = this.observerOnly || this.peaceful || this.fox ? null : this.env.taunt?.(this) ?? null;
    if (pick) {
      this.brain.retarget(pick.id);
      this.tauntedId = pick.id;
      return pick;
    }
    if (this.tauntedId !== null) {
      this.tauntedId = null;
      this.brain.retarget(playerId);
    }
    return null;
  }

  /** The player this enemy is chasing died or despawned (or the taunter it was drawn to: then it goes back to the player). */
  targetGone(targetId: ActorId): void {
    if (this.tauntedId !== null && this.tauntedId === targetId) {
      this.tauntedId = null;
      this.brain.retarget(this.host.actors.player.id);
      return;
    }
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
    this.overlay?.sleep?.();
    // Leave combat first so the token, telegraph (cancelled), open window and aggro (calm) are settled.
    this.brain.standDown();
    // A fleeing thief that goes dormant is out of play: its flee window is over.
    if (this.thief && this.thief.stolenGold > 0) return void this.escape();
    this.asleep = true;
    this.faceHeld = false;
    // A dormant observer forgets: stale awareness would fire `ai.spotted` the moment it wakes.
    this.awareness = 0;
    this.spottedArmed = true;
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
    this.overlay?.dispose?.();
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
  /** Radians off the straight-away heading, so a scattering pack fans out. */
  private scatter = 0;

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
    if (this.overlay?.leave && (this.goneHow === 'calmed' || this.goneHow === 'spared' || this.goneHow === 'retired') && this.overlay.leave(dt, this.goneHow)) return;
    const self = this.mover.feet;
    const p = this.host.player.feet;
    const away = { x: self.x - p.x, z: self.z - p.z };
    const len = Math.hypot(away.x, away.z) || 1;
    const c = Math.cos(this.scatter);
    const sn = Math.sin(this.scatter);
    const ux = away.x / len;
    const uz = away.z / len;
    const v = { x: (ux * c - uz * sn) * this.def.walkSpeed, z: (ux * sn + uz * c) * this.def.walkSpeed };
    this.yaw = turnToward(this.yaw, Math.atan2(-v.x, -v.z), AI.turnRate * dt);
    this.mover.move(v, dt);
    this.leaveTime += dt;
    // A soldier pinned against a wall still leaves: after the walk's time plus a margin.
    const timeout = AI.sparedWalkMetres / Math.max(0.1, this.def.walkSpeed) + SPARED_LEAVE_MARGIN_SECONDS;
    if ((this.leaveFrom && self.distanceTo(this.leaveFrom) >= AI.sparedWalkMetres) || this.leaveTime >= timeout) this.despawn();
  }

  /** Steps the awareness meter and emits `ai.suspicious` / `ai.spotted` on their edges. */
  private trackAwareness(dt: number, p: { sees: boolean; hears: boolean; distance: number }, targetId: ActorId, sightRange: number, providerApplied: boolean): void {
    const step = stepAwareness(this.awareness, { ...p, sightRange }, dt);
    this.awareness = step.awareness;
    // Hostile enemies notice instantly and need no stealth events: only observers and enemies a perception provider
    // applies to (the stealth system) emit. Awareness is tracked for everyone.
    this.emitsStealth = this.observerOnly || providerApplied;
    // `ai.spotted` fires once per fill: it re-arms only after awareness falls back under the suspicious line.
    if (step.awareness <= AWARENESS.suspiciousAbove) this.spottedArmed = true;
    if (!this.emitsStealth) return;
    this.lastSees = p.sees;
    this.lastHears = p.hears;
    this.lastDistance = p.distance;
    if (step.becameSuspicious) this.host.events.emit('ai.suspicious', { actorId: this.actor.id, targetId, awareness: step.awareness });
    if (step.becameSpotted && this.spottedArmed) {
      this.spottedArmed = false;
      this.host.events.emit('ai.spotted', { actorId: this.actor.id, targetId });
    }
  }

  /** A hit on an observer: awareness goes straight to 1, and `ai.spotted` fires if it was not already there. */
  private spotNow(targetId: ActorId): void {
    const was = this.awareness;
    this.awareness = 1;
    if (was < 1 && this.spottedArmed) {
      this.spottedArmed = false;
      this.host.events.emit('ai.spotted', { actorId: this.actor.id, targetId });
    }
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
    if (this.ceiling) this.body.root.position.y += this.ceiling.lift;
    this.body.root.rotation.set(0, this.yaw, 0);
  }

  private chooseLoco(): void {
    const s = this.brain.state;
    if (this.ceiling && !this.ceiling.landed) return this.setLoco(this.ceiling.clip);
    if (s === 'telegraph' || s === 'attack') return; // the attack clip plays
    if (s === 'yield') return this.setLoco(ENEMY_CLIPS.kneelIdle);
    if (this.headLowered) return this.setLoco('HeadLower');
    const own = this.overlay?.loco?.();
    if (own) return this.setLoco(own);
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
        this.headLowered = false;
        this.host.events.emit('enemies.state', { actorId: this.actor.id, from, to });
        // A knocked-down hound stops mid-leap.
        if (to === 'stagger' && from === 'attack' && this.brain.currentMove?.leap) this.pushTicks = 0;
        if (from === 'stagger') this.cooled = false;
        if (to === 'stagger') this.oneShot(ENEMY_CLIPS.stagger, this.def.breakStaggerSeconds ?? AI.breakStaggerSeconds);
        else if (to === 'yield') this.oneShot(ENEMY_CLIPS.kneel, AI.yieldSeconds);
        else if (from === 'yield' || from === 'stagger') this.oneShotLeft = 0;
        this.overlay?.stateChanged?.(from, to);
      },
      aggro: (targetId) => this.host.events.emit('ai.aggro', { actorId: this.actor.id, targetId }),
      calm: () => this.host.events.emit('ai.calm', { actorId: this.actor.id }),
      startAttack: (move, lead) => {
        this.loco = null;
        this.oneShotLeft = 0;
        return this.body.playAttack(move, lead);
      },
      cancelAttack: () => this.body.cancelAttack(),
      telegraph: (move, swingId, lead) => {
        this.overlay?.telegraphed?.(move, swingId);
        this.host.events.emit('telegraph', {
          actorId: this.actor.id,
          kind: move.telegraph,
          attackId: move.clip,
          moveId: move.id,
          swingId,
          leadSeconds: lead,
        });
      },
      telegraphCancelled: (swingId) => this.host.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId }),
      pickMove: (distance) => {
        let moves = this.thief ? this.thief.availableMoves(this.def.moves) : this.def.moves;
        const allow = this.overlay?.allowMove;
        if (allow) moves = moves.filter((m) => allow(m));
        return this.moves.pick(moves, distance, this.env.rng, this.moveFilter);
      },
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

  /** The def's behaviour overlay with its context (behaviours.ts); null when the def has none. */
  private makeOverlay(spawn: EnemySpawn): BehaviourOverlay | null {
    if (!this.def.behaviour || this.def.behaviour === 'circle-rush') return null;
    const host = this.host;
    return makeBehaviour({
      def: this.def,
      actorId: this.actor.id,
      spawnerId: this.spawnerId,
      slot: spawn.slot ?? null,
      options: spawn.options,
      host,
      body: this.body,
      brain: this.brain,
      feet: () => this.mover.feet,
      yaw: () => this.yaw,
      rng: () => this.env.rng(),
      fly: (on, at) => {
        if (this.mover instanceof SwitchingMover) this.mover.fly(on, at);
        else if (!on && at) this.mover.teleport(at);
      },
      raycast: (origin, dir, length) => {
        const physics = host.physics;
        if (!physics) return null;
        const hit = physics.raycast(origin, dir, length, this.mover.collider as never);
        if (!hit || hit.collider === host.player.collider) return null;
        return { distance: hit.distance, point: hit.point };
      },
      indoors: () => !!this.env.nav() || !!host.services.get('interiors')?.current,
      playOneShot: (clip, seconds) => this.oneShot(clip, seconds),
      move: (velocity, dt) => {
        if (Math.hypot(velocity.x, velocity.z) > 0.05) this.yaw = turnToward(this.yaw, Math.atan2(-velocity.x, -velocity.z), AI.turnRate * dt);
        this.mover.move(velocity, dt);
      },
      retire: () => this.retire(),
      finish: () => this.despawn(),
    });
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
    const windowSeconds = (move.activeEnd - move.activeStart) * (this.body.clipDuration(move.clip) ?? 0.5);
    const ticks = Math.max(1, Math.round(windowSeconds / FIXED_TIMESTEP));
    const locked = this.overlay?.leapPoint?.(move);
    if (locked) {
      // A locked point (the wyrm's dive): straight there, no stop-short; the decal drawn at the telegraph is where it lands.
      const dx = locked.x - self.x;
      const dz = locked.z - self.z;
      const len = Math.hypot(dx, dz);
      const metres = Math.min(move.leap.maxMetres, len);
      const speed = metres / (ticks * FIXED_TIMESTEP);
      this.pushTicks = ticks;
      this.pushVelocity = len > 1e-6 ? { x: (dx / len) * speed, z: (dz / len) * speed } : { x: 0, z: 0 };
      return;
    }
    const p = this.host.player.feet;
    const toTarget = Math.hypot(p.x - self.x, p.z - self.z);
    const metres = Math.max(0, Math.min(move.leap.maxMetres, toTarget - HOUND.leapStopShort));
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

  /**
   * A scripted shove (`enemies.push`): `metres` along the horizontal direction `dir` over a short knockback, with no
   * stagger and no poise. Refused (false) for a non-hostile, observer-only, dormant, dying or gone enemy, while any mercy
   * window is open (Release, Spare, Calm, Warm Hand), and for a thief carrying gold. `dir` need not be normalised.
   */
  pushAlong(dir: { x: number; z: number }, metres: number): boolean {
    if (this.phase !== 'alive' || this.asleep || this.observerOnly) return false;
    if (this.actor.team !== 'hostile' || this.actor.dead) return false;
    // The Calm window counts only once Calm is unlocked (before that a circling hound is just an enemy).
    // A calming def's mercy window is Calm's (open only once unlocked) or the Warm Hand's; the other verbs open on `mercyOpen`.
    if (this.def.mercy?.when === 'calming' ? (this.calmOpen && this.env.mercyUnlocked('calm')) || this.warmHandOpen : this.mercyOpen) return false;
    if (this.thief && this.thief.stolenGold > 0) return false;
    if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.z) || !Number.isFinite(metres) || !(metres > 0)) return false;
    const len = Math.hypot(dir.x, dir.z);
    if (!(len > 1e-9)) return false;
    const m = Math.min(metres, AI.pushMaxMetres);
    const seconds = Math.min(0.5, Math.max(AI.knockbackSeconds, m / 15));
    this.pushTicks = Math.max(1, Math.round(seconds / FIXED_TIMESTEP));
    const speed = m / (this.pushTicks * FIXED_TIMESTEP);
    this.pushVelocity = { x: (dir.x / len) * speed, z: (dir.z / len) * speed };
    return true;
  }

  /**
   * v0.6 `actor.pulled`: a forced move of at most `metres` toward `from` over 0.25 s, stopping 1 m short of it. The mover
   * collides with walls and follows the ground. Ignored while invulnerable or not alive. Returns whether it started.
   */
  pulledToward(from: { x: number; z: number }, metres: number): boolean {
    if (this.phase !== 'alive' || this.actor.dead || this.actor.invulnerable) return false;
    if (this.overlay?.refusesPull?.()) return false;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.z) || !Number.isFinite(metres) || !(metres > 0)) return false;
    const dx = from.x - this.mover.feet.x;
    const dz = from.z - this.mover.feet.z;
    const len = Math.hypot(dx, dz);
    const m = Math.min(metres, len - 1);
    if (!(m > 0)) return false;
    this.pushTicks = Math.max(1, Math.round(0.25 / FIXED_TIMESTEP));
    const speed = m / (this.pushTicks * FIXED_TIMESTEP);
    this.pushVelocity = { x: (dx / len) * speed, z: (dz / len) * speed };
    return true;
  }

  /** Knockback runs in place of steering while it lasts. */
  private pushTicks = 0;
  private baseMaxSpeed = 0;
  private pushVelocity = { x: 0, z: 0 };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The bone damage multiplier used by the enemies' damage modifier (HitEvent.damage is ignored). */
export function boneMultiplier(bone: string | undefined): number {
  return bone ? (COMBAT.boneMultipliers[bone] ?? 1) : 1;
}
