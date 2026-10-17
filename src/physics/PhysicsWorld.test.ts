import { describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP, WORLD_GRAVITY } from '../config/constants';
import { PhysicsWorld, type HeightfieldDesc, type Rapier, type RapierLoader } from './PhysicsWorld';
import { buildPhysicsHeightfield } from '../terrain/physicsHeightfield';
import { heightAt } from '../terrain/heightfield';

const realLoader: RapierLoader = () => import('@dimforge/rapier3d');

async function makeWorld(): Promise<PhysicsWorld> {
  const p = new PhysicsWorld();
  await p.init();
  return p;
}

function box(p: PhysicsWorld, x: number, y: number, z: number, hx = 0.5, hy = 0.5, hz = 0.5) {
  return p.addStaticCollider(p.rapier.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
}

const DOWN = { x: 0, y: -1, z: 0 };

// Rapier's query pipeline only sees colliders after the next world step (the game steps every tick).
const settle = (p: PhysicsWorld): void => p.step();

describe('PhysicsWorld lifecycle', () => {
  it('throws from rapier and world before init and reports ready=false', () => {
    const p = new PhysicsWorld();
    expect(p.ready).toBe(false);
    expect(() => p.rapier).toThrow('init()');
    expect(() => p.world).toThrow('init()');
    expect(() => p.step()).toThrow();
  });

  it('is ready after init and exposes rapier and world', async () => {
    const p = await makeWorld();
    expect(p.ready).toBe(true);
    expect(p.rapier).toBeDefined();
    expect(p.world).toBeDefined();
  });

  it('init twice sequentially is a no-op', async () => {
    const p = await makeWorld();
    const w = p.world;
    await p.init();
    expect(p.world).toBe(w);
  });

  it('concurrent init calls invoke the loader once', async () => {
    const loader = vi.fn(realLoader);
    const p = new PhysicsWorld(loader);
    await Promise.all([p.init(), p.init()]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(p.ready).toBe(true);
  });

  it('rejects with a descriptive error and cause when loading fails', async () => {
    const reason = new Error('wasm 404');
    const p = new PhysicsWorld(() => Promise.reject(reason));
    const err = await p.init().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const e = err as Error;
    expect(e.message.startsWith('Failed to load the Rapier physics engine (WASM)')).toBe(true);
    expect(e.message).toContain('wasm 404');
    expect(e.cause).toBe(reason);
    expect(p.ready).toBe(false);
    expect(() => p.world).toThrow();
    expect(() => p.rapier).toThrow();
  });

  it('stringifies non-Error rejection reasons', async () => {
    const p = new PhysicsWorld(() => Promise.reject('boom'));
    await expect(p.init()).rejects.toThrow(/Failed to load the Rapier physics engine \(WASM\): boom/);
  });

  it('retries successfully after a failed init', async () => {
    const loader = vi
      .fn<() => Promise<Rapier>>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockImplementation(realLoader);
    const p = new PhysicsWorld(loader);
    await expect(p.init()).rejects.toThrow('flaky');
    await p.init();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(p.ready).toBe(true);
    expect(() => p.step()).not.toThrow();
  });
});

describe('PhysicsWorld.step', () => {
  it('uses FIXED_TIMESTEP and a dynamic body falls ~0.5*g*t^2 after 60 steps', async () => {
    const p = await makeWorld();
    expect(p.world.timestep).toBeCloseTo(FIXED_TIMESTEP, 6);
    const body = p.world.createRigidBody(p.rapier.RigidBodyDesc.dynamic().setTranslation(0, 100, 0));
    p.world.createCollider(p.rapier.ColliderDesc.ball(0.5), body);
    for (let i = 0; i < 60; i++) p.step();
    const fallen = 100 - body.translation().y;
    expect(fallen).toBeGreaterThan(0.5 * -WORLD_GRAVITY.y * 0.9);
    expect(fallen).toBeLessThan(0.5 * -WORLD_GRAVITY.y * 1.1);
  });
});

describe('PhysicsWorld.addHeightfield validation', () => {
  const valid = (): HeightfieldDesc => ({
    nrows: 2,
    ncols: 2,
    heights: new Float32Array(9),
    scale: { x: 4, y: 1, z: 4 },
    center: { x: 0, y: 0, z: 0 },
  });

  it('accepts a valid heightfield and returns a collider', async () => {
    const p = await makeWorld();
    const c = p.addHeightfield(valid());
    expect(p.world.colliders.contains(c.handle)).toBe(true);
  });

  it('rejects a wrong sample count', async () => {
    const p = await makeWorld();
    expect(() => p.addHeightfield({ ...valid(), heights: new Float32Array(8) })).toThrow(/needs 9 samples/);
    expect(() => p.addHeightfield({ ...valid(), heights: new Float32Array(10) })).toThrow(/needs 9 samples/);
  });

  it.each([
    ['zero nrows', { nrows: 0 }],
    ['zero ncols', { ncols: 0 }],
    ['negative nrows', { nrows: -2 }],
    ['negative ncols', { ncols: -1 }],
    ['fractional nrows', { nrows: 1.5 }],
    ['fractional ncols', { ncols: 2.5 }],
    ['NaN nrows', { nrows: NaN }],
  ])('rejects %s', async (_name, patch) => {
    const p = await makeWorld();
    expect(() => p.addHeightfield({ ...valid(), ...patch })).toThrow(Error);
  });

  it.each([
    ['zero x', { x: 0, y: 1, z: 1 }],
    ['zero y', { x: 1, y: 0, z: 1 }],
    ['zero z', { x: 1, y: 1, z: 0 }],
    ['negative x', { x: -1, y: 1, z: 1 }],
    ['negative y', { x: 1, y: -1, z: 1 }],
    ['negative z', { x: 1, y: 1, z: -1 }],
    ['NaN x', { x: NaN, y: 1, z: 1 }],
    ['Infinity y', { x: 1, y: Infinity, z: 1 }],
    ['Infinity z', { x: 1, y: 1, z: Infinity }],
  ])('rejects scale with %s', async (_name, scale) => {
    const p = await makeWorld();
    expect(() => p.addHeightfield({ ...valid(), scale })).toThrow(/scale/);
  });

  it.each([
    ['NaN x', { x: NaN, y: 0, z: 0 }],
    ['Infinity y', { x: 0, y: Infinity, z: 0 }],
    ['-Infinity z', { x: 0, y: 0, z: -Infinity }],
  ])('rejects non-finite center (%s)', async (_name, center) => {
    const p = await makeWorld();
    expect(() => p.addHeightfield({ ...valid(), center })).toThrow(/center/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a height sample of %s', async (bad) => {
    const p = await makeWorld();
    const heights = new Float32Array(9);
    heights[4] = bad;
    expect(() => p.addHeightfield({ ...valid(), heights })).toThrow(/sample 4/);
  });
});

describe('PhysicsWorld heightfield layout', () => {
  async function sampleHeights(scaleY: number) {
    const p = await makeWorld();
    const nrows = 2;
    const ncols = 3;
    const heights = Float32Array.from({ length: (nrows + 1) * (ncols + 1) }, (_, i) => i);
    const scale = { x: 3, y: scaleY, z: 2 };
    const center = { x: 10, y: 5, z: -4 };
    p.addHeightfield({ nrows, ncols, heights, scale, center });
    settle(p);
    const results: { row: number; col: number; got: number | null; expected: number }[] = [];
    for (let col = 0; col <= ncols; col++) {
      for (let row = 0; row <= nrows; row++) {
        const dx = -scale.x / 2 + (col * scale.x) / ncols;
        const dz = -scale.z / 2 + (row * scale.z) / nrows;
        const hit = p.raycast({ x: center.x + dx * 0.999, y: 100, z: center.z + dz * 0.999 }, DOWN, 200);
        results.push({
          row,
          col,
          got: hit ? hit.point.y : null,
          expected: center.y + scaleY * heights[row + col * (nrows + 1)],
        });
      }
    }
    return results;
  }

  it('matches the documented column-major sample layout', async () => {
    const results = await sampleHeights(1);
    expect(results).toHaveLength(12);
    for (const r of results) {
      expect(r.got, `row ${r.row} col ${r.col}`).not.toBeNull();
      expect(r.got as number).toBeCloseTo(r.expected, 1);
    }
  });

  it('multiplies heights by scale.y', async () => {
    const results = await sampleHeights(2.5);
    for (const r of results) {
      expect(r.got as number).toBeCloseTo(r.expected, 1);
    }
  });
});

describe('PhysicsWorld.removeCollider', () => {
  it('makes a previously hit raycast miss', async () => {
    const p = await makeWorld();
    const c = box(p, 0, 0, 0);
    const origin = { x: 0, y: 5, z: 0 };
    settle(p);
    expect(p.raycast(origin, DOWN, 20)).not.toBeNull();
    p.removeCollider(c);
    settle(p);
    expect(p.raycast(origin, DOWN, 20)).toBeNull();
  });

  it('removing the same collider twice does not throw', async () => {
    const p = await makeWorld();
    const c = box(p, 0, 0, 0);
    p.removeCollider(c);
    expect(() => p.removeCollider(c)).not.toThrow();
  });
});

describe('PhysicsWorld.raycast', () => {
  it('returns point, unit normal and distance', async () => {
    const p = await makeWorld();
    const c = box(p, 0, 0, 0); // top at y = 0.5
    settle(p);
    const hit = p.raycast({ x: 0.1, y: 5, z: 0.2 }, DOWN, 20);
    expect(hit).not.toBeNull();
    expect(hit?.distance).toBeCloseTo(4.5, 4);
    expect(hit?.point.x).toBeCloseTo(0.1, 4);
    expect(hit?.point.y).toBeCloseTo(0.5, 4);
    expect(hit?.point.z).toBeCloseTo(0.2, 4);
    const n = hit?.normal ?? { x: 0, y: 0, z: 0 };
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
    expect(n.y).toBeCloseTo(1, 5);
    expect(hit?.collider.handle).toBe(c.handle);
  });

  it('sees a newly added collider only after the next step', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 20)).toBeNull();
    settle(p);
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 20)).not.toBeNull();
  });

  it('returns null for a zero-length direction', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    settle(p);
    expect(p.raycast({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, 20)).toBeNull();
  });

  it('returns null for a non-finite direction', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    settle(p);
    expect(p.raycast({ x: 0, y: 5, z: 0 }, { x: 0, y: NaN, z: 0 }, 20)).toBeNull();
  });

  it('gives the same distance for a non-normalized direction', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    settle(p);
    const a = p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 20);
    const b = p.raycast({ x: 0, y: 5, z: 0 }, { x: 0, y: -10, z: 0 }, 20);
    expect(a).not.toBeNull();
    expect(b?.distance).toBeCloseTo(a?.distance ?? NaN, 5);
  });

  it('misses a target beyond maxDistance and hits within it', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    settle(p);
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 4)).toBeNull();
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 5)).not.toBeNull();
  });

  it.each([0, -1, NaN])('returns null for maxDistance %s', async (max) => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    settle(p);
    // Sanity: the box is within reach of a valid ray, so a missing guard would show up.
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, 20)).not.toBeNull();
    expect(p.raycast({ x: 0, y: 5, z: 0 }, DOWN, max)).toBeNull();
  });

  it('skips the excluded collider and hits the one behind it', async () => {
    const p = await makeWorld();
    const near = box(p, 0, 0, 0);
    const far = box(p, 0, -3, 0);
    settle(p);
    const origin = { x: 0, y: 5, z: 0 };
    expect(p.raycast(origin, DOWN, 20)?.collider.handle).toBe(near.handle);
    const hit = p.raycast(origin, DOWN, 20, near);
    expect(hit?.collider.handle).toBe(far.handle);
    expect(hit?.point.y).toBeCloseTo(-2.5, 4);
  });
});

