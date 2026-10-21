import type { RangedSpec } from '../types';

/** The `attackId` prefix of a ranged or area hit. The `enemies.moves` modifier leaves these requests' amounts alone (they carry their own). */
export const RANGED_ATTACK_PREFIX = 'ranged:';

/** Aim height above the target's feet (the chest, as perception's `chestHeight`). */
export const AIM_HEIGHT = 1.1;

/** A target is inside an area when it is within this much of the circle's height. */
export const AREA_HEIGHT_TOLERANCE = 2.2;

/** The pooled projectile count shared by every ground shooter. */
export const PROJECTILE_CAPACITY = 24;

/** Burning applied by a slag glob (dps before the shooter's damage scale), as the hound's bite. */
export const GLOB_BURN = { id: 'slag-glob', dps: 3 } as const;

/** Look of each projectile shape (colour, radius of the visual in metres, spin). */
export const SHAPE_LOOK: Readonly<Record<RangedSpec['shape'], { color: number; emissive: number; size: number; length: number }>> = {
  rock: { color: 0x6a5f58, emissive: 0xff5a1f, size: 0.28, length: 0.28 },
  glob: { color: 0xff7a2a, emissive: 0xff4a10, size: 0.14, length: 0.14 },
  net: { color: 0xb09a6a, emissive: 0x000000, size: 0.3, length: 0.05 },
  harpoon: { color: 0x9aa0a8, emissive: 0x000000, size: 0.035, length: 0.9 },
};
