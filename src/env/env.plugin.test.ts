import { describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { EMPTY_KEEP_OUT } from './colliders';
import { createEnvPlugin, envEnabled } from './env.plugin';

const tick = () => new Promise((r) => setTimeout(r, 50));

describe('env plugin', () => {
  it('does nothing without tiles', () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: {} });
    plugin.setup(fc.ctx);
    expect(fc.ctx.services.get('env')?.drawn('b1')).toBeNull();
    plugin.dispose?.();
  });

  it('builds a registered tile into the scene and reports it', async () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: { t: [{ id: 'oak-b', x: 1, z: 2 }, { id: 'barrel', x: 3, z: 4 }] }, heightAt: () => 0 });
    plugin.setup(fc.ctx);
    await tick();
    const env = fc.ctx.services.get('env')!;
    expect(env.drawn('t')).toMatchObject({ tree: 1, prop: 1 });
    expect(env.placeholders('t')).toBe(2);
    expect(fc.ctx.scene.children.some((c) => c.name === 'env.placements')).toBe(true);
    plugin.dispose?.();
    expect(fc.ctx.scene.children.some((c) => c.name === 'env.placements')).toBe(false);
  });

  it('offers a focus point for the shot harness and takes it back with null', async () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: { t: [{ id: 'grass-clump-a', x: 500, z: 500 }] }, heightAt: () => 0 });
    plugin.setup(fc.ctx);
    await tick();
    const env = fc.ctx.services.get('env')!;
    expect(() => env.focus({ x: 500, z: 500 })).not.toThrow();
    expect(() => env.focus(null)).not.toThrow();
    plugin.dispose?.();
  });

  it('is switched off by ?env=off', () => {
    expect(envEnabled('')).toBe(true);
    expect(envEnabled('?env=off')).toBe(false);
  });
});

describe('env plugin colliders', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: 'wattle-fence', x: 10 + 3.4 * i, z: 20, yaw: 0, scale: 1 })),
    { id: 'barrel', x: 14, z: 24 },
    { id: 'handcart-a', x: 12, z: 30, yaw: 0, scale: 1 },
  ];
  const ground = () => 0;

  async function rapier() {
    const physics = new PhysicsWorld();
    await physics.init();
    return physics;
  }

  it('builds one tile per fixed tick once Rapier exists and streams the boxes around the player', async () => {
    const physics = await rapier();
    try {
      const fc = createFakeCore();
      fc.useRapier(physics.rapier);
      const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut: EMPTY_KEEP_OUT });
      plugin.setup(fc.ctx);
      const env = fc.ctx.services.get('env')!;
      expect(env.colliders()).toMatchObject({ live: 0, total: 0 });
      fc.playerFeet.x = 15;
      fc.playerFeet.z = 22;
      fc.tick('rules');
      // a run of six modules (one box) and the cart; the barrel does not collide
      expect(env.colliders()).toMatchObject({ live: 2, total: 2, liveCells: 1 });
      expect(env.colliders().tiles.h9).toMatchObject({ rows: 8, modules: 7, boxes: 2, runs: 1, runModules: 6 });
      expect(fc.colliders.size).toBe(2);
      // the player leaves: the cell goes
      fc.playerFeet.x = 5000;
      fc.tick('rules');
      expect(env.colliders().live).toBe(0);
      expect(fc.colliders.size).toBe(0);
      plugin.dispose?.();
    } finally {
      physics.dispose();
    }
  });

  it('waits without Rapier (headless): no colliders, no error, the rest of the plugin still works', async () => {
    const fc = createFakeCore();
    const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut: EMPTY_KEEP_OUT });
    plugin.setup(fc.ctx);
    expect(() => fc.tick('rules')).not.toThrow();
    expect(fc.ctx.services.get('env')!.colliders()).toMatchObject({ live: 0, total: 0, tiles: {} });
    await tick();
    expect(fc.ctx.services.get('env')!.drawn('h9')).not.toBeNull();
    plugin.dispose?.();
  });

  it('waits when the Rapier getter throws (physics still starting)', () => {
    const fc = createFakeCore();
    Object.defineProperty(fc.ctx.physics, 'rapier', {
      get() {
        throw new Error('PhysicsWorld.init() has not completed');
      },
      configurable: true,
    });
    const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut: EMPTY_KEEP_OUT });
    plugin.setup(fc.ctx);
    expect(() => fc.tick('rules')).not.toThrow();
    expect(fc.colliders.size).toBe(0);
    plugin.dispose?.();
  });

  it('drops a box on a keep-out entry, warns once for the tile, and keeps the rest of the run', async () => {
    const physics = await rapier();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fc = createFakeCore();
      fc.useRapier(physics.rapier);
      const keepOut = { discs: [{ x: 13.4, z: 20, r: 1, why: 'anchor quest.a' }], segments: [], boxes: [] };
      const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut });
      plugin.setup(fc.ctx);
      fc.playerFeet.x = 15;
      fc.playerFeet.z = 22;
      fc.tick('rules');
      const env = fc.ctx.services.get('env')!;
      expect(env.colliders().tiles.h9).toMatchObject({ dropped: 1, droppedBy: { anchor: 1 } });
      expect(env.colliders().total).toBe(3); // two runs and the cart
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('env colliders: h9 dropped 1'))).toHaveLength(1);
      plugin.dispose?.();
    } finally {
      warn.mockRestore();
      physics.dispose();
    }
  });

  it('removes every collider on dispose', async () => {
    const physics = await rapier();
    try {
      const fc = createFakeCore();
      fc.useRapier(physics.rapier);
      const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut: EMPTY_KEEP_OUT });
      plugin.setup(fc.ctx);
      fc.playerFeet.x = 15;
      fc.playerFeet.z = 22;
      fc.tick('rules');
      expect(fc.colliders.size).toBeGreaterThan(0);
      plugin.dispose?.();
      expect(fc.colliders.size).toBe(0);
    } finally {
      physics.dispose();
    }
  });

  it('?env=off creates no colliders, no system and no service', async () => {
    const physics = await rapier();
    const real = (globalThis as { location?: unknown }).location;
    (globalThis as { location?: unknown }).location = { search: '?env=off' };
    try {
      const fc = createFakeCore();
      fc.useRapier(physics.rapier);
      const plugin = createEnvPlugin({ tiles: { h9: rows }, heightAt: ground, keepOut: EMPTY_KEEP_OUT });
      plugin.setup(fc.ctx);
      fc.playerFeet.x = 15;
      fc.playerFeet.z = 22;
      fc.tick('rules');
      expect(fc.colliders.size).toBe(0);
      expect(fc.systems.has('env.colliders')).toBe(false);
      expect(fc.ctx.services.get('env')).toBeUndefined();
      plugin.dispose?.();
    } finally {
      (globalThis as { location?: unknown }).location = real;
      physics.dispose();
    }
  });
});
