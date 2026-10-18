// Region and npcs plugins on the real core: a headless Game (real Rapier, real registries), no fakes.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import npcsPlugin from '../npcs/npcs.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import regionPlugin from './region.plugin';

const modules: Record<string, PluginModule> = {
  '/src/core/core.plugin.ts': { default: corePlugin },
  '/src/region/region.plugin.ts': { default: regionPlugin },
  '/src/npcs/npcs.plugin.ts': { default: npcsPlugin },
};

let physics: PhysicsWorld;
let world: World;
let game: Game;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  physics = new PhysicsWorld();
  await physics.init();
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const input = new InputManager(element, new EventTarget(), doc, { storage: null });
  game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
});

afterEach(() => {
  game.dispose();
  world.dispose();
  vi.restoreAllMocks();
});

describe('region and npcs on the real core', () => {
  it('both plugins set up ok, publish their services and define the layout anchors', async () => {
    const statuses = await game.loadPlugins(modules);
    expect(statuses).toEqual([
      { id: 'core', state: 'ok' },
      { id: 'region', state: 'ok' },
      { id: 'npcs', state: 'ok' },
    ]);
    const c = game.ctx;
    expect(c.services.has('region')).toBe(true);
    expect(c.services.has('npcs')).toBe(true);
    expect(c.anchors.find('waystone.chapel')?.tags).toContain('waystone');
    for (const a of BRIGHTWATER_LAYOUT.anchors) expect(c.anchors.find(a.id), a.id).toBeDefined();
    expect(c.services.get('region')?.at(0, 0)?.id).toBe('brightwater');
    game.fixedUpdate(); // a tick over the real systems must not throw
  });

  it('dispose leaves no anchors, services or colliders from either plugin', async () => {
    const colliders = physics.world.colliders.len();
    await game.loadPlugins(modules);
    expect(game.ctx.anchors.all().length).toBeGreaterThan(BRIGHTWATER_LAYOUT.anchors.length - 1);
    expect(physics.world.colliders.len()).toBeGreaterThan(colliders);
    const c = game.ctx;
    game.dispose();
    expect(c.anchors.all()).toEqual([]);
    expect(c.services.has('region')).toBe(false);
    expect(c.services.has('npcs')).toBe(false);
    expect(physics.world.colliders.len()).toBe(colliders);
  });
});
