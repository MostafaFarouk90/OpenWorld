// The Greyfen on the real game (revision 2 item 4): one reduced manifest with the plugins the region works with. It runs
// with the ones present on the branch (core, nav, region, npcs, interiors, waystones, greyfen) and gains K6b's fauna, K7's
// water and K9's shrine as they merge: no duplicate id, every plugin up, and the interiors' doors on real floors.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { InteriorError } from '../interiors/InteriorController';
import interiorsPlugin from '../interiors/interiors.plugin';
import navPlugin from '../nav/nav.plugin';
import npcsPlugin from '../npcs/npcs.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import regionPlugin from '../region/region.plugin';
import { groundDistance } from '../waystones/ground';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { DEEPS_DEF } from './deepsInterior';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { layoutInterior } from '../interiors/layout';
import { heightAt } from '../terrain/heightfield';
import greyfenPlugin from './greyfen.plugin';
import { GREYFEN_WAYSTONES } from './sites';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/region.plugin.ts': { default: regionPlugin },
  '/src/test/npcs.plugin.ts': { default: npcsPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/greyfen.plugin.ts': { default: greyfenPlugin },
};

let physics: PhysicsWorld;
const worlds: World[] = [];
const games: Game[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
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
  const statuses = await game.loadPlugins(modules);
  // Act 3 is open (the containment holds the Greyfen shut until `story.gate.a3`).
  for (const f of ['story.gate.a2', 'story.gate.a3']) game.ctx.state.setFlag(f, true);
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  const svc = () => game.ctx.services.get('interiors')!;
  return { game, statuses, run, svc };
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
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the Greyfen on the real game', () => {
  it('boots every plugin with no duplicate id, the places, the waystones and the cast', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (const a of GREYFEN_LAYOUT.anchors) expect(t.game.ctx.anchors.get(a.id), a.id).toBeDefined();
    const stones = t.game.ctx.services.get('waystones')!.ids();
    for (const id of Object.keys(GREYFEN_WAYSTONES)) expect(stones, id).toContain(id);
    expect(t.game.ctx.services.get('greyfen')!.shownToggles().length).toBe(5);
  }, 30_000);

  it('enters the Sunken Chapel onto its porch once R13 starts, and leaves by the tower onto the ground outside', async () => {
    const t = await boot();
    await t.run(2);
    expect(await settle(t, t.svc().enter('greyfen-chapel', 'greyfen-chapel')).catch((e: InteriorError) => e.reason)).toBe('locked');
    t.game.ctx.state.setFlag('story.r13.started', true);
    await settle(t, t.svc().enter('greyfen-chapel', 'greyfen-chapel'));
    const entry = t.game.ctx.anchors.get('greyfen.chapel.entry')!.position;
    await t.run(60);
    expect(near(t.game.ctx.player.feet, entry)).toBeLessThan(0.6);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(entry.y - 0.2);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    await settle(t, t.svc().exit('greyfen-chapel-tower'));
    expect(t.svc().current).toBeNull();
    const out = t.game.ctx.anchors.get('greyfen.chapel.tower-exit')!.position;
    expect(near(t.game.ctx.player.feet, out)).toBeLessThan(2);
    await t.run(30);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
  }, 30_000);

  it('enters the Deeps and Mireweather Hut onto real floors', async () => {
    const t = await boot();
    await t.run(2);
    t.game.ctx.state.setFlag('story.d05.started', true);
    for (const [id, entryId] of [
      ['greyfen-deeps', 'greyfen.deeps.entry'],
      ['greyfen-hut', 'greyfen.hut.entry'],
    ] as const) {
      await settle(t, t.svc().enter(id, id));
      await t.run(60);
      const entry = t.game.ctx.anchors.get(entryId)!.position;
      expect(t.game.ctx.player.feet.y, id).toBeGreaterThan(entry.y - 0.2);
      expect(groundDistance(t.game.ctx, 0.5), id).not.toBeNull();
      await settle(t, t.svc().exit());
    }
  }, 30_000);

  it('opens D05\'s sluice gates on their flags, and shuts them when the flag clears', async () => {
    const t = await boot();
    await t.run(2);
    const l = layoutInterior(DEEPS_DEF, heightAt);
    // A ray along the gate 1 tunnel, 2 m under the floor, through the gate (local x 34, z -45 to -49).
    const shut = async () => {
      await t.run(1);
      const hit = t.game.ctx.physics.raycast({ x: l.origin.x + 34, y: l.floorY - 2, z: l.origin.z - 45 }, { x: 0, y: 0, z: -1 }, 4);
      return hit !== null && hit.distance > 1.4 && hit.distance < 2.1;
    };
    expect(await shut()).toBe(true);
    t.game.ctx.state.setFlag('story.d05.sluice1', true);
    expect(await shut()).toBe(false);
    t.game.ctx.state.setFlag('story.d05.sluice1', false);
    expect(await shut()).toBe(true);
  }, 30_000);
});

