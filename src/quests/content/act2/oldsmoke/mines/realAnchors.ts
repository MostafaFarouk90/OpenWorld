// Position tables for the mine quests' pacing, built from A4's real anchors: the mine interiors' own local metres
// (src/oldsmoke/mines) and the surface layout. Within one interior the legs are exact. A leg across the lift is a `lift` beat and no
// walk, so the surface points are shifted to sit on the shaft floor (the lift's landing) and every mine keeps its own frame.
import { MINE_DEFS } from '../../../../../oldsmoke/mines';
import { OLDSMOKE_LAYOUT } from '../../../../../oldsmoke/oldsmoke.layout';

/** A mine's anchors in its own local metres (ids are unique across the five mines). */
export function mineAnchors(mineId: string): Record<string, { x: number; z: number }> {
  const def = MINE_DEFS.find((d) => d.id === mineId);
  if (!def) throw new Error(`realAnchors: no mine ${mineId}`);
  return Object.fromEntries(def.anchors.map((a) => [a.id, { x: a.x, z: a.z }]));
}

/** The surface layout's anchors relative to `origin` (an anchor id) so they can share a table with a mine's local frame. */
export function surfaceAnchorsAt(origin: string, shift: { x: number; z: number }): Record<string, { x: number; z: number }> {
  const o = OLDSMOKE_LAYOUT.anchors.find((a) => a.id === origin);
  if (!o) throw new Error(`realAnchors: no surface anchor ${origin}`);
  return Object.fromEntries(OLDSMOKE_LAYOUT.anchors.map((a) => [a.id, { x: a.x - o.x + shift.x, z: a.z - o.z + shift.z }]));
}

