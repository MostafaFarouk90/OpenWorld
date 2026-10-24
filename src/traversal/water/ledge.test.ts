import { describe, expect, it } from 'vitest';
import { DIVE_RULES } from '../dive/types';
import { ledgeProbe } from './ledge';

/** A rim 1 m up from 0.4 m ahead, and a fence post 2.5 m up at 1.1 m and beyond (yaw 0 faces -Z). */
const ray = {
  raycast: (from: { x: number; y: number; z: number }) => {
    const ahead = -from.z;
    const top = ahead >= 1.0 ? 2.5 : ahead >= 0.4 ? 1 : null;
    return top === null ? null : ({ point: { x: from.x, y: top, z: from.z } } as never);
  },
};

describe('ledge probe', () => {
  it('a taller post past a valid rim never hides the rim', () => {
    const top = ledgeProbe(ray as never, () => undefined)({ x: 0, y: 0, z: 0 }, 0);
    expect(DIVE_RULES.ledgeMaxRise).toBeLessThan(2.5);
    expect(top?.y).toBeCloseTo(1.05);
  });
});
