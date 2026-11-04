// Warden tier 5 capstones (K11 PR 3): Wyrmbreaker, Mountain Unmoved, Voice of the Mountain. Ports-based so the unit tests need no
// game; `capstones.plugin.ts` wires them. Time is the fixed clock's seconds, and nothing here allocates per tick except a cast.
import * as THREE from 'three';
import type { DamageRequest, DamageResult } from '../../actors/DamageResolver';
import type { StatusSpec } from '../../actors/status';
import { COMBAT } from '../../config/constants';
import type { AbilityHandlerResult } from '../../hud/ports';
import type { ActorId, ActorsLike, EventsLike, Vec3 } from '../../vfx/ports';
import { actorsInRadius } from '../../spells/areas';
import { inFissure } from './surge';
import { MOUNTAIN_UNMOVED, VOICE_OF_THE_MOUNTAIN, WYRMBREAKER } from './tuning';

type Stop = () => void;
const refuse = (reason: string): AbilityHandlerResult => ({ ok: false, reason });
const SCRATCH = new THREE.Vector3();

/** Whether a foe is yielding, calming, leaving or staggered for mercy; a throwing reader counts as none (as the resolver does). */
function inMercy(a: unknown): boolean {
  try {
    return ((a as { mercyState?: () => string }).mercyState?.() ?? 'none') !== 'none';
  } catch {
    return false;
  }
}

/** A hostile a capstone hit may land on: alive, hittable and not in a mercy state (a hit from the player would revoke mercy). */
function hittableHostile(a: { team: string; dead: boolean; hittable: boolean }): boolean {
  return a.team === 'hostile' && !a.dead && a.hittable && !inMercy(a);
}

interface GatePorts {
  /** The class is the Warden (a null class is not). */
  isWarden(): boolean;
  learned(): boolean;
  /** Why the player cannot act right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
}

function gate(p: GatePorts): AbilityHandlerResult | null {
  if (!p.isWarden()) return refuse('wrong-class');
  if (!p.learned()) return refuse('not-learned');
  const blocked = p.blockedReason();
  return blocked ? refuse(blocked) : null;
}

// ---- Wyrmbreaker ---------------------------------------------------------------------------------------------------------------

/** Who is "cracked" and until when. Shared by Wyrmbreaker (marks) and the defender-band modifier (reads). */
export class CrackedMarks {
  private readonly until = new Map<ActorId, number>();
  private readonly offs: Array<() => void>;

  constructor(private readonly p: { events: EventsLike; now(): number }) {
    this.offs = [
      p.events.on('actor.died', (e) => void this.until.delete(e.actorId)),
      p.events.on('actor.despawned', (e) => void this.until.delete(e.actorId)),
      p.events.on('save.loaded', () => this.until.clear()),
    ];
  }

  mark(id: ActorId): void {
    this.until.set(id, this.p.now() + WYRMBREAKER.crackSeconds);
  }

  isCracked(id: ActorId, now: number = this.p.now()): boolean {
    const t = this.until.get(id);
    return t !== undefined && now < t;
  }

  get size(): number {
    return this.until.size;
  }

  /** Drops expired marks (a few times a second is enough). */
  prune(now: number = this.p.now()): void {
    for (const [id, t] of this.until) if (now >= t) this.until.delete(id);
  }

  clear(): void {
    this.until.clear();
  }

  /**
   * The DamageResolver modifier body (order -55, defender band, ahead of the guard at -50): +25% damage on a cracked target from
   * every source. Poise is left alone. The player is never marked, so a player target is never touched.
   */
  modify(req: { amount: number }, targetId: ActorId): void {
    if (this.isCracked(targetId)) req.amount *= WYRMBREAKER.crackFactor;
  }

