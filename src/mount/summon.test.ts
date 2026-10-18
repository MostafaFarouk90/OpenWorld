import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../physics/PhysicsWorld';
import { arrivalSpot, pathClear, planWhistle, type SummonPorts } from './summon';

interface Box {
  min: Vec3;
  max: Vec3;
}

/** A flat world (or `heightAt`) with axis-aligned solid boxes; rays and balls test against the boxes. */
function world(boxes: Box[] = [], opts: { heightAt?: (x: number, z: number) => number; resident?: (x: number, z: number) => boolean; indoors?: boolean } = {}): SummonPorts {
  const h = opts.heightAt ?? (() => 0);
  const inside = (p: Vec3, pad = 0) =>
    boxes.some((b) => p.x >= b.min.x - pad && p.x <= b.max.x + pad && p.y >= b.min.y - pad && p.y <= b.max.y + pad && p.z >= b.min.z - pad && p.z <= b.max.z + pad);
  const march = (o: Vec3, d: Vec3, max: number, pad: number): number | null => {
    for (let s = 0; s <= max; s += 0.05) {
      const p = { x: o.x + d.x * s, y: o.y + d.y * s, z: o.z + d.z * s };
      if (inside(p, pad)) return s;
      if (pad === 0 && p.y <= h(p.x, p.z)) return s;
    }
    return null;
  };
  return {
    raycast: (o, d, max) => {
      const s = march(o, d, max, 0);
      return s === null ? null : { distance: s, point: { x: o.x + d.x * s, y: o.y + d.y * s, z: o.z + d.z * s } };
    },
    isResident: opts.resident ?? (() => true),
    heightAt: h,
    indoors: () => opts.indoors ?? false,
    nav: null,
    ballClear: (a, b) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (len < 1e-3) return true;
      return march(a, { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len }, len, 0.35) === null;
    },
  };
}

const FEET = { x: 0, y: 0, z: 0 };

describe('whistle', () => {
  it('a horse within 80 m with a clear path runs to beside the player', () => {
    const plan = planWhistle(world(), FEET, 0, { x: 0, y: 0, z: 30, yaw: 0 } as never);
    expect(plan?.kind).toBe('run');
    if (plan?.kind !== 'run') return;
    expect(Math.hypot(plan.to.x, plan.to.z)).toBeCloseTo(2, 5);
  });

  it('a far or unplaced horse appears 12 m behind and canters in', () => {
    for (const horse of [null, { x: 0, y: 0, z: 300 }]) {
      const plan = planWhistle(world(), FEET, 0, horse);
      expect(plan?.kind).toBe('spawn');
      if (plan?.kind !== 'spawn') return;
      expect(plan.at.z).toBeGreaterThan(9);
      expect(Math.hypot(plan.at.x - plan.to.x, plan.at.z - plan.to.z)).toBeCloseTo(12, 0);
    }
  });

  it('a horse behind a house does not run through it: it is fetched from a clear spot', () => {
    const house = { min: { x: -6, y: 0, z: 10 }, max: { x: 6, y: 6, z: 14 } };
    const plan = planWhistle(world([house]), FEET, Math.PI / 2, { x: 0, y: 0, z: 30 });
    expect(plan?.kind).not.toBe('run');
  });

  it('in an alley with no clear candidate it pops in beside the player', () => {
    const walls = [
      { min: { x: -30, y: 0, z: 3 }, max: { x: 30, y: 8, z: 4 } },
      { min: { x: -30, y: 0, z: -4 }, max: { x: 30, y: 8, z: -3 } },
      { min: { x: -4, y: 0, z: -30 }, max: { x: -3, y: 8, z: 30 } },
      { min: { x: 3, y: 0, z: -30 }, max: { x: 4, y: 8, z: 30 } },
    ];
    const plan = planWhistle(world(walls), FEET, 0, null);
    expect(plan?.kind).toBe('pop');
  });

  it('from a rooftop the horse waits at street level, not on the roof', () => {
    const house = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 6, z: 5 } };
    const roof = { x: 0, y: 6, z: 0 };
    const to = arrivalSpot(world([house]), roof, 0);
    expect(to).not.toBeNull();
    expect(to!.y).toBeCloseTo(0, 1);
    expect(Math.max(Math.abs(to!.x), Math.abs(to!.z))).toBeGreaterThan(5);
  });

  it('at a plateau edge a candidate on the lower ground is refused', () => {
    // Plateau 20 m up for z < 6; the player stands at its edge facing -Z, so "behind" (+Z) is the low ground.
    const h = (_x: number, z: number) => (z < 6 ? 20 : 0);
    const plan = planWhistle(world([], { heightAt: h }), { x: 0, y: 20, z: 4 }, 0, null);
    expect(plan?.kind).toBe('pop');
  });

  it('indoors or on unbuilt ground there is nowhere to stand', () => {
    expect(planWhistle(world([], { indoors: true }), FEET, 0, null)).toBeNull();
    expect(planWhistle(world([], { resident: () => false }), FEET, 0, null)).toBeNull();
  });

  it('pathClear refuses a cliff step and accepts a gentle slope', () => {
    expect(pathClear(world([], { heightAt: (x) => x * 0.3 }), { x: 0, y: 0, z: 0 }, { x: 10, y: 3, z: 0 })).toBe(true);
    expect(pathClear(world([], { heightAt: (x) => (x > 5 ? 4 : 0) }), { x: 0, y: 0, z: 0 }, { x: 10, y: 4, z: 0 })).toBe(false);
  });
});
