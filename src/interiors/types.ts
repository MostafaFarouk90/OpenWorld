import type { Vec3 } from '../physics/PhysicsWorld';

/** An axis-aligned rectangle in an interior's local metres (x0 < x1, z0 < z1). */
export interface LocalRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A walkable room: its floor rectangle and ceiling height above the floor. Rooms that touch are open to each other. */
export interface RoomDef extends LocalRect {
  id: string;
  height: number;
}

/** What the screen looks like inside (contracts/interiors-and-nav.md section 1). */
export interface InteriorEnvironment {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  /** Hemisphere light while inside. */
  skyColor: number;
  groundColor: number;
  ambientIntensity: number;
  /** The light that follows the player. */
  lightColor: number;
  lightIntensity: number;
  lightDistance: number;
}

/** Low furniture (`InteriorDef.props`). */
export interface PropDef {
  id?: string;
  rect: LocalRect;
  height: number;
  walkable?: boolean;
}

/**
 * v0.7 (K3): floor cells lowered below the room floor (pools, channels, submerged tunnels). Cells of a room inside `rect`
 * have their floor at `-depth`; the floor of every neighbouring cell reaches down to it, so the pit has solid sides. `roof`
 * (local y above the room floor, may be negative) lowers the ceiling over these cells, which makes a tunnel under a pool's
 * water line. The first entry that contains a cell wins.
 */
export interface SunkenDef {
  id: string;
  rect: LocalRect;
  depth: number;
  roof?: number;
}

/** A door: the outside anchor is the layout thread's; the inside anchor and the exit interactable's anchor are the interior's. */
export interface DoorDef {
  doorId: string;
  outside: string;
  inside: string;
  exit: string;
  /** False: no enter interactable at the outside anchor (the door is entered by script; Deepgate's mines use the lift). Default true. */
  outsideInteractable?: boolean;
}

/**
 * One interior in local metres (origin at its stair foot, yaw 0 faces -Z). It floats `FLOAT_HEIGHT` above the highest
 * terrain under its footprint at world `site` (plans/slice-2-interiors-nav.md section 2).
 */
export interface InteriorDef {
  id: string;
  site: { x: number; z: number };
  rooms: RoomDef[];
  /** Solid from floor to ceiling. */
  pillars: LocalRect[];
  /**
   * Low solid furniture (tables, counters, shelves, a bed, a dais): floor to `height`, with a collider and a mesh. Its nav cells
   * are blocked unless `walkable`; a walkable prop is at most `MAX_WALKABLE_PROP` tall (the controller's auto-step), and an
   * anchor over it stands on its top. Optional so older defs need no change.
   */
  props?: PropDef[];
  /**
   * Named obstacles, open by default (collider, mesh and nav cells together). v0.7: `base` is the local y of the blocker's
   * bottom (default 0; negative reaches below the floor, so a closed blocker can bridge a sunken channel) and `startClosed`
   * builds it closed (default false).
   */
  blockers: { id: string; rect: LocalRect; height: number; base?: number; startClosed?: boolean }[];
  /** v0.7: sunken floor cells (pools, channels, tunnels). Optional so older defs need no change. */
  sunken?: SunkenDef[];
  /** Wall-mounted torch heads: local x, height above the floor, local z. */
  torches: { x: number; y: number; z: number }[];
  /** Yaw in degrees (0 faces -Z, 90 faces -X). `facing` overrides yaw with the direction toward that local point. */
  anchors: { id: string; x: number; z: number; yaw?: number; facing?: { x: number; z: number } }[];
  /** Boxes: local centre (y above the floor) and half sizes. */
  triggers: { id: string; center: Vec3; half: Vec3 }[];
  doors: DoorDef[];
  environment: InteriorEnvironment;
}
