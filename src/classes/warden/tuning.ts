/** Warden numbers (design 9.2, 9.7, 11.3). Entries marked "own" are this thread's choices where the design gives none. */

export const WARDEN_CLASS_ID = 'warden';

/** The four two-handed clips of Barbarian.glb (lengths 1.100, 0.667, 1.633 and 1.600 s). Windows are estimates from clip length. */
export const WARDEN_CLIPS = {
  slice: '2H_Melee_Attack_Slice',
  spinning: '2H_Melee_Attack_Spinning',
  chop: '2H_Melee_Attack_Chop',
  stab: '2H_Melee_Attack_Stab',
} as const;

/** Ids the axe hits are recognised by: the four clips plus the cleave's extras. */
export const CLEAVE_ATTACK_ID = 'warden.cleave';
export const AXE_ATTACK_IDS: ReadonlySet<string> = new Set([...Object.values(WARDEN_CLIPS), CLEAVE_ATTACK_ID]);

export const SKILL_IDS = {
  cleavingSwing: 'warden.cleavingSwing',
  deepWound: 'warden.deepWound',
  thickSkin: 'warden.thickSkin',
  boulderShoulder: 'warden.boulderShoulder',
  warHowl: 'warden.warHowl',
  emberRage: 'warden.emberRage',
  whirlingHew: 'warden.whirlingHew',
  gritTeeth: 'warden.gritTeeth',
  bloodChant: 'warden.bloodChant',
  skullsplitter: 'warden.skullsplitter',
  earthroot: 'warden.earthroot',
  frenziedHearth: 'warden.frenziedHearth',
  wyrmbreaker: 'warden.wyrmbreaker',
  mountainUnmoved: 'warden.mountainUnmoved',
  voiceOfTheMountain: 'warden.voiceOfTheMountain',
} as const;

/** Cleaving Swing: attack 1 hits every hostile in the front arc (design 11.3: arc 120 degrees; the 3 m range is own). */
export const CLEAVE = { rangeMetres: 3, halfAngle: (60 * Math.PI) / 180 } as const;

/** Deep Wound: bleed for 5 s (design); 2 dps is own. */
export const DEEP_WOUND = { id: 'warden.deepWound', seconds: 5, dps: 2 } as const;

/** Thick Skin: +10% max HP (design). */
export const THICK_SKIN = { maxHealthFactor: 1.1, modifierId: 'warden.thickSkin' } as const;

/** Boulder Shoulder (own numbers, in line with Rim Bash's 5 damage and 40 poise). Poise 40 passes HEAVY_POISE, so it breaks guards. */
export const BOULDER = {
  distance: 5,
  ticks: 21, // 0.35 s at 60 Hz
  hitRadius: 1.2,
  damage: 6,
  poise: 40,
  emberCost: 10,
  cooldown: 10,
  clip: 'Block_Attack',
  attackId: 'warden.boulderShoulder',
} as const;

/** War Howl: below 50% health, stagger within 6 m (design range); the trigger and the 30 s cooldown are own. */
export const WAR_HOWL = { range: 6, healthFraction: 0.5, poise: 35, cooldownSeconds: 30 } as const;

/** Ember Rage (provisional, review item 9): Ember per hit taken, at most once per interval. */
export const EMBER_RAGE = { ember: 3, intervalSeconds: 0.5 } as const;

/** Heartshard Surge, Warden forms (design 9.2, 9.7): the axe burns for 8 s; Blaze is a fissure line instead of the ring. */
export const SURGE_AXE = {
  buffId: 'warden.axeIgnite',
  nameKey: 'buff.warden.axeIgnite',
  seconds: 8,
  ignite: { id: 'warden.axeIgnite', seconds: 3, dps: 3 },
} as const;
export const FISSURE = { length: 10, width: 4 } as const;

/**
 * Tier 3 (Act 2, own numbers where the design gives none). Whirling Hew: a full circle of 2.6 m, 1.2x the weapon base that attack 2
 * uses, one hit per foe, poise equal to the damage. The spin clip is 0.667 s (40 ticks) and its blade is hot from 25% to 75%.
 */
