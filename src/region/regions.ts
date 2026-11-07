// The region registry (contracts v0.6 item 3, design 4.2): the one table of every region's box, level band, music
// track, ambience bed, ground rules and open condition. `regionAt`, the enemy level bands, the ambience beds and the
// containment service all read it. Boxes are in design "map" metres (engine = map + MAP_TO_ENGINE_OFFSET), min
// inclusive and max exclusive. Reserved regions belong to later acts: their boxes are drawn so nothing else is built
// there, `regionAt` never answers them and containment never opens them.
import { flagConditionHolds, type FlagCondition, type FlagReader } from '../core/flagCondition';

export type RegionId =
  | 'brightwater'
  | 'harrowmark'
  | 'cinderreach'
  | 'oldsmoke'
  | 'greyfen'
  | 'dragonspine'
  | 'ashen-waste'
  | 'caldera';

export interface MapBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** engine = map + offset. Brightwater's box starts at map (500, 500), which lands 500 m before the origin. */
export const MAP_TO_ENGINE_OFFSET = { x: -1000, z: -1000 } as const;

export interface RegionDef {
  /** Map-space box (min inclusive, max exclusive). */
  box: MapBox;
  levelBand: { min: number; max: number };
  /** Music track id (an id with no registered track keeps the previous regional track; music-states.md 8). */
  track: string;
  /** Ambience bed id, or null for none yet. */
  bed: RegionBedId | null;
  /** Ground rules key for the terrain worker; A1 fills the Act 2 ones. */
  ground: string | null;
  /** When the region is part of the open area (containment). */
  openWhen: FlagCondition;
  /** A later act's region: never answered by `regionAt`, never open. */
  reserved: boolean;
  /**
   * v0.8: act-scoped bands. The first entry whose condition holds replaces `levelBand` (Harrowmark's Act 4 band from
   * `story.gate.a4`); none holding keeps `levelBand`. Read through `regionBandNow`.
   */
  bandWhen?: readonly { when: FlagCondition; band: { min: number; max: number } }[];
  /** v0.8: a track variant by flag (Harrowmark's ash variant from `story.gate.a4`); the first entry that holds wins. */
  trackWhen?: readonly { when: FlagCondition; track: string }[];
  /** v0.8: the region's weather (L3 runs ash storms only where this is 'ash-storm': the Waste). */
  weather?: 'ash-storm';
  /** v0.8 (Q4): the Ashmare cannot be summoned in this region (`mount.refused.region`); L3 dismisses it at the edge. */
  mount?: 'refused';
  /** v0.9: a sky key the environment reads by region ('caldera-orange'); an unknown key keeps the default sky. */
  sky?: string;
}

/**
 * Phase holds, per region: flags that nothing writes, held shut until a milestone retires them. Phase C held Oldsmoke
 * shut with `story.phase.oldsmokeOpen`; the Phase D PR retired it, so Oldsmoke opens on `story.d03.complete` alone.
 * v0.7: Act 3's Phase E held the Dragonspine (and the Spine Road) with `story.phase.dragonspineOpen`; Phase F's PR (K16 PR 2)
 * retired it, so the Dragonspine opens on `story.gate.a3` alone. A region's hold is spread into its own `openWhen` only, so a
 * hold never touches another region.
 */
export const PHASE_HOLDS: Readonly<Partial<Record<RegionId, readonly string[]>>> = {
  // v0.8 (Act 4, Q11): Phase G held the Waste shut with `story.phase.wasteOpen`; L13 PR 2 retired it, so the Waste opens on
  // M42 accepted alone. An old save that still carries the flag loads cleanly: nothing reads it.
  // v0.9 (Act 5): Phase I holds the bowl floor (`hole.caldera.floor`) with `story.phase.foundryOpen`; N12 PR 2 empties it.
  // The exception to the rule above: the Caldera's hold is spread into its floor hole, not the region's `openWhen`.
  caldera: ['story.phase.foundryOpen'],
};

