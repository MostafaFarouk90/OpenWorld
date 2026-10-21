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
import { HALL_DOOR } from './sites';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { GRISEL_HALL_DOOR_ID, GRISEL_HALL_ID } from './griselHall';
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
  // The oldsmoke plugin defines this anchor in the real game; its door faces south (compass heading 180).
  game.ctx.anchors.define({ id: 'oldsmoke.hall.door', position: { x: HALL_DOOR.x, y: heightAt(HALL_DOOR.x, HALL_DOOR.z), z: HALL_DOOR.z }, yaw: 0 });
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

describe('Grisel Hall on the real game', () => {
  it('stands the layout\'s door anchor where the interior floats (HALL_DOOR)', () => {
    const door = OLDSMOKE_LAYOUT.anchors.find((a) => a.id === 'oldsmoke.hall.door')!;
    expect([door.x, door.z]).toEqual([HALL_DOOR.x, HALL_DOOR.z]);
  });

  it('stays locked until A13 starts M16, then enters onto a real floor and exits to the door', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    await t.run(2);
    expect(await reason(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID))).toBe('locked');
    t.game.ctx.state.setFlag('story.m16.started', true);
    await settle(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID));
    expect(t.svc().current).toBe(GRISEL_HALL_ID);
    const entry = t.anchor('oldsmoke.hall.entry').position;
    expect(near(t.game.ctx.player.feet, entry)).toBeLessThan(0.5);
    await t.run(60);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(entry.y - 0.2);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    await settle(t, t.svc().exit());
    expect(t.svc().current).toBeNull();
    expect(t.events.map((e) => [e.type, e.payload.doorId])).toEqual([
      ['interior.entered', GRISEL_HALL_DOOR_ID],
      ['interior.exited', GRISEL_HALL_DOOR_ID],
    ]);
  });

  it('defines the stealth, guard and post anchors inside the hall, on its floor', async () => {
    const t = await boot();
    await t.run(2);
    t.game.ctx.state.setFlag('story.m16.started', true);
    await settle(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID));
    const dais = t.anchor('oldsmoke.hall.dais').position;
    for (const id of ['oldsmoke.hall.aldous', 'oldsmoke.hall.wenna', 'oldsmoke.hall.guard.1', 'oldsmoke.stealth.m21.cp.study', 'oldsmoke.hide.m21.4', 'spawn.m21.watch-1', 'patrol.m21.hall.3']) {
      const p = t.anchor(id).position;
      expect(Math.abs(p.y - dais.y), id).toBeLessThan(0.6);
      expect(near(p, dais), id).toBeLessThan(60);
    }
    expect(t.svc().setBlocker('oldsmoke.hall.study.door', true)).toBe(true);
    expect(t.svc().setBlocker('oldsmoke.hall.study.door', false)).toBe(true);
  });

  it('never locks the exit, even if the flag clears while inside, and re-derives the lock after a load', async () => {
    const t = await boot();
    await t.run(2);
    t.game.ctx.state.setFlag('story.m16.started', true);
    expect(await reason(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID))).toBe('resolved');
    t.game.ctx.state.setFlag('story.m16.started', false);
    expect(await reason(t, t.svc().exit())).toBe('resolved');
    // A load with the flag set opens the door; a load without it locks it again.
    t.game.ctx.state.load({ flags: { 'story.m16.started': true } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID))).toBe('resolved');
    await settle(t, t.svc().exit());
    t.game.ctx.state.load({ flags: {} });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID))).toBe('locked');
  });

  it('saves inside the hall and loads a fresh game back inside it, at the saved door', async () => {
    const a = await boot();
    await a.run(2);
    a.game.ctx.state.setFlag('story.m16.started', true);
    await settle(a, a.svc().enter(GRISEL_HALL_ID, GRISEL_HALL_DOOR_ID));
    const entries = a.game.ctx.persist.saveAll();
    const saved = { ...a.game.ctx.player.feet };
    expect(entries.find((e) => e.key === 'interior')?.data).toEqual({ interiorId: GRISEL_HALL_ID, doorId: GRISEL_HALL_DOOR_ID });

    const b = await boot();
    for (const e of entries) b.game.ctx.persist.get(e.key)?.load(e.data, e.version);
    const handle = b.game.ctx.player.teleport(saved);
    for (let i = 0; i < 60 && !handle.ready(); i++) await b.run(1);
    await b.run(1);
    b.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await b.run(5);
    expect(b.svc().current).toBe(GRISEL_HALL_ID);
    expect(near(b.game.ctx.player.feet, a.anchor('oldsmoke.hall.entry').position)).toBeLessThan(2);
  });
});
