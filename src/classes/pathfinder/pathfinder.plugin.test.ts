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
import { getSkill, resetClassSkills } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import classesPlugin from '../classes.plugin';
import { CLASS_OPEN_FLAG } from '../kits';
import pathfinderPlugin, { CROSSBOW_TIP } from './pathfinder.plugin';
import { PF } from './tuning';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/combat-verbs.plugin.ts': { default: combatVerbsPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
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
const BOLTS = { id: 'crossbow-bolts', nameKey: 'item.crossbow-bolts.name', descKey: 'item.crossbow-bolts.desc', kind: 'consumable', stackMax: 40 } as never;

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

describe('pathfinder plugin on the real game', () => {
  it('sets up cleanly and registers the kit, attack set, Surge forms and skills exactly once', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const kit = t.ctx.services.require('classes').kit('pathfinder')!;
    expect(kit.tip).toEqual(CROSSBOW_TIP);
    expect(kit.mainhand.embedded).toBe('2H_Crossbow');
    expect(t.ctx.services.require('combatVerbs').registerAttackSet('pathfinder', { attacks: [], heavyIndex: 0 })).toEqual({ ok: false, reason: 'duplicate' });
    for (const zone of ['warm', 'blaze', 'cinder'] as const) {
      expect(t.ctx.services.require('spells').registerSurgeForm('pathfinder', zone, () => {})).toEqual({ ok: false, reason: 'duplicate' });
    }
    expect(getSkill(PF.skillIds.steadyShot)).toBeDefined();
    expect(getSkill(PF.skillIds.cinderTrap)?.kind).toBe('active');
  });

  it('choosing the Pathfinder swaps to the crossbow avatar and loads the ranged attack set', async () => {
    const t = await asPathfinder();
    expect(t.ctx.player.avatar?.classId).toBe('pathfinder');
    const c = t.ctx.player.avatar!.controller;
    expect(c.attackClip(1)).toBe('2H_Ranged_Shoot');
    expect(c.attackClip(2)).toBe('2H_Ranged_Aiming');
    expect(c.attackClip(3)).toBe('2H_Ranged_Shooting');
    expect(c.attackClip(4)).toBe('1H_Ranged_Shoot');
  });

  it('a single shot loosed at a hostile in front hurts it through the damage path and spends no bolt while the item is undefined', async () => {
    const t = await asPathfinder();
    const target = spawnHostile(t, -8);
    const c = t.ctx.player.avatar!.controller;
    expect(c.playAttack('2H_Ranged_Shoot')).toBe(true);
    await t.run(120);
    expect(target.health).toBeLessThan(target.maxHealth);
    expect(target.maxHealth - target.health).toBeCloseTo(PF.baseDamage, 0);
  });

  it('with the bolt item defined, one shot spends one bolt; at zero the swing is the dry butt and shoots nothing', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    const inv = t.ctx.services.require('inventory') as any;
    inv.add('crossbow-bolts', 1);
    const target = spawnHostile(t, -8);
    const c = t.ctx.player.avatar!.controller;
    const before = inv.count('crossbow-bolts');
    c.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    expect(inv.count('crossbow-bolts')).toBe(before - 1);
    const hp = target.health;
    expect(hp).toBeLessThan(target.maxHealth);
    inv.remove('crossbow-bolts', inv.count('crossbow-bolts'));
    c.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    expect(target.health).toBe(hp);
    expect(t.toasts).toContain('pathfinder.noBolts');
  });

  /** Learns the tier 1 and 2 skills and puts the two actives on the bar; returns the slots. */
  function arm(t: Awaited<ReturnType<typeof boot>>) {
    const p = t.ctx.services.require('progression') as any;
    p.grantSkillPoint(8, 'test');
    for (const id of ['tripwire', 'cinderTrap', 'trailblaze', 'falconEye']) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
    expect(p.assign(0, PF.skillIds.cinderTrap)).toBe(true);
    expect(p.assign(1, PF.skillIds.falconEye)).toBe(true);
    return t.ctx.services.require('abilities') as any;
  }

  it('Cinder Trap and Falcon Eye run on the real game: the eye refuses an empty field, the trap bursts under a hostile', async () => {
    const t = await asPathfinder();
    const abilities = arm(t);
    expect(abilities.use(1)).toMatchObject({ ok: false, detail: 'no-targets' });
    const target = spawnHostile(t, -2); // the trap lands 2 m ahead (forward is -Z at yaw 0)
    expect(abilities.use(0)).toEqual({ ok: true });
    await t.run(5);
    expect(target.health).toBe(target.maxHealth - PF.cinderTrap.damage);
    expect(abilities.use(1)).toEqual({ ok: true });
  });

  it('a class change clears a laid trap, so a hostile walking onto its spot is untouched', async () => {
    const t = await asPathfinder();
    const abilities = arm(t);
    const target = spawnHostile(t, -20);
    expect(abilities.use(0)).toEqual({ ok: true });
    t.ctx.events.emit('class.changed', { classId: 'knight', previous: 'pathfinder', free: true, cost: 0 } as never);
    await t.run(5);
    target.root!.position.set(t.ctx.player.feet.x, t.ctx.player.feet.y, t.ctx.player.feet.z - 2);
    await t.run(5);
    expect(target.health).toBe(target.maxHealth);
  });

  it('a save load clears a laid trap too and the game keeps ticking', async () => {
    const t = await asPathfinder();
    const abilities = arm(t);
    const target = spawnHostile(t, -20);
    abilities.use(0);
    t.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    target.root!.position.set(t.ctx.player.feet.x, t.ctx.player.feet.y, t.ctx.player.feet.z - 2);
    await t.run(10);
    expect(target.health).toBe(target.maxHealth);
    expect(t.ctx.player.avatar?.classId).toBe('pathfinder');
  });

  it('exposes the bolt count for the HUD: null as a Knight and while the item is undefined, { count, max } otherwise', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await boot();
    const svc = () => t.ctx.services.require('pathfinder');
    expect(svc().ammo()).toBeNull();
    t.ctx.state.setFlag(CLASS_OPEN_FLAG, true);
    t.ctx.services.require('classes').choose('pathfinder');
    await t.settle();
    const inv = t.ctx.services.require('inventory') as any;
    inv.add('crossbow-bolts', 7);
    expect(svc().ammo()).toEqual({ count: inv.count('crossbow-bolts'), max: 40 });
    delete ITEMS['crossbow-bolts'];
    expect(svc().ammo()).toBeNull();
  });

  it('counts master bolts in the HUD ammo total', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    ITEMS['master-bolts'] = { ...(BOLTS as object), id: 'master-bolts', nameKey: 'item.master-bolts.name', descKey: 'item.master-bolts.desc', stackMax: 20 } as never;
    const t = await boot();
    const svc = () => t.ctx.services.require('pathfinder');
    t.ctx.state.setFlag(CLASS_OPEN_FLAG, true);
    t.ctx.services.require('classes').choose('pathfinder');
    await t.settle();
    const inv = t.ctx.services.require('inventory') as any;
    const base = inv.count('crossbow-bolts');
    expect(svc().ammo()).toEqual({ count: base, max: 40 });
    inv.add('master-bolts', 5);
    expect(svc().ammo()).toEqual({ count: base + 5, max: 40 });
    delete ITEMS['master-bolts'];
    delete ITEMS['crossbow-bolts'];
  });

  it('is harmless as a Knight: a melee hit with a Knight clip lands in full', async () => {
    const t = await boot();
    const target = spawnHostile(t, -1);
    expect(t.ctx.services.require('classes').current()).toBe('knight');
    const hit = t.ctx.damage.apply({ attackerId: 'player', targetId: target.id, amount: 10, kind: 'melee', attackId: '1H_Melee_Attack_Slice_Horizontal' });
    expect(hit?.dealt).toBe(10);
    expect(t.toasts).not.toContain('pathfinder.noBolts');
  });

  it('while a shot swing plays, the crossbow sweep is voided but a bolt-id hit is not', async () => {
    const t = await asPathfinder();
    const target = spawnHostile(t, -30);
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(3);
    const sweep = t.ctx.damage.apply({ attackerId: 'player', targetId: target.id, amount: 10, kind: 'melee', attackId: '2H_Ranged_Shoot' });
    expect(sweep?.outcome).toBe('immune');
    expect(sweep?.dealt).toBe(0);
    const bolt = t.ctx.damage.apply({ attackerId: 'player', targetId: target.id, amount: 10, kind: 'melee', attackId: 'pathfinder.bolt.1' });
    expect(bolt?.dealt).toBe(10);
  });
});