  dispose(): void {
    this.until.clear();
    for (const off of this.offs.splice(0).reverse()) off();
  }
}

export interface WyrmbreakerPorts extends GatePorts {
  actors: ActorsLike;
  damage: { apply(req: DamageRequest): DamageResult | null };
  marks: Pick<CrackedMarks, 'mark'>;
  feet(): Vec3;
  facingYaw(): number;
  /** Plays the chop clip; false when the controller refuses it. */
  playClip(clip: string): boolean;
  /**
   * The cast was broken. During the charge a flinch is not a break (it is ridden out); another action of the player (`verbs.busy`) is; during the
   * chop it is the Skullsplitter test: dead, staggered, or any non-null controller action (a flinch replaced the one-shot).
   */
  interrupted(phase: 'charge' | 'chop'): boolean;
  /** The player is in a flinch (a light hit). The charge rides it out; the chop waits for it to end, at most `flinchGraceTicks`. */
  flinching?(): boolean;
  /** Locks the player's movement for the charge; returns the undo. */
  lockMove(): Stop;
  reportTrigger(skillId: string): void;
  fx?: {
    /** The charge glow for `seconds`; returns what stops it early. */
    charge?(seconds: number): Stop | void;
    /** The fissure at the feet; `hits` is how many foes it struck. */
    fissure?(at: Vec3, yaw: number, hits: number): void;
  };
  skillId: string;
}

/**
 * Wyrmbreaker (Hewer 5). The press starts a 0.8 s charge (glow, movement locked), then the chop clip plays and, on its first hot
 * tick, every hostile in the 12 m by 4 m fissure ahead takes 2.5x the weapon base with poise 60, once per cast, and is cracked for
 * 8 s when the hit landed. Foes in a mercy state are skipped; bosses take it all (damage, poise and the crack: no stun, root or kill
 * is involved). Interrupting the charge refunds nothing: the Ember is spent on the press (the handler returns ok there).
 */
export class Wyrmbreaker {
  private phase: 'idle' | 'charge' | 'chop' = 'idle';
  private elapsed = 0;
  private unlock: Stop | null = null;
  private stopFx: Stop | null = null;

  constructor(private readonly p: WyrmbreakerPorts, private readonly playerId: () => ActorId) {}

  get casting(): boolean {
    return this.phase !== 'idle';
  }

  get charging(): boolean {
    return this.phase === 'charge';
  }

  start(): AbilityHandlerResult {
    const refused = gate(this.p);
    if (refused) return refused;
    if (this.phase !== 'idle') return refuse('casting');
    this.phase = 'charge';
    this.elapsed = 0;
    this.unlock = this.p.lockMove();
    this.stopFx = this.p.fx?.charge?.(WYRMBREAKER.chargeTicks / 60) || null;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.phase === 'idle') return;
    if (!this.p.learned() || this.p.interrupted(this.phase)) return this.cancel();
    this.elapsed++;
    if (this.phase === 'charge') {
      if (this.elapsed < WYRMBREAKER.chargeTicks) return;
      if (this.p.flinching?.() === true) {
        if (this.elapsed < WYRMBREAKER.chargeTicks + WYRMBREAKER.flinchGraceTicks) return;
        return this.cancel();
      }
      this.releaseCharge();
      // The chop clip is refused when something else holds the controller: the cast ends with the Ember spent.
      if (!this.p.playClip(WYRMBREAKER.clip)) return this.cancel();
      this.phase = 'chop';
      this.elapsed = 0;
      return;
    }
    if (this.elapsed === WYRMBREAKER.hitTick) this.strike();
    if (this.elapsed >= WYRMBREAKER.chopTicks) this.cancel();
  }

  /** Ends the cast at once (flinch, respec, class change, load, death, dispose). */
  cancel(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.releaseCharge();
  }

  private releaseCharge(): void {
    this.unlock?.();
    this.unlock = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  private strike(): void {
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const amount = COMBAT.baseDamage * WYRMBREAKER.damageFactor;
    let hits = 0;
    // A snapshot: a hit can kill or change the actor set.
    for (const a of [...this.p.actors.all()]) {
      if (!hittableHostile(a)) continue;
      const pos = a.worldPosition(SCRATCH);
      if (!inFissure(feet, yaw, pos, WYRMBREAKER.length, WYRMBREAKER.width)) continue;
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      const r = this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount,
        poise: WYRMBREAKER.poise,
        kind: 'melee',
        attackId: WYRMBREAKER.attackId,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : fx, 0, d > 1e-6 ? dz / d : fz),
      });
      if (r && r.outcome === 'hit') {
        hits++;
        this.p.marks.mark(a.id);
      }
    }
    this.p.fx?.fissure?.(feet, yaw, hits);
  }
}

// ---- Mountain Unmoved ----------------------------------------------------------------------------------------------------------

export interface MountainUnmovedPorts extends GatePorts {
  now(): number;
  /** `combatVerbs.addKnockbackFilter`, when the service has it; returns the undo. */
  addKnockbackFilter?(id: string, keep: () => boolean): Stop;
  /** The stone skin for `seconds`; returns what stops it early. */
  fx?(seconds: number): Stop | void;
  reportTrigger(skillId: string): void;
  skillId: string;
}

/**
 * Mountain Unmoved (Stonehide 5): for 10 s the poise of every hit on the player is zeroed (`modify`, buffs band) and every knockback
 * is cancelled by a filter that exists only while the skill is up. The flinch stays and pulls stay. Re-pressing while up is refused.
 */
