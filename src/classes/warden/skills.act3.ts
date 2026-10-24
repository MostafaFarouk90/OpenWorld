import * as THREE from 'three';
import { COMBAT } from '../../config/constants';
import type { ActorId, ActorsLike, EventsLike, Vec3 } from '../../vfx/ports';
import { EARTHROOT, FRENZIED_HEARTH, SKULLSPLITTER, STAGGER_WINDOW_SECONDS } from './tuning';

type Result = { ok: true } | { ok: false; reason: string };
type MercyLike = { mercyState?: () => string };
type PoiseLike = { poise?: number; maxPoise?: number; restorePoise?: (n?: number) => void };

/** Whether a foe is yielding, calming, leaving or staggered for mercy; a throwing reader counts as none (as the resolver does). */
function inMercy(a: unknown): boolean {
  try {
    const s = (a as MercyLike).mercyState?.() ?? 'none';
    return s !== 'none';
  } catch {
    return false;
  }
}

const SCRATCH = new THREE.Vector3();

/** A hostile that a tier 4 hit may land on: alive, hittable and not in a mercy state (a hit from the player would revoke mercy). */
function hittableHostile(a: { team: string; dead: boolean; hittable: boolean }): boolean {
  return a.team === 'hostile' && !a.dead && a.hittable && !inMercy(a);
}

export interface StaggerWatchPorts {
  events: EventsLike;
  actors: Pick<ActorsLike, 'get'>;
  /** Simulated seconds. */
  now(): number;
  /** The enemies service view of an actor (`svc('enemies')?.view?.(id)`); optional port. */
  enemyState?(id: ActorId): string | undefined;
}

/**
 * Whether an actor is "staggered" for Skullsplitter's double damage (and anything else that wants the same answer). Three signals:
 * an `actor.staggered` within the last 1.2 s (a break stagger lasts about that long and the event fires once), a poise bar at 0 (only
 * for actors with a poise bar, `maxPoise > 0`), or the AI state `stagger`. Entries clear on death, despawn, calm and load.
 */
export class StaggerWatch {
  private readonly at = new Map<ActorId, number>();
  private readonly offs: Array<() => void>;

  constructor(private readonly p: StaggerWatchPorts) {
    this.offs = [
      p.events.on('actor.staggered', (e) => void this.at.set(e.actorId, p.now())),
      p.events.on('actor.died', (e) => void this.at.delete(e.actorId)),
      p.events.on('actor.despawned', (e) => void this.at.delete(e.actorId)),
      p.events.on('ai.calm', (e) => void this.at.delete(e.actorId)),
      p.events.on('save.loaded', () => this.at.clear()),
    ];
  }

  isStaggered(id: ActorId, now: number = this.p.now()): boolean {
    const t = this.at.get(id);
    if (t !== undefined && now - t < STAGGER_WINDOW_SECONDS) return true;
    const a = this.p.actors.get(id) as (PoiseLike & { maxPoise?: number }) | undefined;
    if (a && typeof a.maxPoise === 'number' && a.maxPoise > 0 && typeof a.poise === 'number' && a.poise <= 0) return true;
    return this.p.enemyState?.(id) === 'stagger';
  }

  dispose(): void {
    this.at.clear();
    for (const off of this.offs.splice(0).reverse()) off();
  }
}

export interface SkullsplitterPorts {
  actors: ActorsLike;
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
  stagger: Pick<StaggerWatch, 'isStaggered'>;
  now(): number;
  /** The class is the Warden (a null class is not). */
  isWarden(): boolean;
  learned(): boolean;
  feet(): Vec3;
  facingYaw(): number;
  /** Why the chop cannot start right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  /** Plays the chop clip; false when the controller refuses it. */
  playClip(clip: string): boolean;
  /** The player was staggered, died or dodged: the chop ends early. */
  interrupted(): boolean;
  reportTrigger(skillId: string): void;
  /** `staggered` is a param of the effect (the crack fan). */
  fx?: { chop?(at: Vec3, yaw: number, staggered: boolean): void };
  skillId: string;
}

/**
 * Skullsplitter (Hewer 4): the 2H chop plays and, while its blade is hot, the nearest hostile within 2.6 m in a 90 degree front arc
 * takes 1.6x the weapon base with poise 40, doubled when the target is staggered. One hit per cast: the first tick of the window
 * that has a target lands it. Foes in a mercy state are skipped. A stagger, death or dodge ends the swing.
 */
export class Skullsplitter {
  private left = 0;
  private elapsed = 0;
  private landed = false;

  constructor(private readonly p: SkullsplitterPorts, private readonly playerId: () => ActorId) {}

  get chopping(): boolean {
    return this.left > 0;
  }

