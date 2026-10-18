// The Knight's combat verbs wired into the game core: block and parry, dodge, stamina, poise reactions, lock-on,
// Second Wind, death and respawn. The decisions live in the pure models next to this file; this class feeds them
// the tick's input and events and applies their answers to the player, the animation controller and the damage
// pipeline. Phases (contracts/game-events-and-flags.md section 2): verbs 10 and lock-on 20 in `intent`, reactions 10
// and death 20 in `afterCombat` (hit reactions therefore show one tick after the hit).
import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { DamageResult, ModifiableRequest } from '../actors/DamageResolver';
import type { AnimationController } from '../characters/AnimationController';
import type { PlayerAvatar } from '../characters/PlayerAvatar';
import { GROUNDED_STATES } from '../characters/knightClips';
import type { GameContext } from '../core/Game';
import type { Action } from '../input/actions';
import type { Vec3 } from '../physics/PhysicsWorld';
import { AttackSets, SpeedMultipliers, DEFAULT_CLASS_ID, type AttackSet, type RegisterAttackSetResult } from './attackSets';
import { DodgeModel } from './DodgeModel';
import { GoldPouch } from './GoldPouch';
import { GuardModel } from './GuardModel';
import { InvulnSources } from './InvulnSources';
import { LockOnModel, type Candidate, type LockView } from './LockOnModel';
import { PoiseTracker, type PoiseReaction } from './PoiseTracker';
import { DeathTimeline, resolveRespawnPoint } from './Respawn';
import { createSecondWind, type SecondWindApi } from './SecondWind';
import { Stamina } from './Stamina';
import { DODGE, GUARD, ORDER, POISE, RESPAWN, STAMINA } from './tuning';

/** Poise handed to damage.stagger so a parry always breaks the attacker. */
export const PARRY_STAGGER_POISE = 999;
export const RIM_BASH_SKILL = 'knight.rimBash';
export const RIPOSTE_SKILL = 'knight.riposteEdge';
const RIPOSTE_WINDOW_TICKS = 120;
const RIM_BASH_RANGE = 2.4;
const RIM_BASH_COOLDOWN_TICKS = 60;
const KNOCKBACK_TICKS = 9;
const SPRINT_PROMPT_TICKS = 30;
const RESPAWN_TELEPORT_WAIT_TICKS = 180;
export const IRON_STANCE_SKILL = 'knight.ironStance';
export const FLOWING_CUTS_SKILL = 'knight.flowingCuts';
const STAB_CLIP = '1H_Melee_Attack_Stab';
const EYE_HEIGHT = 1.4;
const CHEST_HEIGHT = 1.2;
const DEAD_LOCKED_ACTIONS: readonly Action[] = [
  'sprint', 'jump', 'interact', 'mercy', 'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'lockOn',
  'surge', 'surgeLeap', 'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
];

/** What other threads may ask of the combat verbs (services.get('combatVerbs')). */
export interface CombatVerbsService {
  /** Gives Second Wind another use (thread 9 per crisis beat). */
  reArm(charges?: number): void;
  readonly secondWindCharges: number;
  /** An attack or a combat action is playing: other one-shot abilities must wait. */
  readonly busy: boolean;
  readonly staggered: boolean;
  /** A class registers its four attacks once (thread 12 and the class threads); the Knight's is built in. */
  registerAttackSet(classId: string, set: AttackSet): RegisterAttackSetResult;
  /**
   * Multiplies the player's attack animation speed (Tobb's Battle-song); a number or a function read every tick.
   * Multipliers combine by product, clamped to 0.5..2. Returns the remover.
   */
  addAttackSpeedMultiplier(id: string, mult: number | (() => number)): () => void;
  /**
   * Holds a scripted forced move (the Warden's shoulder charge) for `owner` until it is released with `null`. Applied every
   * tick while no dodge or knockback is running (those win); several owners: the latest one wins. `x`, `z` is a unit direction.
   */
  holdForcedMove(owner: string, move: { x: number; z: number; speed: number } | null): void;
}

declare module '../core/Services' {
  interface GameServices {
    lockOn: { readonly targetId: string | null };
    combatVerbs: CombatVerbsService;
  }
}

declare module '../core/events' {
  interface GameEventMap {
    'player.blocked': { attackerId: string | null };
    'player.parried': { attackerId: string | null };
    'player.dodged': { attackerId: string; swingId: number | undefined };
    'player.guardBroken': { attackerId: string | null };
    'player.died': Record<string, never>;
    'player.respawned': { source: string };
    'player.secondWind': { charges: number; staggered: string[] };
    'lockon.changed': { targetId: string | null };
  }
}

