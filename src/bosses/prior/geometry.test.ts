import { describe, expect, it } from 'vitest';
import { clampToArena, distToSegment, pickPillar, yawToward } from './geometry';

const pillars = [
  { x: -6, z: -6 },
  { x: 6, z: -6 },
  { x: -6, z: 6 },
  { x: 6, z: 6 },
];

describe('Prior geometry', () => {
  it('pickPillar prefers the pillar farthest from the player and never the current one', () => {
    expect(pickPillar(pillars, -1, { x: 5, z: 5 })).toBe(0);
    expect(pickPillar(pillars, 0, { x: 5, z: 5 })).not.toBe(0);
    expect([1, 2]).toContain(pickPillar(pillars, 0, { x: 5, z: 5 }));
    expect(pickPillar(pillars, 3, { x: -6, z: -6 })).toBe(1); // ties resolve by index: 1 and 2 are equally far
  });

  it('pickPillar edge cases: none and one pillar', () => {
    expect(pickPillar([], -1, { x: 0, z: 0 })).toBe(-1);
    expect(pickPillar([{ x: 1, z: 1 }], 0, { x: 0, z: 0 })).toBe(0);
  });

  it('distToSegment measures to the nearest point, clamped to the ends', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 0, z: -14 };
    expect(distToSegment({ x: 0.5, z: -7 }, a, b)).toBeCloseTo(0.5);
    expect(distToSegment({ x: 0, z: 3 }, a, b)).toBeCloseTo(3);
    expect(distToSegment({ x: 0, z: -16 }, a, b)).toBeCloseTo(2);
    expect(distToSegment({ x: 3, z: 4 }, a, a)).toBeCloseTo(5);
  });

  it('clampToArena keeps a point inside the square', () => {
    expect(clampToArena({ x: 20, z: -20 }, { x: 0, z: -43 }, 11)).toEqual({ x: 11, z: -32 });
    expect(clampToArena({ x: 1, z: -40 }, { x: 0, z: -43 }, 11)).toEqual({ x: 1, z: -40 });
  });

  it('yawToward follows yaw 0 = -Z', () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(yawToward({ x: 0, z: 0 }, { x: -5, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(yawToward({ x: 0, z: 0 }, { x: 0, z: 5 }))).toBeCloseTo(Math.PI);
  });
});
