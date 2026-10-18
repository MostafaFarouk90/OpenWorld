import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../actors/classes';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { KnightAvatar } from '../characters/KnightAvatar';
import { InputManager } from '../input/InputManager';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import classesPlugin from './classes.plugin';
import { CLASS_OPEN_FLAG } from './kits';
import phaseA from './__fixtures__/phase-a-progression-v2.json';
import slice1 from './__fixtures__/slice-1-progression-v1.json';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/classes.plugin.ts': { default: classesPlugin },
};

const FILES: Record<string, string> = {
  knight: 'Knight.glb',
  barbarian: 'Barbarian.glb',
  mage: 'Mage.glb',
  rogue: 'Rogue.glb',
  rogueHooded: 'Rogue_Hooded.glb',
};
const gltfs = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();

async function readGlb(id: string) {
  const hit = gltfs.get(id);
  if (hit) return hit;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync: (p: string) => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
  };
  const file = readFileSync(`public/assets/kaykit-adventurers/characters/${FILES[id]}`);
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const g = await new Promise<any>((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
  gltfs.set(id, g);
  return g;
}

/** Enough of AssetLoader for the avatars: the real character glbs; weapon assets fail (they fall back to the embedded ones). */
function fakeAssets(failModel: string | null = null) {
  return {
    load: async (id: string) => {
      if (!FILES[id] || id === failModel) throw new Error(`asset "${id}" failed`);
      return readGlb(id);
    },
    instantiate: (id: string) => cloneSkinned(gltfs.get(id)!.scene),
    animations: (id: string) => gltfs.get(id)!.animations,
  };
}

let physics: PhysicsWorld;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

interface BootOpts {
  anchors?: boolean;
  failModel?: string;
  hostile?: () => boolean;
}

async function boot(opts: BootOpts = {}) {
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
  const assets = fakeAssets(opts.failModel ?? null);
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {}, assets: assets as never });
  const ctx = game.ctx;
  const feet = ctx.player.feet;
  const at = (dx: number, dz: number) => ({ x: feet.x + dx, y: feet.y, z: feet.z + dz });
  if (opts.anchors !== false) {
    ctx.anchors.define({ id: 'harrowmark.bastion.yard', position: at(0, 0), yaw: 0 });
    let i = 0;
    for (const npc of ['gaut', 'stane', 'pennard', 'gerta', 'ashdown']) {
      ctx.anchors.define({ id: `harrowmark.bastion.trainer.${npc}`, position: at(1.5, -0.5 - i * 0.01), yaw: 0 });
      ctx.anchors.define({ id: `npc-post.${npc}.bastion`, position: at(3.5, -0.5), yaw: 0 });
      i++;
    }
  }
  const hostile = { on: false };
  ctx.services.provide('waystones' as never, { get hostileAggro() { return opts.hostile?.() ?? hostile.on; } } as never);
  const counts = new Map<string, number>();
  const shown: string[] = [];
  ctx.services.provide('prompts' as never, {
    show: (m: string) => shown.push(m),
    success: (m: string) => counts.set(m, (counts.get(m) ?? 0) + 1),
    hide: () => {},
    count: (m: string) => counts.get(m) ?? 0,
    showHintsAlways: false,
  } as never);
  const spawned: string[] = [];
  const despawned: string[] = [];
  ctx.services.provide('enemies' as never, {
    spawnGroup: (id: string) => {
      spawned.push(id);
      return ['spar'];
    },
    despawnGroup: (id: string) => despawned.push(id),
    reset: () => {},
    alive: () => ['spar'],
  } as never);
  const statuses = await game.loadPlugins(modules);
  const knight = await KnightAvatar.load(assets as never);
  world.setAvatar(knight);
  const events: { type: string; payload: any }[] = [];
  for (const type of ['class.chosen', 'class.changed', 'class.drill', 'player.avatar', 'loot.granted', 'gold.spent', 'hud.toast']) {
    (ctx.events as any).on(type, (payload: unknown) => events.push({ type, payload }));
  }
  game.attachAvatar(knight);
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      await Promise.resolve();
    }
  };
  /** Lets the kit load (real glb parse) settle, then ticks. */
  const settle = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await run(1);
    }
  };
  const classes = () => ctx.services.require('classes');
  const progression = () => ctx.services.require('progression');
  const succeed = (m: string, n = 1) => counts.set(m, (counts.get(m) ?? 0) + n);
  const load = (file: { entries: Record<string, { version: number; data: unknown }> }) => {
    // Thread 6's load lifecycle (contract section 7): each registered key, then save.loaded.
    for (const p of ctx.persist.all()) {
      const e = file.entries[p.key];
      if (e) p.load(e.data, e.version);
    }
    ctx.events.emit('save.loaded', { slot: 'test' });
  };
  return { game, ctx, statuses, run, settle, events, classes, progression, hostile, shown, spawned, despawned, succeed, load };
}

const open = (t: Awaited<ReturnType<typeof boot>>) => t.ctx.state.setFlag(CLASS_OPEN_FLAG, true);

