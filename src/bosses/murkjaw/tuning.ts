import { ACT3_BOSS_IDS } from '../act3Bosses';

/**
 * Murkjaw the Peat Eel-King's numbers (plans/act3-K8.md). The design gives: an enormous eel under the water of D05's flooded
 * undercroft; he surfaces to bite (a whip bite, a water wave); a 1.0 s water bulge and gurgle before each attack; three breaks;
 * no mercy; L + 5 of the Greyfen block; about 1,800 health and 600 kill XP. K3 gave the arena (walkways over deep channels,
 * spear racks); the plan added the beaching lunge's jaw bonus and the break that beaches him. Everything else is a reading for
 * K16's pacing run to retune.
 */

export const MURKJAW_BOSS_ID = ACT3_BOSS_IDS.murkjaw;
export const MURKJAW_KIND = 'murkjaw';
export const MURKJAW_NAME_KEY = 'boss.murkjaw.name';

/** K3's D05 lock flag, which K12 writes when D05 is taken; the arena arms on it. */
export const D05_STARTED_FLAG = 'story.d05.started';

/** K3's frozen names in the Mirewater Deeps (src/greyfen/deepsInterior.ts, plans/act3-briefs/K8.md). */
export const ARENA = {
  interiorId: 'greyfen-deeps',
  trigger: 'trg.greyfen.d05.arena',
  door: 'greyfen.d05.arena.door',
  centre: 'greyfen.d05.arena.centre',
  gate: 'greyfen.d05.arena.gate',
  drop: 'greyfen.d05.arena.drop',
  surfaces: [1, 2, 3, 4, 5, 6].map((n) => `greyfen.d05.arena.surface.${n}`) as readonly string[],
  beaches: [1, 2, 3, 4, 5, 6].map((n) => `greyfen.d05.arena.beach.${n}`) as readonly string[],
  racks: [1, 2, 3, 4].map((n) => `greyfen.d05.arena.rack.${n}`) as readonly string[],
  walkways: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `greyfen.d05.arena.walkway.${n}`) as readonly string[],
  gateClearance: 3.5,
  /** Fallback only: the veil sits on K3's gate rect (`gateVeil`). */
  veilOffset: 2,
  veilWidth: 4.6,
  veilHeight: 3.5,
} as const;

export const MURKJAW = {
  /** Fallbacks when the Greyfen block has no lock (a damaged save): its preview + 5, then this. */
  fallbackLevel: 23,
  /** The level his health and damage are set for; each level above adds `perLevel` (a reading, coordinator-approved). */
  baseLevel: 23,
  perLevel: 0.05,
  maxHealth: 1800,
  maxPoise: 100,
  /** Exposed seconds without a landed hit before poise refills; the clock pauses while he is under (the Slagmaw lesson). */
  poiseRegenDelay: 4,
  /** Three phases (below 66 % and below 33 %), one break each; the third break is the `last`. */
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  healthFloor: 0.08,
  floorModifierOrder: 99,
  jawModifierOrder: 97,
  /** Every hit on him while his jaw lies on a walkway (beached or broken). */
  jawScale: 1.25,
  /** A break throws him onto the nearest walkway, stunned. */
  breakSeconds: 3,
} as const;

export type MurkjawAttack = 'bite' | 'wave' | 'lunge';

/** The cycle (seconds); arrays are by phase. */
export const CYCLE = {
  /** The design's water bulge and gurgle before every attack. */
  bulgeSeconds: 1.0,
  /** The bite's and the lunge's aim locks this long before the strike, so a late dodge works. */
  aimLockBefore: 0.25,
  submergedSeconds: [2.6, 2.2, 1.8] as readonly number[],
  /** Up after a bite (open to spears and ranged skills, out of blade reach). */
  surfacedSeconds: [3.0, 2.6, 2.2] as readonly number[],
  /** Up after a wave. */
  waveSurfacedSeconds: 2.0,
  biteSeconds: 0.35,
  waveSeconds: 0.6,
  lungeSeconds: 0.4,
  beachedSeconds: 2.5,
  slideSeconds: 0.6,
  sinkSeconds: 0.6,
  /** A lunge at least every this many attacks (so a blade always gets its window). */
  lungeEvery: 3,
  /** Phase 3: a wave is followed at once by a bite from the same spot. */
  chainFromPhase: 3,
} as const;

export const BITE = {
  attackId: 'murkjaw.bite',
  telegraph: 'block' as const,
  damage: 30,
  poise: 25,
  reach: 8,
  halfWidth: 0.75,
};

export const WAVE = {
  attackId: 'murkjaw.wave',
  telegraph: 'dodge' as const,
  damage: 12,
  poise: 10,
  radius: 9,
  pushSpeed: 9,
  pushSeconds: 0.5,
  /** The capsule half-width plus a margin: the push stops this short of a walkway edge. */
  edgeMargin: 0.45,
};

export const LUNGE = {
  attackId: 'murkjaw.lunge',
  telegraph: 'dodge' as const,
  damage: 36,
  poise: 40,
  halfWidth: 1.5,
  /** The lane runs this far past the beach point. */
  overshoot: 1,
};

/** Any hit lands only on a player within this height of the walkway. */
export const HIT_HEIGHT = 2.5;

/** A break flings his jaw from the surfacing point nearest the player toward them: stopping `short` metres off, `min`..`max` long. */
export const BREAK_REACH = { short: 1.2, min: 2, max: 9 } as const;

export const SPEARS = {
  perRack: 3,
  refillSeconds: 8,
  /** The throw interactable's reach (no facing cone). */
  range: 22,
  flightSeconds: 0.35,
  /** A spear is a break tool more than a damage tool: three break a fresh 100 poise (x1.5 on a beached jaw). */
  damage: 30,
  poise: 34,
  attackId: 'murkjaw.spear',
  rackRadius: 2.2,
} as const;

/** Phase 2's walkway drop. */
export const DROP = {
  crumbleSeconds: 2,
  /** The drop waits while the player stands on the crossing or this close to it. */
  clearMargin: 1,
  /** ...and only while their feet are within this of the walkway's height (not in the air, not in a channel). */
  standHeight: 0.6,
} as const;

export const PRESENTATION = {
  introSeconds: 4,
  introGurgleAt: 1.2,
  retrySeconds: 1.2,
  deathSeconds: 2.4,
  deathFadeSeconds: 1.8,
} as const;

export const LOOK = {
  segments: 14,
  headRadius: 1.1,
  tailRadius: 0.3,
  spacing: 1.05,
  skin: 0x3b2f22,
  belly: 0x8a7a55,
  eye: 0xd8e8c0,
  tooth: 0xe8e2cc,
  water: 0x5f7a6a,
  foam: 0xd8e4dc,
  veil: 0x16221c,
  /** Under-water depth of a hidden segment (m). */
  under: 1.6,
} as const;

/** Sound keys (silent until the audio side registers them). */
export const SFX = {
  gurgle: 'sfx.murkjaw.gurgle',
  bite: 'sfx.murkjaw.bite',
  wave: 'sfx.murkjaw.wave',
  lunge: 'sfx.murkjaw.lunge',
  splash: 'sfx.murkjaw.splash',
  crumble: 'sfx.murkjaw.crumble',
  death: 'sfx.murkjaw.death',
} as const;

/** Health and hit damage scale for his level (1 at `baseLevel`; never below 1). */
export function levelScale(level: number): number {
  const steps = Number.isFinite(level) ? Math.max(0, level - MURKJAW.baseLevel) : 0;
  return 1 + MURKJAW.perLevel * steps;
}
