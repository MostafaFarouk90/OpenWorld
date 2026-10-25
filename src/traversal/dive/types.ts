// K7's dive data on top of K0's types (contracts v0.7 item 4; review B1): every air pocket and every route entry carries
// a dry stand point, because the save loader snaps the player to the ground and water is not a collider. A pocket's `at`
// is where the player surfaces; its `stand` is the ledge a save, a load or a drowning puts the player on.
import type { Vec3Like } from '../../core/events';
import type { AirPocketDef, DiveRouteDef } from '../../water/types';

export interface DivePocketDef extends AirPocketDef {
  /** A dry, walkable point beside the pocket (never inside dive or deep water). */
  stand: Vec3Like;
}

export interface DiveRouteStandsDef extends DiveRouteDef {
  airPockets: readonly DivePocketDef[];
  /** A dry, walkable point at the route's entry. */
  entryStand: Vec3Like;
}

/** Diving numbers K7 adds to K0's DIVE_TUNING. */
export const DIVE_RULES = {
  /** Feet to the top of the head: the head is under when feet.y + this < the surface. */
  headHeight: 1.6,
  /** A swimmer rises no higher than feet this far under the surface (the spike's head-out line). */
  headOutDepth: 1.4,
  /** Feet less than this deep, with the head out, is standing: the dive ends in walk mode (wading's upper bound). */
  standDepth: 1.2,
  /** Surfacing within this distance of a pocket's `at` makes it the last pocket. */
  pocketRadius: 8,
  /** Drowning costs this fraction of max health, never the last point (ruling P3). */
  drownDamageFraction: 0.2,
  /** Seconds of fade before the drowned player is moved. */
  drownFadeSeconds: 0.35,
  /** Ticks a swimmer pushing into a face must be blocked before the ledge climb is tried (the spike's trap). */
  ledgeBlockedTicks: 3,
  /** The ledge climb finds a top at most this far above the feet, and this far ahead. */
  ledgeMaxRise: 2.2,
  ledgeReach: 0.7,
} as const;
