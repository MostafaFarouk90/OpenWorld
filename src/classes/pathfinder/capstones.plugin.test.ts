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
import pathfinderAct3Plugin from './act3.plugin';
import pathfinderCapstonesPlugin from './capstones.plugin';
import { PF } from './tuning';

vi.setConfig({ testTimeout: 30_000 });

const baseModules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/combat-verbs.plugin.ts': { default: combatVerbsPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/status.plugin.ts': { default: statusPlugin },
  '/src/test/classes.plugin.ts': { default: classesPlugin },
  '/src/test/pathfinder.plugin.ts': { default: pathfinderPlugin },
};
const modules: Record<string, PluginModule> = {
  ...baseModules,
  '/src/test/pathfinder-act3.plugin.ts': { default: pathfinderAct3Plugin },
  '/src/test/pathfinder-capstones.plugin.ts': { default: pathfinderCapstonesPlugin },
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

async function boot(list: Record<string, PluginModule> = modules) {
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
  const statuses = await game.loadPlugins(list);
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
  const press = (code: string) => win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
  const release = (code: string) => win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
  return { game, ctx, statuses, run, settle, toasts, world, press, release, moveModifiers };
}

async function asPathfinder(list: Record<string, PluginModule> = modules) {
  const t = await boot(list);
  t.ctx.state.setFlag(CLASS_OPEN_FLAG, true);
  expect(t.ctx.services.require('classes').choose('pathfinder')).toEqual({ ok: true });
  await t.settle();
  return t;
}


type T = Awaited<ReturnType<typeof boot>>;

const T1_4 = ['steadyShot', 'piercingBolt', 'tripwire', 'cinderTrap', 'trailblaze', 'falconEye', 'emberQuarrel', 'netLauncher', 'lightStep', 'tripleShot', 'caltropField', 'sureFoot'];
const BOLTS = { id: 'crossbow-bolts', nameKey: 'item.crossbow-bolts.name', descKey: 'item.crossbow-bolts.desc', kind: 'consumable', stackMax: 40 } as never;

/** Act 3 begun, the master's book given, tiers 1 to 4 and the one capstone `capstone` learned. */
function learn(t: T, capstone: 'dragonbaneBolt' | 'huntersWeb' | 'skyhawkStrike') {
  t.ctx.state.setFlag('story.gate.a3', true);
  t.ctx.state.setFlag('trainer.pathfinder.masterBook', true);
  const p = t.ctx.services.require('progression') as any;
  p.grantSkillPoint(100, 'test');
  for (const id of [...T1_4, capstone]) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
  return p;
}
const use = (t: T, id: string) => {
  const p = t.ctx.services.require('progression') as any;
  const slot = p.bar().indexOf(id);
  expect(slot, id).toBeGreaterThanOrEqual(0);
  return (t.ctx.services.require('abilities') as any).use(slot);
};
function hostileAt(t: T, dx: number, dz: number, maxHealth = 400) {
  const root = new THREE.Object3D();
  const f = t.ctx.player.feet;
  root.position.set(f.x + dx, f.y, f.z + dz);
  t.ctx.scene.add(root);
  root.updateMatrixWorld(true);
  return t.ctx.actors.spawn({ kind: 'dummy', team: 'hostile', maxHealth, maxPoise: 40, root });
}
const dealt = (t: T, attackId: string) => {
  const hits: Array<{ id: string; dealt: number; poise: number }> = [];
  t.ctx.events.on('damage.dealt', (d) => void (d.attackId === attackId && hits.push({ id: d.targetId, dealt: d.dealt, poise: (d as any).poiseDealt ?? NaN })));
  return hits;
};
const status = (t: T) => t.ctx.services.require('status') as any;

describe('pathfinder capstones plugin: boot and bar', () => {
  it('boots clean and the three capstones are actives with their cooldown and Ember cost', async () => {
    const t = await asPathfinder();
    expect(t.statuses.find((s) => s.id === 'pathfinder-capstones')?.state).toBe('ok');
    expect(getSkill(PF.skillIds.dragonbaneBolt)).toMatchObject({ kind: 'active', tier: 5, cost: 5, cooldown: 40, emberCost: 40, capstone: true });
    expect(getSkill(PF.skillIds.huntersWeb)).toMatchObject({ kind: 'active', tier: 5, cost: 5, cooldown: 45, emberCost: 35, capstone: true });
    expect(getSkill(PF.skillIds.skyhawkStrike)).toMatchObject({ kind: 'active', tier: 5, cost: 5, cooldown: 40, emberCost: 30, capstone: true });
    expect(t.toasts).toEqual([]);
  });

  it('only one capstone per character', async () => {
    const t = await asPathfinder();
    const p = learn(t, 'huntersWeb');
    expect(p.learn(PF.skillIds.dragonbaneBolt).ok).toBe(false);
    expect(p.learn(PF.skillIds.skyhawkStrike).ok).toBe(false);
  });

  it('setup twice (with and without a dispose between) leaves one registration; dispose removes the handlers and the yield floor', async () => {
    const t = await asPathfinder();
    learn(t, 'huntersWeb');
    expect(() => pathfinderCapstonesPlugin.setup(t.ctx)).not.toThrow();
    const abilities = t.ctx.services.require('abilities') as any;
    pathfinderCapstonesPlugin.dispose?.();
    pathfinderCapstonesPlugin.dispose?.();
    for (const id of [PF.skillIds.dragonbaneBolt, PF.skillIds.huntersWeb, PF.skillIds.skyhawkStrike]) {
      const r = abilities.registerHandler(id, () => ({ ok: true }));
      expect(r.ok, id).toBe(true);
      r.dispose();
    }
    const dispose = t.ctx.damage.addModifier(PF.yieldFloor.modifierId, () => {}, PF.yieldFloor.order);
    expect(typeof dispose).toBe('function');
    dispose();
  });
});

describe('pathfinder capstones plugin: Dragonbane Bolt on the real pipeline', () => {
  it('spends a bolt, 40 Ember and starts the cooldown; every foe in the line takes 56, the one off the line nothing', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    learn(t, 'dragonbaneBolt');
    const inv = t.ctx.services.require('inventory') as any;
    inv.remove('crossbow-bolts', inv.count('crossbow-bolts'));
    inv.add('crossbow-bolts', 3);
    const near = hostileAt(t, 0, -8);
    const mid = hostileAt(t, 0, -25);
    const far = hostileAt(t, 0, -55);
    const aside = hostileAt(t, 6, -25);
    const hits = dealt(t, PF.dragonbane.attackId);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    const bolts = inv.count('crossbow-bolts');
    expect(use(t, PF.skillIds.dragonbaneBolt)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - 40);
    expect(inv.count('crossbow-bolts')).toBe(bolts - 1);
    await t.run(90);
    expect(hits.map((h) => h.id).sort()).toEqual([near.id, mid.id, far.id].sort());
    for (const h of hits) expect(h.dealt).toBeCloseTo(56, 3);
    expect(aside.health).toBe(aside.maxHealth);
    expect(use(t, PF.skillIds.dragonbaneBolt)).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  it('a guard that blocks every hit does not stop it (unblockable); a boss takes it too', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    learn(t, 'dragonbaneBolt');
    (t.ctx.services.require('inventory') as any).add('crossbow-bolts', 3);
    const a = hostileAt(t, 0, -8);
    const boss = hostileAt(t, 0, -20);
    t.ctx.bosses.register(boss.id, { bossId: 'test-boss', nameKey: 'x', phases: [], breaksPerPhase: 3 });
    t.ctx.damage.addModifier('test.guard', (req, target) => {
      if (req.outcome === 'hit' && target.team === 'hostile') {
        req.outcome = 'blocked';
        req.amount = 0;
      }
    }, -50);
    const hits = dealt(t, PF.dragonbane.attackId);
    expect(use(t, PF.skillIds.dragonbaneBolt)).toEqual({ ok: true });
    await t.run(60);
    expect(hits.map((h) => h.id).sort()).toEqual([a.id, boss.id].sort());
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(boss.health).toBeLessThan(boss.maxHealth);
  });

  it('passes through a foe in a mercy state and refuses no-ammo with nothing spent', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    learn(t, 'dragonbaneBolt');
    const inv = t.ctx.services.require('inventory') as any;
    inv.remove('crossbow-bolts', inv.count('crossbow-bolts'));
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    expect(use(t, PF.skillIds.dragonbaneBolt)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-ammo' });
    expect(spells.ember).toBe(ember);
    inv.add('crossbow-bolts', 1);
    const kneeling = hostileAt(t, 0, -8);
    (kneeling as any).mercyState = () => 'yielding';
    const clean = hostileAt(t, 0, -16);
    expect(use(t, PF.skillIds.dragonbaneBolt)).toEqual({ ok: true });
    await t.run(60);
    expect(kneeling.health).toBe(kneeling.maxHealth);
    expect(clean.health).toBeLessThan(clean.maxHealth);
    expect(inv.count('crossbow-bolts')).toBe(0);
  });

  it('a class change in flight drops the bolt: nothing lands', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    learn(t, 'dragonbaneBolt');
    (t.ctx.services.require('inventory') as any).add('crossbow-bolts', 1);
    const a = hostileAt(t, 0, -50);
    expect(use(t, PF.skillIds.dragonbaneBolt)).toEqual({ ok: true });
    await t.run(3);
    t.ctx.events.emit('class.changed', { classId: 'knight', previous: 'pathfinder' } as never);
    await t.run(60);
    expect(a.health).toBe(a.maxHealth);
  });

  it('launchBolt is inert when unused and refuses a bad spec before taking ammo', async () => {
    ITEMS['crossbow-bolts'] = BOLTS;
    const t = await asPathfinder();
    const inv = t.ctx.services.require('inventory') as any;
    inv.remove('crossbow-bolts', inv.count('crossbow-bolts'));
    inv.add('crossbow-bolts', 2);
    const svc = t.ctx.services.require('pathfinder') as any;
    expect(typeof svc.launchBolt).toBe('function');
    const base = { origin: { x: 0, y: 1, z: 0 }, speed: 50, lifetime: 1, radius: 0.1, ammo: true, onHit: () => {} };
    expect(svc.launchBolt({ ...base, direction: { x: 0, y: 0, z: 0 } })).toEqual({ ok: false, reason: 'refused' });
    expect(svc.launchBolt({ ...base, direction: { x: NaN, y: 0, z: 1 } })).toEqual({ ok: false, reason: 'refused' });
    expect(inv.count('crossbow-bolts')).toBe(2);
    expect(svc.launchBolt({ ...base, direction: { x: 0, y: 0, z: 1 } })).toEqual({ ok: true, master: false });
    expect(inv.count('crossbow-bolts')).toBe(1);
    // Without the ammo flag nothing is taken.
    expect(svc.launchBolt({ ...base, ammo: false, direction: { x: 0, y: 0, z: 1 } })).toEqual({ ok: true, master: false });
    expect(inv.count('crossbow-bolts')).toBe(1);
    inv.remove('crossbow-bolts', 1);
    expect(svc.launchBolt({ ...base, direction: { x: 0, y: 0, z: 1 } })).toEqual({ ok: false, reason: 'no-ammo' });
  });
});

