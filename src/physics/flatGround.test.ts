import { describe, expect, it } from 'vitest';
import { flatGround } from './flatGround';
import { PhysicsWorld } from './PhysicsWorld';

describe('flatGround', () => {
  it('builds a heightfield in the contract layout', () => {
    const g = flatGround(50, 4, 2, 10, -20);
    expect(g.nrows).toBe(4);
    expect(g.ncols).toBe(4);
    expect(g.heights.length).toBe(25);
    expect([...g.heights].every((h) => h === 2)).toBe(true);
    expect(g.scale).toEqual({ x: 50, y: 1, z: 50 });
    expect(g.center).toEqual({ x: 10, y: 0, z: -20 });
  });

  it('is accepted by addHeightfield and sits at the requested height', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    physics.addHeightfield(flatGround(50, 4, 2, 10, -20));
    physics.step();
    const hit = physics.raycast({ x: 30, y: 10, z: -40 }, { x: 0, y: -1, z: 0 }, 20);
    expect(hit?.point.y).toBeCloseTo(2, 4);
    expect(physics.raycast({ x: 40, y: 10, z: -20 }, { x: 0, y: -1, z: 0 }, 20)).toBeNull();
  });
});