describe('PhysicsWorld.overlapShape', () => {
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  it('reports overlapping colliders and none when clear', async () => {
    const p = await makeWorld();
    const c = box(p, 0, 0, 0);
    settle(p);
    const ball = new p.rapier.Ball(0.5);
    const hits: number[] = [];
    p.overlapShape(ball, { x: 0.8, y: 0, z: 0 }, identity, (col) => {
      hits.push(col.handle);
      return true;
    });
    expect(hits).toEqual([c.handle]);

    const none = vi.fn(() => true);
    p.overlapShape(ball, { x: 10, y: 0, z: 0 }, identity, none);
    expect(none).not.toHaveBeenCalled();
  });

  it('stops after the first hit when the callback returns false', async () => {
    const p = await makeWorld();
    box(p, 0, 0, 0);
    box(p, 0.2, 0, 0);
    settle(p);
    const ball = new p.rapier.Ball(0.5);
    const all = vi.fn(() => true);
    p.overlapShape(ball, { x: 0, y: 0, z: 0 }, identity, all);
    expect(all).toHaveBeenCalledTimes(2);
    const stop = vi.fn(() => false);
    p.overlapShape(ball, { x: 0, y: 0, z: 0 }, identity, stop);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('PhysicsWorld.sweepShape', () => {
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  it('hits a box with the expected time of impact', async () => {
    const p = await makeWorld();
    const c = box(p, 10, 0, 0); // near face at x = 9.5
    settle(p);
    const ball = new p.rapier.Ball(0.5);
    const hit = p.sweepShape(ball, { x: 0, y: 0, z: 0 }, identity, { x: 1, y: 0, z: 0 }, 20);
    expect(hit).not.toBeNull();
    expect(hit?.time_of_impact).toBeCloseTo(9, 2); // ball surface at 0.5 reaches 9.5 after 9 m
    expect(hit?.collider.handle).toBe(c.handle);
  });

  it('misses when swept away from the box or short of it', async () => {
    const p = await makeWorld();
    box(p, 10, 0, 0);
    settle(p);
    const ball = new p.rapier.Ball(0.5);
    expect(p.sweepShape(ball, { x: 0, y: 0, z: 0 }, identity, { x: -1, y: 0, z: 0 }, 20)).toBeNull();
    expect(p.sweepShape(ball, { x: 0, y: 0, z: 0 }, identity, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
  });
});

describe('PhysicsWorld with real terrain data', () => {
  it('accepts buildPhysicsHeightfield output and matches heightAt under the patch', async () => {
    const p = await makeWorld();
    // Type-level check: the terrain contract type is assignable to addHeightfield's argument.
    const patch: HeightfieldDesc = buildPhysicsHeightfield(600, -400, 200, 64);
    p.addHeightfield(patch);
    settle(p);
    for (const [x, z] of [
      [600, -400],
      [520.3, -333.7],
      [689.9, -490.1],
      [555.5, -444.4],
    ]) {
      const hit = p.raycast({ x, y: 1000, z }, DOWN, 2000);
      expect(hit).not.toBeNull();
      // Inside a cell Rapier interpolates linearly, so allow for the terrain's curvature between samples.
      expect(hit?.point.y).toBeCloseTo(heightAt(x, z), 0);
    }
    // Exactly on grid nodes (spacing 200 / 64 m) the collider matches heightAt to float precision.
    for (const [col, row] of [
      [10, 20],
      [33, 7],
      [63, 63],
    ]) {
      const x = 500 + (col * 200) / 64;
      const z = -500 + (row * 200) / 64;
      expect(p.raycast({ x, y: 1000, z }, DOWN, 2000)?.point.y).toBeCloseTo(heightAt(x, z), 2);
    }
    // Outside the patch there is nothing to hit.
    expect(p.raycast({ x: 710, y: 1000, z: -400 }, DOWN, 2000)).toBeNull();
  });
});