interface ProgressionPort {
  learned?(id: string): boolean;
}
interface AbilitiesPort {
  reportTrigger?(id: string): void;
}
interface WaystonesPort {
  respawnPlayer?(): Promise<void> | void;
}
interface InventoryPort {
  readonly gold: number;
  addGold(n: number): void;
  takeGold(n: number, reason?: 'death'): number;
}
interface VfxPort {
  spawnEffect?(id: string, t: { position: Vec3 }): unknown;
}

type Pending =
  | { kind: 'blockHit' }
  | { kind: 'reaction'; reaction: PoiseReaction; dirX: number; dirZ: number };

export class CombatVerbs {
  readonly actor: Actor;
  readonly invuln: InvulnSources;
  readonly stamina: Stamina;
  readonly poise: PoiseTracker;
  readonly guard = new GuardModel();
  readonly dodge = new DodgeModel();
  readonly lockOn = new LockOnModel();
  readonly pouch = new GoldPouch();
  readonly timeline = new DeathTimeline();
  readonly secondWind: SecondWindApi;
  lastRestedWaystoneId: string | null = null;

  readonly attackSets = new AttackSets();
  private readonly forcedHolds = new Map<string, { x: number; z: number; speed: number }>();
  readonly attackSpeed = new SpeedMultipliers((id) => console.warn(`combatVerbs: attack speed multiplier "${id}" is invalid, ignored`));
  private appliedAttackClass: string | null = null;
  private offIronStance: (() => void) | null = null;
  private controller: AnimationController | null = null;
  private offLocks = new Map<string, () => void>();
  private pending: Pending[] = [];
  private lastReactionTick = -1;
  private deathPending = false;
  private deadModifier: (() => void) | null = null;
  private respawnWait: { ready(): boolean; since: number; source: string } | null = null;
  private respawnGrace = 0;
  private knockback: { x: number; z: number; speed: number; left: number } | null = null;
  private freeDodgeYaw: number | null = null;
  private riposteUntil = -1;
  private bashReadyAt = 0;
  private sprintTicks = 0;
  private reArmed = false;
  private readonly dodgedSwings = new Set<string>();
  private readonly offs: Array<() => void> = [];
  /** The current avatar's combat target and clip listener (replaced on a kit swap). */
  private readonly avatarOffs: Array<() => void> = [];

  constructor(private readonly ctx: GameContext) {
    this.actor = ctx.player.actor;
    this.invuln = new InvulnSources(this.actor);
    this.stamina = new Stamina(this.actor, () => !ctx.state.getBool('tutorial.complete'));
    this.poise = new PoiseTracker(this.actor);
    this.secondWind = createSecondWind({
      actor: this.actor,
      invuln: this.invuln,
      hostilesNear: (r) => this.hostilesNear(r),
      stagger: (id, by, poise) => ctx.damage.stagger(id, by, poise),
      heal: (h) => {
        this.actor.health = Math.min(this.actor.maxHealth, h);
      },
      onFired: (info) => {
        this.vfx()?.spawnEffect?.('shockwave-ring', { position: { ...ctx.player.feet } });
        ctx.events.emit('player.secondWind', info);
      },
    });
  }

  // ---- registration ----

