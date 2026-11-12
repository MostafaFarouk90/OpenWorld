// G3 New Game+ ("Second Hearth", design 12.5): enemy scaling. In a Second Hearth every hostile fights as level 40 at the
// cycle's Heat: on spawn its health is lifted from its own level to 40 and multiplied by the Heat, and its hits are lifted
// the same way by a damage modifier in the attacker band. A first playthrough (cycle 0) installs nothing.
import type { Actor } from '../actors/Actor';
import type { ModifiableRequest } from '../actors/DamageResolver';
import { LEVEL } from '../enemies/tuning';
import { NGPLUS_ENEMY_LEVEL } from './tuning';

/** Kinds that are hostile but are not fighters: objectives and stand-ins whose health is a timer, not a fight. */
export const UNSCALED_KINDS: ReadonlySet<string> = new Set(['brazier-cart', 'ulthred-trial']);

/** After the enemies' own move damage (-150), inside the attacker band (-200..-101). */
export const NGPLUS_DAMAGE_ORDER = -110;
export const NGPLUS_DAMAGE_MODIFIER_ID = 'ngplus.scaling';

const level = (l: number): number => (Number.isFinite(l) && l >= 1 ? Math.floor(l) : 1);

/** Health multiplier that lifts a level-`from` enemy to level `to` (enemies/level.ts scaleStats' curve). */
export function healthLift(from: number, to: number = NGPLUS_ENEMY_LEVEL): number {
  const f = (l: number) => 1 + LEVEL.healthPerLevel * (level(l) - 1);
  return level(to) > level(from) ? f(to) / f(from) : 1;
}

/** Damage multiplier that lifts a level-`from` enemy to level `to`. */
export function damageLift(from: number, to: number = NGPLUS_ENEMY_LEVEL): number {
  const f = (l: number) => 1 + LEVEL.damagePerLevel * (level(l) - 1);
  return level(to) > level(from) ? f(to) / f(from) : 1;
}

/**
 * An actor the Second Hearth scales: hostile, mortal and a fighter. Hittable is not asked: a boss spawns unhittable for its
 * intro (the Prior, review of the Act 1 chain).
 */
export function scales(actor: Pick<Actor, 'team' | 'immortal' | 'kind'>): boolean {
  return actor.team === 'hostile' && !actor.immortal && !UNSCALED_KINDS.has(actor.kind);
}

/**
 * The scaler. `heatMultiplier` is read live (W rises during a cycle; a spawn and a hit use the value of their moment).
 * `spawned` must run inside `actor.spawned` (before the owner reads the actor's health).
 */
export class SecondHearthScaling {
  /** Each scaled actor's own level at spawn (its hits are lifted from it). */
  private readonly baseLevel = new Map<string, number>();

  constructor(private readonly heatMultiplier: () => number) {}

  spawned(actor: Actor): void {
    if (!scales(actor)) return;
    const from = actor.level;
    this.baseLevel.set(actor.id, from);
    const k = healthLift(from) * this.heatMultiplier();
    if (!(k > 0) || !Number.isFinite(k)) return;
    const frac = actor.maxHealth > 0 ? actor.health / actor.maxHealth : 1;
    actor.maxHealth = Math.max(1, Math.round(actor.maxHealth * k));
    actor.health = Math.max(1, Math.round(actor.maxHealth * frac));
    if (from < NGPLUS_ENEMY_LEVEL) actor.level = NGPLUS_ENEMY_LEVEL;
  }

  despawned(actorId: string): void {
    this.baseLevel.delete(actorId);
  }

  /** The level an actor spawned at, while it is scaled. */
  levelAtSpawn(actorId: string): number | undefined {
    return this.baseLevel.get(actorId);
  }

  /** The damage modifier: a scaled attacker's direct hit (not a status tick or a fall). */
  modify = (req: ModifiableRequest, _target: Actor, attacker: Actor | null): void => {
    if (!attacker || req.kind === 'status' || req.kind === 'fall') return;
    const from = this.baseLevel.get(attacker.id);
    if (from === undefined) return;
    const k = damageLift(from) * this.heatMultiplier();
    if (Number.isFinite(k) && k > 0) req.amount *= k;
  };

  clear(): void {
    this.baseLevel.clear();
  }
}
