import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld, type HeightfieldDesc } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { buildPhysicsHeightfield } from '../terrain/physicsHeightfield';
import { TerrainColliders, type TerrainCollidersOptions } from './TerrainColliders';

const DOWN = { x: 0, y: -1, z: 0 };
const SMALL = { patchSize: 20, cells: 8 };
const BIG = 1e9;

async function makeWorld(): Promise<PhysicsWorld> {
  const p = new PhysicsWorld();
  await p.init();
  return p;
}

async function setup(options: TerrainCollidersOptions = {}) {
  const physics = await makeWorld();
  const tc = new TerrainColliders(physics, { ...SMALL, budgetMs: BIG, ...options });
  return { physics, tc };
}

/** Clock that advances `dt` ms on every read. */
function fakeClock(dt: number): () => number {
  let t = 0;
  return () => (t += dt);
}

function drain(tc: TerrainColliders, x: number, z: number, max = 200): number {
  let n = 0;
  while (tc.pendingKeys.length > 0 && n < max) {
    tc.update(x, z);
    n++;
  }
  return n;
}

const ALL9 = ['-1,-1', '0,-1', '1,-1', '-1,0', '0,0', '1,0', '-1,1', '0,1', '1,1'];

afterEach(() => vi.restoreAllMocks());