describe('classes plugin on the real game', () => {
  it('sets up cleanly and plays as an unchosen Knight', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.classes().current()).toBe('knight');
    expect(t.classes().chosen()).toBe(false);
    expect(t.ctx.player.avatar?.classId).toBe('knight');
  });

  it('opens the five trainers only once M07 opens the class choice, and refuses a choice before', async () => {
    const t = await boot();
    expect(t.classes().available('warden')).toBe(false);
    expect(t.classes().choose('warden')).toEqual({ ok: false, reason: 'no-permit' });
    open(t);
    for (const id of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'] as ClassId[]) {
      expect(t.ctx.state.getFlag(`classes.available.${id}`)).toBe(true);
    }
    t.ctx.state.setFlag(CLASS_OPEN_FLAG, false);
    expect(t.classes().available('warden')).toBe(false);
  });

  it('choosing the Warden swaps the kit, grants and equips the starter set, mirrors the flags and starts the drill', async () => {
    const t = await boot();
    open(t);
    expect(t.classes().choose('warden')).toEqual({ ok: true });
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('warden');
    expect(t.events.find((e) => e.type === 'player.avatar' && e.payload.classId === 'warden')?.payload.previous).toBe('knight');
    const loot = t.events.find((e) => e.type === 'loot.granted');
    expect(loot?.payload).toEqual({ sourceId: 'trainer:stane', items: [{ itemId: 'woodcutters-axe', count: 1 }, { itemId: 'hide-jerkin', count: 1 }] });
    const inv = t.ctx.services.require('inventory');
    expect(inv.equipped('weapon')).toBe('woodcutters-axe');
    expect(inv.equipped('armour')).toBe('hide-jerkin');
    expect(inv.equipped('offhand')).toBeNull();
    expect(t.ctx.state.getFlag('classes.chosen')).toBe(true);
    expect(t.classes().drill()?.classId).toBe('warden');
    expect(t.ctx.actors.player.maxHealth).toBe(150);
  });

  it('runs the drill to done once the kit is worn: spars for block and dodge, kill XP paused, outcome mirrored', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('warden');
    await t.settle();
    const steps = ['attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge'];
    for (const m of steps) {
      t.succeed(m, 3);
      await t.run(2);
    }
    // Skills and ability steps are passed over: no Warden skills registered yet.
    await t.run(2);
    expect(t.spawned).toEqual(['classes.drill.blocker', 'classes.drill.dodge']);
    expect(t.despawned).toEqual(['classes.drill.blocker', 'classes.drill.dodge']);
    const drill = t.events.filter((e) => e.type === 'class.drill');
    expect(drill.map((e) => e.payload)).toEqual([{ classId: 'warden', outcome: 'done' }]);
    expect(t.ctx.state.getFlag('classes.drill.warden')).toBe('done');
    expect(t.progression().pauseKillXp).toBeDefined();
    expect((t.progression() as any).killXpPaused).toBe(false);
  });

  it('pauses kill XP while the drill runs and ends it as skipped when the player walks off the yard', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    await t.run(1);
    expect((t.progression() as any).killXpPaused).toBe(true);
    t.ctx.player.teleport({ x: t.ctx.player.feet.x + 200, y: t.ctx.player.feet.y, z: t.ctx.player.feet.z });
    await t.run(3);
    expect(t.classes().drill()).toBeNull();
    expect(t.events.filter((e) => e.type === 'class.drill').map((e) => e.payload.outcome)).toEqual(['skipped']);
    expect((t.progression() as any).killXpPaused).toBe(false);
  });

  it('defers the swap while the player is in combat', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('emberwright');
    t.hostile.on = true;
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('knight');
    t.hostile.on = false;
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('emberwright');
  });

  it('defers the swap mid-cast, and a cancelled cast frees it', async () => {
    const t = await boot();
    open(t);
    const id = t.ctx.actors.player.id;
    t.ctx.events.emit('spell.cast', { casterId: id, spellId: 'surge' });
    t.classes().choose('ashblade');
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('knight');
    (t.ctx.events.emit as any)('spell.cancelled', { casterId: id, spellId: 'surge', reason: 'staggered' });
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('ashblade');
  });

  it('keeps the current look and toasts when the kit model fails to load', async () => {
    const t = await boot({ failModel: 'rogueHooded' });
    open(t);
    expect(t.classes().choose('pathfinder')).toEqual({ ok: true });
    await t.settle();
    expect(t.ctx.player.avatar?.classId).toBe('knight');
    expect(t.classes().current()).toBe('pathfinder');
    expect(t.events.some((e) => e.type === 'hud.toast' && e.payload.textKey === 'classes.kit.failed')).toBe(true);
  });

  it('trainer interactables sit at their own anchors and close while the NPC is away from its Bastion post', async () => {
    const t = await boot();
    open(t);
    const trainer = (t.ctx.interaction as any).items?.get?.('trainer:gaut');
    expect(trainer).toBeDefined();
    const p = trainer.position(new THREE.Vector3());
    expect(p.x).toBeCloseTo(t.ctx.anchors.get('harrowmark.bastion.trainer.gaut').position.x);
    expect(trainer.enabled()).toBe(true);
    // Gaut is at the South Gate (M06): the trainer is closed.
    t.ctx.services.provide('npcs' as never, { position: () => ({ x: 999, y: 0, z: 999 }), get: () => undefined, place: () => false } as never);
    expect(trainer.enabled()).toBe(false);
  });

  it('a trainer without its anchor stays closed', async () => {
    const t = await boot({ anchors: false });
    open(t);
    const trainer = (t.ctx.interaction as any).items.get('trainer:stane');
    expect(trainer.enabled()).toBe(false);
  });

  it('the trainer menu holds the respec permit, so a change from it is a respec, and releases it on close', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    t.classes().skipDrill();
    t.ctx.events.emit('classes.trainer.open', { classId: 'warden' });
    expect(t.classes().change('warden')).toEqual({ ok: true });
    const changed = t.events.find((e) => e.type === 'class.changed');
    expect(changed?.payload).toEqual({ classId: 'warden', previous: 'knight', free: true, cost: 0 });
    // The modal stays open until closed; a death closes it and drops the permit.
    t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id } as never);
    expect(t.progression().respec()).toEqual({ ok: false, reason: 'no-permit' });
  });

  it('loads a Phase A save (progression v2) as an unchosen Knight that keeps its Knight skills', async () => {
    const t = await boot();
    t.load(phaseA as never);
    expect(t.classes().current()).toBe('knight');
    expect(t.classes().chosen()).toBe(false);
    expect(t.progression().learnedSkills()).toEqual(['knight.rimBash', 'knight.ironStance']);
    for (const id of ['knight', 'warden'] as ClassId[]) expect(t.classes().drillOutcome(id)).toBeNull();
    expect(t.progression().respecQuote().free).toBe(false);
    expect(t.ctx.state.getFlag('classes.chosen')).not.toBe(true);
  });

  it('loads a slice 1 save (progression v1) as an unchosen Knight with its free respec', async () => {
    const t = await boot();
    t.load(slice1 as never);
    expect(t.classes().current()).toBe('knight');
    expect(t.classes().chosen()).toBe(false);
    expect(t.progression().learnedSkills()).toEqual(['knight.rimBash']);
    expect(t.progression().respecQuote().free).toBe(true);
  });

  it('round-trips a Warden save: the class, the drill outcome, and the kit is put back on after the load', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('warden');
    t.classes().skipDrill();
    await t.settle();
    const entries: Record<string, { version: number; data: unknown }> = {};
    for (const p of t.ctx.persist.all()) entries[p.key] = { version: p.version, data: JSON.parse(JSON.stringify(p.serialize())) };
    expect(entries.classes).toEqual({ version: 1, data: { drills: { warden: 'skipped' }, starterGranted: ['warden'] } });

    const u = await boot();
    u.load({ entries });
    await u.settle();
    expect(u.classes().current()).toBe('warden');
    expect(u.classes().drillOutcome('warden')).toBe('skipped');
    expect(u.ctx.player.avatar?.classId).toBe('warden');
    expect(u.ctx.state.getFlag('classes.drill.warden')).toBe('skipped');
  });

  it('a load with a chosen class and no drill outcome reminds the player to run it', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    const entries: Record<string, { version: number; data: unknown }> = {};
    for (const p of t.ctx.persist.all()) entries[p.key] = { version: p.version, data: JSON.parse(JSON.stringify(p.serialize())) };
    const u = await boot();
    u.load({ entries });
    expect(u.classes().drill()).toBeNull();
    expect(u.events.some((e) => e.type === 'hud.toast' && e.payload.textKey === 'classes.drill.resume')).toBe(true);
  });

  it('a load closes the trainer menu and releases its permit', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    t.ctx.events.emit('classes.trainer.open', { classId: 'knight' });
    t.load({ entries: {} });
    t.progression().grantXp(1000, 'test');
    t.progression().learn('knight.rimBash');
    expect(t.progression().respec()).toEqual({ ok: false, reason: 'no-permit' });
  });

  it('a Phase A load in the middle of a drill cancels it silently and despawns its spar', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    await t.run(1);
    for (const m of ['attack1', 'attack2', 'attack3', 'attack4']) {
      t.succeed(m, 3);
      await t.run(2);
    }
    await t.run(1);
    expect(t.spawned).toEqual(['classes.drill.blocker']);
    t.load(phaseA as never);
    expect(t.classes().drill()).toBeNull();
    expect(t.despawned).toContain('classes.drill.blocker');
    expect(t.events.filter((e) => e.type === 'class.drill')).toEqual([]);
    expect((t.progression() as any).killXpPaused).toBe(false);
  });

  it('a stopped replay keeps a finished drill as done', async () => {
    const t = await boot();
    open(t);
    t.classes().choose('knight');
    await t.run(1);
    for (const m of ['attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'skills', 'ability']) {
      t.succeed(m, 3);
      await t.run(2);
    }
    await t.run(2);
    expect(t.classes().drillOutcome('knight')).toBe('done');
    expect(t.classes().startDrill()).toBe(true);
    t.classes().skipDrill();
    expect(t.classes().drillOutcome('knight')).toBe('done');
    expect(t.ctx.state.getFlag('classes.drill.knight')).toBe('done');
  });
});
