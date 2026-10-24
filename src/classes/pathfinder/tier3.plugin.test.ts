import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { KnightAvatar } from '../../characters/KnightAvatar';
import { InputManager } from '../../input/InputManager';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { ITEMS } from '../../inventory/items';
import combatVerbsPlugin from '../../player/combatVerbs.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import progressionPlugin from '../../progression/progression.plugin';
import statusPlugin from '../../status/status.plugin';
import { getSkill, resetClassSkills } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import classesPlugin from '../classes.plugin';
import { CLASS_OPEN_FLAG } from '../kits';
import pathfinderPlugin from './pathfinder.plugin';
import { PLAYER } from '../../config/constants';
import { PATHFINDER_ATTACKS, PATHFINDER_HEAVY_INDEX, PF } from './tuning';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/combat-verbs.plugin.ts': { default: combatVerbsPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/status.plugin.ts': { default: statusPlugin },
  '/src/test/classes.plugin.ts': { default: classesPlugin },
  '/src/test/pathfinder.plugin.ts': { default: pathfinderPlugin },
};

const FILES: Record<string, string> = { knight: 'Knight.glb', barbarian: 'Barbarian.glb', mage: 'Mage.glb', rogue: 'Rogue.glb', rogueHooded: 'Rogue_Hooded.glb' };
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
const fakeAssets = () => ({
  load: async (id: string) => {
    if (!FILES[id]) throw new Error(`asset "${id}" failed`);
    return readGlb(id);
  },
  instantiate: (id: string) => cloneSkinned(gltfs.get(id)!.scene),
  animations: (id: string) => gltfs.get(id)!.animations,
});

let physics: PhysicsWorld;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  delete ITEMS['crossbow-bolts'];
  vi.restoreAllMocks();
});

async function boot() {
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
  const assets = fakeAssets();
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {}, assets: assets as never });
  const ctx = game.ctx;
  const feet = ctx.player.feet;
  ctx.anchors.define({ id: 'harrowmark.bastion.yard', position: { x: feet.x, y: feet.y, z: feet.z }, yaw: 0 });
  ctx.services.provide('waystones' as never, { hostileAggro: false } as never);
  ctx.services.provide('prompts' as never, { show: () => {}, success: () => {}, hide: () => {}, count: () => 0, showHintsAlways: false } as never);
  ctx.services.provide('enemies' as never, { spawnGroup: () => [], despawnGroup: () => {}, reset: () => {}, alive: () => [] } as never);
  const statuses = await game.loadPlugins(modules);
  const knight = await KnightAvatar.load(assets as never);
  world.setAvatar(knight);
  game.attachAvatar(knight);
  const toasts: string[] = [];
  (ctx.events as any).on('hud.toast', (e: { textKey: string }) => toasts.push(e.textKey));
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      await Promise.resolve();
    }
  };
  const settle = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await run(1);
    }
  };
  return { game, ctx, statuses, run, settle, toasts, world };
}

async function asPathfinder() {
  const t = await boot();
  t.ctx.state.setFlag(CLASS_OPEN_FLAG, true);
  expect(t.ctx.services.require('classes').choose('pathfinder')).toEqual({ ok: true });
  await t.settle();
  return t;
}

function spawnHostile(t: Awaited<ReturnType<typeof boot>>, dz: number) {
  const root = new THREE.Object3D();
  const f = t.ctx.player.feet;
  root.position.set(f.x, f.y, f.z + dz);
  t.ctx.scene.add(root);
  // The Pathfinder faces -Z at yaw 0, so a target at negative dz is ahead.
  return t.ctx.actors.spawn({ kind: 'dummy', team: 'hostile', maxHealth: 100, maxPoise: 40, root });
}

function learnAll(t: Awaited<ReturnType<typeof boot>>, ids: string[]) {
  const p = t.ctx.services.require('progression') as any;
  p.grantSkillPoint(30, 'test');
  for (const id of ids) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
  return p;
}
const TIER2 = ['steadyShot', 'piercingBolt', 'tripwire', 'cinderTrap', 'trailblaze', 'falconEye'];

