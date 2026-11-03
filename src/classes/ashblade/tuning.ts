/**
 * Ashblade numbers (design 9.4). Values the design states are marked; the rest are provisional and live here only so
 * a balance pass is one file (plans/slice-2-class-ashblade.md section 4).
 */
import { COMBAT } from '../../config/constants';
import { SURGE } from '../../vfx/tuning';

export const CLASS_ID = 'ashblade';

export const SKILL = {
  backSlit: 'ashblade.backSlit',
  bleedingEmber: 'ashblade.bleedingEmber',
  quietSoles: 'ashblade.quietSoles',
  ashCloud: 'ashblade.ashCloud',
  quickSlip: 'ashblade.quickSlip',
  sparkDodge: 'ashblade.sparkDodge',
  twinFangs: 'ashblade.twinFangs',
  sootCloak: 'ashblade.sootCloak',
  wallSkitter: 'ashblade.wallSkitter',
  // Tier 4 (Act 3, K11 PR 1).
  cinderMark: 'ashblade.cinderMark',
  decoyFootprints: 'ashblade.decoyFootprints',
  phoenixRoll: 'ashblade.phoenixRoll',
} as const;

export const BACK_SLIT = {
  /** Design: 2x damage from behind. */
  multiplier: 2,
  /** Provisional: the attacker lies within this half angle (60 degrees: a 120 degree rear arc) of straight behind. */
  minDot: Math.cos(Math.PI / 3),
} as const;

export const BLEEDING_EMBER = {
  /** The `ignite` status id; the same id refreshes, never stacks. */
  statusId: 'ashblade.bleedingEmber',
  dps: 3,
  seconds: 4,
} as const;

export const QUICK_SLIP = {
  /** Design: dodge distance +20%. */
  distanceScale: 1.2,
} as const;

export const SPARK_DODGE = {
  statusId: 'ashblade.sparkDodge',
  radius: 2.5,
  dps: 2,
  seconds: 3,
  cooldownSeconds: 1.5,
} as const;

export const ASH_CLOUD = {
  /** Skill data (thread 5's abilities service spends and cools). Ember 10 (Rally Cry's cost) keeps the 40 Surge affordable. */
  emberCost: 10,
  cooldown: 18,
  /** Design effect 16: a 6 s cloud. */
  seconds: 6,
  radius: 3.5,
  /** Metres ahead of the feet. */
  ahead: 3,
  effectId: 'ash-cloud',
  clip: 'Throw',
} as const;

export const ASH_DRIFT = {
  /** Design 9.4: 2 s of ash, invulnerable. */
  seconds: 2,
  source: 'ash-drift',
  /** Hide the avatar this long around the hop (dissolve out, back in). */
  dissolveSeconds: 0.2,
  /** Metres behind the target the player lands (the target's back is the player's side of it). */
  behind: 1.2,
  /** Free-air drift when no hostile is in range. */
  freeDistance: 6,
  /** Targets must share the player's space and stand within this height of the feet. */
  maxDy: 3,
  /** Wall and ground clamps. */
  chestHeight: 1.2,
  groundProbeUp: 1.5,
  groundProbeDown: 3,
  /** Landing ground must be within this of the target's feet. */
  groundTolerance: 2,
  /** Wall rays start this far from the target's feet, outside its capsule (radius 0.35). */
  clearOfTarget: 0.5,
  damage: SURGE.damage,
} as const;

/** AI states in which a hostile is already fighting or has noticed the player. */
export const AGGROED_STATES: ReadonlySet<string> = new Set(['notice', 'chase', 'telegraph', 'attack', 'recover', 'stagger']);

/** Tier 3 (Act 2). Numbers from plans/act2-A11.md; the lean and kick values are provisional. */
export const TWIN_FANGS = {
  /** Each of the two hits deals this share of the attack's damage (and poise): 1.2x in all. */
  hitScale: 0.6,
  /** Seconds after the first hit; 7 fixed ticks. */
  delaySeconds: 0.12,
  /** The second hit is a distinct attack id so it is never scaled again nor chains. */
  attackId: 'ashblade.twinFangs.second',
  effectId: 'twin-fangs',
  /** Cap on queued second hits (one per target per swing in practice). */
  maxQueued: 16,
} as const;

