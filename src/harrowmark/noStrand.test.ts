// v0.8 item 8: the no-strand rule, dark stones and interior checkpoints, on the real core and waystones plugins.
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
import waystonesPlugin from '../waystones/waystones.plugin';
import { M41_CAMP_ANCHOR, REFUGE_REST_ANCHOR, createNoStrandRule, insideRingWall, stoneIsDark } from './noStrand';

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

const y = (x: number, z: number) => heightAt(x, z);
const CAMP = { x: 9100, z: 2900 };
const REFUGE = { x: 9700, z: 4400 };

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
  const a = game.ctx.anchors;
  a.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  a.define({ id: 'waystone.harrowmark-gate', position: { x: 8516, y: y(8516, 1212), z: 1212 }, yaw: 0, tags: ['waystone'] });
  a.define({ id: 'waystone.market', position: { x: 8500, y: y(8500, 2000), z: 2000 }, yaw: 0, tags: ['waystone'] });
  a.define({ id: 'waystone.farm-ring', position: { x: 6830, y: y(6830, 792), z: 792 }, yaw: 0, tags: ['waystone'] });
  a.define({ id: M41_CAMP_ANCHOR, position: { x: CAMP.x, y: y(CAMP.x, CAMP.z), z: CAMP.z }, yaw: 1 });
  a.define({ id: REFUGE_REST_ANCHOR, position: { x: REFUGE.x, y: y(REFUGE.x, REFUGE.z), z: REFUGE.z }, yaw: 2 });
  // Interior floors, 150 m up over the Keep.
  a.define({ id: 'harrowmark.a4.m39.checkpoint', position: { x: 8500, y: y(8500, 1700) + 150, z: 1700 }, yaw: 0 });
  a.define({ id: 'harrowmark.a4.m40.checkpoint', position: { x: 8520, y: y(8520, 1700) + 150, z: 1700 }, yaw: 0 });
  game.ctx.state.setFlag('tutorial.heartshard-awakened', true);
  game.ctx.state.setFlag('story.m06.route', true);
  await game.loadPlugins(modules);
  for (let i = 0; i < 2; i++) game.fixedUpdate();
  const w = game.ctx.services.require('waystones');
  return { game, w, flags: game.ctx.state };
}

describe('insideRingWall and the pure rule', () => {
  it('the ring wall polygon round the city centre (L2: the 56 chords plus 8 m, inside the 760 m circle)', () => {
    expect(insideRingWall(8500, 2000)).toBe(true);
    expect(insideRingWall(8500 + 755, 2000)).toBe(true);
    expect(insideRingWall(8500 + 759, 2000)).toBe(false);
    expect(insideRingWall(8500 + 761, 2000)).toBe(false);
  });
  it('falls back to the shipped spawn when the camp anchor is missing, never inside the walls', () => {
    const flags = { getFlag: (k: string) => k === 'story.m38.complete' || undefined };
    const spawn = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    const rule = createNoStrandRule({ flags, anchors: { find: (id) => (id === 'fallback' ? spawn : undefined) }, heightAt: () => 0, fallbackAnchor: 'fallback', warn: vi.fn() });
    expect(rule({ feet: { x: 8500, y: 0, z: 2000 }, yaw: 0 }, 'load')?.feet).toEqual({ x: 0, y: 0, z: 0 });
    const inside = createNoStrandRule({ flags, anchors: { find: () => ({ position: { x: 8500, y: 0, z: 2000 }, yaw: 0 }) }, heightAt: () => 0, fallbackAnchor: 'x' });
    expect(inside({ feet: { x: 8500, y: 0, z: 2000 }, yaw: 0 }, 'load')).toBeNull();
  });
  it('dark: the gate stone by table, the city stones by position, both from M38 only', () => {
    const none = { getFlag: () => undefined };
    const held = { getFlag: (k: string) => k === 'story.m38.complete' || undefined };
    expect(stoneIsDark('harrowmark-gate', undefined, none)).toBe(false);
    expect(stoneIsDark('harrowmark-gate', undefined, held)).toBe(true);
    expect(stoneIsDark('market', { x: 8500, z: 2000 }, held)).toBe(true);
    expect(stoneIsDark('farm-ring', { x: 6830, z: 792 }, held)).toBe(false);
  });
});

