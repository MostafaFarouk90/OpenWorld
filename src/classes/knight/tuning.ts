import { COMBAT } from '../../config/constants';
import { BANNER } from '../../spells/tuning';

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
  unbrokenOath: 'knight.unbrokenOath',
  heartshardSmite: 'knight.heartshardSmite',
  bannerOfTheSunforge: 'knight.bannerOfTheSunforge',
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

/**
 * Bastion Wall (Bulwark 4, Act 3): 8 s, 20 s cooldown, 20 Ember (design 9.1). While block is held, a hit whose source lies in the
 * 120 degree front cone and that is aimed at the Knight or an ally within 6 m of the Knight is blocked (amount and poise x0.2).
 * The modifier sits at -45 in the defender band, after the player's guard (-50): it acts on outcome 'hit' only, so a hit the guard
 * already blocked or parried is never scaled twice.
 */
export const BASTION_WALL = {
  seconds: 8,
  cooldown: 20,
  emberCost: 20,
  /** Full cone angle in degrees; a source within half of it of the facing is covered (inclusive). */
  coneDegrees: 120,
  allyRadius: 6,
  scale: 0.2,
  modifierId: 'knight.bastionWall.cover',
  modifierOrder: -45,
  fx: 'bastion-wall',
} as const;

/**
 * Executioner's Arc (Vanguard 4, Act 3): the heavy chop, 10 s cooldown and 20 Ember. In the clip's hit window (the chop is 1.067 s,
 * 64 ticks, its blade is hot from 0.45 s to 0.62 s) every hostile within 3 m in the 180 degree front arc takes 1.8x the base hit
 * (COMBAT.baseDamage, the base the Charge of the Halvard doubles) with poise 30, once per cast.
 */
export const EXECUTIONERS_ARC = {
  clip: '1H_Melee_Attack_Chop',
  ticks: 64,
  hitFromTick: 27,
  hitToTick: 38,
  reach: 3,
  arcDegrees: 180,
  damageFactor: 1.8,
  damage: COMBAT.baseDamage * 1.8,
  poise: 30,
  cooldown: 10,
  emberCost: 20,
  attackId: 'knight.executionersArc',
  fx: 'executioners-arc',
  shakeAmplitude: 0.25,
  shakeSeconds: 0.15,
} as const;

/** Hearthfire Ward (Standard 4, Act 3): each banner pulse (every 3 s) heals the Knight and live allies within the banner's 8 m by 3% of max health. */
export const HEARTHFIRE_WARD = {
  fraction: 0.03,
  fx: 'hearthfire-motes',
} as const;

/**
 * Unbroken Oath (Bulwark 5, Act 3 capstone): for 8 s no hit that is not a script kill reduces the Knight below 1 health. The lethal
 * handler sits at -140: after the trial duel's floor (-150, companions/trials.ts, so a trial still scores its yield breaks during the
 * Oath) and before Second Wind (-100, player/tuning.ts), so the Oath never spends the Second Wind. Counterattacks are free:
 * the riposte stab that lands within `counterWindowTicks` of a parry (the verbs' own window, 120 ticks) hands back the stamina spent
 * since the parry. 60 s cooldown and 30 Ember.
 */
export const UNBROKEN_OATH = {
  seconds: 8,
  cooldown: 60,
  emberCost: 30,
  handlerId: 'knight.unbrokenOath.hold',
  handlerOrder: -140,
  /** The Riposte thrust's clip, which is its attack id (CombatVerbs STAB_CLIP). */
  stabAttackId: '1H_Melee_Attack_Stab',
  counterWindowTicks: 120,
  fx: 'unbroken-oath',
  /** The heartbeat vignette: one gold pulse a second. */
  heartbeatSeconds: 1,
  vignetteStrength: 0.25,
  vignetteSeconds: 0.5,
  vignetteColor: 0xffc040,
} as const;

/**
 * Heartshard Smite (Vanguard 5, a passive: open point A). For 8 s after the Knight releases a Surge the sword's blade is scaled
 * along its long axis (+Y) to `reach` metres, so the weapon tracer sweeps 5 m; melee hits deal x1.5 and are fire (attacker band, -180),
 * and ignite for 2 a second for 3 s.
 */
export const HEARTSHARD_SMITE = {
  seconds: 8,
  reach: 5,
  fireFactor: 1.5,
  surgeSpellId: 'heartshard-surge',
  modifierId: 'knight.heartshardSmite.fire',
  modifierOrder: -180,
  igniteId: 'knight.heartshardSmite.ignite',
  igniteDps: 2,
  igniteSeconds: 3,
  fx: 'heartshard-blade',
} as const;

/**
 * Banner of the Sunforge (Standard 5): plants a 20 m banner for its normal 20 s life, replacing any banner; Ember regeneration is
 * doubled while the Knight's feet are within 20 m of it. 60 s cooldown and 30 Ember.
 */
export const SUNFORGE = {
  radius: 20,
  seconds: BANNER.lifetimeSeconds,
  regenFactor: 2,
  cooldown: 60,
  emberCost: 30,
  multiplierId: 'knight.bannerOfTheSunforge.regen',
  fx: 'sunforge-banner',
} as const;
