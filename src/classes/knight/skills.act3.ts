import * as THREE from 'three';
import type { ActorId, Vec3 } from '../../vfx/ports';
import { BASTION_WALL, EXECUTIONERS_ARC, HEARTHFIRE_WARD } from './tuning';

type Result = { ok: true } | { ok: false; reason: string };

/** Accepts the Knight's null class before M07 as well as 'knight' (as tier 3). */
const isKnight = (c: string | null): boolean => c === null || c === 'knight';

type MercyLike = { mercyState?: () => string };
/** Whether a foe is yielding, calming, leaving or staggered for mercy; a throwing reader counts as none (as the resolver does). */
function inMercy(a: unknown): boolean {
  try {
    return ((a as MercyLike).mercyState?.() ?? 'none') !== 'none';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Bastion Wall
// ---------------------------------------------------------------------------------------------------------------------

/** The request as the wall's modifier sees it (a subset of the resolver's ModifiableRequest). */
export interface WallRequest {
  amount: number;
  poise: number;
  outcome: 'hit' | 'blocked' | 'parried' | 'immune';
  kind: string;
  unblockable?: boolean;
  /** Unit, horizontal, attacker to target. */
  direction?: { x: number; y?: number; z: number };
}

export interface WallTarget {
  readonly id: ActorId;
  readonly team: string;
  readonly dead: boolean;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
}

export interface BastionWallPorts {
  now(): number;
  playerId(): ActorId;
  classId(): string | null;
  learned(): boolean;
  dead(): boolean;
  feet(): Vec3;
  /** Yaw of the player's facing; the player looks along (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Whether the block input is down right now. */
  blockHeld(): boolean;
  /** Why the wall cannot be raised right now (dead, staggered), or null. */
  blockedReason(): string | null;
  /** The player's guard broke on the hit being resolved right now (`player.guardBroken` fired this fixed tick). */
  guardBrokeThisTick(): boolean;
  /** Spawns the cone on the player; the returned handle ends it and flickers it on each covered hit. */
  cone(): { stop(): void; flicker(): void } | null;
  reportTrigger(skillId: string): void;
  skillId: string;
}

/**
 * A wall of light (Bulwark 4): for 8 s, while block is held, a hit whose source lies in the 120 degree front cone and that is aimed
 * at the Knight or at a live ally within 6 m of the Knight is blocked, amount and poise x0.2. The modifier acts on outcome 'hit'
 * only, never on a status tick or an unblockable request, so a hit the Knight's own guard already blocked or parried is not scaled
 * a second time (and a parry stays a parry). A request with no direction is not covered. The wall lasts the full 8 s once cast but covers (and shows) only while block is held. The 8 s running out,
 * death, a class change or a load ends it.
 */
export class BastionWall {
  private until = 0;
  private fx: { stop(): void; flicker(): void } | null = null;
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly p: BastionWallPorts) {}

  get active(): boolean {
    return this.until > 0;
  }

  /** The ability handler body. */
  cast(): Result {
    if (this.p.dead()) return { ok: false, reason: 'dead' };
    if (!isKnight(this.p.classId())) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (this.until > 0) return { ok: false, reason: 'active' };
    this.until = this.p.now() + BASTION_WALL.seconds;
    this.fx = this.p.blockHeld() ? this.p.cone() : null;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /**
   * Damage modifier body, defender band at -45 (after the guard at -50). `attackerPos` is where the attacker stands (the
   * modifier's attacker argument, else the actor registry); an ally is covered only when it is known and inside the cone.
   */
  cover(req: WallRequest, target: WallTarget, attackerPos?: Vec3 | null): void {
    if (this.until <= 0 || req.outcome !== 'hit' || req.kind === 'status' || req.unblockable) return;
    if (!this.live()) return this.end();
    if (!this.p.blockHeld()) return;
    const d = req.direction;
    if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
    const len = Math.hypot(d.x, d.z);
    if (len < 1e-6) return;
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const minCos = Math.cos((BASTION_WALL.coneDegrees / 2) * (Math.PI / 180)) - 1e-9;
    if (target.id === this.p.playerId()) {
      // A guard that broke on this very hit stays broken: the wall does not turn it into a block (allies stay covered).
      if (this.p.guardBrokeThisTick()) return;
      // The source lies opposite to the hit's direction; it must be within 60 degrees of where the Knight faces.
      if (-(d.x / len) * fx + -(d.z / len) * fz < minCos) return;
    } else {
      if (target.team !== 'ally' || target.dead) return;
      const pos = target.worldPosition(this.scratch);
      if (Math.hypot(pos.x - feet.x, pos.z - feet.z) > BASTION_WALL.allyRadius) return;
      // For an ally the hit direction is seen from the ally, so the attacker's own position (from the Knight's feet) decides.
      if (!attackerPos || !Number.isFinite(attackerPos.x) || !Number.isFinite(attackerPos.z)) return;
      const ax = attackerPos.x - feet.x;
      const az = attackerPos.z - feet.z;
      const ad = Math.hypot(ax, az);
      if (ad > 1e-6 && (ax * fx + az * fz) / ad < minCos) return;
    }
    req.outcome = 'blocked';
    req.amount *= BASTION_WALL.scale;
    req.poise *= BASTION_WALL.scale;
    this.fx?.flicker();
  }

  /** Once per fixed tick: polls the 8 s and the block input (the cone shows only while block is held; letting go does not end the wall). */
  tick(): void {
    if (this.until <= 0) return;
    if (!this.live() || this.p.now() >= this.until) return this.end();
    const held = this.p.blockHeld();
    if (held && !this.fx) this.fx = this.p.cone();
    else if (!held && this.fx) {
      this.fx.stop();
      this.fx = null;
    }
  }

  /** Drops the wall (load, class change, death, dispose). */
  clear(): void {
    this.end();
  }

  private live(): boolean {
    return !this.p.dead() && isKnight(this.p.classId()) && this.p.learned();
  }

  private end(): void {
    if (this.until <= 0) return;
    this.until = 0;
    this.fx?.stop();
    this.fx = null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Executioner's Arc
// ---------------------------------------------------------------------------------------------------------------------

export interface ArcActor {
  readonly id: ActorId;
  readonly team: string;
  readonly dead: boolean;
  readonly hittable: boolean;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
}

export interface ExecutionersArcPorts {
  actors: { all(): Iterable<ArcActor> };
  damage: {
    apply(req: {
      attackerId: ActorId | null;
      targetId: ActorId;
      amount: number;
      poise: number;
      kind: 'melee';
      attackId: string;
      direction?: THREE.Vector3;
    }): unknown;
  };
  classId(): string | null;
  learned(): boolean;
  feet(): Vec3;
  facingYaw(): number;
  /** Why the chop cannot start right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  playClip(clip: string): boolean;
  /** The player was staggered, died or dodged: the chop ends early. */
  interrupted(): boolean;
  reportTrigger(skillId: string): void;
  fx?(at: Vec3, yaw: number): void;
  skillId: string;
}

/**
 * The heavy chop (Vanguard 4): the clip plays and, while its blade is hot, every hostile within 3 m in the 180 degree front arc takes
 * 1.8x the base hit once, with poise 30. Foes in a mercy state, dead or unhittable ones are skipped.
 */
export class ExecutionersArc {
  private left = 0;
  private elapsed = 0;
  private hit = new Set<ActorId>();
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly p: ExecutionersArcPorts, private readonly playerId: () => ActorId) {}

  get chopping(): boolean {
    return this.left > 0;
  }

  /** The ability handler body. */
  start(): Result {
    if (!isKnight(this.p.classId())) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    if (this.left > 0) return { ok: false, reason: 'chopping' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.playClip(EXECUTIONERS_ARC.clip)) return { ok: false, reason: 'busy' };
    this.left = EXECUTIONERS_ARC.ticks;
    this.elapsed = 0;
    this.hit.clear();
    this.p.fx?.(this.p.feet(), this.p.facingYaw());
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.left <= 0) return;
    if (this.p.interrupted()) return this.cancel();
    this.elapsed++;
    this.left--;
    if (this.elapsed >= EXECUTIONERS_ARC.hitFromTick && this.elapsed <= EXECUTIONERS_ARC.hitToTick) this.sweep();
    if (this.left <= 0) this.cancel();
  }

  /** Ends the chop at once (respec, class change, load, dispose). */
  cancel(): void {
    this.left = 0;
    this.elapsed = 0;
    this.hit.clear();
  }

  private sweep(): void {
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const minCos = Math.cos((EXECUTIONERS_ARC.arcDegrees / 2) * (Math.PI / 180));
    for (const a of this.p.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable || this.hit.has(a.id)) continue;
      if (inMercy(a)) continue;
      const pos = a.worldPosition(this.scratch);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > EXECUTIONERS_ARC.reach) continue;
      if (d > 1e-6 && (dx * fx + dz * fz) / d < minCos - 1e-9) continue;
      this.hit.add(a.id);
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount: EXECUTIONERS_ARC.damage,
        poise: EXECUTIONERS_ARC.poise,
        kind: 'melee',
        attackId: EXECUTIONERS_ARC.attackId,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : fx, 0, d > 1e-6 ? dz / d : fz),
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hearthfire Ward
// ---------------------------------------------------------------------------------------------------------------------

export interface WardActor {
  readonly id: ActorId;
  readonly team: string;
  readonly dead: boolean;
  readonly maxHealth: number;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
}

export interface HearthfireWardPorts {
  actors: { all(): Iterable<WardActor> };
  playerId(): ActorId;
  classId(): string | null;
  learned(): boolean;
  /** `damage.heal`: returns the health added. */
  heal(id: ActorId, amount: number): number;
  /** Motes over the banner and a heart on each healed actor. */
  fx?(banner: Vec3, healed: Vec3[]): void;
}

/**
 * The banner's 3 s pulse (Standard 4) heals the player and every live ally within the pulse radius (8 m inclusive, horizontal, as
 * the banner's own aura measures it) by 3% of their current maximum health (Burn and Scars already shrink that maximum).
 */
export class HearthfireWard {
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly p: HearthfireWardPorts) {}

  /** `banner.pulse`. Returns how many actors were healed. */
  pulse(position: Vec3, radius: number): number {
    if (!isKnight(this.p.classId()) || !this.p.learned()) return 0;
    if (![position.x, position.y, position.z, radius].every(Number.isFinite)) return 0;
    const healed: Vec3[] = [];
    for (const a of this.p.actors.all()) {
      const mine = a.id === this.p.playerId();
      if (a.dead || (!mine && a.team !== 'ally')) continue;
      const pos = a.worldPosition(this.scratch);
      if (Math.hypot(pos.x - position.x, pos.z - position.z) > radius) continue;
      if (this.p.heal(a.id, a.maxHealth * HEARTHFIRE_WARD.fraction) > 0) healed.push({ x: pos.x, y: pos.y, z: pos.z });
    }
    this.p.fx?.(position, healed);
    return healed.length;
  }
}
