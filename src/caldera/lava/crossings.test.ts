// N3 Surge crossings: the aim inside the radius and cone, none outside; the span lint; the Leap's optional aim port
// (the shipped Leap is unchanged without it: see Leap.test.ts, untouched).
import { describe, expect, it, vi } from 'vitest';
import { LeapController, type LeapHost } from '../../spells/Leap';
import { LEAP } from '../../spells/tuning';
import { Crossings, angleBetween, crossingProblem, yawToward } from './crossings';
import { CROSSING } from './tuning';

const lips = { id: 'x.1', from: { x: 0, y: 1, z: 0 }, to: { x: 0, y: 1, z: -5 } };

describe('Crossings', () => {
  it('aims a Leap pressed near a lip end and facing the far one at the far end', () => {
    const c = new Crossings();
    c.add(lips);
    // yaw 0 faces -Z: from (0, 0) the far end (0, -5) is straight ahead
    const a = c.aim({ x: 0.5, z: 0.5 }, 0)!;
    expect(a.crossingId).toBe('x.1');
    expect(angleBetween(a.yaw, yawToward(0.5, 0.5, 0, -5))).toBeLessThan(1e-9);
    expect(a.distance).toBeCloseTo(Math.hypot(0.5, 5.5) + CROSSING.overshoot, 6);
    // both ways
    expect(c.aim({ x: 0, z: -5 }, Math.PI)!.distance).toBeCloseTo(5 + CROSSING.overshoot, 6);
  });

  it('no aim outside the radius or the cone, or with bad input', () => {
    const c = new Crossings();
    c.add(lips);
    expect(c.aim({ x: 0, z: CROSSING.radius + 0.1 }, 0)).toBeNull();
    expect(c.aim({ x: 0, z: 0 }, Math.PI / 2)).toBeNull(); // facing -X
    expect(c.aim({ x: 0, z: 0 }, ((CROSSING.coneDeg - 1) * Math.PI) / 180)).not.toBeNull();
    expect(c.aim({ x: NaN, z: 0 }, 0)).toBeNull();
  });

  it('clamps the distance, and the lint refuses spans outside 3.5 to 6.9 m', () => {
    expect(crossingProblem({ ...lips, to: { x: 0, y: 1, z: -3 } })).toMatch(/spans 3.00/);
    expect(crossingProblem({ ...lips, to: { x: 0, y: 1, z: -7 } })).toMatch(/spans 7.00/);
    expect(crossingProblem({ ...lips, to: { x: 0, y: NaN, z: -5 } })).toMatch(/non-finite/);
    const c = new Crossings();
    expect(() => c.add({ ...lips, to: { x: 0, y: 1, z: -8 } })).toThrow(/spans/);
    c.add({ ...lips, to: { x: 0, y: 1, z: -6.9 } });
    expect(c.aim({ x: 0, z: 1.4 }, 0)!.distance).toBe(CROSSING.maxDistance);
    expect(() => c.add({ ...lips, to: { x: 0, y: 1, z: -6.9 } })).toThrow(/already/);
  });
});

describe('the Leap aim port', () => {
  const host = (aim?: LeapHost['aim']) => {
    const startLeap = vi.fn(() => ({ active: true, cancel() {} }));
    const h: LeapHost = { learned: () => true, alive: () => true, busyReason: () => null, zone: () => 'warm', feetY: () => 0, startLeap, useShard: vi.fn(), ...(aim ? { aim } : {}) };
    return { leap: new LeapController(h), startLeap };
  };

  it('an aim sets the yaw and distance; no aim (or null, or a bad one) is the shipped call', () => {
    const a = host(() => ({ yaw: 1, distance: 5.2 }));
    a.leap.press(0);
    expect(a.startLeap).toHaveBeenCalledWith({ distance: 5.2, apex: LEAP.apex, yaw: 1 });
    for (const aim of [undefined, () => null, () => ({ yaw: NaN, distance: 5 }), () => ({ yaw: 0, distance: 0 })]) {
      const b = host(aim);
      b.leap.press(0);
      expect(b.startLeap).toHaveBeenCalledWith({ distance: LEAP.distance, apex: LEAP.apex });
    }
  });
});
