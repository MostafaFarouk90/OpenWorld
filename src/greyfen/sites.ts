// The only place the Greyfen's positions come from (plans/act3-K3.md revision 2 item 2): K1's exports, and sub-sites derived
// from them. No other file in src/greyfen holds a map coordinate.
import { ACT3_FERRY, ACT3_INTERIOR_PADS, ACT3_PLACES, ACT3_WAYSTONES, M24_POOL, type Act3FerryStopId } from '../region/act3/act3Places';
import {
  CAUSEWAY_DECK,
  CAUSEWAY_GAPS,
  CAUSEWAY_REEDGATE_MERE_POINTS,
  FERRY_REEDGATE_MERE_POINTS,
  GAP_CUT_HALF_LENGTH,
  GREYFEN_WATER_TABLE,
  REEDBED_EAST,
  REEDBED_WEST,
} from '../terrain/shape/greyfen';

export interface XZ {
  x: number;
  z: number;
}
interface LocalBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Each interior's rooms, as a local box from its door (kept equal to the defs' rooms by a test). */
export const INTERIOR_FOOTPRINTS = {
  chapel: { x0: -8, z0: -38, x1: 40, z1: 30 },
  deeps: { x0: -48, z0: -76, x1: 42, z1: 1.5 },
  hut: { x0: -6, z0: -7.5, x1: 6, z1: 1.5 },
} as const satisfies Record<string, LocalBox>;

/** A footprint must keep this margin from its pad's edge on every side (the coordinator's review, item 3). */
export const PAD_MARGIN = 4;

/** The door that centres a footprint on its pad. */
function doorOnPad(pad: { x: number; z: number }, f: LocalBox): XZ {
  return { x: pad.x - (f.x0 + f.x1) / 2, z: pad.z - (f.z0 + f.z1) / 2 };
}

const P = ACT3_PLACES;

export const SITES = {
  reedgate: P.reedgate,
  ferryLanding: P['reedgate-ferry'],
  mere: P['hathrens-mere'],
  mereShrine: P['mere-shrine'],
  hut: P['mireweather-hut'],
  greywatchPosts: [P['greywatch-post-1'], P['greywatch-post-2'], P['greywatch-post-3'], P['greywatch-post-4']],
  chapelDoor: doorOnPad(ACT3_INTERIOR_PADS['sunken-chapel'], INTERIOR_FOOTPRINTS.chapel),
  deepsDoor: doorOnPad(ACT3_INTERIOR_PADS['mirewater-deeps'], INTERIOR_FOOTPRINTS.deeps),
  hutDoor: doorOnPad(ACT3_INTERIOR_PADS['mireweather-hut'], INTERIOR_FOOTPRINTS.hut),
  m24Pool: M24_POOL,
  waystones: ACT3_WAYSTONES,
} as const;

export const INTERIOR_PADS = {
  chapel: ACT3_INTERIOR_PADS['sunken-chapel'],
  deeps: ACT3_INTERIOR_PADS['mirewater-deeps'],
  hut: ACT3_INTERIOR_PADS['mireweather-hut'],
} as const;

// ---- outdoor sub-sites (revision 2 items 1 and 2): derived from K1's exports and fitted on the shaped ground in fit.ts.

/** Hathren's Mere waystone: 14 m west of K1's shrine point (agreed with K9, 21:13 UTC; K9 locks it until M26). */
export const MERE_WAYSTONE_WEST = 14;
/** K9 builds the shrine and its rite here: no K3 structure within this radius (test). */
export const SHRINE_CLEAR = 10;

export const FERRY_STOPS: Readonly<Record<Act3FerryStopId, XZ>> = Object.fromEntries(ACT3_FERRY.stops.map((s) => [s.id, { x: s.x, z: s.z }])) as Record<Act3FerryStopId, XZ>;

/** The four Greyfen waystones by their K1 ids (the Mere's moved per the K9 agreement). */
export const GREYFEN_WAYSTONES: Readonly<Record<'reedgate' | 'hathrens-mere' | 'greywatch' | 'mireweather-hut', XZ>> = {
  reedgate: { x: ACT3_WAYSTONES.reedgate.x, z: ACT3_WAYSTONES.reedgate.z },
  'hathrens-mere': { x: P['mere-shrine'].x - MERE_WAYSTONE_WEST, z: P['mere-shrine'].z },
  greywatch: { x: ACT3_WAYSTONES.greywatch.x, z: ACT3_WAYSTONES.greywatch.z },
  'mireweather-hut': { x: ACT3_WAYSTONES['mireweather-hut'].x, z: ACT3_WAYSTONES['mireweather-hut'].z },
};

export { CAUSEWAY_GAPS, CAUSEWAY_DECK, GREYFEN_WATER_TABLE, GAP_CUT_HALF_LENGTH, REEDBED_EAST, REEDBED_WEST, CAUSEWAY_REEDGATE_MERE_POINTS, FERRY_REEDGATE_MERE_POINTS };
export type { Act3FerryStopId };
