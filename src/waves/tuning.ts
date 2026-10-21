import { SURGE } from '../vfx/tuning';

/**
 * Every A7 number in one place (plans/act2-A7.md, review folds 3 to 5). Pinned by tuning.test.ts with reachability
 * checks, not tuned by feel.
 */

/** The brazier cart (design row 33): 600 health, no poise, pushed along a lane at 1.2 m/s (self-propelled; no pushers in Act 2). */
export const CART = {
  kind: 'brazier-cart',
  maxHealth: 600,
  speed: 1.2,
  /** The ram's tell: the cart rocks back this long before the strike (design row 33's 1.0 s wind-back). */
  windupSeconds: 1.0,
  windupBackMetres: 0.5,
  /** The cart stops this far short of the barricade anchor it rams. */
  strikeGap: 1.5,
  /** Health the barricade loses when a cart arrives. */
  impactDamage: 250,
  /** A lane of about this many seconds is what the reachability tests assume (about 48 m at `speed`). */
  nominalApproachSeconds: 40,
  /** After a cart is destroyed or has struck: collapse, then shrink away. */
  collapseSeconds: 1.2,
  vanishSeconds: 0.6,
} as const;

/** The barricade keeps one value: 400 health, so one leaked cart (250) is survivable and two fail. */
export const BARRICADE = { maxHealth: 400 } as const;

/**
 * What one hit does to a cart, as a fraction of its health. Everything else (light melee, class skills whatever their
 * poise, fire and status ticks) is 0. A heavy chop is any `HEAVY_CHOP_CLIPS` clip on a melee hit; the Surge is
 * `kind: 'spell'` with the Surge's spell id. There is deliberately no poise path.
 */
export const CART_HIT_FRACTION = { chop: 0.1, surge: 0.25 } as const;

export const CART_HIT_VALUE = {
  chop: CART.maxHealth * CART_HIT_FRACTION.chop,
  surge: CART.maxHealth * CART_HIT_FRACTION.surge,
} as const;

/** The damage modifier's id and its place in the defender band (-100 to -1). */
export const CART_MODIFIER = { id: 'waves.cart-hit', order: -50 } as const;

/** Osgar's militia: scripted defenders, not squad AI. They never die and never land a killing blow. */
export const DEFENDER = {
  kind: 'militia',
  maxHealth: 120,
  /** Swings at a hostile this close (metres, horizontal). */
  swingRange: 2.5,
  swingDamage: 6,
  swingCooldown: 1.6,
  /** Seconds a downed militiaman lies before standing again. */
  knockdownSeconds: 4,
  /** The last part of the knockdown is the stand-up clip. */
  riseSeconds: 1,
  /** How often a free militiaman looks for a target. */
  scanSeconds: 0.25,
  /** A post leash: they never walk, so this only decides where a revived one stands. */
  lethalHandlerId: 'waves.defender-floor',
  noKillHandlerId: 'waves.defender-no-kill',
  swingAttackId: 'waves.militia-swing',
  hurtRadius: 0.45,
} as const;

export const DIRECTOR = {
  /** Default pause between a cleared wave and the next. */
  intermissionSeconds: 6,
  /** The beat between a failure and the restart of the same wave. */
  restartBeatSeconds: 3,
  /** The director runs only while the player is within this many metres of the barricade (and outdoors, not travelling). */
  activeRadius: 160,
} as const;

/** Stable structure ids: `<defId>.cart.<wave>.<n>` (wave is the 0-based index, n counts from 1) and the def's barricade id. */
export const cartId = (defId: string, wave: number, n: number): string => `${defId}.cart.${wave}.${n}`;

/** Ember budget of a Surge-only class (spells/Ember.ts, vfx/tuning.ts): start 100, +2/s after 2 s without a spend. */
export const EMBER_BUDGET = { start: 100, regenPerSecond: 2, regenDelay: 2, cost: SURGE.emberCost, cooldown: SURGE.cooldown } as const;

/**
 * Surges a caster with the ember budget can cast in `seconds` of casting as soon as the pool and the cooldown allow
 * (the first at t = 0). Used by the reachability tests.
 */
export function surgeCastsWithin(seconds: number, budget: { start: number; regenPerSecond: number; regenDelay: number; cost: number; cooldown: number } = EMBER_BUDGET): number {
  let ember = budget.start;
  let t = 0;
  let lastSpend = -Infinity;
  let nextCast = 0;
  let casts = 0;
  const step = 0.05;
  while (t <= seconds + 1e-9) {
    if (t >= nextCast - 1e-9 && ember >= budget.cost - 1e-9) {
      ember -= budget.cost;
      lastSpend = t;
      nextCast = t + budget.cooldown;
      casts++;
    }
    if (t - lastSpend >= budget.regenDelay) ember = Math.min(100, ember + budget.regenPerSecond * step);
    t += step;
  }
  return casts;
}