/** Order inside the attacker band: before Back-Slit (-150), so the stored base damage is the unmodified one. */
export const TWIN_FANGS_ORDER = -151;

export const SOOT_CLOAK = {
  seconds: 5,
  cooldownSeconds: 12,
  /** Radius of the sight-blocker disc kept at the feet. */
  radius: 1.2,
  /** Seconds between disc refreshes; each disc lives a little longer so a late tick leaves no gap. */
  refreshSeconds: 0.25,
  discSeconds: 0.6,
  noiseScale: 0.5,
  noiseSource: 'ashblade.sootCloak',
  effectId: 'soot-cloak',
} as const;

export const WALL_SKITTER = {
  /** Fall speed (m/s) while sliding down a wall. */
  slideSpeed: 0.5,
  /** Seconds of sliding per airtime; reset on landing. */
  maxSeconds: 1.2,
  /** Wall kick: horizontal push along the wall normal for `kickTicks` fixed ticks at `kickSpeed` m/s. */
  kickSpeed: 6,
  kickTicks: 8,
  kickOwner: 'ashblade.wallKick',
  /** Avatar root roll (radians) toward the wall, eased per tick. */
  leanRadians: 0.3,
  leanEase: 0.25,
  effectId: 'wall-skitter',
} as const;

// ---- Tier 4 (Act 3, K11 PR 1; plans/act3-K11.md section 2). Numbers the plan states are marked; the rest are provisional. ----

export const CINDER_MARK = {
  skillId: SKILL.cinderMark,
  /** Plan: 15 s cooldown, 15 Ember (skill data; the abilities bar spends and cools). */
  cooldown: 15,
  emberCost: 15,
  /** Plan: the mark lasts 10 s. */
  seconds: 10,
  /** Plan: every hit on the marked foe is a critical hit, x1.5. */
  multiplier: 1.5,
  /** Attacker band, one after Back-Slit (-150), so a back stab on a marked foe is 2 x 1.5 = 3x. */
  order: -149,
  modifierId: 'ashblade-cinder-mark',
  /** Plan: no lock-on, the nearest live hostile within 12 m in a 60 degree front cone (30 degrees either side of the facing). */
  range: 12,
  coneDegrees: 60,
  effectId: 'cinder-mark',
} as const;

export const DECOY_FOOTPRINTS = {
  skillId: SKILL.decoyFootprints,
  cooldown: 20,
  emberCost: 15,
  seconds: 6,
  /** The `stealth.addNoiseScale` source id; scale 0 is silence. */
  noiseSource: 'ashblade.decoyFootprints',
  noiseScale: 0,
  /** Watchers that are not yet alerted see the player at 60% range (a perception provider). */
  sightRangeScale: 0.6,
  effectId: 'decoy-footprints',
} as const;

export const PHOENIX_ROLL = {
  skillId: SKILL.phoenixRoll,
  /** The skill's own ignite status id on the foes in the patch. */
  igniteId: 'ashblade.phoenixRoll',
  /** Plan: a 4 m diameter patch for 4 s, ticking every 0.5 s. */
  radius: 2,
  /** Vertical reach either side of the dodge start (a foe on another floor is not in the fire). */
  halfHeight: 2,
  seconds: 4,
  tickSeconds: 0.5,
  /** Plan: 0.25x the Ashblade base damage (`COMBAT.baseDamage`) per tick. */
  damage: COMBAT.baseDamage * 0.25,
  attackId: 'ashblade.phoenixRoll',
  /** Spark Dodge's ignite shape (2 a second for 3 s), refreshed by each tick, never stacked. */
  igniteDps: 2,
  igniteSeconds: 3,
  /** At most one roll effect (clear and patch) per 4 s, counted from the patch. */
  cooldownSeconds: 4,
  effectId: 'phoenix-patch',
} as const;
