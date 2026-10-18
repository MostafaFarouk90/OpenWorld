import type * as THREE from 'three';
import type { GameEvents } from '../core/events';
import type { Actor, ActorId } from './Actor';
import type { ActorRegistry } from './ActorRegistry';
import type { StatusKind } from './status';
import { canDamage } from './teams';

export interface DamageRequest {
  attackerId: ActorId | null;
  targetId: ActorId;
  /** Health damage before modifiers; >= 0 and finite (0 is a poise-only hit). */
  amount: number;
  /** Poise damage before modifiers; defaults to `amount`. */
  poise?: number;
  /** v0.5 `'status'`: a bleed or ignite tick (actors-and-damage.md section 10); poise 0, unblockable, not dodgeable. */
  kind: 'melee' | 'spell' | 'fall' | 'script' | 'status';
  /** `kind: 'status'` only: the status entry's id and kind. */
  statusId?: string;
  statusKind?: StatusKind;
  bone?: string;
  point?: THREE.Vector3;
  normal?: THREE.Vector3;
  attackId?: string;
  swingId?: number;
  /** Unit, horizontal, attacker root to target root (directional block). */
  direction?: THREE.Vector3;
  /**
   * Cannot be blocked or parried (red telegraphs): a modifier that sets 'blocked' or 'parried' is undone.
   * Set by the request author or an attacker-side modifier (order band -200..-101). I-frames still apply.
   */
  unblockable?: boolean;
  /**
   * v0.5: `false` means a timed block is only a block (scripted boss hits with no `attack.window`):
   * no `'parried'` outcome and no stagger on the attacker. Omitted means parryable.
   */
  parryable?: false;
}

/** Modifier order bands (contracts/actors-and-damage.md section 4). */
export const MODIFIER_BANDS = {
  /** Attacker stats: weapon damage, level scaling, Burn bonuses (threads 2, 5, 7). */
  attacker: [-200, -101],
  /** Defender verbs: block, parry (thread 1). */
  defender: [-100, -1],
  /** Buffs and armour. */
  buffs: [0, 99],
} as const;

export type DamageOutcome = 'hit' | 'blocked' | 'parried' | 'immune';

/** The request as modifiers see and change it. */
export type ModifiableRequest = DamageRequest & { poise: number; outcome: DamageOutcome };

export interface DamageResult extends DamageRequest {
  poise: number;
  outcome: DamageOutcome;
  dealt: number;
  poiseDealt: number;
  healthAfter: number;
  killed: boolean;
  saved: boolean;
  staggered: boolean;
}

export type DamageModifier = (req: ModifiableRequest, target: Actor, attacker: Actor | null) => void;
/** Return true to prevent the death; the handler should leave the target's health above 0. */
export type LethalHandler = (target: Actor, result: Readonly<DamageResult>) => boolean;

interface Ordered<F> {
  id: string;
  fn: F;
  order: number;
  seq: number;
}

