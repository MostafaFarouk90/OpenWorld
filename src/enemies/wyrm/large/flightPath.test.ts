import { describe, expect, it } from 'vitest';
import { FlightPath, PathWalker } from './flightPath';

const square = [
  { x: 0, y: 10, z: 0 },
  { x: 100, y: 10, z: 0 },
  { x: 100, y: 10, z: 100 },
  { x: 0, y: 10, z: 100 },
];

describe('FlightPath (K6a)', () => {
  it('an open path starts and ends on its end points and passes every waypoint', () => {
    const p = new FlightPath(square);
    expect(p.sample(0)).toMatchObject({ x: 0, y: 10, z: 0 });
    const end = p.sample(p.length);
    expect(end.x).toBeCloseTo(0, 6);
    expect(end.z).toBeCloseTo(100, 6);
    for (const w of square) {
      let best = Infinity;
      for (let s = 0; s <= p.length; s += 0.5) {
        const q = p.sample(s);
        best = Math.min(best, Math.hypot(q.x - w.x, q.y - w.y, q.z - w.z));
      }
      expect(best).toBeLessThan(0.5);
    }
  });

  it('samples at constant speed by arc length (steps within 5%)', () => {
    const p = new FlightPath(square, { closed: true });
    const step = p.length / 400;
    let prev = p.sample(0);
    for (let i = 1; i <= 400; i++) {
      const q = p.sample(i * step);
      expect(Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z)).toBeGreaterThan(step * 0.95);
      expect(Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z)).toBeLessThan(step * 1.05);
      prev = q;
    }
  });

  it('heading follows the game rule (yaw 0 faces -Z) and climbs report pitch', () => {
    const p = new FlightPath([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -50 },
      { x: 0, y: 25, z: -100 },
    ]);
    expect(p.sample(10).yaw).toBeCloseTo(0, 2);
    expect(p.sample(p.length - 5).pitch).toBeGreaterThan(0.2);
    const east = new FlightPath([
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 0, z: 0 },
    ]);
    expect(east.sample(20).yaw).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('banks into turns, capped, and flies level on straights', () => {
    const p = new FlightPath(square, { closed: true, maxBank: 0.4 });
    let maxBank = 0;
    for (let s = 0; s < p.length; s += 1) maxBank = Math.max(maxBank, Math.abs(p.sample(s).bank));
    expect(maxBank).toBeGreaterThan(0.05);
    expect(maxBank).toBeLessThanOrEqual(0.4 + 1e-9);
    const straight = new FlightPath([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -100 },
    ]);
    expect(Math.abs(straight.sample(50).bank)).toBeLessThan(1e-6);
  });

  it('a closed path wraps; an open path clamps', () => {
    const c = new FlightPath(square, { closed: true });
    const a = c.sample(5);
    const b = c.sample(5 + c.length);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
    const o = new FlightPath(square);
    expect(o.sample(-50)).toMatchObject(o.sample(0));
    expect(o.sample(o.length + 50).x).toBeCloseTo(o.sample(o.length).x, 9);
  });

  it('rejects a degenerate path (fewer than two distinct points, a non-finite point) and drops duplicates', () => {
    expect(() => new FlightPath([{ x: 1, y: 1, z: 1 }])).toThrow();
    expect(() => new FlightPath([{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }])).toThrow();
    expect(() => new FlightPath([{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }])).toThrow();
    const p = new FlightPath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }]);
    expect(p.points).toHaveLength(2);
    expect(p.length).toBeCloseTo(10, 3);
  });

  it('PathWalker walks at its speed and stops at the end of an open path', () => {
    const w = new PathWalker(new FlightPath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 }]), 10);
    w.step(1);
    expect(w.distance).toBeCloseTo(10, 6);
    expect(w.done).toBe(false);
    const end = w.step(5);
    expect(w.done).toBe(true);
    expect(end.z).toBeCloseTo(-20, 6);
    w.step(NaN);
    expect(w.distance).toBeCloseTo(20, 6);
  });
});
