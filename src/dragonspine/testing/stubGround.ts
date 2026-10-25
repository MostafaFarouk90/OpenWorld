// Test stand-in for K1's shaped ground: a gentle plane with a little relief, flat at a level of its own inside every plateau
// (smoothstep back to the plane over `blend`, capped), a cliff with a shelf north of the Hawk Cliffs foot, and a notch in
// nothing else. Pure; the shape follows the plateau boxes it is given, so a shifted plateau moves its flat ground with it.
import type { PlateauDef } from '../../terrain/shaping';
import { plateauById, type HeightFn } from '../inputs';

const smooth = (t: number): number => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

export const planeHeight = (x: number, z: number): number => 0.07 * (z - 11000) + 0.015 * (x - 12000) + 2.5 * Math.sin(x / 83) * Math.cos(z / 97);

const boxDistance = (b: PlateauDef['box'], x: number, z: number): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

/** The cliff: 30 m over 90 m north of the foot box, then a flat shelf 70 m deep, narrowing off to the sides. */
function cliff(plateaus: readonly PlateauDef[], x: number, z: number): number {
  const foot = plateauById({ plateaus }, 'hawk-cliffs-foot').box;
  const side = 1 - smooth((Math.max(foot.minX - 15 - x, 0, x - foot.maxX - 15)) / 30);
  const up = smooth((z - (foot.maxZ + 10)) / 90) * 30;
  const down = 1 - smooth((z - (foot.maxZ + 190)) / 40);
  return up * down * side;
}

export function stubGround(plateaus: readonly PlateauDef[]): HeightFn {
  const level = new Map(plateaus.map((p) => [p.id, planeHeight((p.box.minX + p.box.maxX) / 2, (p.box.minZ + p.box.maxZ) / 2)]));
  return (x, z) => {
    let h = planeHeight(x, z) + cliff(plateaus, x, z);
    for (const p of plateaus) {
      const blend = Math.min(p.blend, 80);
      const w = 1 - smooth(boxDistance(p.box, x, z) / blend);
      if (w > 0) h += (level.get(p.id)! - h) * w;
    }
    return h;
  };
}