describe('pathfinder tier 3 SkillDefs on the real progression', () => {
  it('tier 3 costs 2 and requires the tier 2 skill of its branch; tier 4 is refused', async () => {
    const t = await asPathfinder();
    const p = learnAll(t, []);
    const want: Array<[string, string]> = [
      ['emberQuarrel', 'piercingBolt'],
      ['netLauncher', 'cinderTrap'],
      ['lightStep', 'falconEye'],
    ];
    for (const [id, req] of want) {
      const def = getSkill(`pathfinder.${id}`)!;
      expect(def).toMatchObject({ tier: 3, cost: 2, requires: `pathfinder.${req}`, availableWhen: true });
    }
    expect(p.learn(PF.skillIds.emberQuarrel).ok).toBe(false); // the tier 2 skill is not learned yet
    for (const id of TIER2) expect(p.learn(`pathfinder.${id}`).ok).toBe(true);
    const before = p.skillPoints;
    for (const [id] of want) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
    expect(before - p.skillPoints).toBe(6);
    for (const id of ['tripleShot', 'caltropField', 'sureFoot']) {
      expect(getSkill(`pathfinder.${id}`)).toMatchObject({ tier: 4, availableWhen: { all: ['story.gate.a3', 'trainer.pathfinder.masterBook'] } });
      expect(p.learn(`pathfinder.${id}`).ok, id).toBe(false);
    }
  });
});

describe('pathfinder tier 3 on the real game', () => {
  it('Ember Quarrel: a loosed bolt ignites the target under its own id; unlearned it does not', async () => {
    const t = await asPathfinder();
    const target = spawnHostile(t, -8);
    const status = t.ctx.services.require('status') as any;
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    expect(target.health).toBeLessThan(target.maxHealth);
    expect(status.list(target.id).map((e: any) => e.id)).not.toContain('pathfinder.emberQuarrel.ignite');
    learnAll(t, [...TIER2, 'emberQuarrel']);
    const second = spawnHostile(t, -9);
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    const ignites = status.list(second.id).filter((e: any) => e.kind === 'ignite');
    expect(ignites.map((e: any) => e.id)).toEqual(['pathfinder.emberQuarrel.ignite']);
    expect(ignites[0].sourceId).toBe('player');
  });

  it('Net Launcher: roots the aimed foe without damage, takes Ember and a cooldown, and a miss costs nothing', async () => {
    const t = await asPathfinder();
    const p = learnAll(t, [...TIER2, 'netLauncher']);
    expect(p.assign(0, PF.skillIds.netLauncher)).toBe(true);
    const abilities = t.ctx.services.require('abilities') as any;
    const status = t.ctx.services.require('status') as any;
    expect(abilities.use(0)).toMatchObject({ ok: false, detail: 'no-target' });
    expect(abilities.cooldown(0).remaining).toBe(0);
    const target = spawnHostile(t, -10);
    const damage: unknown[] = [];
    t.ctx.events.on('damage.dealt', (r) => void damage.push(r));
    expect(abilities.use(0)).toEqual({ ok: true });
    await t.run(2);
    expect(status.has(target.id, 'root')).toBe(true);
    expect(target.health).toBe(target.maxHealth);
    expect(target.poise).toBe(target.maxPoise);
    expect(damage).toEqual([]);
    expect(abilities.cooldown(0).remaining).toBeGreaterThan(15);
    expect(abilities.use(0).ok).toBe(false);
  });

  it('Net Launcher refuses a foe beyond 18 m', async () => {
    const t = await asPathfinder();
    const p = learnAll(t, [...TIER2, 'netLauncher']);
    p.assign(0, PF.skillIds.netLauncher);
    spawnHostile(t, -25);
    expect((t.ctx.services.require('abilities') as any).use(0)).toMatchObject({ ok: false, detail: 'no-target' });
  });

  it('Light Step: one air jump at sqrt(0.7) of the ground speed, back to 0 on a respec, a class change, death and a load', async () => {
    const t = await asPathfinder();
    const c = t.ctx.world.player.controller;
    expect(c.airJumps).toBe(0);
    const p = learnAll(t, [...TIER2, 'lightStep']);
    await t.run(2);
    expect(c.airJumps).toBe(1);
    expect(c.airJumpSpeed).toBeCloseTo(Math.sqrt(0.7) * PLAYER.jumpSpeed);

    t.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    expect(c.airJumps).toBe(0);
    await t.run(2);
    expect(c.airJumps).toBe(1);

    t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id, killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    expect(c.airJumps).toBe(0);
    await t.run(2);
    expect(c.airJumps).toBe(1);

    const release = p.allowRespec('test');
    expect(p.respec().ok).toBe(true);
    release();
    await t.run(2);
    expect(c.airJumps).toBe(0);
    expect(c.airJumpSpeed).toBeUndefined();

  });

  it('Light Step is off in another class even with the skill learned', async () => {
    const t = await asPathfinder();
    const c = t.ctx.world.player.controller;
    const p = learnAll(t, [...TIER2, 'lightStep']);
    await t.run(2);
    expect(c.airJumps).toBe(1);
    p.setClass('warden');
    await t.run(2);
    expect(c.airJumps).toBe(0);
    expect(c.airJumpSpeed).toBeUndefined();
  });
});

