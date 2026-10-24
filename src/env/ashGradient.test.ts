// B4 ash gradient: green in the west, grey towards the fog wall, a green halo round the Quenchstone, identity outside the tile box.
import { describe, expect, it } from 'vitest';
import { tintGround } from '../terrain/shape/detailGround';
import { ashAt, ashGround } from './ashGradient';

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
