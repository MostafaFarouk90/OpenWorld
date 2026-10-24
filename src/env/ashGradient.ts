// B4 ash gradient (design 5.1: the south and east edges are grey by the end of Act 1; the Quenchstone stays warm). Pure maths, shared by
// the terrain colour (src/terrain/shape/detailGround.ts) and the placement generator (tools/env-pass/b4/gen_b4.py has the same numbers),
// so the ground and the props agree on where the land is grey.
export const ASH = { x0: 800, x1: 1040, south: 0.8, z0: 215, z1: 330, halo: { x: 965, z: -165, r: 26 } } as const;
/** B4 tile core, in metres; the ground colour returns to the base beyond this box (the east side is hidden by the fog wall at x 1100). */
export const ASH_BOX = { x0: 700, x1: 1152, z0: -352, z1: 252 } as const;

function smooth(a: number, b: number, v: number): number {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/** 0 (green) to 1 (grey) at (x, z). */
export function ashAt(x: number, z: number): number {
  const v = Math.max(smooth(ASH.x0, ASH.x1, x), ASH.south * smooth(ASH.z0, ASH.z1, -z));
  if (v <= 0) return 0;
  const d = Math.hypot(x - ASH.halo.x, z - ASH.halo.z);
  return v * (1 - 0.9 * Math.exp(-((d / ASH.halo.r) ** 2)));
}

/** Metres over which the ground colour fades back to the base on the Brightwater side (west, north, south) of the box. */
export const ASH_FADE = 120;

/**
 * The ash amount as the ground colour uses it: the gradient inside the B4 box, fading to nothing ASH_FADE m beyond its west, north
 * and south edges. East of the box it holds full strength (the Dead Road runs on into Harrowmark; D1 continues it from there).
 */
export function ashGround(x: number, z: number): number {
  const dx = Math.max(ASH_BOX.x0 - x, 0);
  const dz = Math.max(ASH_BOX.z0 - z, 0, z - ASH_BOX.z1);
  const d = Math.hypot(dx, dz);
  if (d >= ASH_FADE) return 0;
  return ashAt(x, z) * (1 - smooth(0, ASH_FADE, d));
}
