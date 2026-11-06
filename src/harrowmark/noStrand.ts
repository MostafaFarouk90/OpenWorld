// Contracts v0.8 item 8, the no-strand rule (plan Part 3.5, Q2): from the betrayal (M38) Harrowmark is Vey's, so nothing
// may put the player inside the ring wall. A placement rule on the waystones service moves every respawn, load and safe
// teleport target that falls inside to the M41 camp (before M41) or the Ashgate refuge rest (after), and the city's
// stones go dark. Interiors are exempt (their floors are 150 m up and follow the interior rules).
import { flagConditionHolds, type FlagReader } from '../core/flagCondition';
import { OCCUPIED_FLAG } from '../region/act4Containment';
import type { PlacementRule } from '../waystones/types';
import { WAYSTONE_DARK } from '../waystones/tuning';

export const CITY_CENTRE = { x: 8500, z: 2000 } as const;
/** The ring wall's outer face (752 m) plus a margin; L2 may swap the circle for the wall polygon behind insideRingWall. */
export const RING_WALL_RADIUS = 760;
/** Placements this far above the terrain are interiors (150 m up), which the rule never touches. */
export const INTERIOR_MIN_HEIGHT = 100;

/** Reserved here; L2 places the camp, L1 the refuge rest. */
export const M41_CAMP_ANCHOR = 'harrowmark.a4.m41.camp';
export const REFUGE_REST_ANCHOR = 'ashgate.refuge.rest';
export const ASH_ROAD_OPEN_FLAG = 'story.m41.complete';

export function insideRingWall(x: number, z: number): boolean {
  return Math.hypot(x - CITY_CENTRE.x, z - CITY_CENTRE.z) < RING_WALL_RADIUS;
}

export interface NoStrandDeps {
  flags: FlagReader;
  anchors: { find(id: string): { position: { x: number; y: number; z: number }; yaw: number } | undefined };
  /** Terrain height, to tell an interior placement (150 m up) from a street. */
  heightAt(x: number, z: number): number;
  /** The shipped fallback spawn anchor id, used when the camp or refuge anchor is missing. */
  fallbackAnchor: string;
  warn?(msg: string): void;
}

/** The anchor a stranded target goes to now. */
export function strandTarget(flags: FlagReader): string {
  return flags.getFlag(ASH_ROAD_OPEN_FLAG) ? REFUGE_REST_ANCHOR : M41_CAMP_ANCHOR;
}

export function createNoStrandRule(d: NoStrandDeps): PlacementRule {
  const warned = new Set<string>();
  return (t) => {
    if (!d.flags.getFlag(OCCUPIED_FLAG)) return null;
    if (!insideRingWall(t.feet.x, t.feet.z)) return null;
    if (t.feet.y - d.heightAt(t.feet.x, t.feet.z) > INTERIOR_MIN_HEIGHT) return null;
    const id = strandTarget(d.flags);
    const a = d.anchors.find(id) ?? d.anchors.find(d.fallbackAnchor);
    if (!a) return null;
    if (!d.anchors.find(id) && !warned.has(id)) {
      warned.add(id);
      d.warn?.(`noStrand: anchor "${id}" is missing; using "${d.fallbackAnchor}"`);
    }
    // Never inside: a fallback inside the walls would strand the player too.
    if (insideRingWall(a.position.x, a.position.z)) return null;
    return { feet: { ...a.position }, yaw: a.yaw };
  };
}

/** A stone is dark when its WAYSTONE_DARK condition holds, or it stands inside the ring wall while the city is held. */
export function stoneIsDark(id: string, at: { x: number; z: number } | undefined, flags: FlagReader): boolean {
  const when = WAYSTONE_DARK[id];
  if (when && flagConditionHolds(when, flags)) return true;
  return Boolean(at && flags.getFlag(OCCUPIED_FLAG) && insideRingWall(at.x, at.z));
}
