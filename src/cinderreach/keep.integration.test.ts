import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import navPlugin from '../nav/nav.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { KEEP_DOOR } from './scorchhold';
import { groundDistance } from '../waystones/ground';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { InteriorError } from '../interiors/InteriorController';
import interiorsPlugin from '../interiors/interiors.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
};


let physics: PhysicsWorld;
const worlds: World[] = [];
const games: Game[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const g of games.splice(0)) g.dispose();
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9db8d3, 720, 4560);
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
  games.push(game);
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  game.ctx.anchors.define({ id: 'waystone.chapel', position: { x: 40, y: heightAt(40, 45), z: 45 }, yaw: 0, tags: ['waystone', 'waystone-lit'] });
  const statuses = await game.loadPlugins(modules);
  const events: { type: string; payload: { interiorId: string; doorId: string } }[] = [];
  for (const type of ['interior.entered', 'interior.exited'] as const) game.ctx.events.on(type, (p) => events.push({ type, payload: p }));
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  // The cinderreach plugin defines this anchor in the real game; its door faces south (compass heading 180).
  game.ctx.anchors.define({ id: 'cinderreach.scorchhold.keep.door', position: { x: KEEP_DOOR.x, y: heightAt(KEEP_DOOR.x, KEEP_DOOR.z), z: KEEP_DOOR.z }, yaw: 0 });
  const svc = () => game.ctx.services.get('interiors')!;
  const anchor = (id: string) => game.ctx.anchors.get(id);
  return { game, scene, statuses, run, events, svc, anchor };
}

type Booted = Awaited<ReturnType<typeof boot>>;

async function settle<T>(t: Booted, p: Promise<T>): Promise<T> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 600 && !done; i++) await t.run(1);
  return p;
}

async function reason(t: Booted, p: Promise<unknown>): Promise<string> {
  try {
    await settle(t, p);
    return 'resolved';
  } catch (e) {
    return e instanceof InteriorError ? e.reason : String(e);
  }
}

const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the Scorchhold keep on the real game', () => {
  it('stays locked until D03 starts, then enters onto a real floor and exits to the door', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    await t.run(2);
    expect(await reason(t, t.svc().enter('scorchhold-keep', 'scorchhold-keep'))).toBe('locked');
    t.game.ctx.state.setFlag('story.d03.started', true);
    await settle(t, t.svc().enter('scorchhold-keep', 'scorchhold-keep'));
    expect(t.svc().current).toBe('scorchhold-keep');
    const entry = t.anchor('cinderreach.scorchhold.keep.entry').position;
    expect(near(t.game.ctx.player.feet, entry)).toBeLessThan(0.5);
    await t.run(60);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(entry.y - 0.2);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    await settle(t, t.svc().exit());
    expect(t.svc().current).toBeNull();
    expect(t.events.map((e) => [e.type, e.payload.doorId])).toEqual([
      ['interior.entered', 'scorchhold-keep'],
      ['interior.exited', 'scorchhold-keep'],
    ]);
  });

  it('defines A8\'s arena anchors inside the keep, on its floor, with the gate as a blocker', async () => {
    const t = await boot();
    await t.run(2);
    t.game.ctx.state.setFlag('story.d03.started', true);
    await settle(t, t.svc().enter('scorchhold-keep', 'scorchhold-keep'));
    const centre = t.anchor('scorchhold.keep.arena.centre').position;
    for (const n of [1, 2, 3, 4]) {
      const p = t.anchor(`scorchhold.keep.arena.spawn.${n}`).position;
      expect(near(p, centre), String(n)).toBeGreaterThan(5);
      expect(near(p, centre), String(n)).toBeLessThan(15);
      expect(Math.abs(p.y - centre.y)).toBeLessThan(0.5);
    }
    expect(t.svc().setBlocker('scorchhold.keep.arena.gate', true)).toBe(true);
    expect(t.svc().setBlocker('scorchhold.keep.arena.gate', false)).toBe(true);
  });

  it('never locks the exit, even if the flag clears while inside, and re-derives the lock after a load', async () => {
    const t = await boot();
    await t.run(2);
    t.game.ctx.state.setFlag('story.d03.started', true);
    expect(await reason(t, t.svc().enter('scorchhold-keep', 'scorchhold-keep'))).toBe('resolved');
    t.game.ctx.state.setFlag('story.d03.started', false);
    expect(await reason(t, t.svc().exit())).toBe('resolved');
    t.game.ctx.state.load({ flags: { 'story.d03.started': true } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter('scorchhold-keep', 'scorchhold-keep'))).toBe('resolved');
  });
});
