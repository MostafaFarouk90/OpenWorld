import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import type { Interactable } from '../interaction/InteractionSystem';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import waystonesPlugin from './waystones.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
};

let physics: PhysicsWorld;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
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
  const y = (x: number, z: number) => heightAt(x, z);
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  game.ctx.anchors.define({ id: 'waystone.harrowmark-gate', position: { x: 8516, y: y(8516, 1212), z: 1212 }, yaw: 0, tags: ['waystone'] });
  game.ctx.anchors.define({ id: 'waystone.farm-ring', position: { x: 6830, y: y(6830, 792), z: 792 }, yaw: 0, tags: ['waystone'] });
  // Capture the interactables the plugin registers, to press them without a keyboard.
  const stones = new Map<string, Interactable>();
  const register = game.ctx.interaction.register.bind(game.ctx.interaction);
  game.ctx.interaction.register = (i) => {
    stones.set(i.id, i);
    return register(i);
  };
  game.ctx.state.setFlag('tutorial.heartshard-awakened', true);
  const statuses = await game.loadPlugins(modules);
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  return { game, statuses, run, stones };
}


const ROUTE = 'story.m06.route';
const SHARD = 'tutorial.heartshard-awakened';
const gate = 'waystone:harrowmark-gate';

describe('waystone locks', () => {
  it('the South Gate stone refuses the player before M06 and wakes after it', async () => {
    const t = await boot();
    await t.run(2);
    const w = t.game.ctx.services.require('waystones');
    t.stones.get(gate)!.onInteract(t.game.ctx.player.actor);
    expect(w.isLit('harrowmark-gate')).toBe(false);
    t.game.ctx.state.setFlag(ROUTE, true);
    t.stones.get(gate)!.onInteract(t.game.ctx.player.actor);
    expect(w.isLit('harrowmark-gate')).toBe(true);
  });

  it('the farm-ring stone has no lock', async () => {
    const t = await boot();
    await t.run(2);
    t.stones.get('waystone:farm-ring')!.onInteract(t.game.ctx.player.actor);
    expect(t.game.ctx.services.require('waystones').isLit('farm-ring')).toBe(true);
  });

  it('a save from before M06 locks the stone again, and one from after opens it', async () => {
    const t = await boot();
    await t.run(2);
    const state = t.game.ctx.state;
    const before = state.serialize();
    state.setFlag(ROUTE, true);
    state.setFlag(SHARD, true);
    const after = state.serialize();
    // Loading the earlier save: the stone is shut again.
    state.load(before);
    t.game.ctx.events.emit('save.loaded', undefined as never);
    t.stones.get(gate)!.onInteract(t.game.ctx.player.actor);
    expect(t.game.ctx.services.require('waystones').isLit('harrowmark-gate')).toBe(false);
    // Loading the later one: open.
    state.load(after);
    t.game.ctx.events.emit('save.loaded', undefined as never);
    t.stones.get(gate)!.onInteract(t.game.ctx.player.actor);
    expect(t.game.ctx.services.require('waystones').isLit('harrowmark-gate')).toBe(true);
  });

  it('a script can still light it (rekindle by id is not the player prompt)', async () => {
    const t = await boot();
    await t.run(2);
    const w = t.game.ctx.services.require('waystones');
    w.rekindle('harrowmark-gate');
    expect(w.isLit('harrowmark-gate')).toBe(true);
  });
});