describe('TerrainColliders construction', () => {
  it('rejects invalid options with RangeError', async () => {
    const physics = await makeWorld();
    for (const bad of [
      { patchSize: 0 },
      { patchSize: -5 },
      { patchSize: NaN },
      { patchSize: Infinity },
      { cells: 0 },
      { cells: 2.5 },
      { cells: NaN },
      { radius: -1 },
      { radius: 1.5 },
      { budgetMs: -1 },
      { budgetMs: NaN },
      { budgetMs: Infinity },
    ]) {
      expect(() => new TerrainColliders(physics, bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  it('accepts budget 0 and radius 0', async () => {
    const physics = await makeWorld();
    expect(() => new TerrainColliders(physics, { budgetMs: 0, radius: 0 })).not.toThrow();
  });

  it('uses the terrain constants by default', async () => {
    const tc = new TerrainColliders(await makeWorld());
    expect(tc.patchSize).toBe(200);
    expect(tc.cells).toBe(128);
    expect(tc.radius).toBe(1);
  });
});

describe('TerrainColliders initial build', () => {
  it('registers the player patch synchronously even with budget 0', async () => {
    const { tc } = await setup({ budgetMs: 0 });
    tc.update(5, 5);
    expect(tc.keys).toContain('0,0');
    expect(tc.count).toBe(1);
    expect(tc.pendingKeys).toHaveLength(8);
    expect(tc.pendingKeys).not.toContain('0,0');
  });

  it('registers all 9 patches with a large budget and ground is hit by rays', async () => {
    const physics = await makeWorld();
    const tc = new TerrainColliders(physics, { patchSize: 200, cells: 32, budgetMs: BIG });
    tc.update(0, 0);
    drain(tc, 0, 0);
    expect([...tc.keys].sort()).toEqual([...ALL9].sort());
    expect(tc.pendingKeys).toEqual([]);
    physics.step();
    const hit = physics.raycast({ x: 0, y: 500, z: 0 }, DOWN, 1000);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(heightAt(0, 0), 0);
    const px = 250;
    const pz = -120;
    const hit2 = physics.raycast({ x: px, y: 500, z: pz }, DOWN, 1000);
    expect(hit2).not.toBeNull();
    expect(hit2!.point.y).toBeCloseTo(heightAt(px, pz), 0);
    expect(hit2!.collider).toBe(tc.colliderFor('1,-1'));
  });

  it('handles negative coordinates with floor semantics', async () => {
    const { tc } = await setup({ budgetMs: 0, cells: 8 });
    tc.update(-0.5, -0.5);
    expect(tc.keys).toEqual(['-1,-1']);
    tc.update(-20.5, 0);
    expect(tc.keys).toContain('-2,0');
  });

  it('radius 0 builds only the player patch', async () => {
    const { tc } = await setup({ radius: 0 });
    tc.update(0, 0);
    expect(tc.keys).toEqual(['0,0']);
    expect(tc.pendingKeys).toEqual([]);
  });
});

describe('TerrainColliders boundary crossing', () => {
  it('removes 3 immediately, queues 3, and drains them', async () => {
    const { physics, tc } = await setup({ budgetMs: 0 });
    tc.update(5, 5);
    drain(tc, 5, 5);
    expect(tc.count).toBe(9);
    const before = physics.world.colliders.len();
    tc.update(25, 5);
    expect(tc.keys).not.toContain('-1,-1');
    expect(tc.keys).not.toContain('-1,0');
    expect(tc.keys).not.toContain('-1,1');
    expect(physics.world.colliders.len()).toBe(before - 3);
    expect(tc.keys).toContain('1,0');
    expect(tc.pendingKeys.sort()).toEqual(['2,-1', '2,0', '2,1']);
    drain(tc, 25, 5);
    expect(tc.count).toBe(9);
    expect(tc.keys).toContain('2,0');
    expect(physics.world.colliders.len()).toBe(9);
  });

  it('walking back restores the original block', async () => {
    const { tc } = await setup();
    tc.update(5, 5);
    drain(tc, 5, 5);
    tc.update(25, 5);
    drain(tc, 25, 5);
    tc.update(5, 5);
    drain(tc, 5, 5);
    expect([...tc.keys].sort()).toEqual([...ALL9].sort());
  });

  it('moving within a patch changes nothing', async () => {
    const { physics, tc } = await setup();
    tc.update(5, 5);
    drain(tc, 5, 5);
    const keys = tc.keys;
    const colliders = keys.map((k) => tc.colliderFor(k));
    const len = physics.world.colliders.len();
    const add = vi.spyOn(physics, 'addHeightfield');
    const remove = vi.spyOn(physics, 'removeCollider');
    for (const [x, z] of [[1, 1], [19.9, 0.1], [10, 10]]) tc.update(x, z);
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(tc.keys).toEqual(keys);
    expect(keys.map((k) => tc.colliderFor(k))).toEqual(colliders);
    expect(physics.world.colliders.len()).toBe(len);
  });
});

describe('TerrainColliders queue order', () => {
  it('orders pending patches nearest-first and drains in that order', async () => {
    const { tc } = await setup({ budgetMs: 0, cells: 1 });
    // Player near the +x edge of patch 0,0: the 1,* column is nearer than the -1,* column.
    tc.update(19, 10);
    const pending = tc.pendingKeys;
    expect(pending).toHaveLength(8);
    expect(pending[0]).toBe('1,0');
    const centre = (k: string) => {
      const [ix, iz] = k.split(',').map(Number);
      return Math.hypot((ix + 0.5) * 20 - 19, (iz + 0.5) * 20 - 10);
    };
    const d = pending.map(centre);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    // cells 1 -> two columns per patch; each update builds one column.
    const order: string[] = [];
    let remaining = tc.pendingKeys;
    for (let i = 0; i < 40 && remaining.length; i++) {
      tc.update(19, 10);
      const now = tc.pendingKeys;
      for (const k of remaining) if (!now.includes(k)) order.push(k);
      remaining = now;
    }
    expect(order).toEqual(pending);
  });

  it('re-sorts when the player patch changes', async () => {
    const { tc } = await setup({ budgetMs: 0 });
    tc.update(5, 5);
    tc.update(-30, 5);
    const first = tc.pendingKeys[0];
    expect(['-3,-1', '-3,0', '-3,1', '-2,-1', '-2,1', '-1,-1', '-1,1', '0,-1', '0,0', '0,1', '-2,0']).toContain(first);
    expect(tc.pendingKeys).not.toContain('1,0');
    tc.update(300, 5);
    const pending = tc.pendingKeys;
    const dists = pending.map((k) => {
      const [ix, iz] = k.split(',').map(Number);
      return Math.hypot((ix + 0.5) * 20 - 300, (iz + 0.5) * 20 - 5);
    });
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
  });
});

describe('TerrainColliders budget', () => {
  it('takes several updates to finish a patch under a small budget', async () => {
    // 10 columns per patch; each clock read advances 1 ms, budget 3 ms.
    const { tc } = await setup({ cells: 9, budgetMs: 3, now: fakeClock(1) });
    tc.update(5, 5);
    const start = tc.count;
    expect(start).toBe(1);
    let updates = 0;
    while (tc.count < 2 && updates < 100) {
      tc.update(5, 5);
      updates++;
    }
    expect(updates).toBeGreaterThan(1);
    expect(updates).toBeLessThanOrEqual(10);
    expect(tc.count).toBe(2);
  });

  it('keeps a partially built patch across updates (no restart)', async () => {
    const calls: number[] = [];
    const { tc } = await setup({
      cells: 4,
      budgetMs: 0,
      heightAt: (x, z) => {
        calls.push(x);
        return 0 * z;
      },
    });
    tc.update(5, 5);
    const afterSync = calls.length;
    // The player patch (25 samples) plus one column (5 samples) of the first queued patch.
    expect(afterSync).toBe(30);
    tc.update(5, 5);
    expect(calls.length - afterSync).toBe(5);
    tc.update(5, 5);
    expect(calls.length - afterSync).toBe(10);
    const target = tc.pendingKeys[0];
    drain(tc, 5, 5);
    expect(tc.colliderFor(target)).toBeDefined();
    // Every patch sampled exactly 5 columns x 5 rows.
    expect(calls.length).toBe(25 * 9);
  });

  it('budget 0 progresses at least one column per update and always drains', async () => {
    const { tc } = await setup({ cells: 5, budgetMs: 0, now: fakeClock(1) });
    tc.update(5, 5);
    const n = drain(tc, 5, 5, 8 * 6 + 5);
    expect(tc.pendingKeys).toEqual([]);
    expect(tc.count).toBe(9);
    expect(n).toBeLessThanOrEqual(8 * 6);
  });

  it('a large budget finishes everything in one update', async () => {
    const { tc } = await setup({ budgetMs: BIG });
    tc.update(5, 5);
    expect(tc.count).toBe(9);
  });
});

describe('TerrainColliders teleport', () => {
  it('drops old colliders and stale queue, registers the new player patch synchronously', async () => {
    const { physics, tc } = await setup({ budgetMs: 0, cells: 4 });
    tc.update(5, 5);
    drain(tc, 5, 5, 12);
    expect(tc.pendingKeys.length).toBeGreaterThan(0);
    const registered = tc.count;
    expect(registered).toBeGreaterThan(1);
    expect(physics.world.colliders.len()).toBe(registered);

    tc.update(5000, 5000);
    const px = Math.floor(5000 / 20);
    expect(tc.keys).toContain(`${px},${px}`);
    expect(tc.keys.every((k) => Math.abs(Number(k.split(',')[0]) - px) <= 1)).toBe(true);
    expect(tc.pendingKeys.every((k) => Math.abs(Number(k.split(',')[0]) - px) <= 1)).toBe(true);
    expect(tc.pendingKeys.every((k) => Math.abs(Number(k.split(',')[1]) - px) <= 1)).toBe(true);
    expect(physics.world.colliders.len()).toBe(tc.count);
    expect(tc.count).toBe(1);

    physics.step();
    const hit = physics.raycast({ x: 5000.5, y: 2000, z: 5000.5 }, DOWN, 4000);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(heightAt(5000.5, 5000.5), 0);
  });

  it('discards partial work for patches no longer wanted', async () => {
    const calls: Array<[number, number]> = [];
    const { tc } = await setup({
      cells: 4,
      budgetMs: 0,
      heightAt: (x, z) => {
        calls.push([x, z]);
        return 0;
      },
    });
    tc.update(5, 5);
    tc.update(5, 5);
    const head = tc.pendingKeys[0];
    tc.update(1000, 1000);
    expect(tc.pendingKeys).not.toContain(head);
    tc.update(5, 5);
    expect(tc.pendingKeys).toContain(head);
  });
});

describe('TerrainColliders heightfield equality', () => {
  it('matches buildPhysicsHeightfield for default settings', async () => {
    const physics = await makeWorld();
    const spy = vi.spyOn(physics, 'addHeightfield');
    const tc = new TerrainColliders(physics, { budgetMs: BIG });
    tc.update(100, 100);
    // Ensure "-3,2" is built too by moving there.
    tc.update(-3 * 200 + 50, 2 * 200 + 50);
    const captured = new Map<string, HeightfieldDesc>();
    for (const call of spy.mock.calls) {
      const d = call[0];
      captured.set(`${Math.floor(d.center.x / 200)},${Math.floor(d.center.z / 200)}`, d);
    }
    for (const key of ['0,0', '-3,2']) {
      const [ix, iz] = key.split(',').map(Number);
      const want = buildPhysicsHeightfield((ix + 0.5) * 200, (iz + 0.5) * 200, 200, 128);
      const got = captured.get(key);
      expect(got, key).toBeDefined();
      expect(got!.nrows).toBe(want.nrows);
      expect(got!.ncols).toBe(want.ncols);
      expect(got!.scale).toEqual(want.scale);
      expect(got!.center).toEqual(want.center);
      const bytes = (a: Float32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      expect(bytes(got!.heights)).toEqual(bytes(want.heights));
    }
  });

  it('incremental building under budget 0 yields identical data', async () => {
    const physics = await makeWorld();
    const spy = vi.spyOn(physics, 'addHeightfield');
    const tc = new TerrainColliders(physics, { patchSize: 40, cells: 6, budgetMs: 0 });
    tc.update(10, 10);
    drain(tc, 10, 10);
    expect(spy).toHaveBeenCalledTimes(9);
    for (const [d] of spy.mock.calls) {
      const want = buildPhysicsHeightfield(d.center.x, d.center.z, 40, 6);
      expect(Array.from(d.heights)).toEqual(Array.from(want.heights));
    }
  });
});

describe('TerrainColliders duplicate keys', () => {
  it('never holds two colliders for one key', async () => {
    const { physics, tc } = await setup({ budgetMs: 0 });
    tc.update(5, 5);
    const key = tc.pendingKeys[0];
    const [ix, iz] = key.split(',').map(Number);
    const stray = physics.addHeightfield(buildPhysicsHeightfield((ix + 0.5) * 20, (iz + 0.5) * 20, 20, 8));
    (tc as unknown as { colliders: Map<string, unknown> }).colliders.set(key, stray);
    const remove = vi.spyOn(physics, 'removeCollider');
    drain(tc, 5, 5);
    expect(remove).toHaveBeenCalledWith(stray);
    expect(tc.count).toBe(9);
    expect(physics.world.colliders.len()).toBe(9);
    expect(tc.colliderFor(key)).not.toBe(stray);
  });
});

describe('TerrainColliders failures', () => {
  it('warns, leaves the key unregistered, and retries on a later update', async () => {
    const { physics, tc } = await setup({ budgetMs: BIG });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = physics.addHeightfield.bind(physics);
    vi.spyOn(physics, 'addHeightfield').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => tc.update(5, 5)).not.toThrow();
    // The player patch failed first: nothing else is built that update.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('0,0');
    expect(warn.mock.calls[0][1]).toBeInstanceOf(Error);
    expect(tc.keys).not.toContain('0,0');
    // Backing off: the failed key is not rebuilt on the very next update.
    expect(tc.pendingKeys).not.toContain('0,0');
    vi.spyOn(physics, 'addHeightfield').mockImplementation(real);
    tc.update(5, 5);
    expect(tc.keys).not.toContain('0,0');
    tc.update(5, 5);
    expect(tc.keys).toContain('0,0');
    expect(tc.count).toBe(9);
    expect(tc.pendingKeys).toEqual([]);
  });

  it('retries a failing queued patch without blocking others, then succeeds', async () => {
    let bad = 3;
    const { tc } = await setup({
      cells: 4,
      budgetMs: BIG,
      heightAt: (x) => (x > 20 && x < 40 && bad-- > 0 ? NaN : 0),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => tc.update(5, 5)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(tc.keys).not.toContain('1,0');
    for (let i = 0; i < 20; i++) tc.update(5, 5);
    expect(tc.keys).toContain('1,0');
    expect(tc.count).toBe(9);
  });

  it('a permanently failing patch never throws and never leaks colliders', async () => {
    const { physics, tc } = await setup({
      cells: 4,
      budgetMs: BIG,
      heightAt: (x) => (x > 20 && x < 40 ? NaN : 0),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 10; i++) expect(() => tc.update(5, 5)).not.toThrow();
    expect(tc.count).toBe(6);
    expect(physics.world.colliders.len()).toBe(6);
    // The failing keys are waiting out their backoff rather than rebuilt every update.
    expect(tc.pendingKeys).toEqual([]);
  });

  it('backs off exponentially and warns once per failing key', async () => {
    const { physics, tc } = await setup({
      cells: 4,
      budgetMs: BIG,
      heightAt: (x) => (x > 20 && x < 40 ? NaN : 0),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const add = vi.spyOn(physics, 'addHeightfield');
    for (let i = 0; i < 300; i++) tc.update(5, 5);
    expect(warn).toHaveBeenCalledTimes(3);
    // Three failing keys, each tried at updates 1, 3, 7, 15, 31, 63, 127, 255: 8 attempts, not 300.
    const failedAttempts = add.mock.calls.filter(([hf]) => hf.center.x > 20 && hf.center.x < 40).length;
    expect(failedAttempts).toBeLessThanOrEqual(3 * 9);
    expect(failedAttempts).toBeGreaterThanOrEqual(3 * 6);
  });

  it('a backed-off key that leaves the wanted block is forgotten, and retried at once on return', async () => {
    let failing = true;
    const { tc } = await setup({
      cells: 4,
      budgetMs: BIG,
      heightAt: (x) => (failing && x > 20 && x < 40 ? NaN : 0),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    tc.update(5, 5);
    expect(tc.keys).not.toContain('1,0');
    failing = false;
    tc.update(-500, 5); // far away: '1,0' leaves the block
    tc.update(5, 5);
    expect(tc.keys).toContain('1,0');
  });
});

describe('TerrainColliders edge cases', () => {
  it('ignores non-finite positions', async () => {
    const { physics, tc } = await setup();
    tc.update(5, 5);
    const keys = tc.keys;
    const add = vi.spyOn(physics, 'addHeightfield');
    for (const [x, z] of [[NaN, 0], [0, NaN], [Infinity, 0], [0, -Infinity]]) tc.update(x, z);
    expect(add).not.toHaveBeenCalled();
    expect(tc.keys).toEqual(keys);
  });

  it('non-finite first update registers nothing', async () => {
    const { tc } = await setup();
    tc.update(NaN, NaN);
    expect(tc.count).toBe(0);
    expect(tc.pendingKeys).toEqual([]);
  });

  it('colliderFor returns undefined for unknown keys', async () => {
    const { tc } = await setup();
    tc.update(5, 5);
    expect(tc.colliderFor('99,99')).toBeUndefined();
    expect(tc.colliderFor('0,0')).toBeDefined();
  });

  it('dispose removes everything, is idempotent, and makes update a no-op', async () => {
    const { physics, tc } = await setup({ budgetMs: 0 });
    tc.update(5, 5);
    tc.update(5, 5);
    expect(physics.world.colliders.len()).toBeGreaterThan(0);
    tc.dispose();
    expect(tc.count).toBe(0);
    expect(tc.keys).toEqual([]);
    expect(tc.pendingKeys).toEqual([]);
    expect(physics.world.colliders.len()).toBe(0);
    expect(() => tc.dispose()).not.toThrow();
    tc.update(5, 5);
    expect(tc.count).toBe(0);
    expect(tc.pendingKeys).toEqual([]);
    expect(physics.world.colliders.len()).toBe(0);
  });

  it('dispose before any update is fine', async () => {
    const { tc } = await setup();
    expect(() => tc.dispose()).not.toThrow();
  });
});

describe('TerrainColliders performance', () => {
  it('logs full-patch build cost and the max update time while draining a crossing', async () => {
    const physics = await makeWorld();

    const full = new TerrainColliders(physics, { radius: 0, budgetMs: BIG });
    const t0 = performance.now();
    full.update(100, 100);
    const buildMs = performance.now() - t0;
    expect(full.count).toBe(1);
    full.dispose();
    console.log(`TerrainColliders: sync build+add of one 200 m / 128-cell patch: ${buildMs.toFixed(2)} ms`);
    expect(buildMs).toBeLessThan(1000);

    const tc = new TerrainColliders(physics);
    tc.update(100, 100);
    let guard = 0;
    while (tc.pendingKeys.length > 0 && guard++ < 10000) tc.update(100, 100);
    expect(tc.count).toBe(9);
    tc.update(300, 100);
    let maxMs = 0;
    let updates = 0;
    while (guard++ < 20000) {
      const s = performance.now();
      tc.update(300, 100);
      maxMs = Math.max(maxMs, performance.now() - s);
      updates++;
      if (tc.pendingKeys.length === 0) break;
    }
    console.log(
      `TerrainColliders: boundary crossing drained in ${updates} updates, max update() ${maxMs.toFixed(2)} ms (budget 2 ms)`,
    );
    expect(tc.count).toBe(9);
    expect(maxMs).toBeLessThan(25);
  });
});
