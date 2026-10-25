import { describe, expect, it } from 'vitest';
import { cityLawnFor, cityLawnMixFor, CITY_LAWN_MIX, CITY_LAWN, envOwnsGround, envReplacesScenery, groundCoverRect, groundCoverRects, GROUND_COVER_MARGIN, OWNS_GROUND_COVER } from './groundCover';
import { LANE } from '../terrain/shape/detailGround';
import { CLASS_RANGE, GROUND_LIFT } from './PlacementField';
import { TILES } from './tiles';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { grassAcceptFor } from '../region/region.plugin';

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

describe('envOwnsGround on the Harrowmark splats', () => {
  const owns = envOwnsGround(true, TILES);
  it('keeps the meadow blades off the trodden main street, the gate queue and the packed yards', () => {
    for (const [x, z] of [[8490, 1400], [8500, 1300], [8470, 1300]]) expect(owns(x, z), `${x},${z}`).toBe(true);
  });
  it('keeps the blades growing in the trampled yards and camps (drill yard, paddock, both camps)', () => {
    for (const [x, z] of [[8440, 1210], [8550, 1215], [8360, 1390], [8650, 1390], [8250, 1392]]) expect(owns(x, z), `${x},${z}`).toBe(false);
  });
  it('keeps the blades on the approach meadow, the farm ring and well clear of a street or yard', () => {
    for (const [x, z] of [[8300, 1160], [8700, 1170], [8150, 1230], [8420, 1255], [8100, 1140]]) expect(owns(x, z), `${x},${z}`).toBe(false);
  });
  it('brings the blades back with ?env=off', () => {
    expect(envOwnsGround(false, TILES)(8490, 1400)).toBe(false);
  });
});

describe('cityLawnFor (blades inside the Harrowmark walls)', () => {
  const lawn = cityLawnFor(true);
  const hit = (h: number) => ({ raycast: () => ({ collider: { isSensor: () => false, parent: () => ({ isFixed: () => true }) }, point: { y: h } }) }) as never;
  it('is a table of tiles: H1 now, and a tile adopts the lawn by adding its core', () => {
    expect(Object.keys(CITY_LAWN)).toEqual(['h1']);
    expect(cityLawnFor(true, { h1: [], h2: [{ minX: 8440, maxX: 8480, minZ: 1500, maxZ: 1520 }] })(8445, 1510)).toBe(true);
  });
  it('lets the meadow blades grow on the outer-ward lawn', () => {
    expect(lawn(8420, 1300)).toBe(true);
    expect(lawn(8700, 1300)).toBe(true);
  });
  it('excludes crowd lanes (the main street and the gate queue, to their half widths)', () => {
    expect(lawn(8490, 1400)).toBe(false);
    expect(lawn(8490 + 7, 1400)).toBe(false);
    expect(lawn(8490 + 9, 1400)).toBe(true);
    expect(lawn(8500, 1300)).toBe(false);
  });
  it('excludes Harrowmark footprints', () => {
    const house = HARROWMARK_LAYOUT.structures.find((s) => s.kind === 'house' && s.z < 1440)!;
    expect(lawn(house.x, house.z)).toBe(false);
  });
  it('excludes the M06 gate square and the gate passage', () => {
    for (const [x, z] of [[8470, 1300], [8530, 1275], [8500, 1220]]) expect(lawn(x, z), `${x},${z}`).toBe(false);
  });
  it('excludes static colliders (grassAcceptFor probes them) while a free lawn point is accepted', () => {
    expect(grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0, hit(0.6), lawn)(8420, 1300)).toBe(false);
    expect(grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0, hit(0), lawn)(8420, 1300)).toBe(true);
  });
  it('is off under ?env=off, and never opens ground outside a lawn tile', () => {
    expect(cityLawnFor(false)(8420, 1300)).toBe(false);
    expect(lawn(8500, 1600)).toBe(false);
    expect(lawn(100, 100)).toBe(false);
    const closed = grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0);
    const open = grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0, undefined, lawn);
    expect(closed(8420, 1300)).toBe(false);
    expect(open(8420, 1300)).toBe(true);
    expect(open(8500, 1600)).toBe(false);
  });
  it('still keeps the blades off the packed streets and yards inside the lawn', () => {
    const owns = envOwnsGround(true, TILES);
    expect(owns(8490, 1400)).toBe(true);
    expect(owns(8470, 1300)).toBe(true);
    expect(owns(8360, 1390)).toBe(false);
    expect(owns(8420, 1300)).toBe(false);
  });
});

describe('ground cover tuning', () => {
  it('hides distant ground cover well inside the lane tile and lifts its colour', () => {
    expect(CLASS_RANGE.ground).toBeLessThanOrEqual(64);
    expect(GROUND_LIFT).toBeGreaterThan(1);
  });
});

describe('the lawn mix (sparser, drier blades inside the wall)', () => {
  const lawn = cityLawnFor(true);
  const mix = cityLawnMixFor(lawn, () => true);
  it('gives the lawn a sparse, dry mix and the rest of the world none', () => {
    expect(mix(8420, 1300)).toBe(CITY_LAWN_MIX);
    expect(CITY_LAWN_MIX.keep).toBeLessThan(0.5);
    expect(CITY_LAWN_MIX.dry).toBeGreaterThan(0.5);
    expect(mix(8490, 1400)).toBeNull();
    expect(mix(100, 100)).toBeNull();
    expect(cityLawnMixFor(lawn, () => false)(8420, 1300)).toBeNull();
    expect(cityLawnMixFor(cityLawnFor(false), () => true)(8420, 1300)).toBeNull();
  });
  it('thins and dries the tufts of a cell', async () => {
    const { cellTufts, DRY_BLADE } = await import('../region/grass');
    const flat = () => 0;
    const full = cellTufts(1000, 150, flat, () => true);
    const sparse = cellTufts(1000, 150, flat, () => true, 1, 5, () => CITY_LAWN_MIX);
    expect(sparse.length).toBeLessThan(full.length * 0.5);
    expect(sparse.length).toBeGreaterThan(0);
    const mean = (ts: typeof full, k: number) => ts.reduce((a, t) => a + t.color[k]!, 0) / ts.length;
    expect(Math.abs(mean(sparse, 0) - DRY_BLADE[0])).toBeLessThan(Math.abs(mean(full, 0) - DRY_BLADE[0]));
    expect(mean(sparse, 1)).toBeLessThan(mean(full, 1));
  });
});
