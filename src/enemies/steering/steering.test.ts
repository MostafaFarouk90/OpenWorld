import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { STEERING } from '../tuning';
import { Steering, type SteeringInput, forwardOf, turnToward, yawTo } from './steering';

const flat = () => 0;
const noFeeler = () => null;

function input(patch: Partial<SteeringInput>): SteeringInput {
  return {
    position: { x: 0, y: 0, z: 0 },
    desired: { x: 10, z: 0 },
    speed: 2,
    neighbours: [],
    heightAt: flat,
    castFeeler: noFeeler,
    dt: 0.05,
    ...patch,
  };
}

/** Integrates the agent freely (no collision) for `seconds`. */
function simulate(
  s: Steering,
  start: { x: number; z: number },
  patch: Partial<SteeringInput>,
  seconds: number,
  dt = 0.05,
) {
  const pos = { x: start.x, z: start.z };
  const trail: { x: number; z: number }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const out = s.step(input({ ...patch, position: { x: pos.x, y: 0, z: pos.z }, dt }));
    pos.x += out.move.x * dt;
    pos.z += out.move.z * dt;
    trail.push({ ...pos });
  }
  return { pos, trail };
}

describe('Steering seek and arrive', () => {
  it('walks to the target and stops inside the arrive radius', () => {
    const { pos } = simulate(new Steering(), { x: 0, z: 0 }, { desired: { x: 8, z: 3 } }, 12);
    const d = Math.hypot(8 - pos.x, 3 - pos.z);
    expect(d).toBeLessThan(STEERING.arriveRadius);
    expect(d).toBeGreaterThan(0);
  });

  it('slows inside the slow radius', () => {
    const s = new Steering();
    const far = s.step(input({ desired: { x: 10, z: 0 } }));
    const near = new Steering().step(input({ desired: { x: 1.0, z: 0 } }));
    expect(far.move.x).toBeCloseTo(2);
    expect(near.move.x).toBeGreaterThan(0);
    expect(near.move.x).toBeLessThan(far.move.x);
  });

  it('zero-length desired and null desired stay put', () => {
    const s = new Steering();
    expect(s.step(input({ desired: { x: 0, z: 0 } }))).toEqual({ move: { x: 0, z: 0 }, stuck: false, giveUp: false });
    expect(s.step(input({ desired: null })).move).toEqual({ x: 0, z: 0 });
  });

  it('ignores NaN and infinite inputs without throwing', () => {
    const s = new Steering();
    const zero = { x: 0, z: 0 };
    expect(s.step(input({ position: { x: Number.NaN, y: 0, z: 0 } })).move).toEqual(zero);
    expect(s.step(input({ desired: { x: Number.NaN, z: 1 } })).move).toEqual(zero);
    expect(s.step(input({ desired: { x: Number.POSITIVE_INFINITY, z: 1 } })).move).toEqual(zero);
    expect(s.step(input({ speed: Number.NaN })).move).toEqual(zero);
    expect(s.step(input({ dt: Number.NaN })).move).toEqual(zero);
    expect(s.step(input({ neighbours: [{ x: Number.NaN, z: 0 }] })).move.x).toBeGreaterThan(0);
  });
});

describe('Steering separation', () => {
  it('pushes two enemies apart while they seek the same point', () => {
    const a = new Steering();
    const b = new Steering();
    const pa = { x: 0, z: -0.2 };
    const pb = { x: 0, z: 0.2 };
    for (let i = 0; i < 40; i++) {
      const oa = a.step(input({ position: { x: pa.x, y: 0, z: pa.z }, desired: { x: 10, z: 0 }, neighbours: [pb] }));
      const ob = b.step(input({ position: { x: pb.x, y: 0, z: pb.z }, desired: { x: 10, z: 0 }, neighbours: [pa] }));
      pa.x += oa.move.x * 0.05;
      pa.z += oa.move.z * 0.05;
      pb.x += ob.move.x * 0.05;
      pb.z += ob.move.z * 0.05;
    }
    expect(pb.z - pa.z).toBeGreaterThan(0.4);
  });

  it('handles an exactly coincident neighbour', () => {
    const out = new Steering().step(input({ neighbours: [{ x: 0, z: 0 }] }));
    expect(Number.isFinite(out.move.x) && Number.isFinite(out.move.z)).toBe(true);
    expect(Math.hypot(out.move.x, out.move.z)).toBeGreaterThan(0);
  });
});

describe('Steering feelers with a real Rapier wall', () => {
  let physics: PhysicsWorld;
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    // Wall across x = 5, spanning z in [-6, 6].
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(0.25, 2, 6).setTranslation(5, 2, 0));
    physics.step();
  });

  const cast = (o: { x: number; y: number; z: number }, d: { x: number; z: number }, len: number) =>
    physics.raycast(o, { x: d.x, y: 0, z: d.z }, len)?.distance ?? null;

  it('turns along a wall straight ahead instead of into it', () => {
    const { pos, trail } = simulate(
      new Steering(),
      { x: 0, z: 0 },
      { desired: { x: 10, z: 0 }, castFeeler: cast },
      14,
    );
    // Never enters the wall slab (x 4.75..5.25, |z| < 6): it follows the wall to its end and round it.
    const inside = trail.filter((p) => p.x > 4.75 && p.x < 5.25 && Math.abs(p.z) < 6);
    expect(inside).toEqual([]);
    expect(Math.max(...trail.map((p) => Math.abs(p.z)))).toBeGreaterThan(5);
    expect(Math.hypot(10 - pos.x, pos.z)).toBeLessThan(STEERING.arriveRadius);
  });

  it('a clear path is unaffected', () => {
    const out = new Steering().step(input({ desired: { x: 0, z: 10 }, castFeeler: cast }));
    expect(out.move.x).toBeCloseTo(0);
    expect(out.move.z).toBeCloseTo(2);
  });
});