  /** The ability handler body. Ember and the cooldown belong to the abilities service, which charges them only on ok. */
  start(): Result {
    if (!this.p.isWarden()) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned()) return { ok: false, reason: 'not-learned' };
    if (this.left > 0) return { ok: false, reason: 'chopping' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.playClip(SKULLSPLITTER.clip)) return { ok: false, reason: 'busy' };
    this.left = SKULLSPLITTER.ticks;
    this.elapsed = 0;
    this.landed = false;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.left <= 0) return;
    if (this.p.interrupted()) return this.cancel();
    this.elapsed++;
    this.left--;
    if (!this.landed && this.elapsed >= SKULLSPLITTER.hitFromTick && this.elapsed <= SKULLSPLITTER.hitToTick) this.strike();
    if (this.left <= 0) this.cancel();
  }

  /** Ends the chop at once (respec, class change, load, dispose). */
  cancel(): void {
    this.left = 0;
    this.elapsed = 0;
    this.landed = false;
  }

  private strike(): void {
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const cosHalf = Math.cos(SKULLSPLITTER.halfAngle);
    let best: { id: ActorId; dx: number; dz: number; d: number } | null = null;
    for (const a of this.p.actors.all()) {
      if (!hittableHostile(a)) continue;
      const pos = a.worldPosition(SCRATCH);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > SKULLSPLITTER.reach) continue;
      // A foe on top of the player is in front of any facing.
      if (d > 1e-6 && (dx * fx + dz * fz) / d < cosHalf) continue;
      if (!best || d < best.d) best = { id: a.id, dx, dz, d };
    }
    if (!best) return;
    this.landed = true;
    const staggered = this.p.stagger.isStaggered(best.id, this.p.now());
    const amount = COMBAT.baseDamage * SKULLSPLITTER.damageFactor * (staggered ? SKULLSPLITTER.staggeredFactor : 1);
    this.p.damage.apply({
      attackerId: this.playerId(),
      targetId: best.id,
      amount,
      poise: SKULLSPLITTER.poise,
      kind: 'melee',
      attackId: SKULLSPLITTER.attackId,
      direction: new THREE.Vector3(best.d > 1e-6 ? best.dx / best.d : fx, 0, best.d > 1e-6 ? best.dz / best.d : fz),
    });
    this.p.fx?.chop?.(feet, yaw, staggered);
  }
}

export interface EarthrootPorts {
  events: EventsLike;
  actors: ActorsLike;
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
  now(): number;
  /** The class is the Warden (a null class is not). */
  isWarden(): boolean;
  learned(skillId: string): boolean;
  feet(): Vec3;
  /** Why the root cannot be planted right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  /** Locks the player's movement; returns the undo. */
  lockMove(): () => void;
  /** The controller's current action is the dodge (the rising edge ends the root). */
  dodging(): boolean;
  /** Starts the root strips for `seconds`; returns what stops them. */
  fx?(seconds: number): (() => void) | void;
  shockFx?(at: Vec3): void;
  reportTrigger(skillId: string): void;
  skillId: string;
}

/**
 * Earthroot (Stonehide 4): the Warden plants the axe for 5 s. Movement is locked (the dodge is not: see the plugin) and a dodge
 * ends the root at once. `modify` is the DamageResolver modifier: while rooted the poise of hits on the player is zeroed, so
 * there is no stagger or knockback (the 0.3 s flinch of CombatVerbs stays: it keys on the hit, not on poise). Each hostile hit
 * taken releases a shockwave on the hostiles within 3 m, at most once per 0.75 s.
 */
export class Earthroot {
  private until = -Infinity;
  private nextShockAt = -Infinity;
  private wasDodging = false;
  private unlock: (() => void) | null = null;
  private stopFx: (() => void) | null = null;
  private readonly offs: Array<() => void> = [];

  constructor(private readonly p: EarthrootPorts, private readonly playerId: () => ActorId) {
    this.offs.push(
      p.events.on('damage.dealt', (e) => this.onDamage(e)),
      p.events.on('actor.died', (e) => {
        if (e.actorId === this.playerId()) this.reset();
      }),
      p.events.on('save.loaded', () => this.reset()),
    );
  }

  get active(): boolean {
    return this.unlock !== null;
  }

  dispose(): void {
    this.reset();
    for (const off of this.offs.splice(0).reverse()) off();
  }

