// Plain-data description of the Brightwater tutorial footprint. No THREE, no terrain imports:
// resolveLayout.ts turns it into anchors on the terrain, validateLayout.ts checks it.

/** +Z is north; yaw 0 faces -Z (forward = (-sin yaw, -cos yaw)), so yaw 90 degrees faces -X. Specs store yawDeg = heading + 180. */
export interface AnchorSpec {
  id: string;
  x: number;
  z: number;
  /** Metres above (or below) the terrain height at (x, z); the resolved `y` is absolute. */
  dy?: number;
  yawDeg: number;
  tags?: string[];
  /** Id of the structure this anchor stands in or on; exempt from the solid-footprint rule. */
  onStructure?: string;
}

export type TriggerSpec = {
  id: string;
  x: number;
  z: number;
  dy?: number;
  who?: 'player' | 'any-actor';
  once?: boolean;
} & (
  | { shape: 'sphere'; radius: number }
  | { shape: 'box'; half: [number, number, number]; yawDeg?: number }
);

export type BuiltInStructureKind =
  | 'loft'
  | 'gate'
  | 'cart'
  | 'fence'
  | 'house'
  | 'bakery'
  | 'tavern'
  | 'mill'
  | 'well'
  | 'chapel'
  | 'altar'
  | 'waystone'
  | 'board'
  | 'yard-fence'
  | 'pole'
  | 'rock'
  | 'bridge'
  | 'stair'
  // Harrowmark (thread 17): ring wall, gate towers, stepped rooftop access, rooftop blocks, market stalls, crates, the fountain.
  | 'wall'
  | 'tower'
  | 'stair-step'
  | 'block'
  | 'stall'
  | 'crate'
  | 'fountain';

/** The 25 built-in kinds, in the order of the union above. Registered kinds (structureKinds.ts) are not in it. */
export const BUILT_IN_STRUCTURE_KINDS: readonly BuiltInStructureKind[] = [
  'loft',
  'gate',
  'cart',
  'fence',
  'house',
  'bakery',
  'tavern',
  'mill',
  'well',
  'chapel',
  'altar',
  'waystone',
  'board',
  'yard-fence',
  'pole',
  'rock',
  'bridge',
  'stair',
  'wall',
  'tower',
  'stair-step',
  'block',
  'stall',
  'crate',
  'fountain',
];

/** A built-in kind or a registered one (v0.6 item 17); `(string & {})` keeps the built-ins autocompleting. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type StructureKind = BuiltInStructureKind | (string & {});

/**
 * solid: one static box over the footprint (nobody enters).
 * enterable: four wall segments with a doorway (yaw must be 0); the interior is walkable.
 * open: decoration or posts only, no blocking collider over the footprint.
 */
export type StructureMode = 'solid' | 'enterable' | 'open';

export interface DoorSpec {
  /** Door name; the core Door id is `door:<name>` and its flag `door.<name>.open`. */
  name: string;
  side: 'N' | 'S' | 'E' | 'W';
  width: number;
  /** The door is locked until any one of these flags is true (empty or omitted: never locked). */
  openWhen?: string[];
}

export interface StructureSpec {
  id: string;
  kind: StructureKind;
  x: number;
  z: number;
  yawDeg: number;
  /** [width along local x, depth along local z] in metres. */
  footprint: [number, number];
  mode: StructureMode;
  /** Wall and collider height in metres; defaults per kind in the greybox. */
  height?: number;
  door?: DoorSpec;
  /** Id of an enterable structure that contains this one (exempt from the overlap check). */
  inside?: string;
  /**
   * `ledge`: a Leap-gated platform. Its height is measured from the highest ground within 1 m of the footprint and
   * the validator holds it between LEDGE_MIN_HEIGHT and LEDGE_MAX_HEIGHT with a top at least LEDGE_MIN_DEPTH deep.
   */
  role?: 'ledge';
}

/** Foundation kinds stand on a column down to the lowest ground under them, so the terrain-spread rule does not apply. */
export const FOUNDATION_KINDS: readonly StructureKind[] = ['rock'];

/** A plain jump peaks at 1.056 m and auto-step adds 0.4 m; the Leap (apex 2.2 m) clears 1.8 m (review of slice-2-brightwater-layout). */
export const LEDGE_MIN_HEIGHT = 1.7;
export const LEDGE_MAX_HEIGHT = 1.9;
export const LEDGE_MIN_DEPTH = 3;

export interface PatrolSpec {
  id: string;
  points: string[];
  loop: boolean;
}

export interface NpcSpec {
  id: string;
  post: string;
  idleClip?: string;
  /** The NPC is not spawned (or is despawned) while this flag is true; its handover to a companion or a quest. */
  absentWhen?: string;
  /** The NPC is not spawned until this flag is true (Vey from M08, Ashdown from M07). Combines with `absentWhen`. */
  presentWhen?: string;
  /** Once `whenFlag` is true the NPC walks in a straight line to the anchor `to` (the only walking NPCs); on a load it just stands there. */
  walkOff?: { whenFlag: string; to: string };
}

export interface FieldSpec {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Instance count; the field density is count / area. */
  count: number;
}

export interface LayoutData {
  anchors: AnchorSpec[];
  triggers: TriggerSpec[];
  structures: StructureSpec[];
  patrols: PatrolSpec[];
  npcs: NpcSpec[];
  fields: FieldSpec[];
}