function finiteOrZero(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The damage pipeline (contracts/actors-and-damage.md section 4): validate, team rule, modifiers,
 * clamp, lethal handlers, then all of one hit's events as one batch.
 */
export class DamageResolver {
  private readonly modifiers: Ordered<DamageModifier>[] = [];
  private readonly lethal: Ordered<LethalHandler>[] = [];
  private seq = 0;
  /** How many hits are being resolved right now (a modifier may apply another). */
  private depth = 0;
  /** Event emitters of hits nested inside the outermost hit; they go out after its own events. */
  private readonly nested: (() => void)[] = [];
  private readonly warnedUnblockable = new Set<string>();

  constructor(
    private readonly actors: ActorRegistry,
    private readonly events: GameEvents,
    private readonly warn: (message: string, err?: unknown) => void = (m, e) => console.warn(m, e ?? ''),
  ) {}

  addModifier(id: string, fn: DamageModifier, order = 0): () => void {
    return this.insert(this.modifiers, id, fn, order, 'modifier');
  }

  addLethalHandler(id: string, fn: LethalHandler, order = 0): () => void {
    return this.insert(this.lethal, id, fn, order, 'lethal handler');
  }

  apply(input: DamageRequest): DamageResult | null {
    return this.resolve(input, input.attackerId, false);
  }

  private resolve(input: DamageRequest, killerId: ActorId | null, raw: boolean): DamageResult | null {
    this.depth++;
    try {
      return this.resolveOne(input, killerId, raw);
    } finally {
      this.depth--;
      // An outermost hit that was dropped still releases what its modifiers applied.
      if (this.depth === 0 && this.nested.length > 0) {
        this.events.batch(() => {
          for (const emit of this.nested.splice(0)) emit();
        });
      }
    }
  }

  private resolveOne(input: DamageRequest, killerId: ActorId | null, raw: boolean): DamageResult | null {
    const target = this.actors.get(input.targetId);
    const poiseIn = input.poise ?? input.amount;
    if (!target || target.dead) return null;
    if (!Number.isFinite(input.amount) || input.amount < 0 || !Number.isFinite(poiseIn) || poiseIn < 0) {
      this.warn(`DamageResolver: invalid damage ${input.amount}/${poiseIn} on "${input.targetId}"`);
      return null;
    }
    const attacker = input.attackerId ? this.actors.get(input.attackerId) ?? null : null;
    if (!target.hittable && !raw) return null;
    if (attacker && !canDamage(attacker.team, target.team)) return null;

    const req: ModifiableRequest = { ...input, poise: poiseIn, outcome: target.invulnerable && !raw ? 'immune' : 'hit' };
    // `raw` (scripted kills) skips i-frames and modifiers such as block.
    for (const m of raw ? [] : this.modifiers.slice()) {
      const before = { amount: req.amount, poise: req.poise, outcome: req.outcome };
      try {
        m.fn(req, target, attacker);
      } catch (err) {
        this.warn(`DamageResolver: modifier "${m.id}" failed`, err);
      }
      if (req.unblockable && (req.outcome === 'blocked' || req.outcome === 'parried') && before.outcome !== req.outcome) {
        Object.assign(req, before);
        if (!this.warnedUnblockable.has(m.id)) {
          this.warnedUnblockable.add(m.id);
          this.warn(`DamageResolver: modifier "${m.id}" blocked or parried an unblockable hit; undone`);
        }
      }
    }
    // A modifier (or something it called) may have killed or removed the target.
    if (target.dead || this.actors.get(target.id) !== target) return null;

    const zero = req.outcome === 'immune' || req.outcome === 'parried';
    const dealtWanted = zero ? 0 : finiteOrZero(req.amount);
    const poiseWanted = zero ? 0 : finiteOrZero(req.poise);

    const before = target.health;
    const dealt = Math.min(before, dealtWanted);
    target.health = before - dealt;
    let killed = false;
    let saved = false;
    let savedBy = '';
    if (target.immortal) {
      target.health = target.maxHealth; // training dummies take every hit and stay full
    } else if (target.health <= 0 && dealtWanted > 0) {
      target.health = 0;
      const partial: DamageResult = this.result(req, dealt, 0, target, false, false, false);
      for (const h of this.lethal.slice()) {
        let prevented = false;
        try {
          prevented = h.fn(target, partial) === true;
        } catch (err) {
          this.warn(`DamageResolver: lethal handler "${h.id}" failed`, err);
        }
        if (prevented) {
          saved = true;
          savedBy = h.id;
          break;
        }
      }
      if (saved) {
        if (!(target.health > 0)) target.health = Math.min(1, target.maxHealth);
      } else {
        killed = true;
        target._dead = true;
      }
    }
    const poiseBefore = target.poise;
    const poiseDealt = Math.min(poiseBefore, poiseWanted);
    target.poise = poiseBefore - poiseDealt;
    const staggered = poiseBefore > 0 && target.poise <= 0 && target.maxPoise > 0 && !killed;

    const result = this.result(req, dealt, poiseDealt, target, killed, saved, staggered);
    const emitOwn = () => {
      this.events.emit('damage.dealt', result);
      if (saved) this.events.emit('actor.saved', { actorId: target.id, handlerId: savedBy, request: input });
      if (staggered) this.events.emit('actor.staggered', { actorId: target.id, byId: input.attackerId });
      if (killed) this.diedEvent(target, killerId);
    };
    if (this.depth > 1) {
      this.nested.push(emitOwn); // inside another hit: delivered after its events
    } else {
      // One batch: this hit's events, then those of hits applied from inside its modifiers.
      this.events.batch(() => {
        emitOwn();
        for (const emit of this.nested.splice(0)) emit();
      });
    }
    return result;
  }

  /** Poise damage only: emits actor.staggered if poise breaks, never damage.dealt. */
  stagger(id: ActorId, byId: ActorId | null, poise: number): boolean {
    const target = this.actors.get(id);
    if (!target || target.dead || !target.hittable || target.maxPoise <= 0) return false;
    if (!Number.isFinite(poise) || poise <= 0) return false;
    if (target.poise <= 0) return false;
    target.poise = Math.max(0, target.poise - poise);
    if (target.poise > 0) return false;
    const emit = () => this.events.emit('actor.staggered', { actorId: id, byId });
    // From a modifier (parry): after the hit being resolved, like a nested apply.
    if (this.depth > 0) this.nested.push(emit);
    else emit();
    return true;
  }

  /** Health added; 0 for dead or unknown actors and for amounts <= 0 or not finite. */
  heal(id: ActorId, amount: number): number {
    const a = this.actors.get(id);
    if (!a || a.dead || !Number.isFinite(amount) || amount <= 0) return 0;
    const before = a.health;
    a.health = Math.min(a.maxHealth, a.health + amount);
    return a.health - before;
  }

  /** Brings a dead actor back with `healthFraction` (0, 1] of max health. */
  revive(id: ActorId, healthFraction: number, reason: 'respawn' | 'script'): boolean {
    const a = this.actors.get(id);
    if (!a || !a.dead) return false;
    if (!Number.isFinite(healthFraction) || healthFraction <= 0 || healthFraction > 1) {
      this.warn(`DamageResolver: revive fraction ${healthFraction} outside (0, 1]`);
      return false;
    }
    a._dead = false;
    a.health = Math.max(1e-6, a.maxHealth * healthFraction);
    a.poise = a.maxPoise;
    this.events.emit('actor.revived', { actorId: id, reason, health: a.health });
    return true;
  }

  /** Scripted death (a fall into a ditch); ignores i-frames, modifiers and `hittable`. Lethal handlers may still prevent it. */
  kill(id: ActorId, killerId: ActorId | null = null): void {
    const a = this.actors.get(id);
    if (!a || a.dead || a.immortal) return;
    // A null attacker bypasses the team rule; the killer is still reported in actor.died.
    this.resolve({ attackerId: null, targetId: id, amount: a.health + a.maxHealth, poise: 0, kind: 'script' }, killerId, true);
  }

  private diedEvent(target: Actor, killerId: ActorId | null): void {
    this.events.emit('actor.died', {
      actorId: target.id,
      killerId,
      kind: target.kind,
      team: target.team,
      level: target.level,
      spawnTag: target.spawnTag,
    });
  }

  private result(
    req: ModifiableRequest,
    dealt: number,
    poiseDealt: number,
    target: Actor,
    killed: boolean,
    saved: boolean,
    staggered: boolean,
  ): DamageResult {
    return { ...req, dealt, poiseDealt, healthAfter: target.health, killed, saved, staggered };
  }

  private insert<F>(list: Ordered<F>[], id: string, fn: F, order: number, what: string): () => void {
    if (list.some((e) => e.id === id)) throw new Error(`DamageResolver: duplicate ${what} "${id}"`);
    const entry = { id, fn, order, seq: this.seq++ };
    list.push(entry);
    list.sort((a, b) => a.order - b.order || a.seq - b.seq);
    return () => {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    };
  }
}
