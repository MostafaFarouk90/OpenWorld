// The grass on the real core: real Rapier, the real region plugin's colliders. No tuft may stand on a road, in the
// water, inside a structure's footprint or under any static collider (fences and gates included).
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { DEAD_ROAD_FULL, LANE_TRACK_DRAWN, LANE_WIDTH, ROAD_WIDTH } from './deadRoad';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { pointInFootprint } from './geometry';
import { distanceToPolyline, GRASS_MAX_INSTANCES, GrassField } from './grass';
import regionPlugin, { grassAcceptFor, staticColliderAt } from './region.plugin';
import { BROOK_COURSE, BROOK_WIDTH, RIVER_COURSE, RIVER_WIDTH } from './water';

const modules: Record<string, PluginModule> = {
  '/src/core/core.plugin.ts': { default: corePlugin },
  '/src/region/region.plugin.ts': { default: regionPlugin },
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

describe('grass on the real core', () => {
  it('the region plugin adds one grass mesh and a render system', async () => {
    await game.loadPlugins(modules);
    expect(game.ctx.scene.getObjectByName('grass-instances')).toBeDefined();
  });

  it('sees the lane fences through the collider set', async () => {
    await game.loadPlugins(modules);
    physics.step();
    const fence = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === 'fence-lane')!;
    expect(staticColliderAt(physics, fence.x, heightAt(fence.x, fence.z), fence.z)).toBe(true);
    expect(staticColliderAt(physics, 30, heightAt(30, -30), -30)).toBe(false);
  });

  it.each([
    ['the spawn meadow', 0, 0],
    ['Kettlewick and the lane fences', 0, 90],
    ['the mill', -45, 165],
    ['Hollin Ford', -420, -150],
    ['the river', -100, -300],
    ['the fog wall', 1100, -150],
    ['the Dead Road east', 2250, 330],
    ['the farm ring', 6825, 780],
  ])('no tuft near %s stands on a road, in water, in a footprint or under a collider', async (_label, x, z) => {
    await game.loadPlugins(modules);
    physics.step();
    const layouts = [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT];
    const structures = layouts.flatMap((l) => l.structures);
    const field = new GrassField(heightAt, grassAcceptFor(layouts, heightAt, physics), 1, Infinity);
    field.update(x, heightAt(x, z), z);
    const mesh = field.object.getObjectByName('grass-instances') as THREE.InstancedMesh;
    expect(mesh.count).toBeLessThanOrEqual(GRASS_MAX_INSTANCES);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(distanceToPolyline(RIVER_COURSE, p.x, p.z)).toBeGreaterThanOrEqual(RIVER_WIDTH / 2);
      expect(distanceToPolyline(BROOK_COURSE, p.x, p.z)).toBeGreaterThanOrEqual(BROOK_WIDTH / 2);
      expect(distanceToPolyline(DEAD_ROAD_FULL, p.x, p.z)).toBeGreaterThanOrEqual(ROAD_WIDTH / 2);
      expect(distanceToPolyline(LANE_TRACK_DRAWN, p.x, p.z)).toBeGreaterThanOrEqual(LANE_WIDTH / 2);
      expect(structures.some((s) => pointInFootprint(s, p.x, p.z))).toBe(false);
      expect(staticColliderAt(physics, p.x, p.y, p.z)).toBe(false);
    }
    field.dispose();
  });
});