/** The hold flags of one region (empty when it has none). */
export function phaseHolds(id: RegionId): readonly string[] {
  return PHASE_HOLDS[id] ?? [];
}

/** Ambience bed ids a region can name (A14 built the Act 2 ones, K14 the Act 3 ones). */
export type RegionBedId = 'brightwater' | 'harrowmark' | 'cinderreach' | 'oldsmoke' | 'greyfen' | 'dragonspine' | 'ashen-waste' | 'caldera';

/** v0.8: Harrowmark's Act 4 band (design 3, plan 3.1), from `story.gate.a4`; capped at spawn by ACT4_CAP_ABOVE_PLAYER. */
export const HARROWMARK_ACT4_BAND = { min: 28, max: 33 } as const;
/** v0.8: the flag that switches Harrowmark to Act 4 (its band, its track variant, the kill XP factor and the cap). */
export const ACT4_GATE_FLAG = 'story.gate.a4';
/** v0.9: the flag that opens Act 5 (M46 and D08 complete): the Caldera's region, its band and the kill XP factor. */
export const ACT5_GATE_FLAG = 'story.gate.a5';

export const REGION_INFO: Readonly<Record<RegionId, RegionDef>> = {
  brightwater: {
    box: { x0: 500, z0: 500, x1: 6500, z1: 5500 },
    levelBand: { min: 1, max: 9 },
    track: 'barley-and-brazier',
    bed: 'brightwater',
    ground: null,
    openWhen: {},
    reserved: false,
  },
  // Design 4.2: 7.5..11.5 km by 1..5 km, engine x 6500..10500, z 0..4000.
  harrowmark: {
    box: { x0: 7500, z0: 1000, x1: 11500, z1: 5000 },
    levelBand: { min: 4, max: 9 },
    track: 'seven-gates-one-drum',
    bed: 'harrowmark',
    ground: null,
    openWhen: {},
    reserved: false,
    bandWhen: [{ when: { all: [ACT4_GATE_FLAG] }, band: HARROWMARK_ACT4_BAND }],
    trackWhen: [{ when: { all: [ACT4_GATE_FLAG] }, track: 'seven-gates-ash' }],
  },
  // Engine x 15500..22500, z -500..5500. Opens when Act 1 ends.
  cinderreach: {
    box: { x0: 16500, z0: 500, x1: 23500, z1: 6500 },
    levelBand: { min: 8, max: 14 },
    track: 'ash-on-the-pasture',
    bed: 'cinderreach',
    ground: 'cinderreach',
    openWhen: { all: ['story.gate.a2'] },
    reserved: false,
  },
  // Engine x 17000..22000, z 7000..12000. Opens when Scorchhold falls (D03).
  oldsmoke: {
    box: { x0: 18000, z0: 8000, x1: 23000, z1: 13000 },
    levelBand: { min: 12, max: 19 },
    track: 'hammers-below',
    bed: 'oldsmoke',
    ground: 'oldsmoke',
    openWhen: { all: ['story.d03.complete'] },
    reserved: false,
  },
  // v0.7 (Act 3): engine x -500..6500, z 9500..15500. Opens when Act 2 ends. The band is a fallback only (the union of
  // both orders' block levels, invented in CHANGES-v0.7): every Act 3 spawner names a block or an area (lint).
  greyfen: {
    box: { x0: 500, z0: 10500, x1: 7500, z1: 16500 },
    levelBand: { min: 18, max: 26 },
    track: 'peat-and-pitch',
    bed: 'greyfen',
    ground: 'greyfen',
    openWhen: { all: ['story.gate.a3'] },
    reserved: false,
  },
  // v0.7: engine x 10000..17000, z 11000..17000; the summit is an area inside it (areas.ts). Held in Phase E.
  dragonspine: {
    box: { x0: 11000, z0: 12000, x1: 18000, z1: 18000 },
    levelBand: { min: 20, max: 28 },
    track: 'wing-over-rime',
    bed: 'dragonspine',
    ground: 'dragonspine',
    openWhen: { all: ['story.gate.a3', ...phaseHolds('dragonspine')] },
    reserved: false,
  },
  // v0.8 (Act 4): engine x 7000..15000, z 4500..11000. A ring around the Caldera: the box includes the Caldera, which
  // stays reserved (and a closed containment hole); `regionAt` answers null inside any reserved box. Opens when Gate of
  // Ash (M42) is accepted (the Phase G hold is retired). Bands capped at spawn (Q1).
  'ashen-waste': {
    box: { x0: 8000, z0: 5500, x1: 16000, z1: 12000 },
    levelBand: { min: 31, max: 35 },
    track: 'dust-chant',
    bed: 'ashen-waste',
    ground: 'ash',
    openWhen: { all: ['story.m42.started', ...phaseHolds('ashen-waste')] },
    reserved: false,
    weather: 'ash-storm',
    mount: 'refused',
  },
  // v0.9 (Act 5): engine x 9500..12500, z 6500..9500, inside the Waste's ring; `regionAt` answers it before the Waste.
  // Opens on `story.gate.a5` (M46 and D08 complete). Bands are capped at spawn (ACT5_CAP_ABOVE_PLAYER); the bowl's sub-bands
  // are named-only areas (areas.ts). No storm clock (the siege forces its own); the Ashmare is refused as in the Waste.
  // The ambience bed is N8's `caldera` (rumble, bubbling lava, ember crackle).
  caldera: {
    box: { x0: 10500, z0: 7500, x1: 13500, z1: 10500 },
    levelBand: { min: 35, max: 40 },
    track: 'heart-of-the-anvil',
    bed: 'caldera',
    ground: 'caldera',
    // The Phase I hold (`PHASE_HOLDS.caldera`) holds the bowl floor's hole, not the region (act5Containment.ts).
    openWhen: { all: [ACT5_GATE_FLAG] },
    reserved: false,
    mount: 'refused',
    sky: 'caldera-orange',
  },
};

