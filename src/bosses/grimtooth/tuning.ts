/**
 * Gaffer Grimtooth's numbers (plans/slice-2-grimtooth.md sections 3 and 11). The design gives the 0.5 s pounce crouch with a
 * red collar flash, the 1.8x scale, the tail weak spot and three breaks (design 10 row 18); everything else is a reading for
 * the integration thread to tune.
 */

export const GRIMTOOTH_BOSS_ID = 'gaffer-grimtooth';
export const GRIMTOOTH_KIND = 'gaffer-grimtooth';
export const GRIMTOOTH_NAME_KEY = 'boss.gaffer-grimtooth.name';

/** Anchors, trigger and blocker from thread 3a's Underways (src/interiors/underways/generate.ts). */
export const ARENA = {
  interiorId: 'underways',
  arenaTrigger: 'trg.underways.arena',
  arenaDoor: 'underways.arena.door',
  centre: 'underways.arena.centre',
  gate: 'underways.arena.gate',
  /** 3a's arena is 24 x 24 m: he keeps inside this half-extent around the centre. */
  arenaHalfExtent: 11,
  /** The load-teleport rectangle is 3a's whole arena (review S8). */
  reloadHalfExtent: 12,
  /** The door anchor is 4 m outside the wall and the gate spans 2.5 to 4 m from it (review B2). */
  gateClearance: 5,
  veilOffset: 3.25,
} as const;

/** Thread 5's ephemeral summon group (count 4 on `underways.summon.1..4`). */
export const SUMMON_GROUP = 'grimtooth-summons';

/** D02's hound objective (thread 6's `d02` def): the arena arms once it is done (3a's 17:30 note). */
export const D02 = { questId: 'd02', houndObjective: 'o3' } as const;

export const GRIMTOOTH = {
  /** The top of the Act 1 band (design 2: levels 1 to 9). */
  level: 9,
  maxHealth: 900,
  maxPoise: 70,
  poiseRegenDelay: 4,
  /** Three phases, one break each: the `last` break (the mercy window) is the first break of phase 3 (ruling 17:34). */
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  releaseWindowSeconds: 6,
  /** Until the `last` break, health never drops below this fraction; after it he can die outside the window (review S7). */
  healthFloor: 0.08,
  floorModifierOrder: 99,
  /** The tail break runs just before the floor (review S4). */
  tailModifierOrder: 98,
  /** A melee hit on the tail travelling within 60 degrees of his facing (`direction . forward >= 0.5`) breaks his poise. */
  tailFacingDot: 0.5,
  /** A tail hit that does not break (from the front, or a second in the phase) takes this much more damage. */
  tailDamageScale: 1.5,
  /** Turn rate toward the player (rad/s), so getting behind him takes work. */
  turnRate: 4,
  circleMin: 5,
  circleMax: 7,
  circleSecondsMin: 1.5,
  circleSecondsMax: 3,
  circleSpeed: 3.2,
  closeSpeed: 6,
  breakSeconds: 1.2,
  /** Seconds of the player within `campDistance` before he leaps back (no damage). */
  campSeconds: 10,
  campDistance: 2.5,
  backstepMetres: 6,
  backstepSeconds: 0.5,
  howlSeconds: 1.8,
} as const;

/** Howl waves: one at the start of phase 2 and one at the start of phase 3 (ruling 18:47: 2 hounds, then 3). */
export const HOWLS = {
  counts: [2, 3] as readonly number[],
  /** An interrupted howl is re-cast once, not counted again. */
  retries: 1,
} as const;

export interface GrimtoothMoveDef {
  id: 'pounce' | 'bite';
  attackId: string;
  telegraph: 'block' | 'dodge';
  windup: number;
  recover: number;
  cooldown: number;
  /** Distance band (m, feet to feet) in which the move may start. */
  range: readonly [number, number];
  damage: number;
  poise: number;
}

export const MOVES: Readonly<Record<GrimtoothMoveDef['id'], GrimtoothMoveDef>> = {
  /** Pounce: a 0.5 s crouch (tail flare, line decal, red collar flash), a red leap. Dodge only. */
  pounce: {
    id: 'pounce',
    attackId: 'grimtooth.pounce',
    telegraph: 'dodge',
    windup: 0.5,
    recover: 1.1,
    cooldown: 4,
    range: [3, 7.5],
    damage: 32,
    poise: 35,
  },
  /** Burning bite: blockable, never parried (a script hit has no attack window). */
  bite: {
    id: 'bite',
    attackId: 'grimtooth.bite',
    telegraph: 'block',
    windup: 0.35,
    recover: 0.7,
    cooldown: 1.6,
    range: [0, 2.2],
    damage: 18,
    poise: 12,
  },
};

export const POUNCE = {
  /** The leap is capped here and stops this far short of the locked aim point. */
  maxMetres: 6.3,
  stopShort: 1.2,
  /** Airborne time (thread 5's Pounce clip). The hit is checked every airborne tick; first contact wins (review B1). */
  airSeconds: 0.4,
  /** Distance from the take-off-to-aim segment that still hits. */
  radius: 1.1,
  /** The aim locks this long before take-off, so a late side-step dodges it. */
  aimLockBefore: 0.15,
  /** The line decal fills over this long (design 11 "Pounce crouch": 0.4 s). */
  decalFillSeconds: 0.4,
} as const;

export const BITE = {
  reach: 2.4,
  /** Half-angle of the hit cone (radians). */
  halfAngle: Math.PI / 4,
  /** Thread 5's shared burning status (`BURNING_BITE`); applied only on outcome `hit`. */
  status: { id: 'hound-bite', kind: 'ignite' as const, dps: 2, seconds: 4 },
} as const;

/** Presentation timings (sim seconds). */
export const PRESENTATION = {
  introSeconds: 3,
  introRiseSeconds: 1.2,
  introHowlAt: 1.2,
  retrySeconds: 1.2,
  /** Calm: head low, then a walk away from the player while he fades (ruling 18:00). */
  calmHeadSeconds: 1.2,
  calmWalkSpeed: 2,
  calmDespawnAfter: 4,
  deathClipSeconds: 1.2,
  deathFadeSeconds: 1.4,
} as const;

/** Look (design 10 row 18: a scaled Ember Hound, spikes from instanced cones). */
export const LOOK = {
  /** The reach-defining proportions, pinned at the original hound's: the look changes by tint and scale, not hitboxes. */
  build: { bodyHeight: 0.42, legLength: 0.55, neckLength: 0.3, headSize: 0.27, tailLength: 0.6 },
  tint: 0x1c1210,
  emissive: 0x4a1200,
  collarFlash: 0xff2a10,
  spikeCount: 8,
  spikeColor: 0x2a2420,
  spikeEmissive: 0xff5a10,
  /** Effect 31's calm shell fades from orange to gold over this long. */
  calmShellSeconds: 0.8,
  calmShellFrom: 0xff8a30,
  calmShellTo: 0xffd770,
  soot: 0x3a3430,
} as const;
