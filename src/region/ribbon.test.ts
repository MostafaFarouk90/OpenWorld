import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { DEAD_ROAD_DRAWN, LANE_TRACK_DRAWN, ROAD_EAST_X, ROAD_WIDTH, ROAD_Z } from './deadRoad';
import { buildCorridorScenery, vergePlacements, VERGE_GAP_FRACTION, VERGE_SPACING } from './corridorScenery';
import { ribbonGeometry, ribbonHeights, sampleStations } from './ribbon';
import { BROOK_COURSE, FALL_TOLERANCE, RIVER_COURSE } from './water';

describe('sampleStations', () => {
  it('spaces stations along the polyline and ends exactly on the last point', () => {
    const s = sampleStations([[0, 0], [10, 0]], 2);
    expect(s.length).toBe(6);
    expect(s[0]).toMatchObject({ x: 0, z: 0 });
    expect(s[5]).toMatchObject({ x: 10, z: 0 });
    expect(s[3].x).toBeCloseTo(6);
  });

  it('gives unit normals to the left of travel, and turns them at a bend', () => {
    const s = sampleStations([[0, 0], [10, 0], [10, 10]], 5);
    for (const st of s) expect(Math.hypot(st.nx, st.nz)).toBeCloseTo(1);
    expect(s[0]).toMatchObject({ nx: -0, nz: 1 });
    expect(s[s.length - 1].nx).toBeCloseTo(-1);
  });

  it.each([
    ['one point', [[0, 0]], 2],
    ['no length', [[1, 1], [1, 1]], 2],
    ['NaN', [[0, 0], [Number.NaN, 1]], 2],
    ['Infinity', [[0, 0], [Infinity, 1]], 2],
    ['zero step', [[0, 0], [1, 1]], 0],
    ['negative step', [[0, 0], [1, 1]], -3],
  ] as const)('throws on %s', (_n, pts, step) => {
    expect(() => sampleStations(pts as never, step)).toThrow(/ribbon/);
  });

  it('skips a repeated point instead of dividing by zero', () => {
    expect(() => sampleStations([[0, 0], [0, 0], [5, 0]], 1)).not.toThrow();
  });
});

describe('ribbonHeights', () => {
  const st = sampleStations([[0, 0], [20, 0]], 5);
  it('drapes each vertex over the ground with the lift', () => {
    const h = ribbonHeights(st, 4, (x, z) => x * 0.1 + z, { lift: 0.1 });
    expect(h[2][1]).toBeCloseTo(10 * 0.1 + 0.1);
    expect(h[2][0]).not.toBeCloseTo(h[2][2]);
  });

  it('flat water sits at the lowest of the three samples, level across the width', () => {
    const h = ribbonHeights(st, 4, (_x, z) => z, { lift: 0.5, flat: true });
    for (const row of h) expect(row).toEqual([-1.5, -1.5, -1.5]);
  });

  it('monotone water never rises downstream, even over a hump', () => {
    const hump = (x: number) => (x > 8 && x < 14 ? 5 : 0);
    const h = ribbonHeights(st, 2, (x) => hump(x), { lift: 0, flat: true, monotone: true });
    for (let i = 1; i < h.length; i++) expect(h[i][1]).toBeLessThanOrEqual(h[i - 1][1]);
    const raw = ribbonHeights(st, 2, (x) => hump(x), { lift: 0, flat: true });
    expect(Math.max(...raw.map((r) => r[1]))).toBe(5);
  });

  it.each([0, -1, Number.NaN])('rejects width %s', (w) => {
    expect(() => ribbonHeights(st, w, () => 0, { lift: 0 })).toThrow(/width/);
  });

  it('builds an index of two quads per step with finite positions', () => {
    const g = ribbonGeometry(st, 4, () => 1, { lift: 0 });
    expect(g.getIndex()!.count).toBe((st.length - 1) * 12);
    expect([...(g.getAttribute('position').array as Float32Array)].every(Number.isFinite)).toBe(true);
    g.dispose();
  });
});

describe('the Dead Road, river and brook data', () => {
  it('draws the road from the ford to the fog wall along z -150, and never past it (the shaped road starts at x 1100)', () => {
    expect(DEAD_ROAD_DRAWN[0][0]).toBeLessThan(-450);
    expect(DEAD_ROAD_DRAWN[DEAD_ROAD_DRAWN.length - 1]).toEqual([ROAD_EAST_X, ROAD_Z]);
    for (const [x, z] of DEAD_ROAD_DRAWN) {
      expect(z).toBe(ROAD_Z);
      expect(x).toBeLessThanOrEqual(1100);
    }
    const xs = DEAD_ROAD_DRAWN.map((p) => p[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(ROAD_WIDTH).toBe(6);
  });

  it('meets the lane from the loft at (0, -150)', () => {
    expect(LANE_TRACK_DRAWN[0]).toEqual([0, ROAD_Z]);
  });

  it('runs the river over ground that falls downstream (east) within 1 m, from the valley head to the reed island', () => {
    const hs = RIVER_COURSE.map(([x, z]) => heightAt(x, z));
    for (let i = 1; i < hs.length; i++) expect(hs[i], `station ${i}`).toBeLessThanOrEqual(hs[i - 1] + FALL_TOLERANCE);
    expect(hs[0] - hs[hs.length - 1]).toBeGreaterThan(10);
    expect(RIVER_COURSE[RIVER_COURSE.length - 1][0]).toBeLessThanOrEqual(60);
  });

  it('runs the brook north past the ford bridge over ground that falls the whole way', () => {
    const hs = BROOK_COURSE.map(([x, z]) => heightAt(x, z));
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeLessThanOrEqual(hs[i - 1] + FALL_TOLERANCE);
    expect(BROOK_COURSE.some(([x, z]) => x === -420 && z < -150)).toBe(true);
    expect(BROOK_COURSE.some(([x, z]) => x === -420 && z > -150)).toBe(true);
  });
});

describe('vergePlacements', () => {
  const stations = sampleStations(DEAD_ROAD_DRAWN, 2);
  it('puts props on both sides, about every 40 m, outside the road', () => {
    const v = vergePlacements(stations, ROAD_WIDTH / 2 + 1.6);
    const expected = ((1100 + 480) / VERGE_SPACING) * 2;
    expect(v.length).toBeGreaterThan(expected * (1 - VERGE_GAP_FRACTION) * 0.8);
    expect(v.length).toBeLessThanOrEqual(expected);
    for (const p of v) expect(Math.abs(p.z - ROAD_Z)).toBeCloseTo(ROAD_WIDTH / 2 + 1.6);
    expect(v.some((p) => p.z > ROAD_Z)).toBe(true);
    expect(v.some((p) => p.z < ROAD_Z)).toBe(true);
  });

  it('is seeded: the same seed gives the same props, another seed does not', () => {
    const a = vergePlacements(stations, 4, 1);
    expect(vergePlacements(stations, 4, 1)).toEqual(a);
    expect(vergePlacements(stations, 4, 2)).not.toEqual(a);
  });
});

describe('buildCorridorScenery', () => {
  it('builds the road, lane, river, brook, verge and reeds on the terrain, and disposes everything', () => {
    const s = buildCorridorScenery(heightAt);
    const names = s.object.children.map((c) => c.name);
    for (const n of ['dead-road', 'lane-track', 'river', 'hollin-brook', 'reeds']) expect(names).toContain(n);
    const mesh = s.object.getObjectByName('dead-road') as import('three').Mesh;
    const pos = mesh.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(1000);
    s.dispose();
    s.dispose(); // twice is fine
    expect(s.object.children).toHaveLength(0);
  });
});
