// Act 4 thread L1 (plans/act4-L1.md section 5): `track.harrowmark-wall`, the drawn track round the outside of
// Harrowmark's wall that links the roads once Vey shuts the gates (M38). A ribbon on the shipped ground, never a shaper
// edit. It runs 45 m out (radius 795) except across the South Gate's hedged fields, where it comes in to 768 m (16 m
// off the wall's outer face) and bulges out to 785 m round the South Gate's fog face; the radii are fitted so the 3 m
// lane meets no env collider (wallTrack.test.ts). Plain data and maths, worker-safe.
import { CENTER, polar } from '../../harrowmark/city';

export const WALL_TRACK_ID = 'track.harrowmark-wall';
/** The walking lane: 1.5 m either side of the centreline. */
export const WALL_TRACK_HALF_WIDTH = 1.5;
/** Radius away from the South Gate's fields. */
export const WALL_TRACK_RADIUS = 795;
/** Radius across the South Gate's hedged fields, and round the South Gate itself. */
export const WALL_TRACK_SOUTH_RADIUS = 768;
export const WALL_TRACK_SOUTH_GATE_RADIUS = 785;
/** One point every this many degrees of bearing (about 7 m of track). */
const STEP_DEG = 0.5;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Blend from `a` to `b` as `x` runs from `x0` to `x1`. */
const ramp = (x: number, x0: number, x1: number, a: number, b: number) => a + (b - a) * smooth((x - x0) / (x1 - x0));

/** The track's radius at a compass bearing from the city centre (0 = north, 180 = the South Gate). */
export function wallTrackRadius(bearing: number): number {
  const b = ((bearing % 360) + 360) % 360;
  if (b < 148 || b > 212) return WALL_TRACK_RADIUS;
  if (b < 156) return ramp(b, 148, 156, WALL_TRACK_RADIUS, WALL_TRACK_SOUTH_RADIUS);
  if (b > 204) return ramp(b, 204, 212, WALL_TRACK_SOUTH_RADIUS, WALL_TRACK_RADIUS);
  if (b < 176.5 || b > 183.5) return WALL_TRACK_SOUTH_RADIUS;
  if (b < 178) return ramp(b, 176.5, 178, WALL_TRACK_SOUTH_RADIUS, WALL_TRACK_SOUTH_GATE_RADIUS);
  if (b > 182) return ramp(b, 182, 183.5, WALL_TRACK_SOUTH_GATE_RADIUS, WALL_TRACK_SOUTH_RADIUS);
  return WALL_TRACK_SOUTH_GATE_RADIUS;
}

/** The closed loop's centreline, from due north clockwise; the last point repeats the first. */
export const WALL_TRACK_POINTS: readonly (readonly [number, number])[] = Array.from({ length: 360 / STEP_DEG + 1 }, (_, i) => {
  const b = (i * STEP_DEG) % 360;
  const p = polar(b, wallTrackRadius(b));
  return [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100] as const;
});

/** Distance from (x, z) to the track's centreline. */
export function distanceToWallTrack(x: number, z: number): number {
  const bearing = (Math.atan2(x - CENTER.x, z - CENTER.z) * 180) / Math.PI;
  let best = Infinity;
  const i0 = Math.round((((bearing % 360) + 360) % 360) / STEP_DEG);
  for (let k = i0 - 3; k <= i0 + 3; k++) {
    const i = ((k % (WALL_TRACK_POINTS.length - 1)) + (WALL_TRACK_POINTS.length - 1)) % (WALL_TRACK_POINTS.length - 1);
    const [ax, az] = WALL_TRACK_POINTS[i];
    const [bx, bz] = WALL_TRACK_POINTS[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