  /** The ability handler body. Ember and the cooldown belong to the abilities service. */
  start(): Result {
    if (!this.p.isWarden()) return { ok: false, reason: 'wrong-class' };
    if (!this.p.learned(this.p.skillId)) return { ok: false, reason: 'not-learned' };
    if (this.active) return { ok: false, reason: 'rooted' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    this.until = this.p.now() + EARTHROOT.seconds;
    this.nextShockAt = -Infinity;
    this.wasDodging = false;
    this.unlock = this.p.lockMove();
    this.stopFx = this.p.fx?.(EARTHROOT.seconds) || null;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (!this.active) return;
    const dodging = this.p.dodging();
    const edge = dodging && !this.wasDodging;
    this.wasDodging = dodging;
    if (edge || this.p.now() >= this.until || !this.p.learned(this.p.skillId)) this.reset();
  }

  /** Ends the root (expiry, dodge, respec, class change, load, death, dispose). */
  reset(): void {
    this.until = -Infinity;
    this.wasDodging = false;
    this.unlock?.();
    this.unlock = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  /** The DamageResolver modifier body (order -30, after the guard): no poise on hits to the player while rooted. */
  modify(req: { poise: number }, targetId: ActorId): void {
    if (!this.active || targetId !== this.playerId()) return;
    req.poise = 0;
  }

  private onDamage(e: { attackerId: ActorId | null; targetId: ActorId; kind: string; outcome: string }): void {
    if (!this.active || e.targetId !== this.playerId() || e.outcome !== 'hit' || e.kind === 'status' || !e.attackerId) return;
    if (this.p.actors.get(e.attackerId)?.team !== 'hostile') return;
    const now = this.p.now();
    if (now < this.nextShockAt) return;
    this.nextShockAt = now + EARTHROOT.shockIntervalSeconds;
    const feet = this.p.feet();
    const amount = COMBAT.baseDamage * EARTHROOT.shockDamageFactor;
    for (const a of this.p.actors.all()) {
      if (!hittableHostile(a)) continue;
      const pos = a.worldPosition(SCRATCH);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > EARTHROOT.shockRadius) continue;
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount,
        poise: EARTHROOT.shockPoise,
        kind: 'melee',
        attackId: EARTHROOT.attackId,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : 0, 0, d > 1e-6 ? dz / d : 1),
      });
    }
    this.p.shockFx?.(feet);
  }
}

export interface FrenziedHearthPorts {
  events: EventsLike;
  /** The live player actor: `maxHealth` already includes Burn and Scars, so it is read every time. */
  actor(): { health: number; maxHealth: number } & PoiseLike;
  /** Ticks of the fixed clock (the heal key when a hit has no swing id). */
  tick(): number;
  /** The class is the Warden (a null class is not). */
  isWarden(): boolean;
  learned(skillId: string): boolean;
  heal(id: ActorId, amount: number): unknown;
  /** Starts the vignette or steam; returns what stops it. */
  fx?(): (() => void) | void;
  skillId: string;
}

/**
 * Frenzied Hearth (Howlcaller 4, passive): strictly below 30% of the live max health the player cannot be staggered (`modify`, a
 * buffs-band modifier, zeroes the poise of incoming hits, and `tick` refills the poise bar through Actor.restorePoise) and each
 * melee hit the player lands heals 2% of the current max health, once per swing. Exactly 30% is not below. Not done from design
 * 11.5: the red vignette (no continuous screen-fx API) and disabling hit-stop on incoming hits (no hit-stop hook); only steam is drawn.
 */
export class FrenziedHearth {
  private stopFx: (() => void) | null = null;
  private fxOn = false;
  private readonly healed: string[] = [];
  private readonly offs: Array<() => void> = [];

  constructor(private readonly p: FrenziedHearthPorts, private readonly playerId: () => ActorId) {
    this.offs.push(
      p.events.on('damage.dealt', (e) => this.onDamage(e)),
      p.events.on('actor.died', (e) => {
        if (e.actorId === this.playerId()) this.reset();
      }),
      p.events.on('save.loaded', () => this.reset()),
    );
  }

  /** Learned, alive-ish and strictly under the threshold of the live max health. */
  get below(): boolean {
    if (!this.p.isWarden() || !this.p.learned(this.p.skillId)) return false;
    const a = this.p.actor();
    return a.maxHealth > 0 && a.health / a.maxHealth < FRENZIED_HEARTH.threshold;
  }

  dispose(): void {
    this.reset();
    for (const off of this.offs.splice(0).reverse()) off();
  }

  reset(): void {
    this.fxOn = false;
    this.stopFx?.();
    this.stopFx = null;
    this.healed.length = 0;
  }

  /** Once per fixed tick: refills the poise bar while below the threshold and keeps the effect in step. */
  tick(): void {
    const below = this.below && this.p.actor().health > 0;
    if (below) {
      this.p.actor().restorePoise?.();
      if (!this.fxOn) {
        this.fxOn = true;
        this.stopFx = this.p.fx?.() || null;
      }
    } else if (this.fxOn) this.reset();
  }

  /** The DamageResolver modifier body (order 10, buffs band): no poise on hits to the player while below the threshold. */
  modify(req: { poise: number }, targetId: ActorId): void {
    if (targetId !== this.playerId() || !this.below) return;
    req.poise = 0;
  }

  private onDamage(e: { attackerId: ActorId | null; kind: string; outcome: string; dealt: number; swingId?: number; attackId?: string }): void {
    if (e.attackerId !== this.playerId() || e.kind !== 'melee' || e.outcome !== 'hit' || !(e.dealt > 0)) return;
    if (!this.below) return;
    const key = e.swingId !== undefined ? `s${e.swingId}` : `${e.attackId ?? ''}@${this.p.tick()}`;
    if (this.healed.includes(key)) return;
    this.healed.push(key);
    if (this.healed.length > 32) this.healed.shift();
    this.p.heal(this.playerId(), this.p.actor().maxHealth * FRENZIED_HEARTH.healFraction);
  }
}
