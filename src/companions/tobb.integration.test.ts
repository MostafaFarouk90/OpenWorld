// Tobb across a real waystone fast travel and through the chapel vault door, on every real plugin (thread 10).
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';

let physics: PhysicsWorld;
const cleanups: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  vi.restoreAllMocks();
});

async function boot() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  cleanups.push(() => { game.dispose(); world.dispose(); });
  await game.loadPlugins(PLUGIN_MODULES as Record<string, PluginModule>);
  const ctx = game.ctx;
  const run = async (n: number) => {
    for (let i = 0; i < n; i++) {
      game.fixedUpdate();
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  };
  /** Steps the game until the promise settles. */
  const settle = async <T>(p: Promise<T>): Promise<T> => {
    let done = false;
    void p.finally(() => { done = true; });
    for (let i = 0; i < 1500 && !done; i++) await run(1);
    return p;
  };
  const companions = ctx.services.require('companions');
  const tobb = () => {
    const id = companions.actorId('tobb');
    const root = id ? ctx.actors.get(id)?.root : undefined;
    return root ? root.position.clone() : null;
  };
  const gap = () => {
    const p = tobb();
    const f = ctx.player.feet;
    return p ? { flat: Math.hypot(p.x - f.x, p.z - f.z), dy: Math.abs(p.y - f.y) } : { flat: Infinity, dy: Infinity };
  };
  const join = async () => {
    ctx.state.setFlag('story.m05.tobbJoined', true);
    await run(30);
    expect(tobb()).not.toBeNull();
  };
  return { ctx, run, settle, tobb, gap, join };
}

describe('Tobb with the real services', () => {
  it('comes along on a real waystone fast travel (the fastTravel event from WaystoneNetwork)', async () => {
    const t = await boot();
    await t.join();
    const ws = t.ctx.services.require('waystones');
    expect(ws.rekindle('quenchstone', 'script').ok).toBe(true);
    const seen: unknown[] = [];
    t.ctx.events.on('fastTravel', (e) => seen.push(e));
    await expect(t.settle(ws.travel('quenchstone'))).resolves.toEqual({ ok: true });
    await t.run(90);
    expect(seen).toHaveLength(1);
    expect(Math.hypot(t.ctx.player.feet.x - 965, t.ctx.player.feet.z + 162)).toBeLessThan(10);
    expect(t.gap().flat).toBeLessThan(6);
    expect(t.gap().dy).toBeLessThan(3);
  }, 60000);

  it('goes into the chapel vault with the player and comes out with them at the door', async () => {
    const t = await boot();
    await t.join();
    const interiors = t.ctx.services.require('interiors');
    t.ctx.state.setFlag('story.d01.vaultOpen', true); // D01 taken (the density pass locks the door until then)
    await t.settle(interiors.enter('chapel-vault', 'vault'));
    await t.run(60);
    expect(interiors.current).toBe('chapel-vault');
    expect(t.gap().flat).toBeLessThan(6);
    expect(t.gap().dy).toBeLessThan(3);
    await t.settle(interiors.exit());
    await t.run(60);
    expect(interiors.current).toBeNull();
    const door = t.ctx.anchors.get('vault.door').position;
    expect(Math.hypot(t.ctx.player.feet.x - door.x, t.ctx.player.feet.z - door.z)).toBeLessThan(6);
    expect(t.gap().flat).toBeLessThan(6);
    expect(t.gap().dy).toBeLessThan(3);
  }, 60000);
});
