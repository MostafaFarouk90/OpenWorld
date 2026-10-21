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
