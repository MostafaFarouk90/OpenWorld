import * as THREE from 'three';
import { COMBAT } from '../../config/constants';
import type { StatusSpec } from '../../actors/status';
import type { ActorId, ActorsLike, EventsLike, Vec3 } from '../../vfx/ports';
import { BLOOD_CHANT, GRIT_TEETH, WHIRLING_HEW } from './tuning';

type Result = { ok: true } | { ok: false; reason: string };
type MercyLike = { mercyState?: () => string };

/** Whether a foe is yielding, calming, leaving or staggered for mercy; a throwing reader counts as none (as the resolver does). */
function inMercy(a: unknown): boolean {
  try {
    const s = (a as MercyLike).mercyState?.() ?? 'none';
    return s !== 'none';
  } catch {
    return false;
  }
}

export interface WhirlingHewPorts {
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
  feet(): Vec3;
  /** Why the spin cannot start right now (dead, staggered, busy), or null. */
  blockedReason(): string | null;
  /** Plays the spin clip; false when the controller refuses it. */
  playClip(clip: string): boolean;
  /** The player was staggered, died or dodged: the spin ends early. */
  interrupted(): boolean;
  reportTrigger(skillId: string): void;
  fx?: { spin?(at: Vec3): void };
  skillId: string;
}

/**
 * The Warden's spin (Hewer 3): the spin clip plays and, while its blade is hot, every hostile within 2.6 m of the player takes
 * 1.2x the weapon base once, with poise equal to the damage. Foes in a mercy state are skipped (a hit from the player there would
 * revoke mercy), and so are dead or unhittable ones. A stagger, death or dodge ends the swing.
 */
export class WhirlingHew {
  private left = 0;
  private elapsed = 0;
  private hit = new Set<ActorId>();

  constructor(private readonly p: WhirlingHewPorts, private readonly playerId: () => ActorId) {}

  get spinning(): boolean {
    return this.left > 0;
  }

  /** The ability handler body. Ember and the cooldown belong to the abilities service, which charges them only on ok. */
  start(): Result {
    if (this.left > 0) return { ok: false, reason: 'spinning' };
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    if (!this.p.playClip(WHIRLING_HEW.clip)) return { ok: false, reason: 'busy' };
    this.left = WHIRLING_HEW.ticks;
    this.elapsed = 0;
    this.hit.clear();
    this.p.fx?.spin?.(this.p.feet());
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick after the verbs have run. */
  tick(): void {
    if (this.left <= 0) return;
    if (this.p.interrupted()) return this.cancel();
    this.elapsed++;
    this.left--;
    if (this.elapsed >= WHIRLING_HEW.hitFromTick && this.elapsed <= WHIRLING_HEW.hitToTick) this.sweep();
    if (this.left <= 0) this.cancel();
  }

  /** Ends the spin at once (respec, class change, load, dispose). */
  cancel(): void {
    this.left = 0;
    this.elapsed = 0;
    this.hit.clear();
  }

  private sweep(): void {
    const feet = this.p.feet();
    const amount = COMBAT.baseDamage * WHIRLING_HEW.damageFactor;
    for (const a of this.p.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.hittable || this.hit.has(a.id)) continue;
      if (inMercy(a)) continue;
      const pos = a.worldPosition(SCRATCH);
      const dx = pos.x - feet.x;
      const dz = pos.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d > WHIRLING_HEW.reach) continue;
      this.hit.add(a.id);
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: a.id,
        amount,
        poise: amount,
        kind: 'melee',
        attackId: WHIRLING_HEW.attackId,
        direction: new THREE.Vector3(d > 1e-6 ? dx / d : 0, 0, d > 1e-6 ? dz / d : 1),
      });
    }
  }
}

const SCRATCH = new THREE.Vector3();

export interface GritTeethPorts {
  events: EventsLike;
  /** Simulated seconds. */
  now(): number;
  learned(skillId: string): boolean;
  /** The combat verbs' stagger flag; its rising edge counts as a stagger too (a heavy hit staggers without a poise break). */
  staggered(): boolean;
  /** Starts the effect for `seconds`; returns what stops it. */
  fx?(seconds: number): (() => void) | void;
  skillId: string;
}

/**
 * The Warden's stagger reprieve (Stonehide 3): a stagger of the player opens a 4 s window in which the damage the player takes is
 * halved. A window never extends or stacks, and the next one cannot open until 10 s after the last one began. The breaking hit
 * itself is not halved (the stagger event follows its damage). `modify` is the DamageResolver modifier body.
 */
export class GritTeeth {
  private until = -Infinity;
  private nextAt = -Infinity;
  private wasStaggered = false;
  private stopFx: (() => void) | null = null;
  private readonly offs: Array<() => void> = [];

  constructor(private readonly p: GritTeethPorts, private readonly playerId: () => ActorId) {
    this.offs.push(
      p.events.on('actor.staggered', (e) => {
        if (e.actorId === this.playerId()) this.trigger();
      }),
      p.events.on('actor.died', (e) => {
        if (e.actorId === this.playerId()) this.reset();
      }),
      p.events.on('save.loaded', () => this.reset()),
    );
  }

  get active(): boolean {
    return this.p.now() < this.until;
  }

  dispose(): void {
    this.reset();
    for (const off of this.offs.splice(0).reverse()) off();
  }

  /** Forgets the window and the internal cooldown (a load, a death, a respec, a class change). */
  reset(): void {
    const was = this.until > -Infinity;
    this.until = -Infinity;
    this.nextAt = -Infinity;
    this.wasStaggered = false;
    this.stopFx?.();
    this.stopFx = null;
    if (was) this.p.events.emit('buff.removed', { id: GRIT_TEETH.buffId });
  }

