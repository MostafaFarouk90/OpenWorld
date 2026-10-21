// Fox-Fire reveal rule (design 7.9): hidden chests show within 20 m while the buff is on. A9 owns buff.foxFire.active.
export const FOX_FIRE_FLAG = 'buff.foxFire.active';
export const FOX_FIRE_RADIUS = 20;

export function foxFireReveals(buffOn: boolean, dx: number, dz: number, radius = FOX_FIRE_RADIUS): boolean {
  if (!buffOn) return false;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  return dx * dx + dz * dz <= radius * radius;
}
