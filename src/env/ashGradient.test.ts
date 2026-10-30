// B4 ash gradient: green in the west, grey towards the fog wall, a green halo round the Quenchstone, identity outside the tile box.
import { describe, expect, it } from 'vitest';
import { tintGround } from '../terrain/shape/detailGround';
import { ashAt, ashCorridor, ashGround, ashGroundB4, roadDistance } from './ashGradient';

const GRASS = [0.2, 0.36, 0.12] as const;
const tint = (x: number, z: number): number[] => {
  const c = new Float32Array(GRASS);
  tintGround(x, z, c, 0);
  return [...c];
};

describe('ashAt', () => {
  it('is green in the west, grey at the fog wall and in the far south', () => {
    expect(ashAt(700, -150)).toBe(0);
    expect(ashAt(1040, -150)).toBeCloseTo(1, 3);
    expect(ashAt(900, -330)).toBeGreaterThan(0.7);
    expect(ashAt(900, 100)).toBeLessThan(ashAt(1050, 100));
  });

  it('keeps a warm green halo round the basin', () => {
    expect(ashAt(965, -165)).toBeLessThan(0.1);
    expect(ashAt(965, -165 + 26)).toBeLessThan(ashAt(965 + 26 * 2, -165 + 26 * 2));
  });
});

describe('ash ground colour', () => {
  it('is zero on the Brightwater side and well outside the box and the base grass is untouched there', () => {
    expect(ashGround(900, -800)).toBe(0);
    expect(ashGround(1000, 800)).toBe(0);
    expect(ashGround(750, -150)).toBe(0);
    expect(ashGround(1300, -150)).toBeCloseTo(1, 5); // holds full strength east of the tile
    expect(tint(1200, 900)).toEqual([...new Float32Array(GRASS)]);
  });

  it('drains the grass to grey towards the fog wall', () => {
    const wall = tint(1090, -150);
    const west = tint(720, -150);
    const spread = (c: number[]): number => Math.max(...c) - Math.min(...c);
    expect(spread(wall)).toBeLessThan(spread(west));
    for (const v of wall) expect(v).toBeGreaterThanOrEqual(0);
  });
});

// D1 to D3: the corridor holds the grey through the fog wall, then green returns toward the farm-ring (ruling 2026-10-24 19:50 UTC).
describe('corridor ash (x >= 1100)', () => {
  it('is continuous with B4 at the fog wall: full grey on the road at x 1100, and B4 s own edge behaviour is unchanged', () => {
    expect(ashGround(1100, -150)).toBeCloseTo(ashGroundB4(1100, -150), 6);
    expect(ashGround(1099.99, -150)).toBeCloseTo(ashGround(1100, -150), 3);
    expect(ashGround(1100, -150)).toBeCloseTo(1, 5);
    // west of the fog wall it is exactly B4 s function
    for (const [x, z] of [[700, -150], [900, -330], [1040, 100], [1099, -400], [800, 700]] as const) expect(ashGround(x, z)).toBe(ashGroundB4(x, z));
    // B4 s north and south fade still ends in the base colour beyond 200 m
    expect(ashGroundB4(1000, -900)).toBe(0);
  });

  it('holds full grey through the grey reach (x 1100..2300) and thins to 0.55 by x 3700', () => {
    for (const x of [1100, 1300, 1800, 2300]) expect(ashCorridor(x, -150 + (x - 1300) * (800 / 1900))).toBeCloseTo(1, 5);
    expect(ashGround(1800, -150 + 500 * (800 / 1900))).toBeGreaterThan(0.95);
    expect(ashCorridor(3700, 650)).toBeGreaterThan(0.2);
    expect(ashCorridor(3700, 650)).toBeLessThan(0.9);
  });

  it('returns green toward the farm-ring and meets H1 s 0.32 at its edge (x 7760)', () => {
    expect(ashCorridor(6600, 750)).toBeCloseTo(0.1, 2);
    expect(ashGround(6825, 760)).toBeLessThan(0.15);
    expect(ashCorridor(7760, 860)).toBeCloseTo(0.32, 3);
    expect(ashGround(7760, 860)).toBeCloseTo(0.32, 1);
    // green again by the farm-ring, grey at the fog wall
    expect(ashGround(6825, 760)).toBeLessThan(ashGround(1500, -80) * 0.2);
  });

  it('drifts across D2 s heath by at most 0.28 and stays in 0..1 everywhere', () => {
    for (let x = 3000; x <= 6300; x += 37) for (let z = 300; z <= 1100; z += 41) {
      const a = ashCorridor(x, z);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    const base = ashCorridor(4200, 100000 + 0); // any z: compare with the drift-free value at the same x
    expect(Math.abs(ashCorridor(4200, 733) - base)).toBeLessThanOrEqual(0.28 + 1e-9);
  });

  it('applies only near the road: the base ground colour returns 500 m away', () => {
    expect(ashGround(2500, -150 + (2500 - 1300) * (800 / 1900) + 600)).toBe(0);
    expect(ashGround(2500, -150 + (2500 - 1300) * (800 / 1900) - 600)).toBe(0);
    expect(roadDistance(1500, -150 + 200 * (800 / 1900))).toBeLessThan(0.01);
    expect(roadDistance(8000, 1120)).toBeLessThan(0.01);
  });

  it('drains the corridor ground colour like B4 s: grey on the road in D1, green kept at the farm-ring', () => {
    const spread = (c: number[]): number => Math.max(...c) - Math.min(...c);
    expect(spread(tint(1800, -150 + 500 * (800 / 1900)))).toBeLessThan(spread(tint(6825, 760)));
  });
});
