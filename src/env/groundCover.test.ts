import { describe, expect, it } from 'vitest';
import { envOwnsGround, groundCoverRect, GROUND_COVER_MARGIN } from './groundCover';
import { CLASS_RANGE, GROUND_LIFT } from './PlacementField';
import { TILES } from './tiles';

const clumps = (n: number, x0: number, z0: number) => Array.from({ length: n }, (_, i) => ({ id: 'grass-clump-a', x: x0 + i, z: z0 + i * 2 }));

describe('groundCoverRect', () => {
  it('bounds the ground-class rows plus a margin and ignores everything else', () => {
    const r = groundCoverRect([...clumps(30, 10, 20), { id: 'oak-a', x: 900, z: 900 }])!;
    expect(r).toEqual({ minX: 10 - GROUND_COVER_MARGIN, maxX: 39 + GROUND_COVER_MARGIN, minZ: 20 - GROUND_COVER_MARGIN, maxZ: 78 + GROUND_COVER_MARGIN });
  });
  it('is null for a tile with too few ground rows', () => {
    expect(groundCoverRect(clumps(5, 0, 0))).toBeNull();
    expect(groundCoverRect([])).toBeNull();
  });
});

describe('envOwnsGround', () => {
  const tiles = { t: clumps(30, 0, 0) };
  it('is true inside a dressed tile and false outside it', () => {
    const owns = envOwnsGround(true, tiles);
    expect(owns(10, 20)).toBe(true);
    expect(owns(500, 500)).toBe(false);
  });
  it('leaves the meadow blades in B2 (north pasture and east farmland) but not in B1', () => {
    const owns = envOwnsGround(true, TILES);
    expect(owns(80, 280)).toBe(false);
    expect(owns(210, 120)).toBe(false);
    expect(owns(0, 70)).toBe(true);
  });
  it('is false everywhere with ?env=off', () => {
    expect(envOwnsGround(false, tiles)(10, 20)).toBe(false);
  });
  it('covers the B1 lane core with the real tile', () => {
    const owns = envOwnsGround(true, TILES);
    expect(owns(0, 70)).toBe(true);
    expect(owns(0, -2000)).toBe(false);
  });
});

describe('ground cover tuning', () => {
  it('hides distant ground cover well inside the lane tile and lifts its colour', () => {
    expect(CLASS_RANGE.ground).toBeLessThanOrEqual(64);
    expect(GROUND_LIFT).toBeGreaterThan(1);
  });
});
