// Fitting against `heightAt`: Leap ledges, flat spots and the nest shelf. Everything takes the ground as an argument.
import { footprintSpread } from '../cinderreach/siteFit';
import { LEDGE_HEIGHT } from './helpers';
import type { HeightFn, XZ } from './inputs';

export { footprintSpread };
export const LAUNCH_BACK = 5.5;
/** The top must stand this far above the launch ground (the Leap clears 1.8 m; a jump and the auto-step reach 1.46). */
export const LEDGE_RISE_MIN = 1.5;

/** A ledge's footprint (width, depth); the default is the Act 1 and 2 ledge. */
export type LedgeSize = readonly [number, number];
const DEFAULT_SIZE: LedgeSize = [6, 5];

/** Highest ground within 1 m of a ledge's footprint (where the builder puts the base of the column). */
function ledgeHigh(h: HeightFn, cx: number, cz: number, size: LedgeSize): number {
  const w = size[0] + 2;
  const d = size[1] + 2;
  return footprintMax(h, cx, cz, w, d);
}

/** Rise of a ledge top above the ground at a launch point `LAUNCH_BACK` m from its centre toward compass `heading`. */
export function ledgeRise(h: HeightFn, cx: number, cz: number, launch: XZ, size: LedgeSize = DEFAULT_SIZE): number {
  return ledgeHigh(h, cx, cz, size) + LEDGE_HEIGHT - h(launch.x, launch.z);
}

export interface FittedLedge extends XZ {
  launch: XZ;
}

/**
 * The nearest ground to a wanted spot where a Leap ledge is climbable from a launch point: a launch strip that is level enough,
 * with the top 1.5 to 1.8 m above the launch ground (the Act 1 and Act 2 ledges rule). On a slope the launch point is found on
 * the uphill side, the one direction of eight where the rise comes out in range. `size` is the ledge's built footprint (the whole of it is fitted, not a 6 x 5 core). `dirs` limits the launch directions (indices of the eight compass steps from +X, counter-clockwise). Null when nothing within 60 m fits.
 */
export function fitLedge(h: HeightFn, want: XZ, dirs: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7], size: LedgeSize = DEFAULT_SIZE): FittedLedge | null {
  for (let r = 0; r <= 60; r += 2) {
    for (let k = 0; k < Math.max(1, r * 2); k++) {
      const ang = (k / Math.max(1, r * 2)) * Math.PI * 2;
      const x = Math.round(want.x + Math.cos(ang) * r);
      const z = Math.round(want.z + Math.sin(ang) * r);
      if (footprintSpread(h, x, z, size[0], size[1]) > 1.2) continue;
      for (const d of dirs) {
        const launch = { x: x + Math.cos((d * Math.PI) / 4) * LAUNCH_BACK, z: z + Math.sin((d * Math.PI) / 4) * LAUNCH_BACK };
        const rise = ledgeRise(h, x, z, launch, size);
        if (rise < LEDGE_RISE_MIN || rise > LEDGE_HEIGHT + 0.001) continue;
        if (footprintSpread(h, launch.x, launch.z, 4, 4) > 0.8) continue;
        return { x, z, launch };
      }
    }
  }
  return null;
}

/** Highest ground under a w x d footprint, sampled every 1 m. */
export function footprintMax(h: HeightFn, x: number, z: number, w: number, d: number): number {
  let hi = -Infinity;
  for (let i = 0; i <= Math.ceil(w); i++) for (let j = 0; j <= Math.ceil(d); j++) hi = Math.max(hi, h(x - w / 2 + (w * i) / Math.ceil(w), z - d / 2 + (d * j) / Math.ceil(d)));
  return hi;
}

/** The nearest point to `want` (within `radius`) where a player can stand: the ground gradient there is under `maxGrad`. */
export function standableNear(h: HeightFn, want: XZ, radius = 40, maxGrad = 0.35): XZ {
  const grad = (x: number, z: number): number => Math.hypot((h(x + 1, z) - h(x - 1, z)) / 2, (h(x, z + 1) - h(x, z - 1)) / 2);
  if (grad(want.x, want.z) <= maxGrad) return { x: want.x, z: want.z };
  for (let r = 2; r <= radius; r += 2) {
    for (let k = 0; k < Math.max(8, r * 2); k++) {
      const ang = (k / Math.max(8, r * 2)) * Math.PI * 2;
      const x = want.x + Math.cos(ang) * r;
      const z = want.z + Math.sin(ang) * r;
      if (grad(x, z) <= maxGrad) return { x, z };
    }
  }
  return { x: want.x, z: want.z };
}
