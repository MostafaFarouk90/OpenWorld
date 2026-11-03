// Emberwright numbers (design 9.3, 9.6, 9.7). Poise values, Ember 100, the 40% Surge refill, the 5 s burning ground and the
// Anvil's 0.35 s impact are the design's; every damage and cost figure is this thread's (plans/slice-2-class-emberwright.md).
import type { AttackSet } from '../../player/attackSets';

export const CLASS_ID = 'emberwright';

/** Flat for now: main has no spell-power stat (design: 16, +3 per level). Every spell reads damage through this. */
export const spellDamage = (base: number): number => base;

export interface BoltAttack {
  clip: string;
  activeStart: number;
  activeEnd: number;
  ember: number;
}

/** Keys 1 to 4. Windows follow the measured clips: Spellcast_Shoot releases at 0.18, Spellcast_Long at 0.54; the other two were measured from Mage.glb (2H_Ranged_Shoot 1.067 s, 2H_Melee_Attack_Spinning 0.667 s). */
export const ATTACKS: readonly BoltAttack[] = [
  { clip: 'Spellcast_Shoot', activeStart: 0.18, activeEnd: 0.3, ember: 3 },
  { clip: '2H_Ranged_Shoot', activeStart: 0.15, activeEnd: 0.28, ember: 5 },
  { clip: 'Spellcast_Long', activeStart: 0.54, activeEnd: 0.7, ember: 12 },
  { clip: '2H_Melee_Attack_Spinning', activeStart: 0.28, activeEnd: 0.5, ember: 6 },
] as const;

export const EMBERWRIGHT_ATTACK_SET: AttackSet = {
  attacks: ATTACKS.map(({ clip, activeStart, activeEnd }) => ({ clip, activeStart, activeEnd })),
  heavyIndex: 2,
};

export const BOLT = { damage: 10, poise: 10, speed: 22, range: 24, radius: 0.3 } as const;
/** Attack 2: three short bolts; the design's 10 poise and the 10 damage are the point-blank total. */
export const SPARK_BURST = { bolts: 3, spreadDeg: 7, damage: 10 / 3, poise: 10 / 3, speed: 26, range: 14, radius: 0.25 } as const;
export const FLAME_BALL = { damage: 24, poise: 30, speed: 14, range: 20, radius: 0.4, blast: 2, splash: 0.6 } as const;
export const CINDER_RING = { radius: 3, damage: 9, poise: 15, pushMetres: 1.2 } as const;
/** Staff contact when Ember is short: this fraction of the tracer's damage and poise. */
export const STAFF_TAP = 0.4;

export const IGNITE = { id: 'emberwright.ignite', seconds: 3, dps: 2 } as const;
export const CHEST_HEIGHT = 1.3;
export const PLAYER_STAGGER_SECONDS = 0.8;

export const FORGE_SPARK = { chains: 2, radius: 4, fraction: 0.5 } as const;
export const GUST_STEP = { ember: 8, pushRadius: 2, pushMetres: 1.5, clipPrefix: 'Dodge_' } as const;

export const FLAME_LASH = { skillId: 'emberwright.flameLash', ember: 16, cooldown: 6, length: 8, halfWidth: 0.7, damage: 22, poise: 20 } as const;
export const ANVIL_DROP = {
  skillId: 'emberwright.anvilDrop', ember: 24, cooldown: 14, range: 12, halfAngleDeg: 60,
  damage: 30, poise: 40, stunSeconds: 1.5, splashRadius: 2.5, splash: 0.5, impactDelay: 0.35, stunId: 'emberwright.anvilStun',
} as const;
export const WARM_BREATH = { skillId: 'emberwright.warmBreath', ember: 18, cooldown: 12, range: 6, halfAngleDeg: 35, healFraction: 0.2 } as const;

