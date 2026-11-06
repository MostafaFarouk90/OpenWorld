// v0.8 item 9: the scenes plugin in a reduced manifest (core, waystones, scenes; no renderer): the scene mode and the
// cutscene context while it runs, the persisted entry, a replay on save.loaded, and the player's death cancelling.
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
import scenesPlugin from './scenes.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/scenes.plugin.ts': { default: scenesPlugin },
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
  scenesPlugin.dispose?.();
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as any).self ??= globalThis;
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  worlds.push(world);
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  const statuses = await game.loadPlugins(modules);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) game.fixedUpdate();
  };
  return { game, statuses, run, scenes: game.ctx.services.require('scenes') };
}

const DEF = {
  id: 'test-scene',
  steps: [{ line: { speakerId: 'a', textKey: 'k', seconds: 0.5 } }, { flag: { key: 'story.test.one' } }, { checkpoint: 'c1' }, { wait: 1 }, { flag: { key: 'story.test.two' } }],
};

describe('the scenes plugin', () => {
  it('boots headless; the scene holds the scene mode and the cutscene context, and lets both go at the end', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'scenes')?.state).toBe('ok');
    t.scenes.register(DEF);
    const done = t.scenes.play('test-scene');
    expect(t.game.ctx.services.get('movementMode')!.current).toBe('scene');
    expect(t.game.ctx.input.contexts.top()).toBe('cutscene');
    expect(t.game.ctx.services.require('waystones').travelBlockedReason()).toBe('cutscene');
    t.run(2);
    expect(await done).toBe('finished');
    expect(t.game.ctx.state.getBool('story.test.one')).toBe(true);
    expect(t.game.ctx.state.getBool('story.test.two')).toBe(true);
    expect(t.game.ctx.services.get('movementMode')!.current).toBe('walk');
    expect(t.game.ctx.input.contexts.top()).not.toBe('cutscene');
  });

  it('persists `scenes` v1 at a checkpoint and replays from it on save.loaded', async () => {
    const t = await boot();
    t.scenes.register(DEF);
    void t.scenes.play('test-scene');
    t.run(0.6);
    const p = t.game.ctx.persist.get('scenes')!;
    expect(p.version).toBe(1);
    const data = JSON.parse(JSON.stringify(p.serialize()));
    expect(data).toEqual({ id: 'test-scene', checkpoint: 'c1' });
    p.load(data, 1);
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(t.scenes.active).toBe('test-scene');
    t.run(2);
    expect(t.scenes.active).toBeNull();
    expect(t.game.ctx.state.getBool('story.test.two')).toBe(true);
  });

  it("the player's death cancels the scene", async () => {
    const t = await boot();
    t.scenes.register(DEF);
    const done = t.scenes.play('test-scene');
    t.game.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    expect(await done).toBe('cancelled');
    expect(t.game.ctx.state.getBool('story.test.one')).toBe(false);
  });

  it('a death also cancels the queued scenes, so none starts over the dead player (fresh review finding 3)', async () => {
    const t = await boot();
    t.scenes.register(DEF);
    t.scenes.register({ ...DEF, id: 'queued' });
    const first = t.scenes.play('test-scene');
    const second = t.scenes.play('queued');
    t.game.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    expect(await first).toBe('cancelled');
    expect(await second).toBe('cancelled');
    expect(t.scenes.active).toBeNull();
    expect(t.game.ctx.input.contexts.top()).not.toBe('cutscene');
  });

  it('lets the input context go before the save hold, so the hold release sees a safe game (fresh review finding 2)', async () => {
    const t = await boot();
    const order: string[] = [];
    const ctxs = t.game.ctx.input.contexts;
    (t.game.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('save', {
      suspend: () => () => void order.push(`save:${ctxs.top()}`),
    });
    t.scenes.register(DEF);
    const done = t.scenes.play('test-scene');
    t.run(2);
    await done;
    // Every release (the checkpoint's and the end's) sees the cutscene context already gone.
    expect(order.length).toBeGreaterThanOrEqual(1);
    for (const o of order) expect(o).not.toBe('save:cutscene');
  });
});
