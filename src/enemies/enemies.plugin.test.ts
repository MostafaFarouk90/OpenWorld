import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetLoader } from '../assets/AssetLoader';
import { KnightAvatar } from '../characters/KnightAvatar';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import enemiesPlugin from './enemies.plugin';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
let physics: PhysicsWorld;

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** An AssetLoader stand-in serving the parsed Knight; `fail` rejects the load. */
function fakeAssets(opts: { fail?: boolean } = {}) {
  let resolveLoad!: () => void;
  const loaded = new Promise<void>((r) => (resolveLoad = r));
  const assets = {
    load: vi.fn(async () => {
      resolveLoad();
      if (opts.fail) throw new Error('404');
      return gltf;
    }),
    instantiate: vi.fn(() => cloneSkinned(gltf.scene)),
    animations: vi.fn(() => gltf.animations),
    has: () => true,
  };
  return { assets: assets as unknown as AssetLoader, loaded, spy: assets };
}

function setup(assets: AssetLoader | null = null) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const avatar = new KnightAvatar(
    { model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null },
    { warn: () => {} },
  );
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  /** An anchor `dz` metres in front of the player (yaw 0 faces -Z). */
  const anchorAhead = (id: string, dz: number, tags?: string[]) => {
    const x = world.spawn.x;
    const z = world.spawn.z - dz;
    return game.ctx.anchors.define({ id, position: { x, y: heightAt(x, z), z }, yaw: Math.PI, tags });
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  const key = (type: 'keydown' | 'keyup', code: string) =>
    win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} }));
  return { scene, world, game, events, run, anchorAhead, of, key, teardown };
}

