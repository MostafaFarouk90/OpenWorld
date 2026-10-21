// The region registry (contracts v0.6 item 3, design 4.2): the one table of every region's box, level band, music
// track, ambience bed, ground rules and open condition. `regionAt`, the enemy level bands, the ambience beds and the
// containment service all read it. Boxes are in design "map" metres (engine = map + MAP_TO_ENGINE_OFFSET), min
// inclusive and max exclusive. Reserved regions belong to later acts: their boxes are drawn so nothing else is built
// there, `regionAt` never answers them and containment never opens them.
import type { FlagCondition } from '../core/flagCondition';

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
}

/**
 * Phase holds: flags that nothing writes, held shut until a milestone retires them. `story.phase.oldsmokeOpen`
 * keeps Oldsmoke (and the pass wall) closed through Phase C even after D03; A16's final PR empties this list (a
 * one-line edit allowed to A16), so the pass then opens on D03 alone.
 */
export const PHASE_HOLDS: readonly string[] = ['story.phase.oldsmokeOpen'];

const NEVER: FlagCondition = { any: ['region.never'] };

/** Ambience bed ids a region can name (A14 built the Act 2 ones). */
export type RegionBedId = 'brightwater' | 'harrowmark' | 'cinderreach' | 'oldsmoke';

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
  },
  // Engine x 15500..22500, z -500..5500. Opens when Act 1 ends.
  cinderreach: {
    box: { x0: 16500, z0: 500, x1: 23500, z1: 6500 },
    levelBand: { min: 8, max: 14 },
    track: 'ash-on-the-pasture',
    bed: 'cinderreach',
    ground: null,
    openWhen: { all: ['story.gate.a2'] },
    reserved: false,
  },
  // Engine x 17000..22000, z 7000..12000. Opens when Scorchhold falls (D03), held through Phase C by PHASE_HOLDS.
  oldsmoke: {
    box: { x0: 18000, z0: 8000, x1: 23000, z1: 13000 },
    levelBand: { min: 12, max: 19 },
    track: 'hammers-below',
    bed: 'oldsmoke',
    ground: null,
    openWhen: { all: ['story.d03.complete', ...PHASE_HOLDS] },
    reserved: false,
  },
  // Reserved (later acts): band and track are placeholders until the act that builds the region sets them.
  greyfen: {
    box: { x0: 500, z0: 10500, x1: 7500, z1: 16500 },
    levelBand: { min: 18, max: 23 },
    track: 'greyfen',
    bed: null,
    ground: null,
    openWhen: NEVER,
    reserved: true,
  },
  dragonspine: {
    box: { x0: 11000, z0: 12000, x1: 18000, z1: 18000 },
    levelBand: { min: 20, max: 28 },
    track: 'dragonspine',
    bed: null,
    ground: null,
    openWhen: NEVER,
    reserved: true,
  },
  // A ring around the Caldera; the box includes the Caldera, which is listed (and reserved) on its own.
  'ashen-waste': {
    box: { x0: 8000, z0: 5500, x1: 16000, z1: 12000 },
    levelBand: { min: 28, max: 34 },
    track: 'ashen-waste',
    bed: null,
    ground: null,
    openWhen: NEVER,
    reserved: true,
  },
  caldera: {
    box: { x0: 10500, z0: 7500, x1: 13500, z1: 10500 },
    levelBand: { min: 34, max: 40 },
    track: 'caldera',
    bed: null,
    ground: null,
    openWhen: NEVER,
    reserved: true,
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
