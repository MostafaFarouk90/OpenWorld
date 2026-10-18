import * as THREE from 'three';
import type { Actor } from '../../actors/Actor';
import type { BossDef } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { clampToArena, distToSegment, yawToward } from '../prior/geometry';
import { GrimtoothBrain, type GrimtoothHooks } from './GrimtoothBrain';
import type { GrimtoothClip, GrimtoothModel } from './GrimtoothModel';
import { CalmShell, PounceDecal } from './grimtoothFx';
import {
  ARENA,
  BITE,
  GRIMTOOTH,
  GRIMTOOTH_BOSS_ID,
  GRIMTOOTH_KIND,
  GRIMTOOTH_NAME_KEY,
  MOVES,
  POUNCE,
  PRESENTATION,
  SUMMON_GROUP,
  type GrimtoothMoveDef,
} from './tuning';

export const GRIMTOOTH_FLOOR_MODIFIER_ID = 'bosses.grimtooth.floor';
export const GRIMTOOTH_TAIL_MODIFIER_ID = 'bosses.grimtooth.tail';

export const GRIMTOOTH_BOSS_DEF: BossDef = {
  bossId: GRIMTOOTH_BOSS_ID,
  nameKey: GRIMTOOTH_NAME_KEY,
  phases: GRIMTOOTH.phases,
  breaksPerPhase: GRIMTOOTH.breaksPerPhase,
  shield: false,
  shieldBreakers: [],
  releaseWindowSeconds: GRIMTOOTH.releaseWindowSeconds,
};

/** The parts of the game context the encounter touches. */
export type GrimtoothContext = Pick<GameContext, 'scene' | 'actors' | 'damage' | 'combat' | 'events' | 'bosses' | 'player' | 'services'>;

export interface GrimtoothPlaces {
  centre: THREE.Vector3;
  centreYaw: number;
}

/** How an encounter ended: an outcome played out, or a reset (death, load, teardown). */
export type GrimtoothEnd = 'released' | 'defeated' | 'reset';

export interface GrimtoothEncounterOptions {
  model: GrimtoothModel | null;
  places: GrimtoothPlaces;
  warn: (message: string) => void;
  onEnd: (end: GrimtoothEnd) => void;
}

/**
 * One Gaffer Grimtooth fight (plans/slice-2-grimtooth.md sections 2 to 5 and 11): the actor and model, the registry
 * registration, the brain's hooks (telegraphs, the pounce leap and its per-tick hit, the bite, howls, the window), the tail
 * weak spot and health floor, poise regen, and the calm walk-off or the death. The arena owns the trigger, intro, gate and
 * reset rules; this class owns everything that lives and dies with one Grimtooth.
 */