describe("pathfinder capstones plugin: Hunter's Web on the real pipeline", () => {
  it('arms 1 s, then pops: foes inside 12 m take 0.8x base and a 4 s root, a boss a 0.5 slow, foes outside and in a mercy state nothing', async () => {
    const t = await asPathfinder();
    learn(t, 'huntersWeb');
    const a = hostileAt(t, 3, 0);
    const b = hostileAt(t, 0, -9);
    const boss = hostileAt(t, -6, -6);
    t.ctx.bosses.register(boss.id, { bossId: 'test-boss', nameKey: 'x', phases: [], breaksPerPhase: 3 });
    const outside = hostileAt(t, 15, 0);
    const kneeling = hostileAt(t, 2, 2);
    (kneeling as any).mercyState = () => 'yielding';
    const hits = dealt(t, PF.huntersWeb.attackId);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    expect(use(t, PF.skillIds.huntersWeb)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - 35);
    await t.run(40);
    expect(hits).toEqual([]);
    await t.run(30);
    expect(hits.map((h) => h.id).sort()).toEqual([a.id, b.id, boss.id].sort());
    for (const h of hits) expect(h.dealt).toBeCloseTo(11.2, 3);
    const st = status(t);
    expect(st.list(a.id).map((e: any) => e.id)).toContain(PF.huntersWeb.rootStatusId);
    expect(st.list(b.id).map((e: any) => e.id)).toContain(PF.huntersWeb.rootStatusId);
    expect(st.list(boss.id).map((e: any) => e.id)).toContain(PF.huntersWeb.slowStatusId);
    expect(st.list(boss.id).map((e: any) => e.id)).not.toContain(PF.huntersWeb.rootStatusId);
    expect(outside.health).toBe(outside.maxHealth);
    expect(kneeling.health).toBe(kneeling.maxHealth);
    expect(st.list(kneeling.id)).toEqual([]);
    expect(use(t, PF.skillIds.huntersWeb)).toMatchObject({ ok: false, reason: 'cooldown' });
    // The root lapses at 4 s (8 s of margin).
    await t.run(60 * 5);
    expect(st.list(a.id).map((e: any) => e.id)).not.toContain(PF.huntersWeb.rootStatusId);
  });

  it('refuses no-target with no foe within 12 m, spending nothing', async () => {
    const t = await asPathfinder();
    learn(t, 'huntersWeb');
    hostileAt(t, 14, 0);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    expect(use(t, PF.skillIds.huntersWeb)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-target' });
    expect(spells.ember).toBe(ember);
  });

  it.each(['class.changed', 'actor.died', 'save.loaded'])('%s ends an armed web unpopped', async (end) => {
    const t = await asPathfinder();
    learn(t, 'huntersWeb');
    const a = hostileAt(t, 3, 0);
    expect(use(t, PF.skillIds.huntersWeb)).toEqual({ ok: true });
    await t.run(20);
    if (end === 'actor.died') t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id, killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    else t.ctx.events.emit(end as never, { slot: 'x', classId: 'knight' } as never);
    await t.run(90);
    expect(a.health).toBe(a.maxHealth);
  });
});

describe('pathfinder capstones plugin: Skyhawk Strike on the real pipeline', () => {
  const planar = (t: T, a: { x: number; z: number }) => Math.hypot(t.ctx.player.feet.x - a.x, t.ctx.player.feet.z - a.z);
  const posOf = (t: T, id: string) => {
    const v = new THREE.Vector3();
    t.ctx.actors.get(id)!.worldPosition(v);
    return v;
  };

  it('strikes the foe ahead (35, stun 1 s) and carries her to 2 m short of it, unhurt in the air and hurt after', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    const foe = hostileAt(t, 0, -10);
    const hits = dealt(t, PF.skyhawk.attackId);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    const start = { x: t.ctx.player.feet.x, z: t.ctx.player.feet.z };
    expect(use(t, PF.skillIds.skyhawkStrike)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - 30);
    await t.run(10);
    // In the air: nothing hurts her.
    const player = t.ctx.actors.player;
    const hp = player.health;
    t.ctx.damage.apply({ attackerId: foe.id, targetId: player.id, amount: 20, poise: 0, kind: 'melee', attackId: 'x' });
    expect(player.health).toBe(hp);
    await t.run(15);
    expect(hits).toHaveLength(1);
    expect(hits[0].dealt).toBeCloseTo(35, 3);
    expect(status(t).list(foe.id).map((e: any) => e.id)).toContain(PF.skyhawk.stunStatusId);
    await t.run(105);
    // The stun lasted its second.
    expect(status(t).list(foe.id).map((e: any) => e.id)).not.toContain(PF.skyhawk.stunStatusId);
    // She landed about 2 m short of the foe (physics settle: a metre either way), on her side of it.
    const gap = planar(t, posOf(t, foe.id));
    expect(gap).toBeGreaterThan(1);
    expect(gap).toBeLessThan(3.5);
    expect(Math.hypot(t.ctx.player.feet.x - start.x, t.ctx.player.feet.z - start.z)).toBeGreaterThan(5);
    // Landed: vulnerable again.
    t.ctx.damage.apply({ attackerId: foe.id, targetId: player.id, amount: 20, poise: 0, kind: 'melee', attackId: 'y' });
    expect(player.health).toBeLessThan(hp);
    expect(use(t, PF.skillIds.skyhawkStrike)).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  it('a boss takes the hit and is not stunned', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    const boss = hostileAt(t, 0, -10);
    t.ctx.bosses.register(boss.id, { bossId: 'test-boss', nameKey: 'x', phases: [], breaksPerPhase: 3 });
    expect(use(t, PF.skillIds.skyhawkStrike)).toEqual({ ok: true });
    await t.run(120);
    expect(boss.health).toBeLessThan(boss.maxHealth);
    expect(status(t).list(boss.id)).toEqual([]);
  });

  it('with no foe it carries her about 20 m ahead (the gap crossing) and deals no damage', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    const start = { x: t.ctx.player.feet.x, z: t.ctx.player.feet.z };
    const hits = dealt(t, PF.skyhawk.attackId);
    expect(use(t, PF.skillIds.skyhawkStrike)).toEqual({ ok: true });
    await t.run(180);
    const moved = Math.hypot(t.ctx.player.feet.x - start.x, t.ctx.player.feet.z - start.z);
    expect(moved).toBeGreaterThan(15);
    expect(moved).toBeLessThan(23);
    expect(t.ctx.player.feet.z).toBeLessThan(start.z);
    expect(hits).toEqual([]);
  });

  it('is refused in glide, dive, ferry and haul modes, spending nothing', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    hostileAt(t, 0, -10);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    for (const mode of ['glide', 'dive', 'ferry', 'haul']) {
      (t.ctx.services.require('movementMode') as any).set(mode);
      expect(use(t, PF.skillIds.skyhawkStrike), mode).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'movement' });
    }
    (t.ctx.services.require('movementMode') as any).set('walk');
    expect(spells.ember).toBe(ember);
  });

  it('a containment service with a closed strip in the way skips the carry; the strike still lands', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    const f = t.ctx.player.feet;
    const z0 = f.z;
    // A closed strip 5 to 14 m ahead, as a closed hole is cut out of the open area (the real Containment is in the unit tests).
    const containment = {
      closed: true,
      isOpen: (_x: number, z: number) => !(containment.closed && z < z0 - 5 && z > z0 - 14),
      clamp: <T2 extends { x: number; z: number }>(at: T2) => at,
    };
    t.ctx.services.provide('containment' as never, containment as never);
    const foe = hostileAt(t, 0, -20);
    const start = { x: f.x, z: f.z };
    expect(use(t, PF.skillIds.skyhawkStrike)).toEqual({ ok: true });
    await t.run(120);
    expect(foe.health).toBeLessThan(foe.maxHealth);
    expect(Math.hypot(f.x - start.x, f.z - start.z)).toBeLessThan(0.5);
  });

  it('death mid-carry releases the invulnerability and drops the strike', async () => {
    const t = await asPathfinder();
    learn(t, 'skyhawkStrike');
    const foe = hostileAt(t, 0, -12);
    expect(use(t, PF.skillIds.skyhawkStrike)).toEqual({ ok: true });
    await t.run(5);
    t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id, killerId: null, kind: 'player', team: 'player', level: 1 } as never);
    await t.run(60);
    expect(foe.health).toBe(foe.maxHealth);
    const player = t.ctx.actors.player;
    expect(player.invulnerable).toBe(false);
  });
});
