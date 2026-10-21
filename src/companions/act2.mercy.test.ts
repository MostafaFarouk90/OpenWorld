// A5 headless: Hrolf never hits a foe in a mercy state and never provokes it onto himself. Real core resolver, real
// enemies plugin (EnemyManager, spawned through its service, mercy driven by the real hold) and real companions plugin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MercyState } from '../actors/Actor';
import type { AssetLoader } from '../assets/AssetLoader';
import { KnightAvatar } from '../characters/KnightAvatar';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import enemiesPlugin from '../enemies/enemies.plugin';
import { MERCY } from '../enemies/tuning';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import companionsPlugin, { companionControllers } from './companions.plugin';
import { HROLF } from './hrolf';
import { HROLF_TUNING } from './tuning';
import './types';

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
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** An AssetLoader stand-in serving the parsed Knight. */
const fakeAssets = () =>
  ({
    load: vi.fn(async () => gltf),
    instantiate: vi.fn(() => cloneSkinned(gltf.scene)),
    animations: vi.fn(() => gltf.animations),
    has: () => true,
  }) as unknown as AssetLoader;

// Real spawner groups: one Footman, one ember hound, one wraith (manual one-shots with their own anchors).
const GROUPS = {
  soldier: { group: 't09.soldier', anchor: 'spawn.t09.soldier-1' },
  hound: { group: 'density.d02.stray', anchor: 'spawn.d02.stray-1' },
  wraith: { group: 't10.sweeper', anchor: 'spawn.t10.wraith-1' },
} as const;

async function boot() {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: fakeAssets(), report: () => {} });
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const avatar = new KnightAvatar(
    { model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null },
    { warn: () => {} },
  );
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  world.combat.combat.addTarget(world.combat.playerHurtboxes!);
  await game.loadPlugins(modules(corePlugin, enemiesPlugin, companionsPlugin));
  const ctx = game.ctx;
  // The Tilted Anvil posts, far from the test spot (out of view).
  for (const id of ['tobb', 'hrolf']) {
    ctx.anchors.define({ id: `npc-post.${id}.tilted-anvil`, position: { x: 300, y: heightAt(300, 300), z: 300 }, yaw: 0 });
  }
  // Cael takes no real harm from the foes; mercy and Hrolf are what is under test.
  (ctx.player.actor as { immortal: boolean }).immortal = true;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const secs = (s: number) => run(Math.round(s * 60));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const enemies = () => ctx.services.require('enemies');
  const ctl = () => companionControllers().find((c) => c.def.id === 'hrolf')!;
  ctx.state.setFlag(HROLF.joinFlag, true);
  secs(1);
  const f0 = ctx.player.feet.clone();
  /** One foe of `kind` 2 m in front of Cael, aggroed on him (so `mayEngage` can see it), unlocked mercies on. */
  const spawn = (kind: keyof typeof GROUPS, settle = 0.2) => {
    const g = GROUPS[kind];
    ctx.anchors.define({ id: g.anchor, position: { x: f0.x, y: heightAt(f0.x, f0.z - 2), z: f0.z - 2 }, yaw: Math.PI });
    for (const v of ['spare', 'calm', 'release'] as const) enemies().setMercyUnlocked(v, true);
    const [id] = enemies().spawnGroup(g.group, { aggro: true, count: 1 });
    expect(id).toBeDefined();
    secs(settle); // the wraith needs its rise (2.5 s)
    return ctx.actors.get(id!)!;
  };
  const placeHrolf = () => ctl().placeAt({ x: f0.x + 1, y: f0.y, z: f0.z - 1 });
  /** A real player hit: `poise` breaks it, `amount` wounds it. */
  const strike = (id: string, amount: number, poise: number) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: id, amount, poise, kind: 'melee' });
  /** The real mercy hold (key T, 0.5 s) on the foe in front of Cael. */
  const holdMercy = () => {
    win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyT', repeat: false, preventDefault: () => {} }));
    run(1);
    secs(MERCY.holdSeconds + 0.2);
    win.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyT', repeat: false, preventDefault: () => {} }));
    run(1);
  };
  const hrolfId = () => svc().actorId('hrolf')!;
  /** Ticks until the foe's mercy state ends (or `max` s), counting those in `states`; returns that count. */
  const watch = (foe: { mercyState?: () => MercyState }, states: MercyState[], max = 6) => {
    let n = 0;
    for (let i = 0; i < max * 60; i++) {
      run(1);
      const s = foe.mercyState?.() ?? 'none';
      if (s === 'none') break;
      if (states.includes(s)) n++;
    }
    return n;
  };
  /** From `mark` on: Hrolf hit nothing of `foeId` and no foe was aggroed onto Hrolf. */
  const expectUntouched = (mark: number, foeId: string) => {
    const after = events.slice(mark);
    const hits = after.filter((e) => e.type === 'damage.dealt' && e.payload.attackerId === hrolfId() && e.payload.targetId === foeId);
    const aggro = after.filter((e) => e.type === 'ai.aggro' && e.payload.targetId === hrolfId());
    expect(hits).toEqual([]);
    expect(aggro).toEqual([]);
  };
  const hrolfHits = () => of('damage.dealt').filter((d) => d.attackerId === hrolfId());
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { ctx, events, run, secs, of, spawn, placeHrolf, strike, holdMercy, watch, expectUntouched, hrolfHits, done };
}