export class MountainUnmoved {
  private until = -Infinity;
  private active_ = false;
  private dropFilter: Stop | null = null;
  private stopFx: Stop | null = null;

  constructor(private readonly p: MountainUnmovedPorts, private readonly playerId: () => ActorId) {}

  get active(): boolean {
    return this.active_;
  }

  start(): AbilityHandlerResult {
    const refused = gate(this.p);
    if (refused) return refused;
    if (this.active_) return refuse('active');
    this.active_ = true;
    this.until = this.p.now() + MOUNTAIN_UNMOVED.seconds;
    this.dropFilter = this.p.addKnockbackFilter?.(MOUNTAIN_UNMOVED.filterId, () => false) ?? null;
    this.stopFx = this.p.fx?.(MOUNTAIN_UNMOVED.seconds) || null;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick. */
  tick(): void {
    if (!this.active_) return;
    if (this.p.now() >= this.until || !this.p.learned()) this.reset();
  }

  /** Ends the skill (expiry, respec, class change, load, death, dispose). */
  reset(): void {
    this.active_ = false;
    this.until = -Infinity;
    this.dropFilter?.();
    this.dropFilter = null;
    this.stopFx?.();
    this.stopFx = null;
  }

  /** The DamageResolver modifier body (order 20, buffs band): no poise on hits to the player while up. */
  modify(req: { poise: number }, targetId: ActorId): void {
    // Expiry is checked by time here too, so it never acts a tick after the 10 s.
    if (this.active_ && this.p.now() < this.until && targetId === this.playerId()) req.poise = 0;
  }
}

// ---- Voice of the Mountain -----------------------------------------------------------------------------------------------------

export interface VoicePorts extends GatePorts {
  actors: ActorsLike;
  damage: { apply(req: DamageRequest): DamageResult | null };
  /** `status.apply`. */
  stun(targetId: ActorId, spec: StatusSpec): boolean;
  /** The boss predicate: a registered boss actor (`bosses.active()` with `bosses.state(id).actorId`). */
  isBoss(actorId: ActorId): boolean;
  feet(): Vec3;
  reportTrigger(skillId: string): void;
  fx?: { howl?(at: Vec3): void; stunned?(foeId: ActorId, seconds: number): void };
  skillId: string;
}

/**
 * Voice of the Mountain (Howlcaller 5). Every live, hittable hostile within 12 m (inclusive) that is not in a mercy state takes a
 * 0-damage unblockable hit with poise 40 and, when that hit landed and the foe is not a boss and did not enter a mercy state from
 * it, a 3 s stun. It is refused 'no-target' (nothing spent) when there is no such foe in range.
 */
export class VoiceOfTheMountain {
  constructor(private readonly p: VoicePorts, private readonly playerId: () => ActorId) {}

  cast(): AbilityHandlerResult {
    const refused = gate(this.p);
    if (refused) return refused;
    const me = this.playerId();
    const feet = this.p.feet();
    const targets = actorsInRadius(this.p.actors, feet, VOICE_OF_THE_MOUNTAIN.radius, { team: 'hostile', alive: true }).filter(
      (h) => hittableHostile(h.actor),
    );
    if (targets.length === 0) return refuse('no-target');
    for (const h of targets) {
      const a = h.actor;
      const dx = h.position.x - feet.x;
      const dz = h.position.z - feet.z;
      const d = Math.hypot(dx, dz);
      const r = this.p.damage.apply({
        attackerId: me,
        targetId: a.id,
        amount: 0,
        poise: VOICE_OF_THE_MOUNTAIN.poise,
        kind: 'melee',
        attackId: VOICE_OF_THE_MOUNTAIN.attackId,
        unblockable: true,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : 0, 0, d > 1e-6 ? dz / d : 1),
      });
      if (!r || r.outcome !== 'hit' || this.p.isBoss(a.id) || a.dead) continue;
      // Re-read: the poise hit may have put a mercy-on-stagger foe into a mercy state, and a yielding foe is never controlled.
      const now = this.p.actors.get(a.id);
      if (!now || now.dead || inMercy(now)) continue;
      if (this.p.stun(a.id, { id: VOICE_OF_THE_MOUNTAIN.stunId, kind: 'stun', seconds: VOICE_OF_THE_MOUNTAIN.stunSeconds, sourceId: me })) {
        this.p.fx?.stunned?.(a.id, VOICE_OF_THE_MOUNTAIN.stunSeconds);
      }
    }
    this.p.fx?.howl?.(feet);
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }
}
