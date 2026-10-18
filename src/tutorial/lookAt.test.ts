import { describe, expect, it } from 'vitest';
import { angleDegrees } from './lookAt';

const o = { x: 0, y: 0, z: 0 };

describe('angleDegrees', () => {
  it('is 0 straight ahead', () => {
    expect(angleDegrees(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -10 })).toBeCloseTo(0);
  });
  it('is 90 to the side and 180 behind', () => {
    expect(angleDegrees(o, { x: 0, y: 0, z: -1 }, { x: 5, y: 0, z: 0 })).toBeCloseTo(90);
    expect(angleDegrees(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 3 })).toBeCloseTo(180);
  });
  it('accepts a non-normalised forward and a non-origin eye', () => {
    expect(angleDegrees({ x: 1, y: 1, z: 1 }, { x: 0, y: 7, z: 0 }, { x: 1, y: 4, z: 1 })).toBeCloseTo(0);
    expect(angleDegrees(o, { x: 4, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(45);
  });
  it('is 180 for a zero direction or zero forward', () => {
    expect(angleDegrees(o, { x: 0, y: 0, z: 1 }, o)).toBe(180);
    expect(angleDegrees(o, o, { x: 1, y: 0, z: 0 })).toBe(180);
  });
});
