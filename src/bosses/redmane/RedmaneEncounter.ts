import * as THREE from 'three';
import { playEnsured } from '../../audio/act2SfxEnsure';
import type { Actor } from '../../actors/Actor';
import type { BossDef } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { hostFromContext } from '../../enemies/host';
import { EnemyProjectiles, type Shooter } from '../../enemies/ranged/EnemyProjectiles';
import { clampToArena, distToSegment, yawToward } from '../prior/geometry';
import { RedmaneBrain, type ChargeProgress, type RedmaneHooks } from './RedmaneBrain';
import type { RedmaneClip, RedmaneModel } from './RedmaneModel';
import { LaneDecal, TrapField, type TrapView } from './redmaneFx';
import {
  ARENA,
  CHARGE,
  COUNTER,
  MOVES,
  NET_MOVE,
  PRESENTATION,
  REDMANE,
  REDMANE_BOSS_ID,
  REDMANE_KIND,
  REDMANE_MERCY_VERB,
  REDMANE_NAME_KEY,
  THRUST,
  TRAP,
  type RedmaneMoveDef,
} from './tuning';

export const REDMANE_FLOOR_MODIFIER_ID = 'bosses.redmane.floor';
export const REDMANE_COUNTER_MODIFIER_ID = 'bosses.redmane.counter';

export const REDMANE_BOSS_DEF: BossDef = {
  bossId: REDMANE_BOSS_ID,
  nameKey: REDMANE_NAME_KEY,
  phases: REDMANE.phases,
  breaksPerPhase: REDMANE.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: REDMANE.releaseWindowSeconds,
  mercyVerb: REDMANE_MERCY_VERB,
};

/** How many nets can be in the air at once (one is thrown per swing). */
const NET_CAPACITY = 4;

export interface RedmanePlaces {
  centre: THREE.Vector3;
  centreYaw: number;
}

/** How an encounter ended: an outcome played out, or a reset (death, load, teardown). */
export type RedmaneEnd = 'spared' | 'defeated' | 'reset';

export interface RedmaneEncounterOptions {
  model: RedmaneModel | null;
  places: RedmanePlaces;
  warn: (message: string) => void;
  onEnd: (end: RedmaneEnd) => void;
}

interface Trap extends TrapView {
  /** The spring hit has been tested. */
  tested: boolean;
}

/**
 * One Redmane fight (plans/act2-A8.md sections 3 and 4): the actor and model, the registry registration, the brain's hooks
 * (telegraphs, the charge sweep, the thrust, the net on A6b's projectile adapter, the harpoon traps), the dodge counter and
 * the health floor, poise regen, and the Spare or death presentation. The arena owns the trigger, intro, gate and reset
 * rules; this class owns everything that lives and dies with one Redmane.
 */