describe('the no-strand rule on the waystones service', () => {
  it('is inert before M38: the last stone is the respawn', async () => {
    const { w } = await boot();
    w.rekindle('harrowmark-gate');
    expect(w.respawnPoint().waystoneId).toBe('harrowmark-gate');
    w.rekindle('market');
    expect(w.respawnPoint().waystoneId).toBe('market');
  });

  it('a respawn with the last stone being harrowmark-gate lands at the camp, and at the refuge after M41', async () => {
    const { w, flags } = await boot();
    w.rekindle('harrowmark-gate');
    flags.setFlag('story.m38.complete', true);
    expect(w.isDark('harrowmark-gate')).toBe(true);
    expect(w.respawnPoint()).toMatchObject({ waystoneId: null, feet: { x: CAMP.x, z: CAMP.z } });
    // A city stone inside the walls is dark too, and goes the same way.
    w.rekindle('market');
    expect(w.isDark('market')).toBe(true);
    expect(w.respawnPoint()).toMatchObject({ waystoneId: null, feet: { x: CAMP.x, z: CAMP.z } });
    flags.setFlag('story.m41.complete', true);
    expect(w.respawnPoint()).toMatchObject({ waystoneId: null, feet: { x: REFUGE.x, z: REFUGE.z } });
    // A stone outside the city is untouched.
    w.rekindle('farm-ring');
    expect(w.respawnPoint().waystoneId).toBe('farm-ring');
  });

  it('an old autosave inside the walls, loaded with M38, is moved to the camp, and to the refuge after M41', async () => {
    const { game, w, flags } = await boot();
    const spy = vi.spyOn(game.ctx.player, 'teleport');
    flags.setFlag('story.m38.complete', true);
    void w.safeTeleport({ x: 8500, y: y(8500, 2000), z: 2000 }, 0);
    for (let i = 0; i < 120; i++) {
      game.fixedUpdate();
      await Promise.resolve();
    }
    const first = spy.mock.calls.map((c) => c[0] as { x: number; z: number });
    expect(first.some((p) => Math.abs(p.x - CAMP.x) < 1 && Math.abs(p.z - CAMP.z) < 1)).toBe(true);
    expect(first.some((p) => insideRingWall(p.x, p.z))).toBe(false);
  });

  it('dark stones refuse fast travel with reason dark', async () => {
    const { w, flags } = await boot();
    w.rekindle('farm-ring');
    w.rekindle('market');
    flags.setFlag('story.m38.complete', true);
    expect(await w.travel('market')).toEqual({ ok: false, reason: 'dark' });
  });
});

describe('interior checkpoints', () => {
  it('a death in M39 lands at the M39 checkpoint, a death in M40 at the M40 one; clearing returns to the stone', async () => {
    const { w } = await boot();
    w.rekindle('farm-ring');
    w.setCheckpoint('m39', 'harrowmark.a4.m39.checkpoint');
    expect(w.respawnPoint().feet.x).toBe(8500);
    w.setCheckpoint('m40', 'harrowmark.a4.m40.checkpoint');
    expect(w.respawnPoint().feet.x).toBe(8520);
    w.clearCheckpoint('m40');
    expect(w.respawnPoint().feet.x).toBe(8500);
    w.clearCheckpoint('m39');
    expect(w.respawnPoint().waystoneId).toBe('farm-ring');
  });

  it('a checkpoint inside the walls is never moved by the rule (interiors are exempt)', async () => {
    const { w, flags } = await boot();
    flags.setFlag('story.m38.complete', true);
    w.setCheckpoint('m40', 'harrowmark.a4.m40.checkpoint');
    expect(w.respawnPoint().feet.x).toBe(8520);
  });

  it('is saved as `respawn` v1 and restored; a save without it has none', async () => {
    const { game, w } = await boot();
    w.rekindle('farm-ring');
    w.setCheckpoint('m40', 'harrowmark.a4.m40.checkpoint');
    const p = game.ctx.persist.get('respawn')!;
    expect(p.version).toBe(1);
    const data = JSON.parse(JSON.stringify(p.serialize()));
    expect(data).toEqual({ checkpoints: [{ id: 'm40', anchorId: 'harrowmark.a4.m40.checkpoint' }] });
    const ways = game.ctx.persist.get('waystones')!;
    const stones = JSON.parse(JSON.stringify(ways.serialize()));
    ways.load(stones, 1);
    expect(w.respawnPoint().waystoneId).toBe('farm-ring');
    p.load(data, 1);
    expect(w.respawnPoint().feet.x).toBe(8520);
  });
});
