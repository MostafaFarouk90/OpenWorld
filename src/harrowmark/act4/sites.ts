// Harrowmark's Act 4 sites (plans/act4-L2.md, the master for Harrowmark's Act 4 positions). Plain data, no THREE: the layout,
// the interiors, the spawners and other threads import these; nothing else hard-codes an Act 4 Harrowmark position.
import { gatePosition, GATE_NAMES, gateBearing, type GateName } from '../city';

/** Act 4 opens on this (written by Act 3's ending); the ash state, posts and the act band key off it. */
export const A4_FLAG = 'story.gate.a4';
/** The city is Vey's from here (Q2): gates shut, waystone dark, posts inside the walls absent. */
export const OCCUPIED_FLAG = 'story.m38.complete';

/** The interiors' ids. */
export const CHAMBER_ID = 'council-chamber';
export const STAIRS_ID = 'keep-stairs';
export const CRUCIBLE_ID = 'crucible-cellars';
export const DEEP_RUN_ID = 'deep-run';

/** The Council Chamber's own door on the Keep's south face, 32 m east of the Keep hall's (which stays as it is). */
export const CHAMBER_DOOR = { anchor: 'harrowmark.a4.chamber.door', x: 8532, z: 2598, heading: 180 } as const;
/** The Crucible's door, 12 m inside the plugged Smelter gate, facing the wall (outward). */
const SMELTER_IN = gatePosition('smelter', 738);
export const CRUCIBLE_DOOR = {
  anchor: 'harrowmark.a4.crucible.door',
  x: Math.round(SMELTER_IN.x * 100) / 100,
  z: Math.round(SMELTER_IN.z * 100) / 100,
  heading: Math.round(gateBearing(GATE_NAMES.indexOf('smelter')) * 100) / 100,
} as const;
/** The deep run's way out, outside the north wall; M41's camp (L1's anchor) is 12 m from it. */
export const DEEP_RUN_EXIT = { anchor: 'harrowmark.a4.deeprun.exit', x: 8900, z: 3300, heading: 200 } as const;
/** L0 reserved this id and L1 places it; L4 reads it for the benched companions. Never rename it. */
export const M41_CAMP_ANCHOR = 'harrowmark.a4.m41.camp';
/** Only if L1's anchor is missing (the warn-once fallback in act4 layout). */
export const M41_CAMP_FALLBACK = { x: 8888, z: 3310 } as const;

/**
 * Where each interior floats. Every float stays at least 130 m (box to box) from every other, the enemies' wake range plus a
 * margin (interiors/harrowmark/sites.test.ts), so the chamber and the stairs float west of the Keep road, clear of the Keep
 * hall's float; the Crucible floats north of its door (220 m), clear of D02's Underways; the deep run floats over its own
 * exit, outside the walls. Doors find their interior by anchor, so the offsets are invisible.
 */
export const ACT4_SITES = {
  [CHAMBER_ID]: { x: 8300, z: 2450 },
  [STAIRS_ID]: { x: 8120, z: 2480 },
  [CRUCIBLE_ID]: { x: CRUCIBLE_DOOR.x, z: CRUCIBLE_DOOR.z + 220 },
} as const;

/** The working gates (shutters) the occupied city closes; `northeast` is L1's Ash Road gate. The other three are plugs. */
export const WORKING_GATES: readonly GateName[] = ['south', 'river', 'northwest', 'northeast'];
/** Each working gate's face anchor sits this far outside the wall on the gate's bearing. */
export const GATE_FACE_OUT = 15;
export const gateFaceAnchor = (gate: GateName): string => `harrowmark.a4.gate.${gate}.face`;

/** The River Gate's inside checkpoint, 20 m in from the gate on its bearing. */
export const RIVER_CHECKPOINT = gatePosition('river', 730);

/** Six checkpoints on the main streets (section 2): position and the barricade's heading (its rail runs across the street). */
export const CHECKPOINTS = [
  { id: 'keep-road-s', x: 8500, z: 1880, heading: 0 },
  { id: 'keep-road-n', x: 8500, z: 2380, heading: 0 },
  { id: 'market', x: 8500, z: 1640, heading: 90 },
  { id: 'guild', x: 8640, z: 1600, heading: 45 },
  { id: 'river-gate', x: Math.round(RIVER_CHECKPOINT.x), z: Math.round(RIVER_CHECKPOINT.z), heading: Math.round(gateBearing(GATE_NAMES.indexOf('river'))) },
  { id: 'counting', x: 8740, z: 2000, heading: 90 },
] as const;

/** R20's two farm-ring huts outside the River Gate (120 m and 260 m out on the convoy road). */
export const R20_HUTS = [
  { id: 'harrowmark.a4.r20.hut.1', ...gatePosition('river', 870) },
  { id: 'harrowmark.a4.r20.hut.2', ...gatePosition('river', 1010) },
] as const;

/**
 * A door reached only by an interior link (L0's v0.8 item 9b) names this as its `exit`. No interior defines it, so the
 * interiors plugin registers no exit interactable for that door: the way back is the link, never a jump to the outside anchor.
 */
export const LINK_ONLY_EXIT = 'harrowmark.a4.link-only';