describe('pathfinder plugin lifecycle', () => {
  it('setup twice on one context (with and without a dispose between) does not throw and dispose releases everything', async () => {
    const t = await boot();
    const ctx = t.ctx;
    // 1. a second setup without a dispose first releases the previous run
    expect(() => pathfinderPlugin.setup(ctx)).not.toThrow();
    // 2. dispose, set up again, dispose
    pathfinderPlugin.dispose?.();
    expect(() => pathfinderPlugin.setup(ctx)).not.toThrow();
    pathfinderPlugin.dispose?.();
    pathfinderPlugin.dispose?.(); // idempotent
    // everything the plugin registered is gone: the same ids can be taken again
    const abilities = ctx.services.require('abilities') as any;
    for (const id of [PF.skillIds.cinderTrap, PF.skillIds.falconEye, PF.skillIds.netLauncher]) {
      const r = abilities.registerHandler(id, () => ({ ok: true }));
      expect(r.ok, id).toBe(true);
      r.dispose();
    }
    expect(() => ctx.damage.addModifier('pathfinder.crossbow', () => {}, -190)()).not.toThrow();
    expect(() => ctx.services.provide('pathfinder' as never, { ammo: () => null } as never)()).not.toThrow();
    expect(ctx.services.require('spells').registerSurgeForm('pathfinder', 'warm', () => {})).toMatchObject({ ok: true });
    expect(ctx.services.require('combatVerbs').registerAttackSet('pathfinder', { attacks: PATHFINDER_ATTACKS, heavyIndex: PATHFINDER_HEAVY_INDEX })).toMatchObject({ ok: true });
    // the player's controller is back at its defaults and nothing of ours is ticking
    expect(ctx.world.player.controller.airJumps).toBe(0);
  });

  it('after a dispose the Ember Quarrel handler is gone: a bolt-id hit ignites nothing', async () => {
    const t = await asPathfinder();
    learnAll(t, [...TIER2, 'emberQuarrel']);
    const target = spawnHostile(t, -3);
    pathfinderPlugin.dispose?.();
    t.ctx.damage.apply({ attackerId: 'player', targetId: target.id, amount: 5, kind: 'melee', attackId: 'pathfinder.bolt.1' });
    expect((t.ctx.services.require('status') as any).has(target.id, 'ignite')).toBe(false);
  });
});
