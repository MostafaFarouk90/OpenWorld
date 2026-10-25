import { DEAD_ROAD } from '../terrain/shape/deadRoad';

// B4 ash gradient (design 5.1: the south and east edges are grey by the end of Act 1; the Quenchstone stays warm). Pure maths, shared by
// the terrain colour (src/terrain/shape/detailGround.ts) and the placement generator (tools/env-pass/b4/gen_b4.py has the same numbers),
// so the ground and the props agree on where the land is grey.
export const ASH = { x0: 760, x1: 1040, south: 0.8, z0: 215, z1: 330, halo: { x: 965, z: -165, r: 26 } } as const;
/** B4 tile core, in metres; the ground colour returns to the base beyond this box (the east side is hidden by the fog wall at x 1100). */
export const ASH_BOX = { x0: 640, x1: 1152, z0: -452, z1: 402 } as const;

function smooth(a: number, b: number, v: number): number {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: no visible edge where the ramp starts
}

/** 0 (green) to 1 (grey) at (x, z). */
export function ashAt(x: number, z: number): number {
  const v = Math.max(smooth(ASH.x0, ASH.x1, x), ASH.south * smooth(ASH.z0, ASH.z1, -z));
  if (v <= 0) return 0;
  const d = Math.hypot(x - ASH.halo.x, z - ASH.halo.z);
  return v * (1 - 0.9 * Math.exp(-((d / ASH.halo.r) ** 2)));
}

/** Metres over which the ground colour fades back to the base on the Brightwater side (west, north, south) of the box. */
export const ASH_FADE = 200;

/**
 * The ash amount as the ground colour uses it inside and west of B4: the gradient inside the B4 box, fading to nothing ASH_FADE m beyond its west, north
 * and south edges. East of the box it holds full strength (the Dead Road runs on into Harrowmark; D1 continues it from there).
 */
export function ashGroundB4(x: number, z: number): number {
  const dx = Math.max(ASH_BOX.x0 - x, 0);
  const dz = Math.max(ASH_BOX.z0 - z, 0, z - ASH_BOX.z1);
  const d = Math.hypot(dx, dz);
  if (d >= ASH_FADE) return 0;
  return ashAt(x, z) * (1 - smooth(0, ASH_FADE, d));
}

// ---- D1 to D3: the Dead Road corridor (design 5.1 and 5.2) ----
// The grey holds through the fog wall (x 1100) and lifts eastward, so the farm-ring is green again: a trough of grey, not a slope.
// `ashCorridor` is the same maths as ash_corridor() in plans/env-pass/d1d3/gen_d1d3.py, so the ground, the meadow blades and the
// placement palettes (dead or live trees, grey or green clumps) agree on where the land is grey.

/** The corridor function takes over from B4's box at this x (the fog wall); B4's own edge behaviour west of it is unchanged. */
export const CORRIDOR_X0 = 1100;
/** Metres over which B4's value blends into the corridor's, east of the fog wall (so B4's north and south fade does not end in a hard line). */
export const CORRIDOR_BLEND = 200;
/** The ground colour follows the corridor value within this distance of the road centre line (the 600 m corridor strip)... */
export const CORRIDOR_HALF = 300;
/** ...and fades back to the base ground over this many metres beyond it. */
export const CORRIDOR_FADE = 200;

/** 0 (green) to 1 (grey) along the Dead Road, x >= 1100, before the distance from the road is applied. */
export function ashCorridor(x: number, z: number): number {
  // Full grey through the grey reach (x 1100..2300), lifting through the thaw (to 0.55 at x 3700) and the heath (0.25 at x 5600),
  // a dusting (0.10) on Harrowmark's farm-ring from x 6600, rising to 0.32 at x 7760 where H1 takes over.
  const a = 1 - 0.45 * smooth(2300, 3700, x) - 0.3 * smooth(3700, 5600, x) - 0.15 * smooth(5600, 6600, x) + 0.22 * smooth(7300, 7760, x);
  // D2's grey heath: drifts of grey 300 to 600 m across from a two-sine field, strongest at x 3900..5300, none outside x 3000..6300.
  const p = smooth(3000, 3900, x) * (1 - smooth(5300, 6300, x));
  const patch = Math.sin(x / 97 + 1.7 * Math.sin(z / 61)) * Math.sin(z / 83 + x / 211);
  return Math.min(1, Math.max(0, a + 0.28 * p * patch));
}

/** Distance (m) from (x, z) to the Dead Road's centre line. */
export function roadDistance(x: number, z: number): number {
  const pts = DEAD_ROAD.points;
  let best = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}

/**
 * The ash amount as the ground colour uses it, everywhere: B4's gradient inside and west of its box (holding full strength east of the
 * box, unchanged), and from the fog wall on the corridor's value near the road, blended in over CORRIDOR_BLEND m. Far from the road
 * (beyond CORRIDOR_HALF + CORRIDOR_FADE) the ground is the base colour again. No ?env=off switch (terrain colour, ruling 2026-10-24).
 */
export function ashGround(x: number, z: number): number {
  if (x < CORRIDOR_X0) return ashGroundB4(x, z);
  const west = ashGroundB4(CORRIDOR_X0, z);
  const near = 1 - smooth(CORRIDOR_HALF, CORRIDOR_HALF + CORRIDOR_FADE, roadDistance(x, z));
  const east = ashCorridor(x, z) * near;
  return west + (east - west) * smooth(CORRIDOR_X0, CORRIDOR_X0 + CORRIDOR_BLEND, x);
}
