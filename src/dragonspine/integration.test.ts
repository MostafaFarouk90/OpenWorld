// Boots a reduced manifest (core, region, npcs, nav, interiors, waystones and this plugin) on the real ground, which carries K1's
// plateaus (`ACT3_PLATEAUS`). 30 s timeout (contracts v0.7 item 24).
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { Game } from '../core/Game';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import { InteriorError } from '../interiors/InteriorController';
import interiorsPlugin from '../interiors/interiors.plugin';
import navPlugin from '../nav/nav.plugin';
import npcsPlugin from '../npcs/npcs.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import regionPlugin from '../region/region.plugin';
import { groundDistance } from '../waystones/ground';
import waystonesPlugin from '../waystones/waystones.plugin';
import { DRAGONSPINE_NPCS } from './npcDefs';
import dragonspinePlugin from './dragonspine.plugin';
import { COLLAPSED_CAVE_DOOR_ID, COLLAPSED_CAVE_ID, ROCKFALL_BLOCKER_ID, WYRMWATCH_HALL_DOOR_ID, WYRMWATCH_HALL_ID } from './interiors';
import { DRAGONSPINE_OPEN_FLAG, R16_ROCKFALL_CLEARED_FLAG, R16_STARTED_FLAG } from './flags';
import { DRAGONSPINE_LAYOUT } from './dragonspine.layout';

/** A load replaces every flag, so the loads below keep the region open. */
const OPEN = { 'story.gate.a3': true, [DRAGONSPINE_OPEN_FLAG]: true };
let physics: PhysicsWorld;
const games: Game[] = [];
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const g of games.splice(0)) g.dispose();
  vi.restoreAllMocks();
});

async function boot(plugins = [corePlugin, regionPlugin, npcsPlugin, navPlugin, interiorsPlugin, waystonesPlugin, dragonspinePlugin]) {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const game = makeTestGame(physics);
  games.push(game);
  // The Dragonspine is held until Phase F: open it (the containment would push the player out of a closed region).
  game.ctx.state.setFlag('story.gate.a3', true);
  game.ctx.state.setFlag(DRAGONSPINE_OPEN_FLAG, true);
  const statuses = await bootPlugins(game, plugins);
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
async function reason(t: Booted, p: Promise<unknown>): Promise<string> {
  try {
    await settle(t, p);
    return 'resolved';
  } catch (e) {
    return e instanceof InteriorError ? e.reason : String(e);
  }
}
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** The rockfall blocker's mesh in the built interior: visible means closed. */
function rockfall(game: Game): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  game.ctx.scene.traverse((o) => {
    if (o.name.endsWith(ROCKFALL_BLOCKER_ID)) found = o;
  });
  if (!found) throw new Error('no rockfall blocker mesh');
  return found;
}

