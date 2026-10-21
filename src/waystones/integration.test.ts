import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import mapPlugin from '../map/map.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FakeIndexedDb } from '../save/__fixtures__/fakeIndexedDb';
import savePlugin from '../save/save.plugin';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import waystonesPlugin from './waystones.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/save.plugin.ts': { default: savePlugin },
  '/src/test/map.plugin.ts': { default: mapPlugin },
};

let physics: PhysicsWorld;
let fake: FakeIndexedDb;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

async function boot(anchors = true) {
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
  if (anchors) {
    const y = (x: number, z: number) => heightAt(x, z);
    game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    game.ctx.anchors.define({ id: 'waystone.chapel', position: { x: 82, y: y(82, 52), z: 52 }, yaw: 0, tags: ['waystone'] });
    game.ctx.anchors.define({ id: 'waystone.kettlewick', position: { x: 12, y: y(12, 150), z: 150 }, yaw: 0, tags: ['waystone', 'waystone-lit'] });
  }
  const statuses = await game.loadPlugins(modules);
  const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  return { game, statuses, run, flush, world };
}

describe('waystones + saves on the real game', () => {
  it('all plugins set up', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  });

  it('Kettlewick starts lit (T14), the chapel does not; flags mirror it', async () => {
    const t = await boot();
    await t.run(2);
    const w = t.game.ctx.services.require('waystones');
    expect(w.litIds()).toEqual(['kettlewick']);
    expect(t.game.ctx.state.getBool('waystone.kettlewick.lit')).toBe(true);
    expect(t.game.ctx.state.getBool('waystone.chapel.lit')).toBe(false);
  });

  it('a foe that aggroed and never calmed stops blocking travel once it is gone or far away (QA round 3)', async () => {
    const t = await boot();
    await t.run(2);
    const w = t.game.ctx.services.require('waystones');
    const pf = t.game.ctx.player.feet;
    const spawnAt = (dx: number) => {
      const root = new THREE.Object3D();
      root.position.set(pf.x + dx, pf.y, pf.z);
      return t.game.ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 10, root });
    };
    const near = spawnAt(8);
    t.game.ctx.events.emit('ai.aggro', { actorId: near.id, targetId: 'player' } as never);
    expect(w.hostileAggro).toBe(true);
    expect(w.travelBlockedReason()).toBe('in-combat');
    // it wanders off without ever calming
    near.root!.position.x = pf.x + 200;
    expect(w.hostileAggro).toBe(false);
    expect(w.travelBlockedReason()).toBeNull();
    // a stuck foe that is still close keeps the block
    const close = spawnAt(5);
    t.game.ctx.events.emit('ai.aggro', { actorId: close.id, targetId: 'player' } as never);
    expect(w.hostileAggro).toBe(true);
  });

  it('respawn point falls back to the spawn anchor, never null', async () => {
    const t = await boot();
    const r = t.game.ctx.services.require('waystones').respawnPoint();
    expect(r.waystoneId).toBeNull();
    expect(r.feet).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('fast travel lands on solid ground 150 m away and the player does not fall through', async () => {
    const t = await boot();
    await t.run(5);
    const w = t.game.ctx.services.require('waystones');
    const p = w.travel('kettlewick');
    let done = false;
    void p.then(() => (done = true));
    for (let i = 0; i < 900 && !done; i++) await t.run(1);
    await expect(p).resolves.toEqual({ ok: true });
    await t.run(180);
    const f = t.game.ctx.player.feet;
    expect(Math.hypot(f.x - 12, f.z - 150)).toBeLessThan(2);
    expect(f.y).toBeGreaterThan(heightAt(f.x, f.z) - 0.5);
    expect(f.y).toBeLessThan(heightAt(f.x, f.z) + 1.5);
    expect(w.travelling).toBe(false);
  });

  it('travel to a stone that is not lit is refused and moves nothing', async () => {
    const t = await boot();
    await t.run(2);
    const w = t.game.ctx.services.require('waystones');
    expect(await w.travel('chapel')).toEqual({ ok: false, reason: 'not-lit' });
    expect(t.game.ctx.player.feet.x).toBeCloseTo(0, 0);
  });

  it('save then Continue in a fresh game restores waystones, flags and position', async () => {
    const a = await boot();
    await a.flush();
    await a.run(3);
    a.game.ctx.state.setFlag('story.test', true);
    const w = a.game.ctx.services.require('waystones');
    w.rekindle('chapel');
    const t1 = w.travel('kettlewick');
    for (let i = 0; i < 900; i++) {
      await a.run(1);
      if (!w.travelling) break;
    }
    await t1;
    await a.run(120); // grounded
    const saved = await a.game.ctx.services.require('save').saveNow('manual');
    expect(saved.ok).toBe(true);
    await a.flush();

    const b = await boot();
    await b.flush();
    const save = b.game.ctx.services.require('save');
    expect(save.hasSave()).toBe(true);
    await b.run(3);
    const loaded = new Promise<void>((r) => b.game.ctx.events.on('save.loaded', () => r()));
    const cont = save.continueNow();
    for (let i = 0; i < 900; i++) {
      await b.run(1);
      if (!save.loading && i > 5) break;
    }
    expect(await cont).toBe(true);
    await loaded;
    expect(b.game.ctx.state.getBool('story.test')).toBe(true);
    expect(b.game.ctx.services.require('waystones').isLit('chapel')).toBe(true);
    const f = b.game.ctx.player.feet;
    expect(Math.hypot(f.x - 12, f.z - 150)).toBeLessThan(3);
    expect(f.y).toBeGreaterThan(heightAt(f.x, f.z) - 0.5);
  });

  it('Continue with no save does nothing', async () => {
    const t = await boot();
    await t.flush();
    const save = t.game.ctx.services.require('save');
    expect(save.hasSave()).toBe(false);
    expect(await save.continueNow()).toBe(false);
  });

  it('IndexedDB unavailable: the game keeps running and saves to memory', async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    const t = await boot();
    await t.run(3);
    await t.flush();
    const save = t.game.ctx.services.require('save');
    const r = await save.saveNow('manual');
    expect(r.ok).toBe(true);
    expect(save.usingFallback).toBe(true);
  });

  it('ground ray ignores the player capsule: a teleport into thin air is not released and falls back', async () => {
    const t = await boot();
    await t.run(5);
    const w = t.game.ctx.services.require('waystones');
    // An anchor 40 m above the terrain: nothing solid below it.
    t.game.ctx.anchors.define({ id: 'waystone.sky', position: { x: 12, y: heightAt(12, 150) + 40, z: 150 }, yaw: 0, tags: ['waystone', 'waystone-lit'] });
    await t.run(2);
    const p = w.travel('sky');
    let res: unknown = null;
    void p.then((r) => (res = r));
    for (let i = 0; i < 1200 && res === null; i++) await t.run(1);
    expect(res).toEqual({ ok: false, reason: 'terrain-not-ready' });
    await t.run(120);
    const f = t.game.ctx.player.feet;
    expect(Math.hypot(f.x - 0, f.z - 0)).toBeLessThan(3); // back where they stood
  });

  it('never saves an airborne position', async () => {
    const t = await boot();
    await t.run(60);
    t.game.ctx.player.teleport({ x: 0, y: 40, z: 0 });
    await t.run(3);
    await t.flush();
    const save = t.game.ctx.services.require('save');
    const r = await save.saveNow('manual');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const pos = r.file.entries['player-position']?.data as { y: number } | undefined;
      expect(pos === undefined || pos.y < 5).toBe(true);
    }
  });

  it('no save can overwrite the real one between boot and Continue', async () => {
    const a = await boot();
    await a.flush();
    await a.run(3);
    a.game.ctx.state.setFlag('story.test', true);
    expect((await a.game.ctx.services.require('save').saveNow('manual')).ok).toBe(true);
    await a.flush();

    const b = await boot();
    await b.flush();
    await b.run(3);
    const save = b.game.ctx.services.require('save');
    expect(save.hasSave()).toBe(true);
    expect(save.loading).toBe(true);
    const early = await save.saveNow('exit');
    expect(early.ok).toBe(false);
    await b.run(2);
    const cont = save.continueNow();
    for (let i = 0; i < 900 && save.loading; i++) await b.run(1);
    expect(await cont).toBe(true);
    expect(b.game.ctx.state.getBool('story.test')).toBe(true);
    expect(save.hasSave()).toBe(false); // consumed: no second Continue
    expect(await save.continueNow()).toBe(false);
  });

  it('a successful fast travel is autosaved once the player stands on the destination', async () => {
    const t = await boot();
    await t.flush();
    await t.run(5);
    const w = t.game.ctx.services.require('waystones');
    const p = w.travel('kettlewick');
    for (let i = 0; i < 900 && w.travelling; i++) await t.run(1);
    await p;
    await t.run(10);
    await t.flush();
    const raw = await new Promise<any>((res) => {
      const r = (fake.factory as any).open('owg', 1);
      r.onsuccess = () => {
        const tx = r.result.transaction('saves', 'readonly').objectStore('saves').get('autosave');
        tx.onsuccess = () => res(tx.result);
      };
    });
    expect(raw?.reason).toBe('waystone');
    expect(Math.hypot(raw.entries['player-position'].data.x - 12, raw.entries['player-position'].data.z - 150)).toBeLessThan(3);
  });

  it('a script rekindle lights the stone through the service and emits cause script', async () => {
    const t = await boot();
    await t.run(2);
    const seen: unknown[] = [];
    t.game.ctx.events.on('waystone.rekindled', (e) => seen.push(e));
    const w = t.game.ctx.services.require('waystones');
    expect(w.rekindle('chapel')).toEqual({ ok: true });
    t.game.fixedUpdate();
    expect(seen).toEqual([{ waystoneId: 'chapel', cause: 'script' }]);
    expect(w.isLit('chapel')).toBe(true);
    expect(t.game.ctx.state.getBool('waystone.chapel.lit')).toBe(true);
  });
});
