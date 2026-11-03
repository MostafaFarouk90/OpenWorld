import { WYRM_SHAPE } from '../builder/params';

/**
 * The water form's depth (K6a, plans/act3-K6a.md 1): where a large dragon's head sits for a "lift" between hidden under the
 * bed (0), swimming with the brow at the surface (0.5) and reared high out of the water (1). The body follows the head's
 * trail, so a rear lifts the neck while the body stays in the water. Under the bed the terrain hides the body, so a dive
 * needs no fade. `crossed` reports the ticks where the head breaks or leaves the surface (a splash ring goes there).
 */
export interface WaterLevel {
  /** Water surface height (world y). */
  surface: number;
  /** Bed height under the dragon (world y). */
  floor: number;
}

export const SURFACING = {
  /** Hidden: the head this many chest radii under the bed. */
  hideBelow: 3,
  /** Swimming: the head's centre this many chest radii above the surface. */
  swimAbove: 0.25,
  /** Reared: the head this many standing head heights above the surface. */
  rearHeads: 2.2,
} as const;

/** The head's world y for a lift 0..1 at a scale (smooth: hidden -> swimming -> reared). */
export function headYFor(lift: number, scale: number, water: WaterLevel): number {
  const r = WYRM_SHAPE.chestRadius * scale;
  const hidden = Math.min(water.floor, water.surface) - SURFACING.hideBelow * r;
  const swim = water.surface + SURFACING.swimAbove * r;
  const reared = water.surface + SURFACING.rearHeads * WYRM_SHAPE.headHeight * scale;
  const k = Number.isFinite(lift) ? Math.min(1, Math.max(0, lift)) : 0;
  if (k <= 0.5) return hidden + (swim - hidden) * smooth(k / 0.5);
  return swim + (reared - swim) * smooth((k - 0.5) / 0.5);
}

/** +1 when `y` rose through the surface since `prevY`, -1 when it sank through it, 0 otherwise. */
export function crossed(prevY: number, y: number, surface: number): -1 | 0 | 1 {
  if (prevY < surface && y >= surface) return 1;
  if (prevY >= surface && y < surface) return -1;
  return 0;
}

export function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