export const WHIRLING_HEW = {
  reach: 2.6,
  damageFactor: 1.2,
  cooldown: 14,
  emberCost: 20,
  clip: WARDEN_CLIPS.spinning,
  attackId: 'warden.whirlingHew',
  ticks: 40,
  hitFromTick: 10,
  hitToTick: 30,
} as const;

/**
 * Grit Teeth: half damage for 4 s after the player is staggered, no stacking, 10 s between windows (counted from the start of one).
 * Order 50 sits mid buffs band (0..99): after the block and parry of the defender band (-100..-1) have settled the outcome and
 * amount, so a blocked hit is halved from what is left, and ahead of nothing else that scales damage taken.
 */
export const GRIT_TEETH = {
  modifierId: 'warden.gritTeeth',
  order: 50,
  factor: 0.5,
  seconds: 4,
  cooldownSeconds: 10,
  buffId: 'warden.gritTeeth',
  nameKey: 'buff.warden.gritTeeth',
  effect: 'grit-teeth',
} as const;

/** Blood Chant: 20 s; every hit by an ally-team attacker on a hostile leaves a bleed under its own status id (Deep Wound's spec). */
export const BLOOD_CHANT = {
  seconds: 20,
  cooldown: 45,
  emberCost: 25,
  buffId: 'warden.bloodChant',
  nameKey: 'buff.warden.bloodChant',
  effect: 'blood-rune',
  bleed: { id: 'warden.bloodChant.bleed', seconds: DEEP_WOUND.seconds, dps: DEEP_WOUND.dps },
} as const;

/**
 * Tier 4 (Act 3, K11 PR 1, design 9.2 and 11.5; numbers are own, scaled from tier 3).
 * Skullsplitter: the 2H chop (1.633 s, about 98 ticks), its blade hot from about 35% to 55% of the clip. The nearest hostile within
 * 2.6 m in a 90 degree front arc takes 1.6x the weapon base (the base Whirling Hew scales) with poise 40; double damage on a staggered
 * target. "Staggered" is an `actor.staggered` within the last 1.2 s, poise at 0, or the AI state `stagger` (see StaggerWatch).
 */
export const SKULLSPLITTER = {
  reach: 2.6,
  halfAngle: Math.PI / 4,
  damageFactor: 1.6,
  staggeredFactor: 2,
  poise: 40,
  cooldown: 10,
  emberCost: 20,
  clip: WARDEN_CLIPS.chop,
  attackId: 'warden.skullsplitter',
  ticks: 98,
  hitFromTick: 34,
  hitToTick: 54,
  effect: 'skullsplitter',
  /** Design 11.5: a 0.2 s camera shake on the chop. */
  shakeAmplitude: 0.3,
  shakeSeconds: 0.2,
} as const;

/** How long an `actor.staggered` keeps a target "staggered" for the Warden's tier 4 skills (break stagger lasts about this long). */
export const STAGGER_WINDOW_SECONDS = 1.2;

/**
 * Earthroot: rooted for 5 s (move modifier lockMove, which does NOT block the dodge, so the dodge ends it early). While rooted the
 * poise of every hit on the player is zeroed by a defender-band modifier at order -30 (guard -50 and Oathward -40 have run; the
 * buffs band starts at 0). Each hostile hit taken releases a shockwave (0.5x base, poise 20, 3 m), at most once per 0.75 s.
 */
export const EARTHROOT = {
  seconds: 5,
  cooldown: 20,
  emberCost: 20,
  modifierId: 'warden.earthroot',
  order: -30,
  moveSource: 'warden.earthroot',
  shockRadius: 3,
  shockDamageFactor: 0.5,
  shockPoise: 20,
  shockIntervalSeconds: 0.75,
  attackId: 'warden.earthroot',
  effect: 'earthroot',
  shockEffect: 'earthroot-shock',
} as const;