export class RedmaneEncounter implements RedmaneHooks {
  readonly actor: Actor;
  readonly brain: RedmaneBrain;
  private readonly ctx: GameContext;
  private readonly model: RedmaneModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: RedmanePlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: RedmaneEnd) => void;
  private readonly offs: (() => void)[] = [];
  private readonly lane = new LaneDecal();
  private readonly trapField = new TrapField(TRAP.maxLive[TRAP.maxLive.length - 1]);
  private readonly projectiles: EnemyProjectiles;
  private traps: Trap[] = [];
  /** Each trap springs under its own swing id, so two dodged traps are never one swing to the dodge dedupe. */
  private trapSwing = 1000;
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  /** The `last` break has happened: the floor is lifted for good (a lapsed window does not bring it back). */
  private floorLifted = false;
  private poiseIdle = 0;
  /** Seconds left in which the next player hit is a dodge counter. */
  private counterT = 0;
  /** Charge: take-off, lane, progress, and whether this swing has landed (or been dodged) already. */
  private readonly takeoff = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly dir = new THREE.Vector3(0, 0, -1);
  private readonly aimPoint = new THREE.Vector3();
  private aimed = false;
  private travelled = 0;
  private chargeHit = false;
  private telegraphT = -1;
  private telegraphLead = 1;
  private loopClip: RedmaneClip | null = null;
  private glyph: { stop(): void } | null = null;
  private outcomeT = 0;
  private outcomeKind: 'spared' | 'defeated' | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly shooter: Shooter;

  constructor(ctx: GameContext, opts: RedmaneEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-thrandil-redmane';
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(this.root, this.lane.mesh, this.trapField.group);
    this.projectiles = new EnemyProjectiles(hostFromContext(ctx, opts.warn), NET_CAPACITY);

    this.actor = ctx.actors.spawn({
      kind: REDMANE_KIND,
      team: 'hostile',
      level: REDMANE.level,
      maxHealth: REDMANE.maxHealth,
      maxPoise: REDMANE.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Out of the fight until register(): the intro shows him standing, not fighting.
      hittable: false,
    });
    this.actor.untargetable = true;
    const root = this.root;
    const actor = this.actor;
    this.shooter = {
      id: actor.id,
      damageScale: 1,
      get feet() {
        return root.position;
      },
      get yaw() {
        return root.rotation.y;
      },
    };
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(REDMANE_COUNTER_MODIFIER_ID, (req, _target, attacker) => this.counter(req, attacker), COUNTER.modifierOrder),
      ctx.damage.addModifier(REDMANE_FLOOR_MODIFIER_ID, (req) => this.floor(req), REDMANE.floorModifierOrder),
    );
    this.brain = new RedmaneBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === REDMANE_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        if (p.last) this.floorLifted = true;
        this.clearHazards();
        this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (!mine(p)) return;
        this.clearHazards();
        this.counterT = 0;
        this.brain.onPhase(p.phase);
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (!mine(p)) return;
        this.brain.onReleaseWindow(p.open);
        if (p.open) this.startGlyph();
        else this.stopGlyph();
      }),
      ctx.events.on('boss.spared', (p) => {
        if (mine(p)) this.outcome('spared');
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome('defeated');
      }),
      ctx.events.on('player.dodged', (p) => {
        if (p.attackerId === this.actor.id && this.registered && !this.ended) this.counterT = COUNTER.seconds;
      }),
      ctx.events.on('damage.dealt', (r) => {
        if (r.targetId === this.actor.id && r.outcome === 'hit') this.poiseIdle = 0;
      }),
    );
    this.loop('idle');
  }

  /** True once `register` ran and until the encounter ends (the outcome presentation included). */
  get fighting(): boolean {
    return this.registered && !this.ended;
  }

  /** Fighting and no outcome yet (the gate may close only then). */
  get contested(): boolean {
    return this.fighting && !this.outcomePlaying;
  }

  get done(): boolean {
    return this.ended;
  }

  /** The Spare kneel or the death is playing. */
  get outcomePlaying(): boolean {
    return this.outcomeKind !== null;
  }

  get view(): RedmaneModel | null {
    return this.model;
  }

  /** Live traps (tests). */
  get liveTraps(): number {
    return this.traps.length;
  }

  /** Nets in the air (tests). */
  get liveNets(): number {
    return this.projectiles.liveCount;
  }

  /** The dodge counter is armed: the next player hit deals double. */
  get counterArmed(): boolean {
    return this.counterT > 0;
  }

  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  /** Starts the fight after the intro: registers the boss (bar and music follow `boss.started`) and starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, REDMANE_BOSS_DEF);
    } catch (err) {
      this.warn(`could not register Redmane: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.brain.start();
    return true;
  }

  /** Fixed tick: brain, movement, facing, poise regen, telegraph glow, traps, nets, fx and the outcome presentation. */
  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.model?.update(dt);
    this.lane.update(dt);
    if (this.outcomeKind) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;
    this.counterT = Math.max(0, this.counterT - dt);
    this.projectiles.update(dt);
    this.tickTraps(dt);

    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist, liveTraps: this.traps.length });
    if (this.ended || this.outcomeKind) return;
    this.move(dt, player);
    this.glow(dt);
    // Poise refills after 4 s without a landed hit (design 9.6), outside the stagger and the window.
    const st = this.brain.state;
    if (st !== 'broken' && st !== 'window') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= REDMANE.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
    }
  }

  /**
   * Ends the encounter without an outcome (player death, load, teardown): traps and nets gone, Redmane despawned.
   * `unregisterFirst` (teardown) makes the registry report `'unregistered'`; otherwise the despawn reports `'despawned'`.
   */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) this.dropRegistration();
    this.finish('reset');
  }

  // ---- RedmaneHooks ----

  telegraph(move: RedmaneMoveDef, swingId: number, leadSeconds: number): void {
    this.ctx.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: move.telegraph,
      attackId: move.attackId,
      moveId: `${REDMANE_BOSS_ID}.${move.id}`,
      swingId,
      leadSeconds,
    });
    if (move.id === 'charge') {
      // The couch (design 10 row 19): lance levelled, red tabard flash, the horn.
      this.telegraphT = 0;
      this.telegraphLead = Math.max(0.05, leadSeconds);
      this.oneShot('couch');
      this.aimed = false;
      const player = this.ctx.player.feet;
      this.lane.show(this.root.position, this.laneEnd(this.tmp.set(player.x, this.root.position.y, player.z)));
      this.sfx('sfx.redmane.horn');
    } else if (move.id === 'thrust') {
      this.oneShot('thrust');
    } else if (move.id === 'net') {
      this.oneShot('net');
    } else {
      this.oneShot('trap');
    }
  }

  telegraphCancelled(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.aimed = false;
    this.lane.stop();
    this.endTelegraph();
  }

  aim(): void {
    const player = this.ctx.player.feet;
    this.aimed = true;
    this.aimPoint.set(player.x, this.root.position.y, player.z);
    this.lane.show(this.root.position, this.laneEnd(this.tmp.copy(this.aimPoint)), true);
  }

  chargeStart(): void {
    if (!this.aimed) this.aim();
    this.aimed = false;
    this.endTelegraph();
    this.takeoff.copy(this.root.position);
    this.prev.copy(this.root.position);
    this.dir.set(this.aimPoint.x - this.takeoff.x, 0, this.aimPoint.z - this.takeoff.z);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
    this.dir.normalize();
    this.root.rotation.y = Math.atan2(-this.dir.x, -this.dir.z);
    this.travelled = 0;
    this.chargeHit = false;
    this.loop('run');
  }

  /** Runs him along the locked lane and tests the swept segment each tick; one hit (or dodge) per swing. */
  chargeTick(swingId: number, dt: number): ChargeProgress {
    const pos = this.root.position;
    const want = Math.min(CHARGE.speed * dt, CHARGE.maxMetres - this.travelled);
    pos.x += this.dir.x * want;
    pos.z += this.dir.z * want;
    clampToArena(pos, this.places.centre, ARENA.arenaHalfExtent);
    const moved = Math.hypot(pos.x - this.prev.x, pos.z - this.prev.z);
    if (!this.chargeHit) {
      const feet = this.ctx.player.feet;
      if (Math.abs(feet.y - pos.y) <= 2.5 && distToSegment(feet, this.prev, pos) <= CHARGE.radius) {
        this.chargeHit = true;
        this.hitPlayer(MOVES.charge, swingId);
      }
    }
    this.prev.copy(pos);
    this.travelled += moved;
    if (moved < want - 1e-4) return 'wall';
    return this.travelled >= CHARGE.maxMetres - 1e-6 ? 'done' : 'running';
  }

  chargeEnd(): void {
    this.lane.stop();
    this.loop('idle');
  }

  strike(move: RedmaneMoveDef, swingId: number): void {
    this.endTelegraph();
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) > 2.5) return;
    const dx = feet.x - pos.x;
    const dz = feet.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > THRUST.reach) return;
    if (d > 1e-3) {
      const yaw = this.root.rotation.y;
      const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
      if (dot < Math.cos(THRUST.halfAngle)) return;
    }
    this.hitPlayer(move, swingId);
  }

  netRelease(): void {
    this.endTelegraph();
    const feet = this.ctx.player.feet;
    this.projectiles.fire(this.shooter, NET_MOVE, { x: feet.x, y: feet.y, z: feet.z });
    this.sfx('sfx.redmane.net');
  }

  trapPlace(): void {
    this.endTelegraph();
    const feet = this.ctx.player.feet;
    const at = clampToArena({ x: feet.x, z: feet.z }, this.places.centre, ARENA.trapHalfExtent);
    this.traps.push({ x: at.x, y: this.root.position.y, z: at.z, age: 0, sprung: false, tested: false });
    this.trapField.sync(this.traps);
  }

  backstep(): void {
    this.oneShot('flinch');
  }

  stagger(): void {
    this.lane.stop();
    this.oneShot('stagger');
  }

  window(): void {
    this.lane.stop();
    this.endTelegraph();
    this.oneShot('kneel');
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  /** The end of the lane for an aim point: up to `maxMetres` from him, inside the arena (in place). */
  private laneEnd(aim: THREE.Vector3): THREE.Vector3 {
    const from = this.root.position;
    const dx = aim.x - from.x;
    const dz = aim.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) aim.set(from.x + (dx / d) * CHARGE.maxMetres, from.y, from.z + (dz / d) * CHARGE.maxMetres);
    else aim.copy(from);
    return clampToArena(aim, this.places.centre, ARENA.arenaHalfExtent);
  }

  private hitPlayer(move: RedmaneMoveDef, swingId: number) {
    const player = this.ctx.player.actor;
    if (player.dead) return null;
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    const direction = new THREE.Vector3(feet.x - pos.x, 0, feet.z - pos.z);
    if (direction.lengthSq() < 1e-6) direction.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
    direction.normalize();
    return this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: move.damage,
      poise: move.poise,
      kind: 'melee',
      attackId: move.attackId,
      swingId,
      direction,
      // The charge and the trap are red (dodge only); the thrust is blockable but never parried (a script hit has no attack window).
      ...(move.telegraph === 'dodge' ? { unblockable: true } : { parryable: false as const }),
    });
  }

  private tickTraps(dt: number): void {
    if (this.traps.length === 0) return;
    const keep: Trap[] = [];
    for (const t of this.traps) {
      t.age += dt;
      if (!t.sprung && t.age >= TRAP.armSeconds) {
        t.sprung = true;
        this.springTrap(t);
      }
      if (t.age < TRAP.armSeconds + TRAP.spikeSeconds) keep.push(t);
    }
    this.traps = keep;
    this.trapField.sync(this.traps);
  }

  private springTrap(t: Trap): void {
    if (t.tested) return;
    t.tested = true;
    const player = this.ctx.player.actor;
    if (player.dead) return;
    const feet = this.ctx.player.feet;
    if (Math.abs(feet.y - t.y) > 2.2 || Math.hypot(feet.x - t.x, feet.z - t.z) > TRAP.radius) return;
    const result = this.ctx.damage.apply({
      attackerId: this.actor.id,
      targetId: player.id,
      amount: MOVES.trap.damage,
      poise: MOVES.trap.poise,
      kind: 'melee',
      attackId: MOVES.trap.attackId,
      swingId: this.trapSwing++,
      direction: new THREE.Vector3(0, 0, -1),
      unblockable: true,
    });
    if (result?.outcome !== 'hit') return;
    try {
      this.ctx.services.get('status')?.apply(player.id, { id: TRAP.rootStatusId, kind: 'root', seconds: TRAP.rootSeconds, sourceId: this.actor.id });
    } catch (err) {
      this.warn(`trap root failed: ${String(err)}`);
    }
  }

  /** Traps and nets go on a break, a phase change, an outcome and a reset. */
  private clearHazards(): void {
    this.traps = [];
    this.trapField.sync(this.traps);
    this.projectiles.cancelFor(this.actor.id);
  }

  /** Approach, backstep, the feint's wheel, and turning toward the player (the charge's run is driven by chargeTick). */
  private move(dt: number, player: THREE.Vector3Like): void {
    const pos = this.root.position;
    const dx = player.x - pos.x;
    const dz = player.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const st = this.brain.state;
    const mode = this.brain.moving;
    let speed = 0;
    if (dist > 1e-3) {
      const ux = dx / dist;
      const uz = dz / dist;
      if (mode === 'approach') {
        speed = REDMANE.walkSpeed;
        const step = Math.min(speed * dt, Math.max(0, dist - REDMANE.preferredDistance));
        pos.x += ux * step;
        pos.z += uz * step;
        if (step <= 0) speed = 0;
      } else if (mode === 'backstep') {
        speed = REDMANE.backstepMetres / REDMANE.backstepSeconds;
        pos.x -= ux * speed * dt;
        pos.z -= uz * speed * dt;
      }
      clampToArena(pos, this.places.centre, ARENA.arenaHalfExtent);
    }
    if (st !== 'charge') {
      if (mode === 'approach' && speed > 0) this.loop('walk');
      else if (this.telegraphT < 0 && (st === 'approach' || st === 'recover' || st === 'feint')) this.loop('idle');
    }
    this.model?.setSpeed(speed);
    // He turns toward the player at a limited rate (so getting behind him takes work), except mid-charge, broken or lying low,
    // and not after the charge lane has locked.
    const turning = st === 'approach' || st === 'thrust' || st === 'net' || st === 'trap' || st === 'recover' || st === 'feint' || (st === 'couch' && !this.aimed);
    if (turning && dist > 1e-3) {
      const want = yawToward(pos, player);
      let diff = want - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = REDMANE.turnRate * (st === 'feint' ? 3 : 1) * dt;
      this.root.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
  }

  private glow(dt: number): void {
    if (this.telegraphT < 0) return;
    this.telegraphT += dt;
    this.model?.setTelegraph(Math.min(1, this.telegraphT / this.telegraphLead));
  }

  private endTelegraph(): void {
    this.telegraphT = -1;
    this.model?.setTelegraph(0);
  }

  /** Dodge counter: after a dodged swing, the next player hit within `COUNTER.seconds` deals double damage and poise, once. */
  private counter(req: { targetId: string; amount: number; poise?: number; kind?: string }, attacker: Actor | null | undefined): void {
    if (req.targetId !== this.actor.id || this.counterT <= 0 || !this.registered || this.outcomeKind) return;
    if (!attacker || attacker.id !== this.ctx.player.actor.id || req.kind !== 'melee') return;
    this.counterT = 0;
    req.amount *= COUNTER.scale;
    if (typeof req.poise === 'number') req.poise *= COUNTER.scale;
  }

  /** Keeps health at or above the floor until the `last` break; clamps damage only, never poise. */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    const min = Math.ceil(this.actor.maxHealth * REDMANE.healthFloor);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private loop(clip: RedmaneClip): void {
    if (this.loopClip === clip) return;
    this.loopClip = clip;
    this.model?.play(clip, { loop: true });
  }

  private oneShot(clip: RedmaneClip): void {
    this.loopClip = null;
    this.model?.play(clip);
  }

  private sfx(key: string): void {
    const audio = this.ctx.services.get('audio');
    if (!audio) return;
    try {
      playEnsured(audio, key, this.root.position);
    } catch {
      // the audio thread owns the keys; a missing one is silent
    }
  }

  /** The yield glyph over his head for the window (design 11, row 32: the shared vfx effect). */
  private startGlyph(): void {
    this.stopGlyph();
    const vfx = this.ctx.services.get('vfx');
    const p = this.root.position;
    try {
      const h = vfx?.spawnEffect?.('yield-glyph', { position: { x: p.x, y: p.y, z: p.z } }, { seconds: REDMANE.releaseWindowSeconds });
      if (h && typeof (h as { stop?: unknown }).stop === 'function') this.glyph = h as { stop(): void };
    } catch (err) {
      this.warn(`yield glyph failed: ${String(err)}`);
    }
  }

  private stopGlyph(): void {
    this.glyph?.stop();
    this.glyph = null;
  }

  private outcome(kind: 'spared' | 'defeated'): void {
    this.brain.onOutcome(kind);
    this.outcomeKind = kind;
    this.outcomeT = 0;
    this.lane.stop();
    this.endTelegraph();
    this.clearHazards();
    this.stopGlyph();
    this.counterT = 0;
    // Unhittable the same tick: a strike on a spared Redmane would revoke the mercy (and its Oswin +3).
    this.actor.untargetable = true;
    this.actor.hittable = false;
    if (kind === 'spared') {
      this.model?.dropLance();
      this.oneShot('kneel');
    } else {
      this.oneShot('death');
    }
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    if (this.outcomeKind === 'spared') {
      if (t >= PRESENTATION.spareKneelSeconds) this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.spareKneelSeconds) / PRESENTATION.spareFadeSeconds));
      if (t >= PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds) this.finish('spared');
      return;
    }
    if (t >= PRESENTATION.deathClipSeconds) this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.deathClipSeconds) / PRESENTATION.deathFadeSeconds));
    if (t >= PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) this.finish('defeated');
  }

  private dropRegistration(): void {
    const off = this.unregister;
    this.unregister = null;
    off?.();
  }

  private finish(end: RedmaneEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.stopGlyph();
    for (const off of this.offs.splice(0)) off();
    // As the Prior: the registry drops the registration on `actor.despawned` (exactly one `boss.ended`); only a teardown
    // unregisters first.
    this.unregister = null;
    this.projectiles.cancelFor(this.actor.id);
    this.projectiles.dispose();
    this.traps = [];
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.lane.dispose();
    this.trapField.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
