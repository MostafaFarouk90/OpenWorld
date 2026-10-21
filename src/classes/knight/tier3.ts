import * as THREE from 'three';
import type { ActorId, Vec3 } from '../../vfx/ports';
import { HALVARD, OATHWARD, SQUIRE } from './tuning';

type Result = { ok: true } | { ok: false; reason: string };

/** A modifier request as the Oathward sees it (a subset of the resolver's ModifiableRequest). */
export interface HitRequest {
  amount: number;
  poise: number;
  outcome: 'hit' | 'blocked' | 'parried' | 'immune';
}

// ---------------------------------------------------------------------------------------------------------------------
// Oathward
// ---------------------------------------------------------------------------------------------------------------------

export interface OathwardPorts {
  now(): number;
  playerId(): ActorId;
  /** Chosen class: null before M07 (plays as the Knight). */
  classId(): string | null;
  learned(): boolean;
  dead(): boolean;
  feet(): Vec3;
  /** Spawns the bubble on the player; the returned function ends it. */
  bubble(): (() => void) | null;
  burst(at: Vec3): void;
}

/**
 * A shield bubble on the player (Bulwark 3): absorbs up to 100 damage for 20 s. `absorb` is the damage modifier body; what
 * the bubble cannot take passes through. A recast replaces it with a fresh one.
 */
export class Oathward {
  private left = 0;
  private until = 0;
  private stopFx: (() => void) | null = null;

  constructor(private readonly p: OathwardPorts) {}

  get active(): boolean {
    return this.until > 0;
  }

  get remaining(): number {
    return this.left;
  }

  /** The ability handler body. */
  cast(): Result {
    if (this.p.dead()) return { ok: false, reason: 'dead' };
    if (!this.knight()) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    this.end(false);
    this.left = OATHWARD.absorb;
    this.until = this.p.now() + OATHWARD.seconds;
    this.stopFx = this.p.bubble();
    return { ok: true };
  }

  /** Damage modifier, defender band after the guard. Only hits that would land are reduced. */
  absorb(req: HitRequest, targetId: ActorId): void {
    if (this.until <= 0 || targetId !== this.p.playerId() || req.outcome !== 'hit' || !(req.amount > 0)) return;
    if (!this.knight() || !this.p.learned()) return this.end(false);
    const taken = Math.min(this.left, req.amount);
    // The poise a fully absorbed hit carries goes with it; a partly absorbed hit keeps its share.
    req.poise *= 1 - taken / req.amount;
    req.amount -= taken;
    this.left -= taken;
    if (this.left <= 0) this.end(true);
  }

  /** Once per fixed tick. */
  tick(): void {
    if (this.until > 0 && (this.p.dead() || this.p.now() >= this.until || !this.p.learned())) this.end(false);
  }

  /** Drops the bubble without the burst (load, class change, death, dispose). */
  clear(): void {
    this.end(false);
  }

  private knight(): boolean {
    const c = this.p.classId();
    return c === null || c === 'knight';
  }

