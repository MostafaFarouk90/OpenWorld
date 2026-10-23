// Review B L2 (plans/act2-followups/review-b.md): a `&new` dev jump that the jump plugin refuses (a bad id, a bad class)
// used to take the jump boot branch anyway: saves unlocked, no hold, and the first autosave wrote a fresh game over the
// real slot. The boot now holds saves itself for a refused jump.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import waystonesPlugin from '../waystones/waystones.plugin';
import { FakeIndexedDb } from './__fixtures__/fakeIndexedDb';
import { devJumpBoot } from './devJump';
import savePlugin from './save.plugin';

describe('devJumpBoot', () => {
  it('a valid ?act1=, ?act2= or ?bellows=1 with &new is a jump (its plugin holds saves)', () => {
    expect(devJumpBoot('?act1=m03&new', true)).toBe('jump');
    expect(devJumpBoot('?act2=r06&new&class=emberwright', true)).toBe('jump');
    expect(devJumpBoot('?bellows=1&new', true)).toBe('jump');
    expect(devJumpBoot('?act2=r06&bellows=1&new', true)).toBe('jump');
  });

  it('a refused one (unknown quest, unknown class, a bad id next to a bad bellows value) is refused', () => {
    expect(devJumpBoot('?act2=m16&new', true)).toBe('refused');
    expect(devJumpBoot('?act2=m11&new&class=bard', true)).toBe('refused');
    expect(devJumpBoot('?act1=zz&new', true)).toBe('refused');
    expect(devJumpBoot('?act1=zz&act2=m16&new', true)).toBe('refused');
  });

  it('no &new, no jump named, or a production build: the ordinary boot', () => {
    expect(devJumpBoot('?act2=m11', true)).toBeNull();
    expect(devJumpBoot('?bellows=1', true)).toBeNull();
    expect(devJumpBoot('?new', true)).toBeNull();
    expect(devJumpBoot('?bellows=0&new', true)).toBeNull();
    expect(devJumpBoot('?act2=m11&new', false)).toBeNull();
    expect(devJumpBoot('?act2=m16&new', false)).toBeNull();
  });
});

describe('the save plugin\'s boot with a dev jump', () => {
  let physics: PhysicsWorld;
  const worlds: World[] = [];
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    (globalThis as { indexedDB?: unknown }).indexedDB = new FakeIndexedDb().factory;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const w of worlds.splice(0)) w.dispose();
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function bootWith(search: string) {
    vi.stubGlobal('window', { location: { search } });
    (globalThis as any).self ??= globalThis;
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const world = new World(scene, physics, {
      colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
      moveModifier: () => moveModifiers.state(),
    });
    worlds.push(world);
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const input = new InputManager(element, win, doc, { storage: null });
    const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
    game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    const modules: Record<string, PluginModule> = {
      '/src/test/core.plugin.ts': { default: corePlugin },
      '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
      '/src/test/save.plugin.ts': { default: savePlugin },
    };
    await game.loadPlugins(modules);
    for (let i = 0; i < 10; i++) {
      game.fixedUpdate();
      for (let k = 0; k < 5; k++) await new Promise((r) => setTimeout(r, 0));
    }
    const save = game.ctx.services.require('save');
    return { game, save, dispose: () => game.dispose?.() };
  }

  it('a refused ?act2=m16&new boots with saves held: a manual save is deferred, not written', async () => {
    const t = await bootWith('?act2=m16&new');
    expect(t.save.loading).toBe(false);
    expect(await t.save.saveNow('manual')).toEqual({ ok: false, reason: 'deferred' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dev jump was refused'));
    t.dispose();
  });

  it('a plain &new boot (no jump) still saves', async () => {
    const t = await bootWith('?new');
    expect((await t.save.saveNow('manual')).ok).toBe(true);
    t.dispose();
  });
});
