import type { MoveDef } from '../../enemies/types';

/**
 * The Slagmaw's numbers (plans/act2-A8.md, "PR 2, the Slagmaw"). The design gives: a segmented lava worm, a burrow strike and a
 * lava spit, a 1.2 s ground tremor with spreading glowing cracks and a 0.1 m camera shake before each eruption, three breaks each
 * opened by cooling it at one of A9's pool valves, no mercy. Everything else is a reading for A16's headless run to retune.
 */

export const SLAGMAW_BOSS_ID = 'the-slagmaw';
export const SLAGMAW_KIND = 'the-slagmaw';
export const SLAGMAW_NAME_KEY = 'boss.the-slagmaw.name';

/** A13's D04 sets this when the arena objective becomes current; the arena arms on it. */
export const D04_STARTED_FLAG = 'story.d04.started';

/**
 * Anchors, trigger and blocker of A4's Deepdelve (src/oldsmoke/mines/deepdelve.ts). The arena floor is 30 x 30 m and flat
 * (local x 150..180, z -35..-5, centre 165,-20); the gate is a 1.5 x 4 m blocker in the approach corridor's east end.
 */
export const ARENA = {
  interiorId: 'mine-deepdelve',
  arenaTrigger: 'trg.deepdelve.slagmaw.arena',
  arenaDoor: 'deepdelve.slagmaw.arena.door',
  centre: 'deepdelve.slagmaw.arena.centre',
  gate: 'deepdelve.slagmaw.arena.gate',
  /** The valve anchors, one per break. */
  valves: ['deepdelve.slagmaw.valve.1', 'deepdelve.slagmaw.valve.2', 'deepdelve.slagmaw.valve.3'] as readonly string[],
  /** Eruptions and the worm stay inside this half-extent around the centre: 2 m off the walls, clear of the 1 m lava rims. */
  arenaHalfExtent: 13,
  /** The arena rectangle exactly (walls at 15 m); the gate rect and the approach lie outside it. */
  reloadHalfExtent: 15,
  gateClearance: 3.5,
  /** Fallback only: the veil is placed on A4's gate rect (`gateVeil`). */
  veilOffset: 2,
  /** The veil spans the 4 m gate with a little overlap into the corridor walls. */
  veilWidth: 4.5,
  veilHeight: 3,
} as const;

export const SLAGMAW = {
  /** The top of the Cinderreach band, one above Redmane. */
  level: 15,
  maxHealth: 1500,
  maxPoise: 90,
  poiseRegenDelay: 4,
  /** Three phases (below 66 % and below 33 %), one break each; the third break is the `last` and he can then die. */
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  /** No mercy: the registry def has no mercy verb and a zero window. */
  releaseWindowSeconds: 0,
  /** Until the `last` break, health never drops below this fraction. */
  healthFloor: 0.08,
  floorModifierOrder: 99,
  /** Poise damage multiplier while his crust is hot (anything but a valve cool). 0 = none. */
  hotPoiseScale: 0,
  breakSeconds: 4,
} as const;

/** The valves: operating valve N (once per phase, in phase order N) douses the arena and cools his crust. */
export const COOLING = {
  /** How long a cooled crust lasts (poise damage counts) before it re-heats and poise is restored. */
  seconds: 9,
  /** The doused disc around the valve; a surfaced Slagmaw inside it, or surfacing inside it while cooled, is hit by the spray. */
  radius: 7,
  /** Interact radius of a valve. */
  interactRadius: 2.2,
  /** A hot-crusted worm resurfacing inside the disc takes the cooling hit at once. */
  positions: 2,
} as const;

/** The cycle: burrowed, tremor, eruption, surfaced, submerge. */
export const CYCLE = {
  /** Underground time before a tremor, by phase (seconds). */
  burrowedSeconds: [3.5, 2.8, 2.2] as readonly number[],
  /** The ground tremor before every eruption: the design's 1.2 s with spreading cracks and a 0.1 m camera shake. */
  tremorSeconds: 1.2,
  shakeMetres: 0.1,
  /** Eruption: a burst at the locked spot. Dodge only. */
  eruptionRadius: 4.5,
  eruptionDamage: 34,
  eruptionPoise: 30,
  /** Seconds the worm is up after erupting (open to blades, spits lava). */
  surfacedSeconds: [5, 5.5, 6] as readonly number[],
  /** Lava spits while surfaced: first after this, then every. */
  spitFirstSeconds: 1.2,
  spitEverySeconds: [2.2, 1.8, 1.4] as readonly number[],
  submergeSeconds: 0.8,
  /** The spot locks this long before the eruption, so a late roll dodges it. */
  aimLockBefore: 0.25,
  /** Phase 3 only: the burrow strike chains a second tremor right after the first eruption. */
  chainFromPhase: 3,
} as const;

/** The burrow strike: the eruption move as the shared telegraph record. */
export const ERUPTION = {
  attackId: 'slagmaw.eruption',
  telegraph: 'dodge',
  damage: CYCLE.eruptionDamage,
  poise: CYCLE.eruptionPoise,
} as const;

/** The lava spit rides A6b's projectile adapter as a glob (ignites on hit). Dodge or block. */
export const SPIT_MOVE: MoveDef = {
  id: 'slagmaw.spit',
  clip: 'Throw',
  activeStart: 0.3,
  activeEnd: 0.5,
  windup: 0.5,
  telegraph: 'block',
  weapon: 'right',
  damage: 14,
  poise: 12,
  range: [3, 22],
  cooldown: 1.4,
  recover: 0.4,
  weight: 0,
  ranged: { shape: 'glob', speed: 13, maxRange: 24, radius: 0.55, originHeight: 2.4 },
  /** A parry would stagger the shooter and empty his poise; only a valve cool may do that. */
  parryable: false,
};

/** Presentation timings (sim seconds). */
export const PRESENTATION = {
  introSeconds: 4.5,
  introRumbleAt: 1.2,
  retrySeconds: 1.2,
  deathSeconds: 2.4,
  deathFadeSeconds: 1.8,
} as const;

/** Look: a procedural segmented worm with a scrolling lava shader (region-local coordinates only). */
export const LOOK = {
  segments: 9,
  /** Head radius and the taper to the tail (m). */
  headRadius: 1.5,
  tailRadius: 0.7,
  segmentSpacing: 1.6,
  crustColor: 0x4a3830,
  /** Base emissive lift so the shaded side never goes black: ember hot, a faint slate lift cooled. */
  crustEmber: 0x3a1408,
  crustEmberCooled: 0x22262b,
  plateColor: 0x5a4a42,
  plateEmber: 0x8a2a0a,
  plateCooled: 0x80878f,
  seamCooled: 0x5a2a1a,
  lavaColor: 0xff5a1f,
  lavaHot: 0xffc23a,
  /** The cooled crust: dark and dull (the valve douse). */
  cooledColor: 0x7a838e,
  crackColor: 0xff7a2a,
  veilColor: 0x2a1812,
} as const;
