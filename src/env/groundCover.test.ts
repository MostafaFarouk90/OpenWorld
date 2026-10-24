import { describe, expect, it } from 'vitest';
import { envOwnsGround, envReplacesScenery, groundCoverRect, groundCoverRects, GROUND_COVER_MARGIN, OWNS_GROUND_COVER } from './groundCover';
import { LANE } from '../terrain/shape/detailGround';
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

describe('groundCoverRects', () => {
  it('gives one rectangle per separate dressed area, so a far annex does not claim the meadow between', () => {
    const rs = groundCoverRects([...clumps(30, 0, 0), ...clumps(30, 400, 0)]);
    expect(rs).toHaveLength(2);
    expect(rs.some((r) => r.minX <= 200 && r.maxX >= 200)).toBe(false);
  });
  it('joins rows in touching cells into one area and drops areas with too few rows', () => {
    expect(groundCoverRects(clumps(30, 0, 0))).toHaveLength(1);
    expect(groundCoverRects([...clumps(30, 0, 0), ...clumps(4, 600, 600)])).toHaveLength(1);
  });
});

describe('envOwnsGround', () => {
  const tiles = { t: clumps(30, 0, 0) };
  it('is true inside a tile that owns its ground cover and false outside it', () => {
    const owns = envOwnsGround(true, tiles, new Set(['t']));
    expect(owns(10, 20)).toBe(true);
    expect(owns(500, 500)).toBe(false);
  });
  it('leaves the meadow blades under a tile that does not opt in, however many ground rows it has', () => {
    expect(envOwnsGround(true, tiles)(10, 20)).toBe(false);
  });
  it('leaves the meadow blades in every tile, B1 included, but keeps them off the B1 lane', () => {
    expect([...OWNS_GROUND_COVER]).toEqual([]);
    const owns = envOwnsGround(true, TILES);
    expect(owns(80, 280)).toBe(false);
    expect(owns(210, 120)).toBe(false);
    for (const [x, z] of [[768, -150], [935, -140], [990, -150], [846, -158]]) expect(owns(x, z)).toBe(false);
    expect(owns(0, 70)).toBe(true); // on the lane
    expect(owns(20, 70)).toBe(false); // B1 meadow beside it
    expect(owns(0, -30)).toBe(false); // the meadow eye pose
  });
  it('is false everywhere with ?env=off', () => {
    expect(envOwnsGround(false, tiles, new Set(['t']))(10, 20)).toBe(false);
  });
  it('keeps the B1 lane clear along its length and nowhere far from it', () => {
    const owns = envOwnsGround(true, TILES);
    for (const z of [0, 70, 150]) expect(owns(0, z)).toBe(true);
    expect(owns(0, -2000)).toBe(false);
    expect(owns(LANE.halfWidth + 3, 70)).toBe(false);
  });
  it('covers B3 (the ford, the fields) and the reed island only when a tile opts in; by default B3 keeps the meadow blades', () => {
    expect(envOwnsGround(true, TILES)(-250, -110)).toBe(false);
    const owns = envOwnsGround(true, TILES, new Set(['b3']));
    expect(owns(-250, -110)).toBe(true);
    expect(owns(-430, -140)).toBe(true);
    expect(owns(55, -300)).toBe(true);
    expect(owns(-10, -300)).toBe(false);
  });
});

describe('envReplacesScenery', () => {
  it('is true inside B3 and its annex while the pass is on, false elsewhere and with ?env=off', () => {
    const on = envReplacesScenery(true);
    expect(on(-300, -300)).toBe(true);
    expect(on(-300, -146)).toBe(true);
    expect(on(55, -300)).toBe(true);
    expect(on(-20, -300)).toBe(false);
    expect(on(600, -150)).toBe(false);
    expect(envReplacesScenery(false)(-300, -300)).toBe(false);
  });
  it('ignores bounds of a tile that has no rows', () => {
    expect(envReplacesScenery(true, { x: [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }] }, {})(5, 5)).toBe(false);
  });
});

describe('ground cover tuning', () => {
  it('hides distant ground cover well inside the lane tile and lifts its colour', () => {
    expect(CLASS_RANGE.ground).toBeLessThanOrEqual(64);
    expect(GROUND_LIFT).toBeGreaterThan(1);
  });
});
