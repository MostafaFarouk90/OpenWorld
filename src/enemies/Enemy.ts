import * as THREE from 'three';
import { COMBAT, FIXED_TIMESTEP } from '../config/constants';
import { Brain, type BrainHooks, type Senses } from './ai/Brain';
import { MoveSelector } from './ai/moveSelect';
import { makeLineOfSight, perceive } from './ai/perception';
import { ENEMY_CLIPS } from './clips';
import type { EnemyAnimator } from './EnemyAnimator';
import type { EnemyModel } from './EnemyModel';
import type { ActorId, ActorLike, EnemyHost } from './ports';
import { forwardOf, Steering, turnToward, yawTo } from './steering/steering';
import { HeightfieldMover, SwitchingMover, type EnemyMover } from './steering/movers';
import { AI } from './tuning';
import type { AiState, EnemyDef, EnemyView, MoveDef, SpawnOptions, WeaponChannel } from './types';

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
  mercyUnlocked(verb: 'release' | 'spare'): boolean;
  /** Called once the enemy is gone from the world (after despawn). */
  gone(self: Enemy, how: 'died' | 'released' | 'spared' | 'despawned'): void;
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
  private stuckGiveUp = false;
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
    readonly model: EnemyModel,
    readonly animator: EnemyAnimator,
  ) {
    const host = env.host;
    this.host = host;
    this.def = spawn.def;
    this.slug = spawn.slug;
    this.spawnerId = spawn.spawnerId;
    this.damageScale = spawn.damageScale * (spawn.options.damageScale ?? 1);
    this.yaw = this.targetYaw = spawn.yaw;
    this.mover = host.physics
      ? new SwitchingMover(host.physics, host.heightAt, spawn.feet)
      : new HeightfieldMover(host.heightAt, spawn.feet);
    this.lineOfSight = host.physics
      ? makeLineOfSight(host.physics, host.player.collider, this.mover.collider)
      : () => true;

    try {
      host.scene.add(model.root);
      this.placeRoot(this.mover.feet);
      model.root.updateMatrixWorld(true);

      const maxHealth = Math.max(1, Math.round(spawn.maxHealth * (spawn.options.healthScale ?? 1)));
      this.actor = host.actors.spawn({
        kind: this.def.kind,
        team: 'hostile',
        level: spawn.level,
        maxHealth,
        maxPoise: this.def.maxPoise,
        root: model.root,
        owner: model.owner,
        spawnTag: spawn.spawnTag,
      });
      this.actor.data['audio'] = { material: this.def.material };
      this.actor.data['enemies'] = this.view;

      this.brain = new Brain(this.def, this.hooks(), {
        home: { x: spawn.feet.x, z: spawn.feet.z },
        patrol: spawn.patrol,
        leash: spawn.options.leash,
        aggroOnSpawn: spawn.options.aggro ? host.actors.player.id : null,
      });
      if (spawn.options.moves) this.moveFilter = [...spawn.options.moves];

      this.removers.push(host.combat.addTarget(model.hurtboxes, this.actor.id));
      for (const ch of ['right', 'left'] as const) {
        const tracer = model.tracers[ch];
        if (!tracer) continue;
        if (tracer.attacker !== model.owner) this.removers.push(host.actors.bindOwner(this.actor, tracer.attacker));
        this.removers.push(host.combat.addAttacker(this.actor.id, tracer, animator.windowSource(ch)));
        // vfx-and-feedback.md: the trail id is the actor id; the shield gets none.
        const parts = model.weapons[ch];
        const trail = parts && ch === 'right' ? host.services.get('vfx')?.attachTrail?.(this.actor.id, parts.hilt, parts.tip) : undefined;
        if (trail) this.trails[ch] = trail;
      }
    } catch (err) {
      // Roll back what was built so a failed spawn leaves no actor, collider, scene node or registration.
      for (const remove of this.removers.splice(0)) remove();
      for (const ch of ['right', 'left'] as const) this.trails[ch]?.dispose();
      const spawned = (this as { actor?: ActorLike }).actor;
      if (spawned) host.actors.despawn(spawned.id);
      model.root.removeFromParent();
      this.mover.dispose();
      throw err;
    }

    animator.onWindow = (ch, phase, swingId) => {
      this.trails[ch]?.setEmitting(phase === 'open');
      if (phase === 'open') this.brain.windowOpened(swingId);
    };
    animator.onClipEnd = (clip, interrupted) => {
      const move = this.brain.currentMove;
      if (move && clip === move.clip) this.brain.attackClipEnded(this.brain.currentSwing, interrupted);
    };
    if (this.brain.state === 'spawn') this.oneShot(ENEMY_CLIPS.rise, AI.riseSeconds);
    else this.setLoco(ENEMY_CLIPS.idle);
  }

  private moveFilter: string[] | undefined;

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
    };
  }

  /** Simulated feet this tick. */
  get feet(): THREE.Vector3 {
    return this.mover.feet;
  }

  get isGone(): boolean {
    return this.phase === 'gone';
  }

  /** Alive and taking part (not dying, released or leaving). */
  get active(): boolean {
    return this.phase === 'alive';
  }

  get mercyOpen(): boolean {
    return this.phase === 'alive' && this.brain.mercyOpen;
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
    const p = perceive({
      selfFeet: self,
      selfYaw: this.yaw,
      targetFeet: pFeet,
      targetAlive: !player.dead,
      targetLoud: this.host.player.loud(),
      damagedBy: this.damagedThisTick,
      lineOfSight: this.lineOfSight,
    });
    this.damagedThisTick = false;
    const toTarget = yawTo(self, pFeet);
    const senses: Senses = {
      self: { x: self.x, z: self.z },
      targetId: player.id,
      targetAlive: !player.dead,
      targetPos: { x: pFeet.x, z: pFeet.z },
      notices: p.notices,
      sees: p.sees,
      distance: p.distance,
      facingErrorDeg: Math.abs(wrap(toTarget - this.yaw)) * (180 / Math.PI),
      healthFraction: this.actor.maxHealth > 0 ? this.actor.health / this.actor.maxHealth : 0,
      stuckGiveUp: this.stuckGiveUp,
      yieldAllowed: this.env.mercyUnlocked('spare'),
    };
    const intent = this.brain.step(dt, senses);

    let velocity = { x: 0, z: 0 };
    this.stuckGiveUp = false;
    if (intent.goal && intent.speed > 0 && Math.hypot(intent.goal.x - self.x, intent.goal.z - self.z) > intent.stopDistance) {
      const out = this.steering.step({
        position: self,
        desired: intent.goal,
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
    this.speed = pushed ? 0 : Math.hypot(velocity.x, velocity.z);
    if (pushed) {
      // facing stays while knocked back
    } else if (intent.face) this.targetYaw = yawTo(self, intent.face);
    else if (this.speed > 0.05) this.targetYaw = Math.atan2(-velocity.x, -velocity.z);
    this.yaw = turnToward(this.yaw, this.targetYaw, AI.turnRate * dt);
    this.mover.move(velocity, dt);
  }

  /** `animation` phase: root at the simulated pose, mixer by one tick, matrices current for combat. */
  animate(dt: number): void {
    if (this.phase === 'gone' || this.asleep) return;
    this.placeRoot(this.mover.feet);
    if (this.oneShotLeft > 0) this.oneShotLeft -= dt;
    if (this.phase === 'alive' && this.oneShotLeft <= 0) this.chooseLoco();
    this.animator.fixedUpdate(dt);
    this.model.root.updateMatrixWorld(true);
  }

  /** `afterCombat` phase: poise regen, slow timer, the death and release fades. */
  react(dt: number): void {
    if (this.phase === 'gone') return;
    this.moves.tick(dt);
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
      this.model.setOpacity(Math.max(0, 1 - this.phaseTime / this.fadeSeconds));
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
  damaged(attackerId: ActorId | null, outcome: string, poiseDealt: number, staggered: boolean, killed: boolean): void {
    if (this.phase !== 'alive') return;
    if (outcome === 'hit') {
      this.damagedThisTick = true;
      this.poiseIdle = 0;
    }
    if (staggered || killed) return; // actor.staggered and actor.died follow in the same batch
    this.brain.hit(attackerId, poiseDealt, outcome);
  }

  staggered(byId: ActorId | null): void {
    if (this.phase !== 'alive') return;
    this.poiseIdle = 0;
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
    this.brain.spared();
    this.goneHow = 'spared';
    this.phase = 'leaving';
    this.leaveFrom = this.mover.feet.clone();
    this.setLoco(ENEMY_CLIPS.walk);
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
    if (this.phase === 'alive') this.brain.alert(targetId);
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
    this.animator.onWindow = null;
    this.animator.onClipEnd = null;
    this.animator.dispose();
    this.model.dispose();
    this.mover.dispose();
    this.env.gone(this, this.goneHow);
  }

  // ---- internals ---------------------------------------------------------------------------------

  private goneHow: 'died' | 'released' | 'spared' | 'despawned' = 'despawned';
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
      vfx.dissolve(this.model.root, seconds).then(done, done);
    } catch (err) {
      this.host.warn(`enemies: vfx dissolve failed for ${this.actor.id}: ${String(err)}`);
      this.fadeHandledByVfx = false;
    }
  }

  private deathClipSeconds(): number {
    return this.animator.clipDuration(ENEMY_CLIPS.death) ?? 1;
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

  private clearSlow(): void {
    this.slowLeft = 0;
    const r = this.slowRemover;
    this.slowRemover = null;
    r?.();
  }

  private placeRoot(feet: THREE.Vector3): void {
    this.prevRoot.copy(this.model.root.position);
    this.model.root.position.copy(feet);
    this.model.root.rotation.set(0, this.yaw, 0);
  }

  private chooseLoco(): void {
    const s = this.brain.state;
    if (s === 'telegraph' || s === 'attack') return; // the attack clip plays
    if (s === 'yield') return this.setLoco(ENEMY_CLIPS.kneelIdle);
    if (this.speed > LOCO_RUN_SPEED) this.setLoco(ENEMY_CLIPS.run);
    else if (this.speed > 0.1) this.setLoco(ENEMY_CLIPS.walk);
    else this.setLoco(ENEMY_CLIPS.idle);
  }

  private setLoco(clip: string): void {
    if (this.loco === clip && this.animator.currentClip === clip) return;
    this.loco = clip;
    this.animator.play(clip, { loop: true });
  }

  private oneShot(clip: string, seconds: number): void {
    this.loco = null;
    this.animator.play(clip, { loop: false });
    const len = this.animator.clipDuration(clip) ?? FIXED_TIMESTEP;
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
        if (to === 'stagger') this.oneShot(ENEMY_CLIPS.stagger, AI.breakStaggerSeconds);
        else if (to === 'yield') this.oneShot(ENEMY_CLIPS.kneel, AI.yieldSeconds);
        else if (from === 'yield' || from === 'stagger') this.oneShotLeft = 0;
      },
      aggro: (targetId) => this.host.events.emit('ai.aggro', { actorId: this.actor.id, targetId }),
      calm: () => this.host.events.emit('ai.calm', { actorId: this.actor.id }),
      startAttack: (move, lead) => {
        this.loco = null;
        this.oneShotLeft = 0;
        return this.animator.playAttack(move, lead);
      },
      cancelAttack: () => this.animator.cancelAttack(),
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
      pickMove: (distance) => this.moves.pick(this.def.moves, distance, this.env.rng, this.moveFilter),
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