  private end(burst: boolean): void {
    if (this.until <= 0) return;
    this.until = 0;
    this.left = 0;
    this.stopFx?.();
    this.stopFx = null;
    if (burst) this.p.burst(this.p.feet());
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Charge of the Halvard
// ---------------------------------------------------------------------------------------------------------------------

export interface HalvardActor {
  readonly id: ActorId;
  readonly team: string;
  readonly dead: boolean;
  readonly hittable: boolean;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
}

export interface HalvardPorts {
  actors: { all(): Iterable<HalvardActor> };
  damage: {
    apply(req: {
      attackerId: ActorId | null;
      targetId: ActorId;
      amount: number;
      kind: 'melee';
      attackId: string;
      direction?: THREE.Vector3;
    }): unknown;
  };
  classId(): string | null;
  learned(): boolean;
  feet(): Vec3;
  /** Yaw of the player's facing; the player looks along (-sin yaw, -cos yaw). */
  facingYaw(): number;
  /** Why the lunge cannot start right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  playClip(clip: string): boolean;
  /** Holds (or releases with null) the scripted move in the combat verbs. */
  hold(move: { x: number; z: number; speed: number } | null): void;
  /** Ground height at a point; when present the lunge stops before a drop of more than `HALVARD.maxDrop`. */
  heightAt?(x: number, z: number): number;
  /** Staggered, dead or dodging: the lunge ends early. */
  interrupted(): boolean;
  reportTrigger(skillId: string): void;
  fx(at: Vec3, yaw: number): void;
  skillId: string;
}

/**
 * A forward lunge (Vanguard 3): 5 m in 0.25 s, every hostile on the way hit once for twice the Stab's damage. A normal player
 * hit: mercy states are decided by the resolver and the foes, not skipped here. A wall stops the move in the forced-move code.
 */
export class HalvardCharge {
  private left = 0;
  private dir = { x: 0, z: 0 };
  private held = false;
  private hit = new Set<ActorId>();
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly p: HalvardPorts, private readonly playerId: () => ActorId) {}

  get charging(): boolean {
    return this.left > 0;
  }

  start(): Result {
    const c = this.p.classId();
    if (c !== null && c !== 'knight') return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    if (this.left > 0) return { ok: false, reason: 'charging' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.playClip(HALVARD.clip)) return { ok: false, reason: 'busy' };
    const yaw = this.p.facingYaw();
    this.dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    this.left = HALVARD.ticks;
    this.hit.clear();
    this.held = true;
    this.p.hold({ x: this.dir.x, z: this.dir.z, speed: HALVARD.distance / (HALVARD.ticks / 60) });
    this.p.reportTrigger(this.p.skillId);
    this.p.fx(this.p.feet(), yaw);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.left <= 0) return;
    if (this.p.interrupted()) return this.end();
    this.left--;
    const feet = this.p.feet();
    if (this.p.heightAt) {
      const ahead = this.p.heightAt(feet.x + this.dir.x * HALVARD.probe, feet.z + this.dir.z * HALVARD.probe);
      if (this.p.heightAt(feet.x, feet.z) - ahead > HALVARD.maxDrop) return this.end();
    }
    for (const a of this.p.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable || this.hit.has(a.id)) continue;
      const pos = a.worldPosition(this.scratch);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > HALVARD.hitRadius) continue;
      if (d > 1e-6 && (dx * this.dir.x + dz * this.dir.z) / d < 0) continue;
      this.hit.add(a.id);
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount: HALVARD.damage,
        kind: 'melee',
        attackId: HALVARD.attackId,
        direction: new THREE.Vector3(this.dir.x, 0, this.dir.z),
      });
    }
    if (this.left <= 0) this.end();
  }

  cancel(): void {
    this.end();
  }

  private end(): void {
    const was = this.held;
    this.left = 0;
    this.held = false;
    this.hit.clear();
    if (was) this.p.hold(null);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Squire's Resolve
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Plugin-local fight tracker. A fight opens when a hostile aggroes, and closes once no aggroed hostile is left for the grace
 * time: a foe leaves the set on `ai.calm`, its death or despawn, or when `alive` says it is gone. `reset` (a load) closes it.
 */
export class FightTracker {
  private readonly aggroed = new Set<ActorId>();
  private open_ = false;
  private emptySince = 0;

  constructor(
    private readonly now: () => number,
    private readonly alive: (id: ActorId) => boolean,
    private readonly onClose: () => void,
  ) {}

  get open(): boolean {
    return this.open_;
  }

  get foes(): number {
    return this.aggroed.size;
  }

  /** `ai.aggro` from a hostile. */
  aggro(actorId: ActorId): void {
    this.aggroed.add(actorId);
    this.open_ = true;
  }

  /** `actor.died`: the last aggroed foe falling ends the fight at once. */
  died(actorId: ActorId): void {
    if (this.aggroed.delete(actorId) && this.aggroed.size === 0 && this.open_) this.close();
  }

  /** `ai.calm`, `actor.despawned`: the fight ends after the grace time. */
  gone(actorId: ActorId): void {
    if (this.aggroed.delete(actorId) && this.aggroed.size === 0) this.emptySince = this.now();
  }

  /** A hit between a hostile and an ally or the player: keeps the fight open for foes that never emit `ai.aggro` (bosses). */
  engage(): void {
    this.open_ = true;
    this.emptySince = this.now();
  }

  /** Opens a fight with no foe in it (an ally saved outside any aggro); it closes after the grace time. */
  touch(): void {
    if (this.open_) return;
    this.open_ = true;
    this.emptySince = this.now();
  }

  tick(): void {
    if (!this.open_) return;
    for (const id of this.aggroed) if (!this.alive(id)) this.gone(id);
    if (this.aggroed.size > 0) return;
    if (this.now() - this.emptySince >= SQUIRE.graceSeconds) this.close();
  }

  reset(): void {
    this.aggroed.clear();
    if (this.open_) this.close();
  }

  private close(): void {
    this.open_ = false;
    this.onClose();
  }
}

export interface SquireActor {
  readonly id: ActorId;
  readonly team: string;
  readonly maxHealth: number;
  health: number;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
}

export interface SquirePorts {
  now(): number;
  playerId(): ActorId;
  feet(): Vec3;
  classId(): string | null;
  learned(): boolean;
  fx(at: Vec3): void;
  alive(id: ActorId): boolean;
}

/** Wires the tracker to the lethal handler: each ally is saved once per fight. */
export class SquiresResolve {
  readonly fight: FightTracker;
  private readonly used = new Set<ActorId>();
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly p: SquirePorts) {
    this.fight = new FightTracker(p.now, p.alive, () => this.used.clear());
  }

  /** `damage.dealt`: `attackerTeam` and `targetTeam` are the teams of the two actors. */
  onDamage(attackerTeam: string | undefined, targetTeam: string | undefined): void {
    const friendly = (t?: string) => t === 'ally' || t === 'player';
    if ((attackerTeam === 'hostile' && friendly(targetTeam)) || (friendly(attackerTeam) && targetTeam === 'hostile')) this.fight.engage();
  }

  /** `actor.died` of any actor. */
  onDied(actorId: ActorId): void {
    this.fight.died(actorId);
  }

  /** `ai.aggro`; `team` is the aggroing actor's team. */
  onAggro(actorId: ActorId, team: string | undefined): void {
    if (team === 'hostile') this.fight.aggro(actorId);
  }

  /** The lethal handler body: true prevents the death and leaves the ally at 1 health. */
  lethal(target: SquireActor): boolean {
    if (target.team !== 'ally' || target.id === this.p.playerId() || this.used.has(target.id)) return false;
    const c = this.p.classId();
    if ((c !== null && c !== 'knight') || !this.p.learned()) return false;
    const feet = this.p.feet();
    const pos = target.worldPosition(this.scratch);
    if (Math.hypot(pos.x - feet.x, pos.z - feet.z) > SQUIRE.radius) return false;
    this.used.add(target.id);
    this.fight.touch();
    target.health = Math.min(1, target.maxHealth);
    this.p.fx({ x: pos.x, y: pos.y, z: pos.z });
    return true;
  }

  tick(): void {
    this.fight.tick();
  }

  reset(): void {
    this.fight.reset();
    this.used.clear();
  }
}
