// Plain-data description of the Brightwater tutorial footprint. No THREE, no terrain imports:
// resolveLayout.ts turns it into anchors on the terrain, validateLayout.ts checks it.

/** +Z is north and yaw 0 faces +Z; yaw 90 degrees faces +X. */
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

export type StructureKind =
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
  | 'pole';

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
  /** Flags that all must be true for the door to open (the chapel stays shut until T04 starts). */
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
}

export interface PatrolSpec {
  id: string;
  points: string[];
  loop: boolean;
}

export interface NpcSpec {
  id: string;
  post: string;
  idleClip?: string;
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