describe('the Dragonspine plugin booted with its neighbours', () => {
  it('boots clean and defines every anchor, trigger, waystone and NPC', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (const a of DRAGONSPINE_LAYOUT.anchors) expect(t.game.ctx.anchors.find(a.id), a.id).toBeTruthy();
    for (const id of ['waystone.wyrmwatch-lodge', 'waystone.rime-pass', 'waystone.last-anvil']) expect(t.game.ctx.anchors.find(id)?.tags, id).toContain('waystone');
    const npcs = t.game.ctx.services.get('npcs')!;
    for (const n of DRAGONSPINE_NPCS) expect(npcs.get(n.id), n.id).toBeTruthy();
    expect(t.game.ctx.anchors.find('dragonspine.wyrmwatch.hearth')).toBeFalsy();
  }, PLUGIN_TEST_TIMEOUT);

  it('survives a missing npcs plugin: the places stand and the cast is simply absent', async () => {
    const t = await boot([corePlugin, regionPlugin, navPlugin, interiorsPlugin, { ...dragonspinePlugin, dependsOn: ['core', 'region'] }]);
    expect(t.statuses.find((s) => s.id === 'dragonspine')?.state).toBe('ok');
    expect(t.game.ctx.anchors.find('waystone.rime-pass')).toBeTruthy();
    expect(t.game.ctx.services.get('npcs')).toBeFalsy();
  }, PLUGIN_TEST_TIMEOUT);

  it('round-trips the hall door: enter onto a real floor, exit to the door; the door is never locked', async () => {
    const t = await boot();
    await t.run(2);
    expect(await reason(t, t.svc().enter(WYRMWATCH_HALL_ID, WYRMWATCH_HALL_DOOR_ID))).toBe('resolved');
    expect(t.svc().current).toBe(WYRMWATCH_HALL_ID);
    const inside = t.game.ctx.anchors.get('dragonspine.hall.inside').position;
    expect(near(t.game.ctx.player.feet, inside)).toBeLessThan(0.5);
    await t.run(60);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(inside.y - 0.2);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    // The hall's posts and the dais stand on its floor.
    for (const id of ['dragonspine.hall.dais', 'dragonspine.hall.hearth', 'dragonspine.hall.hunter.1', 'dragonspine.hall.hunter.2']) {
      expect(Math.abs(t.game.ctx.anchors.get(id).position.y - inside.y), id).toBeLessThan(0.6);
    }
    expect(await reason(t, t.svc().exit())).toBe('resolved');
    expect(t.svc().current).toBeNull();
    const door = t.game.ctx.anchors.get('dragonspine.lodge.hall.door').position;
    expect(near(t.game.ctx.player.feet, door)).toBeLessThan(6);
  }, PLUGIN_TEST_TIMEOUT);

  it('keeps the cave door locked until story.r16.started, across a load either way, and never locks the exit', async () => {
    const t = await boot();
    await t.run(2);
    expect(await reason(t, t.svc().enter(COLLAPSED_CAVE_ID, COLLAPSED_CAVE_DOOR_ID))).toBe('locked');
    t.game.ctx.state.setFlag(R16_STARTED_FLAG, true);
    expect(await reason(t, t.svc().enter(COLLAPSED_CAVE_ID, COLLAPSED_CAVE_DOOR_ID))).toBe('resolved');
    t.game.ctx.state.setFlag(R16_STARTED_FLAG, false);
    expect(await reason(t, t.svc().exit())).toBe('resolved');
    // Back outside: at the mouth, not left in the float.
    expect(near(t.game.ctx.player.feet, t.game.ctx.anchors.get('dragonspine.cave.mouth').position)).toBeLessThan(6);
    t.game.ctx.state.load({ flags: { ...OPEN, [R16_STARTED_FLAG]: true } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter(COLLAPSED_CAVE_ID, COLLAPSED_CAVE_DOOR_ID))).toBe('resolved');
    await settle(t, t.svc().exit());
    t.game.ctx.state.load({ flags: { ...OPEN } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter(COLLAPSED_CAVE_ID, COLLAPSED_CAVE_DOOR_ID))).toBe('locked');
  }, PLUGIN_TEST_TIMEOUT);

  it('closes the rockfall blocker at setup, opens it on the flag and re-derives it on save.loaded', async () => {
    const t = await boot();
    await t.run(2);
    const gate = rockfall(t.game);
    expect(gate.visible).toBe(true);
    // The collider is live too: a ray along the passage from the rockfall anchor hits the blocker while it is closed and nothing after.
    const from = t.game.ctx.anchors.get('dragonspine.cave.rockfall').position;
    const probe = () => t.game.ctx.physics.raycast({ x: from.x, y: from.y + 1, z: from.z }, { x: 0, y: 0, z: -1 }, 6);
    expect(probe()?.distance ?? 99).toBeLessThan(3.5);
    t.game.ctx.state.setFlag(R16_ROCKFALL_CLEARED_FLAG, true);
    expect(gate.visible).toBe(false);
    await t.run(2);
    expect(probe()).toBeNull();
    // A load without the flag closes it again; a load with it opens it.
    t.game.ctx.state.load({ flags: { ...OPEN } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(gate.visible).toBe(true);
    await t.run(2);
    expect(probe()?.distance ?? 99).toBeLessThan(3.5);
    t.game.ctx.state.load({ flags: { ...OPEN, [R16_ROCKFALL_CLEARED_FLAG]: true } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(gate.visible).toBe(false);
    expect(t.svc().setBlocker(ROCKFALL_BLOCKER_ID, true)).toBe(true);
    expect(gate.visible).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);
});
