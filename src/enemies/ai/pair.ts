import { PAIR } from '../tuning';

export interface XZ {
  x: number;
  z: number;
}

/**
 * Where a footman in a pair walks while advancing: the target pushed out sideways so the two arrive on
 * opposite flanks (design 10 row 2, "advances in pairs"). The side follows the order of `selfKey` and
 * `partnerKey` (stable, so the two never pick the same flank); the offset fades out inside `PAIR.closeIn`
 * so the pair still closes to striking range. Returns `target` unchanged when there is no partner within
 * `PAIR.maxPartnerDistance`, or the geometry is degenerate.
 */
export function pairGoal(
  self: XZ,
  partner: XZ | null,
  target: XZ,
  selfKey: string,
  partnerKey: string,
): XZ {
  if (!partner || selfKey === partnerKey) return target;
  if (Math.hypot(partner.x - self.x, partner.z - self.z) > PAIR.maxPartnerDistance) return target;
  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > PAIR.closeIn) || !Number.isFinite(dist)) return target;
  const side = selfKey < partnerKey ? 1 : -1;
  const px = (-dz / dist) * side;
  const pz = (dx / dist) * side;
  const fade = Math.min(1, (dist - PAIR.closeIn) / PAIR.closeIn);
  return { x: target.x + px * PAIR.flankMetres * fade, z: target.z + pz * PAIR.flankMetres * fade };
}
