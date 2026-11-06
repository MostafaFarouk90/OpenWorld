// The ring wall as a polygon (L2; plan act4-L2.md section 6): the 56 chords of city.ts, pushed out 8 m past the vertex
// circle, so the wall's outer face (752 m) and the gate passages count as inside and anything 760 m out counts as outside.
// noStrand.ts's insideRingWall (L0's API) reads it.
import { CENTER, CHORDS, RING_RADIUS } from '../city';

export const RING_POLYGON_MARGIN = 8;
const VERTEX_RADIUS = RING_RADIUS / Math.cos(Math.PI / CHORDS) + RING_POLYGON_MARGIN;

/** The polygon's vertices (engine x, z), at the same bearings as city.ts's chord ends. */
export const RING_POLYGON: readonly { x: number; z: number }[] = Array.from({ length: CHORDS }, (_, k) => {
  const b = ((180 + (k - 0.5) * (360 / CHORDS)) * Math.PI) / 180;
  return { x: CENTER.x + VERTEX_RADIUS * Math.sin(b), z: CENTER.z + VERTEX_RADIUS * Math.cos(b) };
});

/** Even-odd ray cast against the polygon. */
export function insideRingPolygon(x: number, z: number): boolean {
  let inside = false;
  const p = RING_POLYGON;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!;
    const b = p[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