describe('Steering cliff and slope probe', () => {
  // Plateau for x < 0, 5 m lower for x >= 0.
  const cliff = (x: number) => (x < 0 ? 0 : -5);
  const heightCliff = (x: number, _z: number) => cliff(x);

  it('refuses a 5 m drop and slides along the edge', () => {
    const s = new Steering();
    const pos = { x: -0.5, z: 0 };
    const start = { ...pos };
    for (let i = 0; i < 60; i++) {
      const out = s.step(
        input({ position: { x: pos.x, y: 0, z: pos.z }, desired: { x: 6, z: 6 }, heightAt: heightCliff }),
      );
      pos.x += out.move.x * 0.05;
      pos.z += out.move.z * 0.05;
      expect(heightCliff(pos.x, pos.z)).toBe(0);
    }
    expect(pos.z - start.z).toBeGreaterThan(2);
  });

  it('straight at the edge with nowhere to slide gives zero only when both sides are cliffs', () => {
    const out = new Steering().step(
      input({ position: { x: 0.2, y: 0, z: 0 }, desired: { x: 6, z: 0 }, heightAt: () => Number.NaN }),
    );
    expect(out.move.x).toBeGreaterThan(0); // unknown terrain is not refused
    const wall = (x: number) => (x < 0.5 ? 0 : -5);
    const refused = new Steering().step(
      input({ position: { x: 0.2, y: 0, z: 0 }, desired: { x: 6, z: 0 }, heightAt: (x) => wall(x) }),
    );
    // It slides sideways (perpendicular), never forward.
    expect(Math.abs(refused.move.x)).toBeLessThan(1e-9);
    expect(Math.abs(refused.move.z)).toBeGreaterThan(0);
  });

  it('refuses a slope above 40 degrees and allows 30', () => {
    const slope = (deg: number) => (x: number) => Math.tan((deg * Math.PI) / 180) * x;
    const steep = new Steering().step(
      input({ position: { x: 0, y: 0, z: 0 }, desired: { x: 10, z: 0 }, heightAt: slope(45) }),
    );
    expect(Math.abs(steep.move.x)).toBeLessThan(1e-9);
    const ok = new Steering().step(input({ desired: { x: 10, z: 0 }, heightAt: slope(30) }));
    expect(ok.move.x).toBeGreaterThan(1.9);
  });
});

describe('Steering stuck handling', () => {
  it('side-steps after 1 s of no progress', () => {
    const s = new Steering();
    let last = s.step(input({}));
    let t = 0;
    while (t < 1.2 && !last.stuck) {
      last = s.step(input({})); // position never changes
      t += 0.05;
    }
    expect(last.stuck).toBe(true);
    expect(t).toBeGreaterThanOrEqual(0.9);
    expect(t).toBeLessThan(1.2);
    // Desired is +x, so the side step is along +/-z.
    expect(Math.abs(last.move.x)).toBeLessThan(1e-9);
    expect(Math.abs(last.move.z)).toBeGreaterThan(0);
  });

  it('gives up after 3 s stuck, once, and again after reset()', () => {
    const s = new Steering();
    let gaveUpAt = -1;
    let count = 0;
    for (let i = 0; i < 100; i++) {
      const out = s.step(input({}));
      if (out.giveUp) {
        count++;
        if (gaveUpAt < 0) gaveUpAt = i * 0.05;
      }
    }
    expect(count).toBe(1);
    expect(gaveUpAt).toBeGreaterThanOrEqual(2.9);
    expect(gaveUpAt).toBeLessThanOrEqual(3.3);
    s.reset();
    let again = false;
    for (let i = 0; i < 100; i++) again ||= s.step(input({})).giveUp;
    expect(again).toBe(true);
  });

  it('free movement is never stuck', () => {
    const s = new Steering();
    const pos = { x: 0, z: 0 };
    for (let i = 0; i < 100; i++) {
      const out = s.step(input({ position: { x: pos.x, y: 0, z: pos.z }, desired: { x: 100, z: 0 } }));
      expect(out.stuck).toBe(false);
      expect(out.giveUp).toBe(false);
      pos.x += out.move.x * 0.05;
    }
  });
});

describe('yaw helpers', () => {
  it('matches the player convention (yaw 0 faces -Z)', () => {
    expect(yawTo({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(yawTo({ x: 0, z: 0 }, { x: -5, z: 0 })).toBeCloseTo(Math.PI / 2);
    const f = forwardOf(yawTo({ x: 1, z: 1 }, { x: 4, z: 5 }));
    expect(f.x).toBeCloseTo(3 / 5);
    expect(f.z).toBeCloseTo(4 / 5);
  });

  it('turnToward takes the shortest arc across +/-PI', () => {
    const r = turnToward(3.0, -3.0, 0.1);
    expect(r).toBeCloseTo(3.1);
    const l = turnToward(-3.0, 3.0, 0.1);
    expect(l).toBeCloseTo(-3.1);
    expect(turnToward(0, 1, 5)).toBeCloseTo(1);
    expect(turnToward(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(turnToward(Math.PI - 0.05, -Math.PI + 0.05, 1)).toBeCloseTo(-Math.PI + 0.05);
  });
});
