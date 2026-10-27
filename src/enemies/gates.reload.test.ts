// Phase A spawner gates re-derived after a real save and load (thread 10): the churchyard wraiths (Release),
// Hollin Ford's pairs (M04 + Spare) and the Dead Road patrols (until the wardstones are done).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetLoader } from '../assets/AssetLoader';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FakeIndexedDb } from '../save/__fixtures__/fakeIndexedDb';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';

// The enemies plugin spawns once the Knight model has loaded (enemies.plugin.ts): serve it from disk.
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(p: string): Uint8Array };
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as never, rej));
});
// The model resolves after every plugin set up, as in the browser (a cached instant load would start the
// spawners before the region plugin defines the corridor anchors).
let modelReady: () => void = () => {};
const assets = () =>
  ({
    // Only the Knight is served: the swap models (horse, buildings) load in the background and must not take over `modelReady`.
    load: (id: string) => (id === 'knight' ? new Promise((res) => { modelReady = () => res(gltf); }) : Promise.reject(new Error(`asset "${id}" is not served in this test`))),
    instantiate: () => cloneSkinned(gltf.scene),
    animations: () => gltf.animations,
    has: () => true,
  }) as unknown as AssetLoader;

let physics: PhysicsWorld;
let fake: FakeIndexedDb;
const cleanups: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  physics?.dispose();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

async function boot() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: assets(), report: () => {} });
  const dispose = () => { game.dispose(); world.dispose(); };
  cleanups.push(dispose);
  await game.loadPlugins(PLUGIN_MODULES as Record<string, PluginModule>);
  modelReady();
  const ctx = game.ctx;
  const run = async (n: number) => {
    for (let i = 0; i < n; i++) {
      game.fixedUpdate();
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  };
  const settle = async <T>(p: Promise<T>): Promise<T> => {
    let done = false;
    void p.finally(() => { done = true; });
    for (let i = 0; i < 1500 && !done; i++) await run(1);
    return p;
  };
  await run(5);
  const enemies = ctx.services.require('enemies');
  const alive = (id: string) => enemies.alive(id).length;
  return { ctx, run, settle, alive, dispose };
}

const GROUPS = ['brightwater.churchyard', 'brightwater.ford.pair-1', 'brightwater.ford.pair-2', 'brightwater.deadroad.patrol-1', 'brightwater.deadroad.patrol-2'];

describe('Phase A spawner gates survive a real save and load', () => {
  it('mid-M04 with Release and Spare unlocked: the same groups stand after the load; wardstones done keeps the patrols away', async () => {
    const a = await boot();
    const quests = a.ctx.services.require('quests');
    for (const q of ['m01', 'm02', 'm03']) { quests.start(q); quests.complete(q); }
    quests.start('m04');
    a.ctx.state.setFlag('enemies.mercy.release', true);
    a.ctx.state.setFlag('enemies.mercy.spare', true);
    // the ford pairs wait for the end of Gaut's lesson (the density pass's story.m04.spareTaught)
    for (const o of ['o1', 'o2']) quests.completeObjective('m04', o);
    await a.run(60);
    const before = Object.fromEntries(GROUPS.map((g) => [g, a.alive(g)]));
    expect(before['brightwater.churchyard']).toBe(4);
    expect(before['brightwater.ford.pair-1']).toBe(2);
    expect(before['brightwater.deadroad.patrol-1']).toBe(3);
    expect((await a.settle(a.ctx.services.require('save').saveNow('manual'))).ok).toBe(true);
    const file = fake.peek('slot-0');
    a.dispose();

    // Load into a fresh game: every gate re-derives from the loaded flags and quest state.
    fake = new FakeIndexedDb();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
    fake.seed('slot-0', file);
    fake.seed('autosave', file);
    const b = await boot();
    expect(await b.settle(b.ctx.services.require('save').continueNow())).toBe(true);
    await b.run(60);
    expect(Object.fromEntries(GROUPS.map((g) => [g, b.alive(g)]))).toEqual(before);

    // The fifth wardstone: the patrols leave, and a save made now loads without them.
    b.ctx.state.setFlag('world.deadroad.wardstones.done', true);
    await b.run(60);
    expect(b.alive('brightwater.deadroad.patrol-1')).toBe(0);
    expect((await b.settle(b.ctx.services.require('save').saveNow('manual'))).ok).toBe(true);
    const file2 = fake.peek('slot-0');
    b.dispose();
    fake = new FakeIndexedDb();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
    fake.seed('slot-0', file2);
    fake.seed('autosave', file2);
    const c = await boot();
    expect(await c.settle(c.ctx.services.require('save').continueNow())).toBe(true);
    await c.run(60);
    expect(c.alive('brightwater.deadroad.patrol-1') + c.alive('brightwater.deadroad.patrol-2')).toBe(0);
    expect(c.alive('brightwater.ford.pair-1')).toBe(2);
  }, 90000);
});
