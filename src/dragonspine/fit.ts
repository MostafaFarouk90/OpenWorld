// Fitting against `heightAt`: Leap ledges, flat spots and the nest shelf. Everything takes the ground as an argument.
import { footprintSpread } from '../cinderreach/siteFit';
import { LEDGE_HEIGHT } from './helpers';
import type { HeightFn, Rect, XZ } from './inputs';

export { footprintSpread };
export const LAUNCH_BACK = 5.5;
/** The top must stand this far above the launch ground (the Leap clears 1.8 m; a jump and the auto-step reach 1.46). */
export const LEDGE_RISE_MIN = 1.5;

/** Highest ground under a ledge's 6 x 5 footprint. */
function ledgeHigh(h: HeightFn, cx: number, cz: number): number {
  let hi = -Infinity;
  for (let dx = -3; dx <= 3; dx += 1.5) for (let dz = -2.5; dz <= 2.5; dz += 1.25) hi = Math.max(hi, h(cx + dx, cz + dz));
  return hi;
}

/** Rise of a ledge top above the ground at a launch point `LAUNCH_BACK` m from its centre toward compass `heading`. */
export function ledgeRise(h: HeightFn, cx: number, cz: number, launch: XZ): number {
  return ledgeHigh(h, cx, cz) + LEDGE_HEIGHT - h(launch.x, launch.z);
}

export interface FittedLedge extends XZ {
  launch: XZ;
}

/**
 * The nearest ground to a wanted spot where a Leap ledge is climbable from a launch point: a launch strip that is level enough,
 * with the top 1.5 to 1.8 m above the launch ground (the Act 1 and Act 2 ledges rule). On a slope the launch point is found on
 * the uphill side, the one direction of eight where the rise comes out in range. `dirs` limits the launch directions (indices of the eight compass steps from +X, counter-clockwise). Null when nothing within 60 m fits.
 */
export function fitLedge(h: HeightFn, want: XZ, dirs: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7]): FittedLedge | null {
  for (let r = 0; r <= 60; r += 2) {
    for (let k = 0; k < Math.max(1, r * 2); k++) {
      const ang = (k / Math.max(1, r * 2)) * Math.PI * 2;
      const x = Math.round(want.x + Math.cos(ang) * r);
      const z = Math.round(want.z + Math.sin(ang) * r);
      if (footprintSpread(h, x, z, 6, 5) > 1.2) continue;
      for (const d of dirs) {
        const launch = { x: x + Math.cos((d * Math.PI) / 4) * LAUNCH_BACK, z: z + Math.sin((d * Math.PI) / 4) * LAUNCH_BACK };
        const rise = ledgeRise(h, x, z, launch);
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

/**
 * The nest shelf: the nearest flat spot above the cliff foot (20 x 14 m, spread within 2 m) that stands at least `minGain` metres
 * over the foot's centre; falls back to the flattest spot above it. Searches north of the foot, where the cliff face rises.
 */
export function findShelf(h: HeightFn, foot: Rect, minGain: number): XZ {
  const base = h((foot.minX + foot.maxX) / 2, (foot.minZ + foot.maxZ) / 2);
  let best: (XZ & { score: number }) | null = null;
  let flattest: (XZ & { spread: number }) | null = null;
  for (let z = foot.maxZ + 20; z <= foot.maxZ + 140; z += 6) {
    for (let x = foot.minX - 20; x <= foot.maxX + 20; x += 6) {
      const gain = h(x, z) - base;
      if (gain < minGain / 2) continue;
      const spread = footprintSpread(h, x, z, 20, 14, 4);
      if (!flattest || spread < flattest.spread) flattest = { x, z, spread };
      if (gain < minGain || spread > 2) continue;
      const score = Math.hypot(x - (foot.minX + foot.maxX) / 2, z - foot.maxZ) + spread * 10;
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  const pick = best ?? flattest;
  if (pick) return { x: pick.x, z: pick.z };
  return { x: (foot.minX + foot.maxX) / 2, z: foot.maxZ + 60 };
}