export class GrimtoothEncounter implements GrimtoothHooks {
  readonly actor: Actor;
  readonly brain: GrimtoothBrain;
  private readonly ctx: GrimtoothContext;
  private readonly model: GrimtoothModel | null;
  private readonly root: THREE.Object3D;
  private readonly places: GrimtoothPlaces;
  private readonly warn: (m: string) => void;
  private readonly onEnd: (end: GrimtoothEnd) => void;
  private readonly offs: (() => void)[] = [];
  private readonly decal = new PounceDecal();
  private readonly shell = new CalmShell();
  private unregister: (() => void) | null = null;
  private registered = false;
  private ended = false;
  /** The `last` break has happened: the floor is lifted for good (review S7). */
  private floorLifted = false;
  /** The tail has broken his poise this phase. */
  private tailSpent = false;
  private poiseIdle = 0;
  /** Pounce: take-off, the locked aim point, the landing, and whether this swing has landed its hit. */
  private readonly aimPoint = new THREE.Vector3();
  private readonly takeoff = new THREE.Vector3();
  private readonly landing = new THREE.Vector3();
  private readonly leapDir = new THREE.Vector3(0, 0, -1);
  private aimed = false;
  /** The head's position on the previous airborne tick: each tick tests only the segment swept since (review should-fix). */
  private readonly prevHead = new THREE.Vector3();
  /** Fixed ticks run, so a `boss.phase` from the same hit as a tail break does not hand the tail back (review nit). */
  private ticks = 0;
  private leapK = -1;
  private tailSpentAt = -1;
  private leapHit = false;
  private collarFlash = 0;
  private telegraphT = -1;
  private telegraphLead = 1;
  private loopClip: GrimtoothClip | null = null;
  /** Outcome presentation: seconds since it began, and its kind; null while fighting. */
  private outcomeT = 0;
  private outcomeKind: 'released' | 'defeated' | null = null;
  private readonly walkDir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(ctx: GrimtoothContext, opts: GrimtoothEncounterOptions) {
    this.ctx = ctx;
    this.model = opts.model;
    this.places = opts.places;
    this.warn = opts.warn;
    this.onEnd = opts.onEnd;
    this.root = opts.model?.root ?? new THREE.Group();
    this.root.name = 'boss-gaffer-grimtooth';
    this.root.position.copy(opts.places.centre);
    this.root.rotation.set(0, opts.places.centreYaw, 0);
    ctx.scene.add(this.root, this.decal.mesh, this.shell.mesh);

    this.actor = ctx.actors.spawn({
      kind: GRIMTOOTH_KIND,
      team: 'hostile',
      level: GRIMTOOTH.level,
      maxHealth: GRIMTOOTH.maxHealth,
      maxPoise: GRIMTOOTH.maxPoise,
      root: this.root,
      owner: opts.model?.owner,
      // Out of the fight until register(): the intro shows him rising, not fighting.
      hittable: false,
    });
    this.actor.untargetable = true;
    if (opts.model) this.offs.push(ctx.combat.addTarget(opts.model.hurtboxes, this.actor.id));
    this.offs.push(
      ctx.damage.addModifier(GRIMTOOTH_TAIL_MODIFIER_ID, (req, _target, attacker) => this.tail(req, attacker), GRIMTOOTH.tailModifierOrder),
      ctx.damage.addModifier(GRIMTOOTH_FLOOR_MODIFIER_ID, (req) => this.floor(req), GRIMTOOTH.floorModifierOrder),
    );
    this.brain = new GrimtoothBrain(this);

    const mine = (p: { bossId: string }) => p.bossId === GRIMTOOTH_BOSS_ID && this.registered && !this.ended;
    this.offs.push(
      ctx.events.on('boss.break', (p) => {
        if (!mine(p)) return;
        if (p.last) this.floorLifted = true;
        this.brain.onBreak();
      }),
      ctx.events.on('boss.phase', (p) => {
        if (!mine(p)) return;
        if (this.tailSpentAt !== this.ticks) this.tailSpent = false;
        this.brain.onPhase(p.phase);
      }),
      ctx.events.on('boss.releaseWindow', (p) => {
        if (mine(p)) this.brain.onReleaseWindow(p.open);
      }),
      ctx.events.on('boss.released', (p) => {
        if (mine(p)) this.outcome('released');
      }),
      ctx.events.on('boss.defeated', (p) => {
        if (mine(p)) this.outcome('defeated');
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

  /** The calm walk-off or the death is playing. */
  get outcomePlaying(): boolean {
    return this.outcomeKind !== null;
  }

  get view(): GrimtoothModel | null {
    return this.model;
  }

  /** Feet position (the root sits at the feet). */
  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.root.position);
  }

  /** Starts the fight after the intro: registers the boss (bar and music follow `boss.started`) and starts the brain. */
  register(): boolean {
    if (this.registered || this.ended) return false;
    try {
      this.unregister = this.ctx.bosses.register(this.actor.id, GRIMTOOTH_BOSS_DEF);
    } catch (err) {
      this.warn(`could not register Grimtooth: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.registered = true;
    this.actor.hittable = true;
    this.actor.untargetable = false;
    this.brain.start();
    return true;
  }

  /** Fixed tick: brain, movement, facing, poise regen, telegraph glow, fx and the outcome presentation. */
  tick(dt: number): void {
    if (this.ended || !(dt > 0)) return;
    this.ticks++;
    this.model?.update(dt);
    this.decal.update(dt);
    this.shell.update(dt, this.root.position, this.root.rotation.y);
    if (this.outcomeKind) {
      this.tickOutcome(dt);
      return;
    }
    if (!this.registered) return;

    const player = this.ctx.player.feet;
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.brain.tick(dt, { dist, liveSummons: this.liveSummons() });
    if (this.ended || this.outcomeKind) return;
    this.move(dt, player);
    this.glow(dt);
    // Poise refills after 4 s without a landed hit (design 9.6), outside the stagger and the window.
    const st = this.brain.state;
    if (st !== 'broken' && st !== 'window') {
      this.poiseIdle += dt;
      if (this.poiseIdle >= GRIMTOOTH.poiseRegenDelay && this.actor.poise < this.actor.maxPoise) this.actor.restorePoise();
    }
  }

  /**
   * Ends the encounter without an outcome (player death, load, teardown): the summons reset, Grimtooth despawned.
   * `unregisterFirst` (teardown) makes the registry report `'unregistered'`; otherwise the despawn reports `'despawned'`.
   */
  reset(opts: { unregisterFirst?: boolean } = {}): void {
    if (this.ended) return;
    if (opts.unregisterFirst) this.dropRegistration();
    this.finish('reset');
  }

  // ---- GrimtoothHooks ----

  telegraph(move: GrimtoothMoveDef, swingId: number, leadSeconds: number): void {
    this.ctx.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: move.telegraph,
      attackId: move.attackId,
      moveId: `${GRIMTOOTH_BOSS_ID}.${move.id}`,
      swingId,
      leadSeconds,
    });
    this.telegraphT = 0;
    this.telegraphLead = Math.max(0.05, leadSeconds);
    if (move.id === 'pounce') {
      // The "Pounce crouch" (design 11): tail flare, the line decal, the red collar flash.
      this.oneShot('crouch');
      this.collarFlash = 1;
      const player = this.ctx.player.feet;
      this.decal.start(this.root.position, this.leapTarget(this.tmp.set(player.x, this.root.position.y, player.z)));
      this.sfx('sfx.grimtooth.growl');
    } else {
      this.oneShot('bite');
    }
  }

  telegraphCancelled(swingId: number): void {
    this.ctx.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId });
    this.aimed = false;
    this.endTelegraph();
  }

  aim(): void {
    const player = this.ctx.player.feet;
    this.aimed = true;
    this.aimPoint.set(player.x, this.root.position.y, player.z);
    this.decal.retarget(this.root.position, this.leapTarget(this.tmp.copy(this.aimPoint)));
  }

  leapStart(): void {
    if (!this.aimed) this.aim();
    this.aimed = false;
    this.leapHit = false;
    this.leapK = -1;
    this.endTelegraph();
    this.takeoff.copy(this.root.position);
    this.leapTarget(this.landing.copy(this.aimPoint));
    this.leapDir.set(this.aimPoint.x - this.takeoff.x, 0, this.aimPoint.z - this.takeoff.z);
    if (this.leapDir.lengthSq() < 1e-6) this.leapDir.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
    this.leapDir.normalize();
    this.root.rotation.y = Math.atan2(-this.leapDir.x, -this.leapDir.z);
    this.prevHead.set(this.takeoff.x + this.leapDir.x * POUNCE.stopShort, 0, this.takeoff.z + this.leapDir.z * POUNCE.stopShort);
    this.oneShot('pounce');
    this.sfx('sfx.grimtooth.pounce');
  }

  /** Moves him along the leap and checks the hit every airborne tick; the first contact wins (review B1). */
  leapTick(swingId: number, t01: number): void {
    const k = Math.min(1, Math.max(0, t01));
    const pos = this.root.position;
    pos.x = this.takeoff.x + (this.landing.x - this.takeoff.x) * k;
    pos.z = this.takeoff.z + (this.landing.z - this.takeoff.z) * k;
    if (this.leapHit) return;
    // His head reaches the stop-short distance past his feet, so the swept segment ends at the aim point on landing.
    const head = { x: pos.x + this.leapDir.x * POUNCE.stopShort, z: pos.z + this.leapDir.z * POUNCE.stopShort };
    const from = { x: this.prevHead.x, z: this.prevHead.z };
    this.prevHead.set(head.x, 0, head.z);
    const feet = this.ctx.player.feet;
    if (Math.abs(feet.y - pos.y) > 2.5) return;
    // The take-off tick sweeps from his body (feet) so a player standing at his nose is not skipped.
    const start = this.leapK < 0 ? { x: this.takeoff.x, z: this.takeoff.z } : from;
    this.leapK = k;
    if (distToSegment(feet, start, head) > POUNCE.radius) return;
    this.leapHit = true;
    this.hitPlayer(MOVES.pounce, swingId);
  }

  leapEnd(_swingId: number, interrupted: boolean): void {
    this.decal.stop();
    if (!interrupted) this.loop('idle');
  }

  strike(move: GrimtoothMoveDef, swingId: number): void {
    this.endTelegraph();
    const feet = this.ctx.player.feet;
    const pos = this.root.position;
    if (Math.abs(feet.y - pos.y) > 2.5) return;
    const dx = feet.x - pos.x;
    const dz = feet.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > BITE.reach) return;
    if (d > 1e-3) {
      const yaw = this.root.rotation.y;
      const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d;
      if (dot < Math.cos(BITE.halfAngle)) return;
    }
    const result = this.hitPlayer(move, swingId);
    if (result?.outcome !== 'hit') return;
    // The burning bite (thread 5's shared status), only on a hit, as the Prior's chain slow.
    const status = this.ctx.services.get('status');
    try {
      status?.apply(this.ctx.player.actor.id, { ...BITE.status, sourceId: this.actor.id });
    } catch (err) {
      this.warn(`burning bite failed: ${String(err)}`);
    }
  }

  backstep(): void {
    this.oneShot('pounce');
  }

  howlStart(): void {
    this.oneShot('howl');
    this.sfx('sfx.grimtooth.howl');
  }

  howlRelease(count: number): void {
    this.loop('idle');
    const enemies = this.ctx.services.get('enemies');
    if (!enemies) return;
    try {
      // reset clears calm-exiting hounds and spent slots; then the wave fills the lowest `count` slots.
      enemies.reset(SUMMON_GROUP);
      enemies.spawnGroup(SUMMON_GROUP, { aggro: true, count });
    } catch (err) {
      this.warn(`summon group "${SUMMON_GROUP}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  stagger(): void {
    this.decal.stop();
    this.oneShot('knockdown');
  }

  window(): void {
    this.decal.stop();
    this.endTelegraph();
    this.oneShot('headLower');
  }

  restorePoise(): void {
    this.actor.restorePoise();
    this.poiseIdle = 0;
  }

  // ---- internals ----

  /** The landing for an aim point: `stopShort` before it, at most `maxMetres` from him, inside the arena (in place). */
  private leapTarget(aim: THREE.Vector3): THREE.Vector3 {
    const from = this.root.position;
    const dx = aim.x - from.x;
    const dz = aim.z - from.z;
    const d = Math.hypot(dx, dz);
    const len = Math.max(0, Math.min(POUNCE.maxMetres, d - POUNCE.stopShort));
    if (d > 1e-6) aim.set(from.x + (dx / d) * len, from.y, from.z + (dz / d) * len);
    else aim.copy(from);
    return clampToArena(aim, this.places.centre, ARENA.arenaHalfExtent);
  }

  private hitPlayer(move: GrimtoothMoveDef, swingId: number) {
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
      // The pounce is red (dodge only); the bite is blockable but never parried (a script hit has no attack window).
      ...(move.telegraph === 'dodge' ? { unblockable: true } : { parryable: false as const }),
    });
  }

  /** Circle, close, backstep, the leap (driven by leapTick) and turning toward the player. */
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
      if (mode === 'circle') {
        // Stalk round the player, drifting back into the middle of the band.
        const mid = (GRIMTOOTH.circleMin + GRIMTOOTH.circleMax) / 2;
        const radial = Math.max(-1, Math.min(1, (dist - mid) / 2));
        const vx = -uz + ux * radial;
        const vz = ux + uz * radial;
        const vl = Math.hypot(vx, vz) || 1;
        speed = GRIMTOOTH.circleSpeed;
        pos.x += (vx / vl) * speed * dt;
        pos.z += (vz / vl) * speed * dt;
      } else if (mode === 'close') {
        speed = GRIMTOOTH.closeSpeed;
        const step = Math.min(speed * dt, Math.max(0, dist - 1.6));
        pos.x += ux * step;
        pos.z += uz * step;
      } else if (mode === 'backstep') {
        speed = GRIMTOOTH.backstepMetres / GRIMTOOTH.backstepSeconds;
        pos.x -= ux * speed * dt;
        pos.z -= uz * speed * dt;
      }
      clampToArena(pos, this.places.centre, ARENA.arenaHalfExtent);
    }
    if (mode === 'circle' || mode === 'close') this.loop(mode === 'close' ? 'run' : 'walk');
    else if (st === 'recover' && this.loopClip !== 'idle' && this.telegraphT < 0) this.loop('idle');
    this.model?.setSpeed(speed);
    // He turns toward the player at a limited rate (so getting behind him takes work), except mid-leap, broken or lying low,
    // and not after the pounce aim has locked.
    const turning = st === 'circle' || st === 'close' || st === 'bite' || st === 'recover' || (st === 'crouch' && !this.aimed);
    if (turning && dist > 1e-3) {
      const want = yawToward(pos, player);
      let diff = want - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = GRIMTOOTH.turnRate * dt;
      this.root.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
  }

  private glow(dt: number): void {
    if (this.telegraphT >= 0) {
      this.telegraphT += dt;
      this.model?.setTelegraph(Math.min(1, this.telegraphT / this.telegraphLead));
    }
    if (this.collarFlash > 0) {
      this.collarFlash = Math.max(0, this.collarFlash - dt / Math.max(0.05, MOVES.pounce.windup));
      this.model?.setCollarFlash(this.collarFlash);
    }
  }

  private endTelegraph(): void {
    this.telegraphT = -1;
    this.collarFlash = 0;
    this.model?.setTelegraph(0);
    this.model?.setCollarFlash(0);
  }

  /**
   * The tail weak spot (review S4): a melee hit on the `tail` hurtbox travelling within 60 degrees of his facing breaks his
   * poise once per phase; any other tail hit takes extra damage. Only melee hits carry `bone`, so spells and bolts never do.
   */
  private tail(req: { targetId: string; bone?: string; kind: string; direction?: THREE.Vector3; amount: number; poise?: number }, attacker: Actor | null | undefined): void {
    if (req.targetId !== this.actor.id || req.bone !== 'tail' || !this.registered || this.outcomeKind) return;
    if (!attacker || attacker.team === 'hostile') return;
    const yaw = this.root.rotation.y;
    const d = req.direction;
    const len = d ? Math.hypot(d.x, d.z) : 0;
    const dot = d && len > 1e-6 ? (d.x * -Math.sin(yaw) + d.z * -Math.cos(yaw)) / len : -1;
    if (dot >= GRIMTOOTH.tailFacingDot && !this.tailSpent && this.actor.poise > 0 && this.brain.state !== 'window') {
      this.tailSpent = true;
      this.tailSpentAt = this.ticks;
      req.poise = Math.max(req.poise ?? 0, this.actor.poise);
      return;
    }
    req.amount *= GRIMTOOTH.tailDamageScale;
  }

  /** Keeps health at or above the floor until the `last` break; clamps damage only, never poise. */
  private floor(req: { targetId: string; amount: number }): void {
    if (req.targetId !== this.actor.id || this.floorLifted || !this.registered) return;
    const min = Math.ceil(this.actor.maxHealth * GRIMTOOTH.healthFloor);
    const room = Math.max(0, this.actor.health - min);
    if (req.amount > room) req.amount = room;
  }

  private liveSummons(): number {
    try {
      return this.ctx.services.get('enemies')?.alive(SUMMON_GROUP).length ?? 0;
    } catch {
      return 0;
    }
  }

  private loop(clip: GrimtoothClip): void {
    if (this.loopClip === clip) return;
    this.loopClip = clip;
    this.model?.play(clip, { loop: true });
  }

  private oneShot(clip: GrimtoothClip): void {
    this.loopClip = null;
    this.model?.play(clip);
  }

  private sfx(key: string): void {
    const audio = this.ctx.services.get('audio');
    if (!audio) return;
    try {
      audio.playAt(key, this.root.position);
    } catch {
      // thread 9 owns the keys; a missing one is silent
    }
  }

  private outcome(kind: 'released' | 'defeated'): void {
    this.brain.onOutcome(kind);
    this.outcomeKind = kind;
    this.outcomeT = 0;
    this.decal.stop();
    this.endTelegraph();
    this.actor.untargetable = true;
    if (kind === 'released') {
      // Effect 31 on his model; the pack is thread 1's to scatter (ruling 18:00): no reset, no despawn.
      this.actor.hittable = false;
      this.shell.start();
      this.oneShot('headLower');
    } else {
      // The summons crumble at once (review nit: an instant despawn, no credit).
      this.resetSummons();
      this.oneShot('knockdown');
    }
  }

  private tickOutcome(dt: number): void {
    this.outcomeT += dt;
    const t = this.outcomeT;
    if (this.outcomeKind === 'released') {
      if (t >= PRESENTATION.calmHeadSeconds) {
        if (this.walkDir.lengthSq() === 0) {
          // Walk away from the player.
          const player = this.ctx.player.feet;
          this.walkDir.set(this.root.position.x - player.x, 0, this.root.position.z - player.z);
          if (this.walkDir.lengthSq() < 1e-6) this.walkDir.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y));
          this.walkDir.normalize();
          this.root.rotation.y = Math.atan2(-this.walkDir.x, -this.walkDir.z);
          this.loop('walk');
          this.model?.setSpeed(PRESENTATION.calmWalkSpeed);
        }
        const pos = this.root.position;
        pos.addScaledVector(this.walkDir, PRESENTATION.calmWalkSpeed * dt);
        clampToArena(pos, this.places.centre, ARENA.arenaHalfExtent);
        const walk = PRESENTATION.calmDespawnAfter - PRESENTATION.calmHeadSeconds;
        this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.calmHeadSeconds) / walk));
      }
      if (t >= PRESENTATION.calmDespawnAfter) this.finish('released');
      return;
    }
    if (t >= PRESENTATION.deathClipSeconds) {
      this.model?.setOpacity(Math.max(0, 1 - (t - PRESENTATION.deathClipSeconds) / PRESENTATION.deathFadeSeconds));
    }
    if (t >= PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) this.finish('defeated');
  }

  private resetSummons(): void {
    try {
      this.ctx.services.get('enemies')?.reset(SUMMON_GROUP);
    } catch (err) {
      this.warn(`summon group "${SUMMON_GROUP}" reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private dropRegistration(): void {
    const off = this.unregister;
    this.unregister = null;
    off?.();
  }

  private finish(end: GrimtoothEnd): void {
    if (this.ended) return;
    this.ended = true;
    // A calm leaves the pack to thread 1's scatter (review B3): only a kill or a reset clears the group.
    // A death or load during the calm walk-off finishes as a reset, and still leaves the scattering pack alone (review B).
    if (end !== 'released' && this.outcomeKind !== 'released') this.resetSummons();
    for (const off of this.offs.splice(0)) off();
    // As the Prior: the registry drops the registration on `actor.despawned` (exactly one `boss.ended`); only a teardown
    // unregisters first.
    this.unregister = null;
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.decal.dispose();
    this.shell.dispose();
    if (this.model) this.model.dispose();
    else this.root.removeFromParent();
    this.onEnd(end);
  }
}