  /** Once per fixed tick. */
  tick(): void {
    if (this.until > -Infinity && this.p.now() >= this.until) this.endWindow();
    if (!this.p.learned(this.p.skillId)) {
      if (this.until > -Infinity || this.nextAt > -Infinity) this.reset();
      this.wasStaggered = false;
      return;
    }
    const s = this.p.staggered();
    if (s && !this.wasStaggered) this.trigger();
    this.wasStaggered = s;
  }

  private trigger(): void {
    if (!this.p.learned(this.p.skillId)) return;
    const now = this.p.now();
    if (now < this.until || now < this.nextAt) return;
    this.until = now + GRIT_TEETH.seconds;
    this.nextAt = now + GRIT_TEETH.cooldownSeconds;
    this.p.events.emit('buff.applied', { id: GRIT_TEETH.buffId, nameKey: GRIT_TEETH.nameKey, seconds: GRIT_TEETH.seconds });
    this.stopFx = this.p.fx?.(GRIT_TEETH.seconds) || null;
  }

  private endWindow(): void {
    this.until = -Infinity;
    this.stopFx?.();
    this.stopFx = null;
    this.p.events.emit('buff.removed', { id: GRIT_TEETH.buffId });
  }

  /** The damage modifier: whatever the player is about to take in the window is halved (a block's chip damage too; parries and immunity are zero anyway). */
  modify(req: { amount: number; kind: string }, targetId: ActorId): void {
    if (targetId !== this.playerId() || req.kind === 'script' || !this.active) return;
    req.amount *= GRIT_TEETH.factor;
  }
}

export interface BloodChantPorts {
  events: EventsLike;
  actors: ActorsLike;
  now(): number;
  learned(skillId: string): boolean;
  status(): { apply(actorId: ActorId, spec: StatusSpec): boolean; list?(actorId: ActorId): ReadonlyArray<{ id: string }> } | undefined;
  /** Why the chant cannot be raised right now (dead, staggered), or null. */
  blockedReason(): string | null;
  /** Starts the rune effect for `seconds`; returns what stops it. */
  fx?(seconds: number): (() => void) | void;
  reportTrigger(skillId: string): void;
  /** Id of Deep Wound's status: a target already bleeding from it takes no second bleed. */
  deepWoundId: string;
  skillId: string;
  warn(message: string): void;
}

/**
 * The Warden's war song (Howlcaller 3): for 20 s every hit that lands on a hostile from an ally-team attacker (the companions and
 * the familiar, never the player) leaves a 2 dps, 5 s bleed under its own status id. A target already bleeding from Deep Wound is
 * left alone, so the two never stack. An ally's hit on a foe in a mercy state is dropped before `damage.dealt`, so none arrives here.
 */
export class BloodChant {
  private until = -Infinity;
  private stopFx: (() => void) | null = null;
  private warned = false;
  private readonly offs: Array<() => void> = [];

  constructor(private readonly p: BloodChantPorts, private readonly playerId: () => ActorId) {
    this.offs.push(
      p.events.on('damage.dealt', (e) => this.onDamage(e)),
      p.events.on('actor.died', (e) => {
        if (e.actorId === this.playerId()) this.reset();
      }),
      p.events.on('save.loaded', () => this.reset()),
    );
  }

  get active(): boolean {
    return this.p.now() < this.until;
  }

  dispose(): void {
    this.reset();
    for (const off of this.offs.splice(0).reverse()) off();
  }

  /** The ability handler body. Ember and the cooldown belong to the abilities service. A second chant while one runs renews it. */
  start(): Result {
    const blocked = this.p.blockedReason();
    if (blocked) return { ok: false, reason: blocked };
    const now = this.p.now();
    this.stopFx?.();
    this.until = now + BLOOD_CHANT.seconds;
    this.p.events.emit('buff.applied', { id: BLOOD_CHANT.buffId, nameKey: BLOOD_CHANT.nameKey, seconds: BLOOD_CHANT.seconds });
    this.stopFx = this.p.fx?.(BLOOD_CHANT.seconds) || null;
    this.p.reportTrigger(this.p.skillId);
    return { ok: true };
  }

  /** Once per fixed tick. */
  tick(): void {
    if (this.until > -Infinity && (this.p.now() >= this.until || !this.p.learned(this.p.skillId))) this.reset();
  }

  /** Ends the chant (expiry, respec, class change, load, death, dispose). */
  reset(): void {
    const was = this.until > -Infinity;
    this.until = -Infinity;
    this.stopFx?.();
    this.stopFx = null;
    if (was) this.p.events.emit('buff.removed', { id: BLOOD_CHANT.buffId });
  }

  private onDamage(e: { attackerId: ActorId | null; targetId: ActorId; kind: string; outcome: string }): void {
    if (!this.active || e.outcome !== 'hit' || e.kind === 'status' || !e.attackerId) return;
    const attacker = this.p.actors.get(e.attackerId);
    const target = this.p.actors.get(e.targetId);
    if (attacker?.team !== 'ally' || !target || target.team !== 'hostile' || target.dead) return;
    const status = this.p.status();
    if (!status) {
      if (!this.warned) {
        this.warned = true;
        this.p.warn('warden: the status service is missing, so Blood Chant applies nothing');
      }
      return;
    }
    if (status.list?.(target.id).some((s) => s.id === this.p.deepWoundId)) return;
    const b = BLOOD_CHANT.bleed;
    status.apply(target.id, { id: b.id, kind: 'bleed', dps: b.dps, seconds: b.seconds, sourceId: attacker.id });
  }
}