describe('enemies plugin on the real core', () => {
  it('registers its service, strings, persistable and systems, and removes them on dispose', async () => {
    const t = setup();
    const statuses = await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    expect(statuses.map((s) => [s.id, s.state])).toEqual([
      ['core', 'ok'],
      ['enemies', 'ok'],
    ]);
    const c = t.game.ctx;
    expect(c.services.get('enemies')).toBeDefined();
    expect(c.strings.has('enemies.mercy.release')).toBe(true);
    for (const id of ['enemies.think', 'enemies.animate', 'enemies.react', 'enemies.render']) expect(t.game.systems.has(id)).toBe(true);
    expect(c.persist.get('enemies')?.version).toBe(1);
    t.teardown();
    expect(c.services.get('enemies')).toBeUndefined();
    expect(t.game.systems.has('enemies.think')).toBe(false);
  });

  it('headless (no asset loader): spawning warns and returns nothing instead of throwing', async () => {
    const t = setup(null);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    t.anchorAhead('spawn.t10.wraith', 4);
    const enemies = t.game.ctx.services.require('enemies');
    expect(enemies.spawnGroup('t10.sweeper')).toEqual([]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('headless'))).toBe(true);
    t.run(10);
    t.teardown();
  });

  it('a wraith spawned through the service rises, telegraphs and hits the player through the real damage bridge', async () => {
    const { assets } = fakeAssets();
    const t = setup(assets);
    // Thread 1's job in the game (actors-and-damage.md section 5): make the player hittable.
    t.world.combat.combat.addTarget(t.world.combat.playerHurtboxes!);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    t.anchorAhead('spawn.t10.wraith', 3);
    const enemies = t.game.ctx.services.require('enemies');
    const [id] = enemies.spawnGroup('t10.sweeper');
    expect(id).toBeDefined();
    const actor = t.game.ctx.actors.get(id)!;
    expect(actor.team).toBe('hostile');
    expect(actor.spawnTag).toBe('t10.sweeper');
    expect(actor.data.audio).toEqual({ material: 'ash' });
    const player = t.game.ctx.actors.player;
    const startHealth = player.health;
    for (let i = 0; i < 900 && player.health === startHealth; i++) t.run(1);
    expect(t.of('ai.aggro')).toEqual([{ actorId: id, targetId: player.id }]);
    const tele = t.of('telegraph')[0];
    expect(tele).toMatchObject({ actorId: id, kind: expect.stringMatching(/block|dodge/) });
    const hit = t.of('damage.dealt').find((d) => d.targetId === player.id);
    expect(hit).toMatchObject({ attackerId: id, outcome: 'hit' });
    expect(player.health).toBeLessThan(startHealth);
    expect(t.of('attack.window' as keyof GameEventMap).length).toBeGreaterThan(0);
    t.teardown();
  });

  it('auto spawners start only after the Knight model loads, and the north patrol warns when its anchor is missing', async () => {
    const { assets, loaded, spy } = fakeAssets();
    const t = setup(assets);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    expect(spy.load).toHaveBeenCalledWith('knight');
    await loaded;
    await Promise.resolve();
    await Promise.resolve();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('spawn.brightwater.north-patrol'))).toBe(true);
    t.teardown();
  });

  it('a failed Knight load warns once and spawns nothing', async () => {
    const { assets, loaded } = fakeAssets({ fail: true });
    const t = setup(assets);
    t.anchorAhead('spawn.brightwater.north-patrol', 6);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    await loaded;
    await new Promise((r) => setTimeout(r, 0));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('failed to load')).length).toBe(1);
    expect(t.game.ctx.services.require('enemies').alive('brightwater.north-patrol')).toEqual([]);
    t.teardown();
  });

  it('quest m01 spawns the lane wraiths tagged spawn.m01, and disposing the game despawns them', async () => {
    const { assets } = fakeAssets();
    const t = setup(assets);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    t.anchorAhead('spawn.m01.wraith-1', 10);
    t.game.events.emit('quest.started', { questId: 'm01' });
    const ids = t.game.ctx.services.require('enemies').alive('m01.lanes');
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(t.game.ctx.actors.get(id)!.spawnTag).toBe('spawn.m01');
    const before = t.scene.children.length;
    t.teardown();
    for (const id of ids) expect(t.game.ctx.actors.get(id)).toBeUndefined();
    expect(t.scene.children.length).toBeLessThan(before);
  });

  it('persists the warmth tier and locked block levels and restores them on load', async () => {
    const { assets } = fakeAssets();
    const t = setup(assets);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    const enemies = t.game.ctx.services.require('enemies');
    enemies.setWarmthTier(3);
    enemies.lockBlockLevel('brightwater.north', 4);
    const saver = t.game.ctx.persist.get('enemies')!;
    const data = JSON.parse(JSON.stringify(saver.serialize()));
    expect(data).toMatchObject({ warmthTier: 3, lockedBlockLevels: { 'brightwater.north': 4 } });
    enemies.setWarmthTier(0);
    saver.load(data, 1);
    expect(saver.serialize()).toMatchObject({ warmthTier: 3, lockedBlockLevels: { 'brightwater.north': 4 } });
    t.teardown();
  });

  it('holding T on a staggered wraith releases it through the real interaction system once Release is unlocked', async () => {
    const { assets } = fakeAssets();
    const t = setup(assets);
    await t.game.loadPlugins(modules(corePlugin, enemiesPlugin));
    t.anchorAhead('spawn.t10.wraith', 2);
    const enemies = t.game.ctx.services.require('enemies');
    const [id] = enemies.spawnGroup('t10.sweeper');
    const player = t.game.ctx.actors.player;
    t.run(150);
    const hold = (ticks: number) => {
      t.key('keydown', 'KeyT');
      t.run(ticks);
      t.key('keyup', 'KeyT');
      t.run(1);
    };

    // Locked: a staggered wraith ignores the hold.
    expect(t.game.ctx.damage.stagger(id, player.id, 1000)).toBe(true);
    t.run(1);
    hold(40);
    expect(t.of('mercy')).toEqual([]);
    t.run(120);

    enemies.setMercyUnlocked('release', true);
    expect(t.game.ctx.state.getBool('enemies.mercy.release')).toBe(true);
    t.game.ctx.actors.get(id)!.restorePoise();
    expect(t.game.ctx.damage.stagger(id, player.id, 1000)).toBe(true);
    t.run(1);
    hold(40);
    expect(t.of('mercy')).toMatchObject([{ verb: 'release', tier: 'normal', track: 'ashwalkers', creature: 'ash-wraith', actorId: id }]);
    expect(t.game.ctx.state.favour('ashwalkers')).toBeGreaterThan(0);
    t.run(Math.ceil(1.3 * 60));
    expect(t.game.ctx.actors.get(id)).toBeUndefined();
    expect(t.of('enemies.groupCleared')).toEqual([{ spawnerId: 't10.sweeper' }]);
    t.teardown();
  });
});
