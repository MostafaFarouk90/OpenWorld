import { describe, expect, it } from 'vitest';
import { RopeIndex, ShelterTracker } from './lanes';

const rope = { id: 'rope.test', points: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }] };

describe('rope index', () => {
  const idx = new RopeIndex([rope]);

  it('is safe within 4 m (the lane half width) and not beyond', () => {
    expect(idx.onRope(50, 4)).toBe(true);
    expect(idx.onRope(50, -4)).toBe(true);
    expect(idx.onRope(50, 4.1)).toBe(false);
  });

  it('handles segment ends and the corner', () => {
    expect(idx.onRope(-3.9, 0)).toBe(true);
    expect(idx.onRope(-4.1, 0)).toBe(false);
    expect(idx.onRope(102, -2)).toBe(true);
    expect(idx.onRope(103, 103)).toBe(false);
    expect(idx.onRope(101, 60)).toBe(true);
  });

  it('works across grid cells and with no ropes', () => {
    expect(idx.onRope(49.9, 1)).toBe(true);
    expect(idx.onRope(50.1, 1)).toBe(true);
    const none = new RopeIndex([]);
    expect(none.onRope(0, 0)).toBe(false);
    expect(none.nearest(0, 0)).toBeNull();
  });

  it('skips non-finite points and finds the nearest rope point', () => {
    const bad = new RopeIndex([{ id: 'r', points: [{ x: 0, z: 0 }, { x: Number.NaN, z: 0 }] }]);
    expect(bad.segmentCount).toBe(0);
    expect(idx.nearest(40, 20)).toEqual({ x: 40, z: 0 });
    expect(idx.nearest(130, 50)).toEqual({ x: 100, z: 50 });
  });
});

describe('shelter tracker', () => {
  const shelters = [
    { id: 'waste.shelter.a', at: { x: 0, z: 0 }, radius: 6 },
    { id: 'waste.shelter.b', at: { x: 450, z: 0 }, radius: 6 },
  ];

  it('enters and leaves with hysteresis, no chatter on the line', () => {
    const t = new ShelterTracker(shelters);
    expect(t.update(10, 0)).toEqual({});
    expect(t.update(5.9, 0)).toEqual({ entered: 'waste.shelter.a' });
    expect(t.update(6.5, 0)).toEqual({});
    expect(t.update(5.5, 0)).toEqual({});
    expect(t.update(6.9, 0)).toEqual({});
    expect(t.update(7.1, 0)).toEqual({ left: 'waste.shelter.a' });
    expect(t.current).toBeNull();
    expect(t.last).toBe('waste.shelter.a');
  });

  it('keeps the last shelter passed along a walk and moves on at the next one', () => {
    const t = new ShelterTracker(shelters);
    t.update(0, 0);
    for (let x = 0; x <= 445; x += 5) t.update(x, 0);
    expect(t.last).toBe('waste.shelter.b');
    expect(t.current).toBe('waste.shelter.b');
  });

  it('restores a saved last shelter and drops unknown ids; reset keeps it', () => {
    const t = new ShelterTracker(shelters);
    t.restoreLast('waste.shelter.b');
    expect(t.last).toBe('waste.shelter.b');
    t.restoreLast('nope');
    expect(t.last).toBeNull();
    t.update(0, 0);
    t.reset();
    expect(t.current).toBeNull();
    expect(t.last).toBe('waste.shelter.a');
  });
});