describe('Hrolf leaves mercy alone (Q3, contract item 7)', () => {
  it('Spare: a yielding Footman takes no hit and no aggro onto Hrolf', async () => {
    const t = await boot();
    const foe = t.spawn('soldier');
    t.strike(foe.id, foe.maxHealth * 0.6, 100); // wounded below half and poise-broken: it yields
    expect(foe.mercyState?.()).toBe('yielding');
    const mark = t.events.length;
    t.placeHrolf();
    expect(t.watch(foe, ['yielding'])).toBeGreaterThan(60);
    t.expectUntouched(mark, foe.id);
    t.done();
  });

  it('Calm: an ember hound being calmed takes no hit and no aggro onto Hrolf', async () => {
    const t = await boot();
    const foe = t.spawn('hound');
    expect(foe.mercyState?.()).toBe('none');
    t.holdMercy(); // the Warm Hand (no pack inventory): the hound is calmed
    expect(foe.mercyState?.()).toBe('calming');
    const mark = t.events.length;
    t.placeHrolf();
    expect(t.watch(foe, ['calming'])).toBeGreaterThan(30);
    t.expectUntouched(mark, foe.id);
    t.done();
  });

  it('The Warm Hand: a knocked-down hound takes no hit and no aggro onto Hrolf', async () => {
    const t = await boot();
    const foe = t.spawn('hound');
    t.strike(foe.id, 1, 100); // a poise break: it is knocked down
    expect(foe.mercyState?.()).toBe('staggered');
    const mark = t.events.length;
    t.placeHrolf();
    expect(t.watch(foe, ['staggered'])).toBeGreaterThan(30);
    t.expectUntouched(mark, foe.id);
    t.done();
  });

  it('Release: a staggered wraith takes no hit and no aggro onto Hrolf', async () => {
    const t = await boot();
    const foe = t.spawn('wraith', 2.5);
    t.strike(foe.id, 1, 100);
    expect(foe.mercyState?.()).toBe('staggered');
    const mark = t.events.length;
    t.placeHrolf();
    expect(t.watch(foe, ['staggered'])).toBeGreaterThan(30);
    t.expectUntouched(mark, foe.id);
    t.done();
  });

  it('a spared foe that is leaving takes no hit and no aggro onto Hrolf', async () => {
    const t = await boot();
    const foe = t.spawn('soldier');
    t.strike(foe.id, foe.maxHealth * 0.6, 100);
    expect(foe.mercyState?.()).toBe('yielding');
    t.holdMercy(); // the real Spare hold
    expect(foe.mercyState?.()).toBe('leaving');
    const mark = t.events.length;
    t.placeHrolf();
    expect(t.watch(foe, ['leaving'])).toBeGreaterThan(30);
    t.expectUntouched(mark, foe.id);
    t.done();
  });

  it('control: a plain aggroed Footman Cael is fighting does get Hrolf hits', async () => {
    const t = await boot();
    const foe = t.spawn('soldier');
    t.strike(foe.id, 2, 0);
    t.placeHrolf();
    t.secs(HROLF_TUNING.cooldown + 1);
    expect(foe.mercyState?.()).toBe('none');
    expect(t.hrolfHits().filter((h) => h.targetId === foe.id).length).toBeGreaterThan(0);
    t.done();
  });
});