/** Tier 3 (Act 2). Every figure is this thread's (design 9.3 names the skills only); see design/changes-applied.md. */
export const FIRE_WALL = {
  skillId: 'emberwright.fireWall', ember: 25, cooldown: 20, cards: 12, length: 6, ahead: 4, seconds: 8, halfThickness: 0.8, halfHeight: 3,
  dps: 8, tickSeconds: 0.5, igniteId: 'emberwright.fireWall.ignite', igniteSeconds: 3, igniteDps: 2, attackId: 'emberwright.fireWall', effectId: 'fire-wall',
} as const;
export const IRON_FAMILIAR = {
  skillId: 'emberwright.ironFamiliar', ember: 30, cooldown: 40, health: 60, hover: 1.2, seconds: 20, followMax: 3, followStop: 2, snapDistance: 10, speed: 7, spawnSide: 1,
  strikeSeconds: 1.5, retrySeconds: 0.25, range: 12, damage: 6, idPrefix: 'familiar:', kind: 'familiar', attackId: 'emberwright.ironFamiliar', effectId: 'iron-familiar',
  /** Enemies within `tauntRadius` metres target the familiar for `tauntSeconds` (or until it dies), then go back to the player. */
  tauntRadius: 10, tauntSeconds: 8,
} as const;
export const SMOKE_SCREEN = { skillId: 'emberwright.smokeScreen', ember: 20, cooldown: 25, ahead: 6, radius: 5, seconds: 8, sightRange: 3, effectId: 'smoke-screen' } as const;

export const SURGE_FORM = { emberRefill: 0.4, groundSeconds: 5, groundRadius: 6, groundTick: 0.5 } as const;

/** Effects that exist in the vfx plugin today (EFFECT_IDS is closed); dedicated ids come with the vfx owner. */
export const FX = {
  boltImpact: 'hit-spark',
  blast: 'ember-burst',
  ring: 'shockwave-ring',
  scorch: 'scorch-decal',
  anvil: 'hit-spark-heavy',
  wind: 'shockwave-ring',
} as const;

export const ACTOR_RADIUS = 0.5;

// ---- Tier 4 (Act 3, K11 PR 2; plans/act3-K11-pr2.md). Cooldowns, costs, radii and times are the plan's; the rest are provisional. ----

/** Attacks 1 to 4 as the damage pipeline sees them: the spell attack ids (runtime.ts), and the staff's melee clips. */
export const OWN_SPELL_ATTACK_IDS: readonly string[] = ['emberwright.bolt', 'emberwright.sparkBurst', 'emberwright.flameBall', 'emberwright.cinderRing'];

export const CINDER_RAIN = {
  skillId: 'emberwright.cinderRain', cooldown: 22, emberCost: 30,
  /** Plan: a 5 m radius field for 3 s, a tick every 0.5 s (6 ticks), each hostile inside takes 0.35x the base spell damage (Ember Bolt's, `BOLT.damage`) as fire. */
  radius: 5, seconds: 3, tickSeconds: 0.5, damageFraction: 0.35, damage: spellDamage(BOLT.damage) * 0.35,
  /** Vertical reach either side of the field's ground. */
  halfHeight: 3,
  /** Centre: the lock-on target when a live hostile within `lockRange` m, else `ahead` m in front of the player. */
  lockRange: 20, ahead: 8,
  igniteId: 'emberwright.cinderRain.ignite', igniteSeconds: 3, igniteDps: 2, attackId: 'emberwright.cinderRain', effectId: 'cinder-rain',
} as const;

export const TEMPER_WEAPON = {
  skillId: 'emberwright.temperWeapon', cooldown: 30, emberCost: 20, seconds: 20,
  /** The nearest live companion within this many metres, else the Emberwright's own staff. */
  range: 10,
  /** Attacker band: after the staff's -150 and Cinder Mark's -149 neighbours, before the rest. */
  order: -148, modifierId: 'emberwright-temper-weapon', multiplier: 1.3,
  companionAttackPrefix: 'companion.',
  igniteId: 'emberwright.temperWeapon.ignite', igniteSeconds: 3, igniteDps: 2,
  /** A foe already burning from an id with this prefix (Ember Bolt, Fire Wall, Cinder Rain) takes no second ignite. */
  igniteSkipPrefix: 'emberwright.',
  effectId: 'temper-weapon',
} as const;

export const UPDRAFT = {
  skillId: 'emberwright.updraft', cooldown: 18, emberCost: 20,
  /** Plan: every hostile within 4 m (inclusive); `halfHeight` keeps a foe on another floor out. */
  radius: 4, halfHeight: 3,
  poise: 30, stunSeconds: 1.5, stunId: 'emberwright.updraft.stun', attackId: 'emberwright.updraft',
  /** The lift is drawn by the VFX column (open point A): 1.5 m over 0.8 s. */
  liftMetres: 1.5, liftSeconds: 0.8, effectId: 'emberwright-updraft',
} as const;
