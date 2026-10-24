// Movement modes and their routes (contracts v0.7 items 5, 6, 7 and 25). Types, the rule table and the `movementMode`
// port only: K7 builds the glide (PR 2), the ferry, the sled haul, the carry reset and the dive (PR 1), sets the mode
// through `movementMode.set`, and tests each rule. Nothing sets a mode until K7 lands, so every refusal hook reads
// `walk` and behaves as before v0.7.
import type { FlagCondition } from '../core/flagCondition';
import type { Vec3Like } from '../core/events';

// ---- Glide (item 5) ----

export interface GlideLedgeDef {
  /** `glide.<name>`. */
  id: string;
  /** The ledge anchor (dotted, `dragonspine.`): where the glide starts and where a cancelled glide's catch returns. */
  anchorId: string;
  /** Launch yaw (yaw 0 faces -Z). */
  heading: number;
  /** Allowed headings, as a half-angle (radians) either side of `heading`: steering stays inside it. */
  laneHalfAngle: number;
  /** Where a glide may land (engine (x, z) boxes); landing elsewhere is still safe (no fall damage). */
  landingAreas: readonly { x0: number; z0: number; x1: number; z1: number }[];
  /** Ledges open on `story.m34.complete` (plan 3.5). */
  openWhen: FlagCondition;
}

export interface UpdraftDef {
  id: string;
  centre: Vec3Like;
  radius: number;
  /** Metres above `centre.y` the updraft reaches. */
  height: number;
  /** Upward speed (m/s) added inside it. */
  lift: number;
}

/** Forward 10 m/s; vertical speed clamped to the sink rate; no attacks; a hit ends the glide into a fall. */
export const GLIDE_TUNING = { forwardSpeed: 10, sinkRate: 2.5 } as const;

export type GlideEndReason = 'landed' | 'cancelled' | 'contained' | 'hit';

// ---- Ferry (item 6) ----

export interface FerryStopDef {
  id: string;
  /** The landing anchor the player boards and leaves from. */
  anchorId: string;
}

export interface FerryRouteDef {
  /** `ferry.<name>`. */
  id: string;
  stops: readonly FerryStopDef[];
  /** The boat's path (world points), first stop first; each stop lies on it. */
  path: readonly Vec3Like[];
  /** Metres per second (5). */
  speed: number;
}

// ---- Heavy carry and the carry reset (item 7) ----

/** Carry kinds: a held item (shipped carries) or a dragged sled (R15): 60% speed, no sprint or attacks, dropped on a hit. */
export type CarryKind = 'held' | 'sled';

export const SLED_TUNING = { speedScale: 0.6 } as const;

export interface CarryRouteDef {
  /** The carried object's id (a `CarryItemSpec` id or a sled id). */
  id: string;
  /** Checkpoint positions in order: the start of each haul leg (or an egg's pick-up point). */
  checkpoints: readonly Vec3Like[];
  /** An object more than this many metres off its route returns to its last checkpoint (30). */
  corridorHalfWidth: number;
  /** An object more than this many metres below its route at that point returns too (10). */
  maxDrop: number;
}

// ---- Movement modes (item 25) ----

export type MovementMode = 'walk' | 'glide' | 'ferry' | 'dive' | 'haul';

export interface MovementModeRule {
  /** What a save stores as the player's position: the live position, or the mode's safe point (`movementMode.safePoint`). */
  save: 'position' | 'safePoint';
  /** Fast travel: allowed, or refused (waystone `TravelFailure` 'movement', map text `map.blocked.movement`). */
  fastTravel: 'allowed' | 'refused';
  /** The Ashmare: a summon is refused in this mode (`mount.refused.movement`); K7 dismisses the rider before a glide or a ride. */
  mount: 'allowed' | 'refused';
  /** Companions: hidden while the mode lasts (they reappear when it ends), or follow as usual. */
  companions: 'hidden' | 'follow';
}

/** Plan Part 4 item 25. A save is never refused (a tab can close at any time); it stores the safe point instead. */
export const MOVEMENT_MODE_RULES: Readonly<Record<MovementMode, MovementModeRule>> = {
  walk: { save: 'position', fastTravel: 'allowed', mount: 'allowed', companions: 'follow' },
  // The ledge the glide started from (a glide can pass more than 200 m above the ground, which the loader refuses).
  glide: { save: 'safePoint', fastTravel: 'refused', mount: 'refused', companions: 'hidden' },
  // The stop the ride left from.
  ferry: { save: 'safePoint', fastTravel: 'refused', mount: 'refused', companions: 'hidden' },
  // The last air pocket (post-sluice set in D05).
  dive: { save: 'safePoint', fastTravel: 'refused', mount: 'refused', companions: 'hidden' },
  // The player's position; the hauled object is saved where it lies (carry reset); fast travel returns it to its checkpoint.
  haul: { save: 'position', fastTravel: 'allowed', mount: 'refused', companions: 'follow' },
};

/** The `movementMode` service (core provides it; K7 calls `set`). */
export interface MovementModeService {
  readonly current: MovementMode;
  /** The point a save stores in a `safePoint` mode (null otherwise, or before K7 gives one). */
  readonly safePoint: { position: Vec3Like; yaw: number } | null;
  /** K7: enters a mode with its safe point (`walk` clears it). Emits `movement.mode` on a change. */
  set(mode: MovementMode, safePoint?: { position: Vec3Like; yaw: number } | null): void;
  rule(): MovementModeRule;
}