  /** Hooks events, damage modifiers, the lethal handler and the systems. Everything is scoped by the caller's context. */
  install(): void {
    const { ctx } = this;
    this.offs.push(
      ctx.events.on('attack.window', (e) => this.guard.onWindow(e, ctx.clock.tick)),
      ctx.events.on('telegraph', (e) =>
        this.guard.onTelegraph({ actorId: e.actorId, kind: e.kind, attackId: e.attackId, leadSeconds: e.leadSeconds }),
      ),
      ctx.events.on('telegraph.cancelled', (e) => this.guard.clearActor(e.actorId)),
      ctx.events.on('actor.despawned', (e) => this.guard.clearActor(e.actorId)),
      ctx.events.on('damage.dealt', (r) => this.onDamage(r)),
      ctx.events.on('actor.staggered', (e) => this.onStaggered(e.actorId)),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === this.actor.id) this.deathPending = true;
      }),
      ctx.events.on('rest', (e) => {
        // Inn rests (placeId only) do not move the respawn point.
        if (e.waystoneId) this.lastRestedWaystoneId = e.waystoneId;
      }),
    );
    ctx.damage.addModifier('player-riposte', (req) => this.riposteModifier(req), -150);
    ctx.damage.addModifier('player-guard', (req, target, attacker) => this.guardModifier(req, target, attacker), ORDER.guardModifier);
    ctx.damage.addLethalHandler(
      'second-wind',
      (target, result) => (this.reArmed || !ctx.state.getBool('tutorial.complete')) && this.secondWind.handler(target, result),
      ORDER.secondWindHandler,
    );
    ctx.systems.add({ id: 'verbs.intent', fixedPhase: 'intent', order: ORDER.verbs, fixedUpdate: () => this.intent() });
    ctx.systems.add({ id: 'verbs.lockon', fixedPhase: 'intent', order: ORDER.lockOn, fixedUpdate: () => this.lockOnTick() });
    ctx.systems.add({ id: 'verbs.reactions', fixedPhase: 'afterCombat', order: ORDER.reactions, fixedUpdate: () => this.reactions() });
    ctx.systems.add({ id: 'verbs.death', fixedPhase: 'afterCombat', order: ORDER.death, fixedUpdate: () => this.death() });
    ctx.interaction.register({
      id: 'pickup:goldPouch',
      kind: 'pickup',
      position: (out) => {
        const p = this.pouch.pouch?.position;
        return out.set(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
      },
      radius: 2,
      holdSeconds: RESPAWN.pouchHoldSeconds,
      promptKey: 'combat.pouch.prompt',
      enabled: () => this.pouch.pouch !== null && !this.actor.dead,
      onInteract: () => {
        this.pouch.recover(this.inventory());
      },
    });
    ctx.persist.register({
      key: 'player',
      version: 1,
      serialize: () => ({
        health: this.actor.health,
        stamina: this.actor.stamina,
        lastRestedWaystoneId: this.lastRestedWaystoneId,
        goldPouch: this.pouch.serialize(),
      }),
      load: (data) => this.load(data),
    });
    ctx.services.provide('lockOn', {
      get targetId() {
        return self.lockOn.target;
      },
    } as { readonly targetId: string | null });
    const self = this;
    ctx.services.provide('combatVerbs', {
      reArm: (n) => {
        this.reArmed = true;
        this.secondWind.reArm(n);
      },
      get secondWindCharges() {
        return self.secondWind.charges;
      },
      get busy() {
        return self.busy;
      },
      get staggered() {
        return self.controller?.currentAction === 'stagger';
      },
      registerAttackSet: (classId, set) => self.attackSets.register(classId, set),
      addAttackSpeedMultiplier: (id, mult) => self.attackSpeed.add(id, mult),
      holdForcedMove: (owner, move) => {
        if (move && Number.isFinite(move.x + move.z + move.speed)) {
          self.forcedHolds.delete(owner); // re-insert so the latest hold is the last
          self.forcedHolds.set(owner, { ...move });
        } else self.forcedHolds.delete(owner);
      },
    });
    const rig = ctx.cameraRig;
    if (rig) {
      rig.lockTarget = () => this.lockTargetPoint();
      rig.onLockLook = (dx) => {
        const dir = this.lockOn.pushMouse(dx, ctx.clock.tick);
        if (dir !== 0 && this.lockOn.swap(dir, this.view())) this.lockChanged(true);
      };
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    for (const off of this.offLocks.values()) off();
    this.offLocks.clear();
    this.forcedHolds.clear();
    this.deadModifier?.();
    this.deadModifier = null;
    this.offIronStance?.();
    this.offIronStance = null;
    this.invuln.remove('dodge');
    this.invuln.remove('respawn');
    this.invuln.remove('secondWind');
    this.controller?.exitAction();
    if (this.lockOn.target !== null) this.ctx.events.emit('lockon.changed', { targetId: null });
    const rig = this.ctx.cameraRig;
    if (rig) {
      rig.lockTarget = null;
      rig.onLockLook = null;
    }
    const player = this.ctx.world.player;
    player.setFacingOverride(null);
    player.setForcedMove(null);
  }

  get busy(): boolean {
    const c = this.controller;
    return !!c && (c.currentAction !== null || c.state === 'attack' || c.state === 'oneShot');
  }

  // ---- tick: verbs ----

  private intent(): void {
    const { ctx, actor } = this;
    const avatar = ctx.world.avatar;
    this.expireGrace();
    this.secondWind.tickGrace();
    this.poise.tick();
    if (!avatar) return;
    this.bindAvatar(avatar);
    const c = avatar.controller;
    const tick = ctx.clock.tick;
    const a = ctx.input.actions;
    this.syncClassKit(c);
    if (actor.dead || this.timeline.pending) {
      this.stamina.tick({ blocking: false, sprinting: false });
      return;
    }

    const grounded = ctx.world.player.controller.grounded;
    const action = c.currentAction;
    const guarding = action === 'block' || action === 'blockHit';
    const free = action === null && GROUNDED_STATES.has(c.state);
    const canGuard =
      a.down('block') && !this.stamina.exhausted && !this.guard.lockedOut(tick) && grounded && action !== 'stagger' && !this.dodge.active;
    this.guard.setBlockHeld(canGuard && (free || guarding), tick);

    if (this.dodge.active) this.stepDodge(c);
    else if (a.pressed('dodge')) this.tryDodge(c, grounded, free || action === 'block' || this.cutCancellable(c));

    if (!this.dodge.active) {
      if (canGuard && free) c.enterAction('block');
      else if (!canGuard && action === 'block') c.exitAction();
      if (guarding && a.pressed('attack1') && this.learned(RIM_BASH_SKILL) && tick >= this.bashReadyAt) this.rimBash(c);
    }

    const sprinting = a.down('sprint') && ctx.player.moving && grounded && !this.stamina.exhausted && action === null && !c.movementLocked;
    this.stamina.tick({ blocking: guarding, sprinting });
    this.sprintTicks = sprinting ? this.sprintTicks + 1 : 0;
    if (this.sprintTicks === SPRINT_PROMPT_TICKS) this.prompts()?.success('sprint');
    if (a.pressed('jump') && grounded && action === null && !c.movementLocked) this.prompts()?.success('jump');

    this.setLock('verbs.exhausted', this.stamina.exhausted ? ['sprint'] : null);
    this.setLock('verbs.heavy', !this.stamina.canAfford(STAMINA.heavyAttackCost) ? [`attack${this.attackSet().heavyIndex + 1}` as Action] : null);
    this.applyMovement();
  }

  /** The attack set of the chosen class (the Knight's until the M07 choice). */
  private attackSet(): AttackSet {
    return this.attackSets.get(this.classId());
  }

  private classId(): string {
    return this.ctx.services.get('progression')?.classId ?? DEFAULT_CLASS_ID;
  }

  /** Per tick: the class's attacks on the controller, attack speed, and Iron Stance's walk-while-guarding. */
  private syncClassKit(c: AnimationController): void {
    const id = this.classId();
    if (this.appliedAttackClass !== id) {
      // Refused while an attack plays; it is retried next tick.
      if (c.setAttackSet(this.attackSets.get(id).attacks)) this.appliedAttackClass = id;
    }
    c.setAttackSpeed(this.attackSpeed.value());
    const iron = this.learned(IRON_STANCE_SKILL);
    c.setWalkWhileBlocking(iron);
    const guarding = iron && c.currentAction === 'block';
    if (guarding && !this.offIronStance) {
      this.offIronStance = this.ctx.player.addMoveModifier('verbs.ironStance', { speedScale: GUARD.ironStanceSpeedScale, lockFacing: true, lockActions: ['sprint'] });
    } else if (!guarding && this.offIronStance) {
      this.offIronStance();
      this.offIronStance = null;
    }
  }

  /** Flowing Cuts: a dodge may cancel an attack once its damage window has closed (the recovery). */
  private cutCancellable(c: AnimationController): boolean {
    if (!this.learned(FLOWING_CUTS_SKILL) || c.state !== 'attack') return false;
    const att = c.activeAttack();
    return !!att && att.normalizedTime > att.activeEnd;
  }

  private tryDodge(c: AnimationController, grounded: boolean, free: boolean): void {
    const { ctx, actor } = this;
    const a = ctx.input.actions;
    const ok = this.dodge.canStart({
      stamina: this.stamina,
      exhausted: this.stamina.exhausted,
      grounded,
      dead: actor.dead,
      staggered: c.currentAction === 'stagger',
      busyAction: !free,
    });
    if (!ok || !this.stamina.spend(STAMINA.dodgeCost)) return;
    const right = a.axis('moveLeft', 'moveRight');
    const forward = a.axis('moveBack', 'moveForward');
    const w = ctx.cameraRig && (right !== 0 || forward !== 0) ? ctx.cameraRig.toWorld(right, forward) : { x: right, z: -forward };
    const start = this.dodge.start({
      inputX: w.x,
      inputZ: w.z,
      facingYaw: ctx.player.facingYaw,
      lockedOn: this.lockOn.target !== null,
    });
    this.freeDodgeYaw = this.lockOn.target === null ? start.yaw : null;
    this.knockback = null;
    c.enterAction('dodge', { clip: start.clip, durationTicks: DODGE.totalTicks });
    this.stepDodge(c);
  }

  private stepDodge(c: AnimationController): void {
    const t = this.dodge.tick();
    if (t.iFrames) this.invuln.add('dodge');
    else this.invuln.remove('dodge');
    this.ctx.world.player.setForcedMove(t.move);
    if (t.done) {
      this.freeDodgeYaw = null;
      this.invuln.remove('dodge');
      if (c.currentAction === 'dodge') c.exitAction();
    }
  }

  private abortDodge(): void {
    if (!this.dodge.active) return;
    this.dodge.cancel();
    this.dodge.tick();
    this.freeDodgeYaw = null;
    this.invuln.remove('dodge');
    this.ctx.world.player.setForcedMove(null);
  }

  private applyMovement(): void {
    const player = this.ctx.world.player;
    if (this.knockback && this.knockback.left > 0 && !this.dodge.active) {
      player.setForcedMove({ x: this.knockback.x, z: this.knockback.z, speed: this.knockback.speed });
      this.knockback.left--;
    } else if (!this.dodge.active) {
      this.knockback = null;
      let hold: { x: number; z: number; speed: number } | null = null;
      for (const h of this.forcedHolds.values()) hold = h;
      player.setForcedMove(hold);
    }
    const target = this.lockOn.target;
    if (this.freeDodgeYaw !== null) player.setFacingOverride(this.freeDodgeYaw);
    else if (target !== null && !this.actor.dead) {
      const t = this.ctx.actors.get(target);
      if (t) {
        const p = t.worldPosition(TMP);
        const f = this.ctx.player.feet;
        const dx = p.x - f.x;
        const dz = p.z - f.z;
        if (dx !== 0 || dz !== 0) player.setFacingOverride(Math.atan2(-dx, -dz));
      }
    } else player.setFacingOverride(null);
  }

  private rimBash(c: AnimationController): void {
    const { ctx } = this;
    this.bashReadyAt = ctx.clock.tick + RIM_BASH_COOLDOWN_TICKS;
    c.exitAction();
    if (!c.playOneShot('Block_Attack', { lockMove: true })) return;
    const feet = ctx.player.feet;
    const yaw = ctx.player.facingYaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (const t of ctx.actors.ofTeam('hostile')) {
      if (t.dead) continue;
      const p = t.worldPosition(TMP);
      const dx = p.x - feet.x;
      const dz = p.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > RIM_BASH_RANGE || d === 0 || (dx * fx + dz * fz) / d < 0.5) continue;
      ctx.damage.apply({
        attackerId: this.actor.id,
        targetId: t.id,
        amount: 5,
        poise: 40,
        kind: 'melee',
        attackId: 'rim-bash',
        direction: new THREE.Vector3(dx / d, 0, dz / d),
      });
    }
    this.abilities()?.reportTrigger?.(RIM_BASH_SKILL);
  }

  // ---- damage ----

  private riposteModifier(req: ModifiableRequest): void {
    if (req.attackerId !== this.actor.id || req.attackId !== STAB_CLIP || this.ctx.clock.tick > this.riposteUntil) return;
    req.unblockable = true;
  }

  private guardModifier(req: ModifiableRequest, target: Actor, attacker: Actor | null): void {
    if (target.id !== this.actor.id || req.outcome === 'immune') return;
    const c = this.controller;
    const action = c?.currentAction;
    // The tick after a blockHit clip ends the guard is still up; block re-enters on the next intent.
    const gap = action === null && this.guard.held && !!c && GROUNDED_STATES.has(c.state);
    if (action !== 'block' && action !== 'blockHit' && !gap) return;
    const res = this.guard.resolve(req, {
      tick: this.ctx.clock.tick,
      facingYaw: this.ctx.player.facingYaw,
      stamina: this.stamina,
      exhausted: this.stamina.exhausted,
      arcHalfAngle: this.learned(IRON_STANCE_SKILL) ? GUARD.ironStanceArcHalfAngle : undefined,
    });
    if (res.outcome === 'parried') {
      req.outcome = 'parried';
      req.amount = 0;
      req.poise = 0;
      if (attacker) this.ctx.damage.stagger(attacker.id, this.actor.id, PARRY_STAGGER_POISE);
    } else if (res.outcome === 'blocked') {
      req.outcome = 'blocked';
      req.amount *= res.scale;
      req.poise *= res.poiseScale;
      this.stamina.forceDrain(res.staminaCost);
    } else if (res.guardBreak) {
      this.stamina.forceDrain(res.staminaCost);
      this.ctx.events.emit('player.guardBroken', { attackerId: req.attackerId });
    }
  }

  private onDamage(r: DamageResult): void {
    const { ctx } = this;
    // The Riposte thrust is spent when it lands.
    if (r.attackerId === this.actor.id && r.attackId === STAB_CLIP && this.riposteUntil >= ctx.clock.tick && r.outcome === 'hit') {
      this.riposteUntil = -1;
      this.abilities()?.reportTrigger?.(RIPOSTE_SKILL);
    }
    if (r.targetId !== this.actor.id) return;
    if (r.outcome === 'blocked') {
      ctx.events.emit('player.blocked', { attackerId: r.attackerId });
      this.prompts()?.success('block');
      this.pending.push({ kind: 'blockHit' });
    } else if (r.outcome === 'parried') {
      ctx.events.emit('player.parried', { attackerId: r.attackerId });
      this.prompts()?.success('block');
      if (this.learned(RIPOSTE_SKILL)) this.riposteUntil = ctx.clock.tick + RIPOSTE_WINDOW_TICKS;
    } else if (r.outcome === 'immune') {
      const attacker = r.attackerId ? ctx.actors.get(r.attackerId) : undefined;
      if (attacker?.team === 'hostile' && this.invuln.has('dodge')) {
        const key = `${r.attackerId}#${r.swingId ?? r.attackId ?? ctx.clock.tick}`;
        if (!this.dodgedSwings.has(key)) {
          this.dodgedSwings.add(key);
          if (this.dodgedSwings.size > 64) this.dodgedSwings.delete(this.dodgedSwings.values().next().value as string);
          ctx.events.emit('player.dodged', { attackerId: r.attackerId as string, swingId: r.swingId });
          this.prompts()?.success('dodge');
        }
      }
    } else {
      const reaction = this.poise.onDamage({
        outcome: r.outcome,
        reqPoise: r.poise,
        poiseDealt: r.poiseDealt,
        staggered: r.staggered,
        amount: r.dealt,
      });
      if (reaction.kind !== 'none') {
        const d = r.direction;
        this.pending.push({ kind: 'reaction', reaction, dirX: d?.x ?? 0, dirZ: d?.z ?? 0 });
        this.lastReactionTick = ctx.clock.tick;
      }
    }
  }

  private onStaggered(actorId: string): void {
    if (actorId !== this.actor.id || this.lastReactionTick === this.ctx.clock.tick) return;
    this.pending.push({ kind: 'reaction', reaction: { kind: 'break', ticks: POISE.breakStaggerTicks, knockback: 0 }, dirX: 0, dirZ: 0 });
  }

  // ---- tick: reactions ----

  private reactions(): void {
    const c = this.controller;
    const queue = this.pending.splice(0);
    if (!c || this.actor.dead) return;
    for (const p of queue) {
      if (p.kind === 'blockHit') {
        if (c.currentAction === 'block') c.enterAction('blockHit', { durationTicks: 12 });
        continue;
      }
      const r = p.reaction;
      if (r.kind === 'flinch') {
        if (!this.dodge.active && c.currentAction !== 'stagger') c.enterAction('flinch', { durationTicks: r.ticks });
      } else if (r.kind === 'stagger' || r.kind === 'break') {
        this.abortDodge();
        c.enterAction('stagger', { durationTicks: r.ticks });
        const len = Math.hypot(p.dirX, p.dirZ);
        if (r.knockback > 0 && len > 0) {
          this.knockback = { x: p.dirX / len, z: p.dirZ / len, speed: r.knockback / (KNOCKBACK_TICKS / 60), left: KNOCKBACK_TICKS };
        }
      }
    }
  }

  // ---- tick: death and respawn ----

  private death(): void {
    const { ctx, actor } = this;
    const c = this.controller;
    if (this.deathPending) {
      this.deathPending = false;
      this.onDeath(c);
    }
    if (this.respawnWait) {
      const w = this.respawnWait;
      if (w.ready() || ctx.clock.tick - w.since > RESPAWN_TELEPORT_WAIT_TICKS) this.finishRespawn(c, w.source);
      return;
    }
    if (this.timeline.tick() === 'respawn') {
      if (actor.dead) this.beginRespawn(c);
      else this.finishRespawn(c, 'external');
    }
  }

  private onDeath(c: AnimationController | null): void {
    const { ctx } = this;
    this.abortDodge();
    this.knockback = null;
    this.ctx.world.player.setForcedMove(null);
    this.ctx.world.player.setFacingOverride(null);
    this.pending.length = 0;
    this.guard.setBlockHeld(false, ctx.clock.tick);
    c?.enterAction('dying');
    this.deadModifier ??= ctx.player.addMoveModifier('player-dead', { lockMove: true, lockActions: DEAD_LOCKED_ACTIONS });
    this.timeline.onDied();
    this.pouch.drop({ ...ctx.player.feet }, this.inventory(), ctx.state.getBool('tutorial.complete'));
    ctx.events.emit('player.died', {});
  }

  private beginRespawn(c: AnimationController | null): void {
    const { ctx } = this;
    const waystones = this.svc<WaystonesPort>('waystones');
    if (waystones?.respawnPlayer) {
      let result: unknown;
      try {
        result = waystones.respawnPlayer();
      } catch {
        this.teleportToFallback();
        return;
      }
      if (result && typeof (result as Promise<void>).then === 'function') {
        let settled = false;
        const wait = { ready: () => settled, since: ctx.clock.tick, source: 'waystone' };
        this.respawnWait = wait;
        (result as Promise<void>).then(
          () => {
            settled = true;
          },
          () => {
            if (this.respawnWait === wait) this.teleportToFallback();
          },
        );
        return;
      }
      this.finishRespawn(c, 'waystone');
      return;
    }
    this.teleportToFallback();
  }

  private teleportToFallback(): void {
    const { ctx } = this;
    let point;
    try {
      point = resolveRespawnPoint({
        lastRestedWaystoneId: this.lastRestedWaystoneId,
        findAnchor: (id) => ctx.anchors.find(id),
        worldSpawn: ctx.world.spawn,
      });
    } catch {
      point = { position: ctx.world.spawn, yaw: 0, source: 'world' as const };
    }
    const handle = ctx.player.teleport(point.position, point.yaw);
    this.respawnWait = { ready: () => handle.ready(), since: ctx.clock.tick, source: point.source };
  }

  private finishRespawn(c: AnimationController | null, source: string): void {
    const { ctx, actor } = this;
    this.respawnWait = null;
    this.timeline.cancel();
    if (actor.dead) ctx.damage.revive(actor.id, RESPAWN.healthFraction, 'respawn');
    actor.restoreStamina(actor.maxStamina);
    actor.restorePoise();
    c?.exitAction();
    this.ctx.world.player.setForcedMove(null);
    this.deadModifier?.();
    this.deadModifier = null;
    this.invuln.add('respawn');
    this.respawnGrace = RESPAWN.graceTicks;
    ctx.events.emit('player.respawned', { source });
  }

  private expireGrace(): void {
    if (this.respawnGrace > 0 && --this.respawnGrace === 0) this.invuln.remove('respawn');
  }

  // ---- lock-on ----

  private lockOnTick(): void {
    const { ctx } = this;
    if (!ctx.world.avatar) return;
    const view = this.view();
    if (!this.actor.dead && !this.timeline.pending && ctx.input.actions.pressed('lockOn')) {
      if (this.lockOn.toggle(view).changed) this.lockChanged(this.lockOn.target !== null);
    }
    const u = this.lockOn.update(view);
    if (u) this.lockChanged(false);
  }

  private lockChanged(success: boolean): void {
    this.ctx.events.emit('lockon.changed', { targetId: this.lockOn.target });
    if (success) this.prompts()?.success('lockOn');
  }

  private lockTargetPoint(): { x: number; y: number; z: number } | null {
    const id = this.lockOn.target;
    const t = id ? this.ctx.actors.get(id) : undefined;
    if (!t) return null;
    const p = t.worldPosition(TMP);
    return { x: p.x, y: p.y + CHEST_HEIGHT, z: p.z };
  }

  private view(): LockView {
    const { ctx } = this;
    const feet = ctx.player.feet;
    const candidates: Candidate[] = [];
    for (const a of ctx.actors.all()) {
      if (a === this.actor) continue;
      const p = a.worldPosition(TMP);
      candidates.push({ id: a.id, x: p.x, y: p.y, z: p.z, team: a.team, dead: a.dead });
    }
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return {
      tick: ctx.clock.tick,
      playerX: feet.x,
      playerZ: feet.z,
      cameraYaw: ctx.cameraRig?.yaw ?? ctx.player.facingYaw,
      playerDead: this.actor.dead,
      candidates,
      hasSight: (id) => {
        const c = byId.get(id);
        if (!c) return false;
        const from = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
        const dir = { x: c.x - from.x, y: (c.y ?? feet.y) + CHEST_HEIGHT - from.y, z: c.z - from.z };
        const dist = Math.hypot(dir.x, dir.y, dir.z);
        const hit = ctx.physics.raycast(from, dir, dist, ctx.world.player.controller.collider);
        return !hit || hit.distance >= dist - 0.6;
      },
    };
  }

  // ---- persistence ----

  private load(data: unknown): void {
    const d = data as { health?: unknown; stamina?: unknown; lastRestedWaystoneId?: unknown; goldPouch?: unknown } | null;
    if (!d || typeof d !== 'object') return;
    const { actor } = this;
    if (typeof d.lastRestedWaystoneId === 'string' || d.lastRestedWaystoneId === null) this.lastRestedWaystoneId = d.lastRestedWaystoneId;
    this.pouch.load(d.goldPouch);
    if (actor.dead || this.timeline.pending) {
      this.timeline.cancel();
      this.respawnWait = null;
      this.ctx.damage.revive(actor.id, 1, 'script');
      this.controller?.exitAction();
      this.deadModifier?.();
      this.deadModifier = null;
    }
    if (typeof d.health === 'number' && Number.isFinite(d.health)) {
      // Clamp to the unpenalised maximum: Burn and Scars load after this and progression re-clamps on `save.loaded`.
      const cap = Math.max(actor.maxHealth, this.svc<{ baseMaxHealth?(): number }>('progression')?.baseMaxHealth?.() ?? 0);
      actor.health = Math.min(cap, Math.max(1, d.health));
    }
    if (typeof d.stamina === 'number' && Number.isFinite(d.stamina)) actor.stamina = Math.min(actor.maxStamina, Math.max(0, d.stamina));
  }

  // ---- helpers ----

  /** Re-binds when the class kit changes (v0.5 `swapAvatar`): the previous avatar's target and listener are undone. */
  private bindAvatar(avatar: PlayerAvatar): void {
    if (this.controller === avatar.controller) return;
    if (this.controller === null) this.offs.push(() => this.unbindAvatar());
    this.unbindAvatar();
    this.controller = avatar.controller;
    this.appliedAttackClass = null;
    const hurtboxes = this.ctx.world.combat.playerHurtboxes;
    if (hurtboxes) this.avatarOffs.push(this.ctx.combat.addTarget(hurtboxes, this.actor.id));
    this.avatarOffs.push(
      avatar.controller.events.subscribe((e) => {
        if (e.type !== 'clipStart') return;
        const set = this.attackSet();
        const i = set.attacks.findIndex((a) => a.clip === e.clip);
        if (i < 0) return;
        if (i === set.heavyIndex) this.stamina.spend(STAMINA.heavyAttackCost);
        this.prompts()?.success(`attack${i + 1}`);
      }),
    );
  }

  private unbindAvatar(): void {
    for (const off of this.avatarOffs.splice(0).reverse()) off();
  }

  private setLock(name: string, actions: readonly Action[] | null): void {
    const has = this.offLocks.has(name);
    if (actions && !has) this.offLocks.set(name, this.ctx.player.addMoveModifier(name, { lockActions: actions }));
    else if (!actions && has) {
      this.offLocks.get(name)!();
      this.offLocks.delete(name);
    }
  }

  private hostilesNear(radius: number): Array<{ id: string }> {
    const f = this.ctx.player.feet;
    return this.ctx.actors.ofTeam('hostile').filter((a) => {
      if (a.dead) return false;
      const p = a.worldPosition(TMP);
      return Math.hypot(p.x - f.x, p.z - f.z) <= radius;
    });
  }

  private svc<T>(name: string): T | undefined {
    return this.ctx.services.get(name as never) as T | undefined;
  }
  private prompts() {
    return this.ctx.services.get('prompts');
  }
  private learned(id: string): boolean {
    return this.svc<ProgressionPort>('progression')?.learned?.(id) === true;
  }
  private abilities(): AbilitiesPort | undefined {
    return this.svc<AbilitiesPort>('abilities');
  }
  private inventory(): InventoryPort | undefined {
    return this.svc<InventoryPort>('inventory');
  }
  private vfx(): VfxPort | undefined {
    return this.svc<VfxPort>('vfx');
  }
}

const TMP = new THREE.Vector3();
