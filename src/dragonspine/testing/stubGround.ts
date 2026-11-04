// Test stand-in for K1's shaped ground: a gentle plane with a little relief, flat at a level of its own inside every plateau
// (smoothstep back to the plane over `blend`, capped), a cliff with a shelf north of the Hawk Cliffs foot, and a notch in
// nothing else. Pure; the shape follows the plateau boxes it is given, so a shifted plateau moves its flat ground with it.
import { HAWK_NEST_SHELF } from '../../terrain/shape/dragonspine';
import type { PlateauDef } from '../../terrain/shaping';
import { plateauById, type HeightFn } from '../inputs';

const smooth = (t: number): number => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

export const planeHeight = (x: number, z: number): number => 0.07 * (z - 11000) + 0.015 * (x - 12000) + 2.5 * Math.sin(x / 83) * Math.cos(z / 97);

const boxDistance = (b: PlateauDef['box'], x: number, z: number): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

/** The cliff: 50 m over 130 m north of the foot box, then a flat shelf 70 m deep, narrowing off to the sides. */
function cliff(plateaus: readonly PlateauDef[], x: number, z: number): number {
  const foot = plateauById({ plateaus }, 'hawk-cliffs-foot').box;
  const side = 1 - smooth((Math.max(foot.minX - 15 - x, 0, x - foot.maxX - 130)) / 30);
  const up = smooth((z - (foot.maxZ + 10)) / 130) * 50;
  const down = 1 - smooth((z - (foot.maxZ + 260)) / 40);
  return up * down * side;
}

export function stubGround(plateaus: readonly PlateauDef[], shelf: { x: number; z: number; w: number; d: number } = HAWK_NEST_SHELF): HeightFn {
  // The nest shelf is a level bench cut into the cliff, as K1's is.
  const shelfLevel = planeHeight(shelf.x, shelf.z) + cliff(plateaus, shelf.x, shelf.z);
  // A plateau inside another (the keep pad on the Aerie shelf) is level with it, as K1's are.
  const host = (p: PlateauDef): PlateauDef => plateaus.find((q) => q !== p && q.box.minX <= p.box.minX && q.box.maxX >= p.box.maxX && q.box.minZ <= p.box.minZ && q.box.maxZ >= p.box.maxZ) ?? p;
  const level = new Map(plateaus.map((p) => [p.id, planeHeight((host(p).box.minX + host(p).box.maxX) / 2, (host(p).box.minZ + host(p).box.maxZ) / 2)]));
  return (x, z) => {
    let h = planeHeight(x, z) + cliff(plateaus, x, z);
    for (const p of plateaus) {
      const blend = Math.min(p.blend, 80);
      const w = 1 - smooth(boxDistance(p.box, x, z) / blend);
      if (w > 0) h += (level.get(p.id)! - h) * w;
    }
    const sd = Math.hypot(Math.max(Math.abs(x - shelf.x) - shelf.w / 2, 0), Math.max(Math.abs(z - shelf.z) - shelf.d / 2, 0));
    const sw = 1 - smooth(sd / 12);
    return h + (shelfLevel - h) * sw;
  };
}