export const REGION_IDS = Object.keys(REGION_INFO) as RegionId[];

/** The engine-space box of a region (min inclusive, max exclusive). */
export function engineBox(id: RegionId): MapBox {
  const b = REGION_INFO[id].box;
  return {
    x0: b.x0 + MAP_TO_ENGINE_OFFSET.x,
    z0: b.z0 + MAP_TO_ENGINE_OFFSET.z,
    x1: b.x1 + MAP_TO_ENGINE_OFFSET.x,
    z1: b.z1 + MAP_TO_ENGINE_OFFSET.z,
  };
}

/** v0.8: a region's band now: the first `bandWhen` entry that holds, else `levelBand`. A copy. */
export function regionBandNow(id: RegionId, flags?: FlagReader | null): { min: number; max: number } {
  const def = REGION_INFO[id];
  if (flags) for (const e of def.bandWhen ?? []) if (flagConditionHolds(e.when, flags)) return { ...e.band };
  return { ...def.levelBand };
}

/** v0.8: a region's track now: the first `trackWhen` entry that holds, else `track`. */
export function regionTrackNow(id: RegionId, flags?: FlagReader | null): string {
  const def = REGION_INFO[id];
  if (flags) for (const e of def.trackWhen ?? []) if (flagConditionHolds(e.when, flags)) return e.track;
  return def.track;
}

/**
 * v0.8 item 12: the region at (x, z) refuses a summon (`mount: 'refused'`): the Ashen Waste, Caldera box included.
 * Reads the engine boxes directly; the player cannot stand there before the Waste opens anyway (containment).
 */
export function regionRefusesMount(x: number, z: number): boolean {
  for (const id of REGION_IDS) {
    const r = REGION_INFO[id];
    if (r.mount !== 'refused' || r.reserved) continue;
    const b = engineBox(id);
    if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return true;
  }
  return false;
}
