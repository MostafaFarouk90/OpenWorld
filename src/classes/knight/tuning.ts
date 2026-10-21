import { COMBAT } from '../../config/constants';

/** Knight tier 3 numbers (design 9.1). Entries marked "own" are this thread's choices where the design gives none. */

export const KNIGHT_CLASS_ID = 'knight';

export const SKILL_IDS = {
  ironStance: 'knight.ironStance',
  flowingCuts: 'knight.flowingCuts',
  bannerPlant: 'knight.bannerPlant',
  oathward: 'knight.oathward',
  chargeOfTheHalvard: 'knight.chargeOfTheHalvard',
  squiresResolve: 'knight.squiresResolve',
  bastionWall: 'knight.bastionWall',
  executionersArc: 'knight.executionersArc',
  hearthfireWard: 'knight.hearthfireWard',
} as const;

/**
 * Oathward: a 1.4 m bubble absorbing 100 damage for up to 20 s (design); 30 s cooldown and 15 Ember (own, set on the SkillDef).
 * The modifier sits at -40: inside the defender band (-100..-1), after the player's guard (-50), so a blocked or parried hit
 * reaches the bubble already reduced and a hit the guard zeroed costs it nothing.
 */
export const OATHWARD = {
  absorb: 100,
  seconds: 20,
  radius: 1.4,
  cooldown: 30,
  emberCost: 15,
  modifierId: 'knight.oathward.absorb',
  modifierOrder: -40,
  bubbleFx: 'oathward-bubble',
  burstFx: 'oathward-burst',
} as const;

/**
 * Charge of the Halvard: 5 m in 0.25 s along the facing (own distance); every hostile hit once for twice the Stab's damage.
 * The Stab (attack 4) deals the base hit, COMBAT.baseDamage, times the struck bone's multiplier (1 for the torso).
 */
export const HALVARD = {
  distance: 5,
  ticks: 15, // 0.25 s at 60 Hz
  hitRadius: 1.2,
  /** The lunge stops when the ground this far ahead is more than `maxDrop` below the feet. */
  probe: 0.6,
  maxDrop: 1,
  damageFactor: 2,
  damage: COMBAT.baseDamage * 2,
  emberCost: 15,
  cooldown: 12,
  clip: '1H_Melee_Attack_Stab',
  attackId: 'knight.chargeOfTheHalvard',
  holdOwner: 'knight.charge',
  fx: 'halvard-charge',
} as const;

/**
 * Squire's Resolve: an ally within 10 m of the player (own) that takes a lethal hit is left at 1 health, once per fight.
 * A fight opens on a hostile's `ai.aggro` and closes 6 s (own) after the last aggroed foe is gone.
 */
export const SQUIRE = {
  radius: 10,
  graceSeconds: 6,
  handlerId: 'knight.squiresResolve.hold',
  handlerOrder: 0,
  fx: 'squire-resolve',
} as const;