/**
 * Frenzied Hearth: strictly below 30% of the live max health (Burn and Scars already lower it; exactly 30% is not below). Incoming
 * poise is zeroed by a buffs-band modifier at order 10 (before Grit Teeth's 50) and the poise bar is refilled each fixed tick.
 * Each melee hit landed while below 30% heals 2% of the current max health, once per swing.
 */
export const FRENZIED_HEARTH = {
  threshold: 0.3,
  healFraction: 0.02,
  modifierId: 'warden.frenziedHearth',
  order: 10,
  effect: 'frenzied-hearth',
} as const;

/**
 * Tier 5 capstones (K11 PR 3, design 9.2 and 11.5; numbers are own, about 2 to 3 times a tier 4 skill).
 *
 * Wyrmbreaker: the press charges for 0.8 s on its own (the bar has presses only), then the 2H chop plays (the same clip and hot
 * window as Skullsplitter) and a 12 m by 4 m fissure ahead of the player takes 2.5x the weapon base with poise 60, once per cast.
 * Every foe the chop hit is "cracked" for 8 s: a defender-band modifier at order -55 (before the guard at -50) raises every hit it
 * takes by 25%, whatever the source. Enemies have no armour stat, so this is the cracked-armour reading. A flinch, stagger, dodge,
 * death or another attack during the charge cancels the cast; the Ember is already spent (the abilities service charges on the
 * press) and nothing is refunded.
 */
export const WYRMBREAKER = {
  chargeTicks: 48, // 0.8 s at 60 Hz
  /** A flinch (a light hit) does not break the charge; the chop waits up to this long after the charge for the flinch to end. */
  flinchGraceTicks: 30,
  length: 12,
  width: 4,
  damageFactor: 2.5,
  poise: 60,
  cooldown: 30,
  emberCost: 30,
  clip: WARDEN_CLIPS.chop,
  attackId: 'warden.wyrmbreaker',
  /** The chop clip: 98 ticks, blade hot from tick 34 (as Skullsplitter). The fissure lands on the first hot tick. */
  chopTicks: 98,
  hitTick: 34,
  crackSeconds: 8,
  crackFactor: 1.25,
  crackModifierId: 'warden.wyrmbreaker.crack',
  crackOrder: -55,
  moveSource: 'warden.wyrmbreaker',
  effect: 'wyrmbreaker',
  chargeEffect: 'wyrmbreaker-charge',
  /** Design 11.5: 100 ms hit-stop on release, plus a camera shake. */
  hitStopSeconds: 0.1,
  shakeAmplitude: 0.45,
  shakeSeconds: 0.3,
} as const;

/**
 * Mountain Unmoved: for 10 s the poise of every hit on the player is zeroed (a buffs-band modifier at order 20, between Frenzied
 * Hearth at 10 and Grit Teeth at 50; Earthroot's -30 runs before it) so there is no stagger or break, and every knockback is
 * cancelled through the combat verbs' knockback filter. The 0.3 s flinch on damage stays (it keys on the hit, as in Earthroot) and
 * pulls (`actor.pulled`) are not knockback and stay.
 */
export const MOUNTAIN_UNMOVED = {
  seconds: 10,
  cooldown: 45,
  emberCost: 25,
  modifierId: 'warden.mountainUnmoved',
  order: 20,
  filterId: 'warden.mountainUnmoved',
  effect: 'mountain-unmoved',
} as const;

/**
 * Voice of the Mountain: every hostile within 12 m (horizontal, inclusive) takes a 0-damage unblockable hit with poise 40 and a 3 s
 * stun under `warden.voiceOfTheMountain.stun`. Bosses take the poise only; foes in a mercy state are skipped.
 */
export const VOICE_OF_THE_MOUNTAIN = {
  radius: 12,
  poise: 40,
  stunSeconds: 3,
  stunId: 'warden.voiceOfTheMountain.stun',
  cooldown: 45,
  emberCost: 30,
  attackId: 'warden.voiceOfTheMountain',
  effect: 'voice-of-the-mountain',
  stunEffect: 'voice-stun',
  /** Design 11.5: camera shake 0.4 s. */
  shakeAmplitude: 0.4,
  shakeSeconds: 0.4,
} as const;
