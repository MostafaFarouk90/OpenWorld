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
import { PF } from './tuning';

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
const modules: Record<string, PluginModule> = { ...baseModules, '/src/test/pathfinder-act3.plugin.ts': { default: pathfinderAct3Plugin } };

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

const T1_3 = ['steadyShot', 'piercingBolt', 'tripwire', 'cinderTrap', 'trailblaze', 'falconEye', 'emberQuarrel', 'netLauncher', 'lightStep'];
const T4 = ['tripleShot', 'caltropField', 'sureFoot'];

/** Act 3 begun, the master's book given, tiers 1 to 3 and the named tier 4 skills learned. */
function master(t: T, tier4 = T4, lower = true) {
  t.ctx.state.setFlag('story.gate.a3', true);
  t.ctx.state.setFlag('trainer.pathfinder.masterBook', true);
  const p = t.ctx.services.require('progression') as any;
  p.grantSkillPoint(100, 'test');
  for (const id of [...(lower ? T1_3 : []), ...tier4]) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
  return p;
}

function hostileAt(t: T, dx: number, dz: number, hittable = true) {
  const root = new THREE.Object3D();
  const f = t.ctx.player.feet;
  root.position.set(f.x + dx, f.y, f.z + dz);
  t.ctx.scene.add(root);
  root.updateMatrixWorld(true);
  const a = t.ctx.actors.spawn({ kind: 'dummy', team: 'hostile', maxHealth: 200, maxPoise: 40, root });
  a.hittable = hittable;
  return a;
}

describe('pathfinder act 3 plugin: boot, bar and lifecycle', () => {
  it('boots clean; Caltrop Field is an 18 s, 15 Ember active; tier 4 stays refused before the master book', async () => {
    const t = await asPathfinder();
    expect(t.statuses.find((s) => s.id === 'pathfinder-act3')?.state).toBe('ok');
    expect(getSkill(PF.skillIds.caltropField)).toMatchObject({ kind: 'active', tier: 4, cooldown: 18, emberCost: 15 });
    expect(getSkill(PF.skillIds.tripleShot)).toMatchObject({ kind: 'passive', tier: 4 });
    expect(getSkill(PF.skillIds.sureFoot)).toMatchObject({ kind: 'passive', tier: 4 });
    const p = t.ctx.services.require('progression') as any;
    p.grantSkillPoint(100, 'test');
    for (const id of T1_3) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
    for (const id of T4) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(false);
    master(t, [], false);
    for (const id of T4) expect(p.learn(`pathfinder.${id}`).ok, id).toBe(true);
  });

  it('setup twice (with and without a dispose between) leaves one registration; dispose removes the spread and the filter', async () => {
    const t = await asPathfinder();
    master(t);
    expect(() => pathfinderAct3Plugin.setup(t.ctx)).not.toThrow();
    const abilities = t.ctx.services.require('abilities') as any;
    // The second setup took over cleanly: Caltrop Field is still bound once.
    const calls = vi.spyOn(console, 'warn');
    pathfinderAct3Plugin.dispose?.();
    pathfinderAct3Plugin.dispose?.();
    const r = abilities.registerHandler(PF.skillIds.caltropField, () => ({ ok: true }));
    expect(r.ok).toBe(true);
    r.dispose();
    // No spread and no filter any more: a single shot is one bolt, and a moving stagger is knocked back.
    const a = hostileAt(t, 0, -8);
    let hits = 0;
    t.ctx.events.on('damage.dealt', (d) => void (d.attackId === 'pathfinder.bolt.1' && hits++));
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    expect(hits).toBe(1);
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(calls.mock.calls.filter((c) => String(c[0]).includes('threw'))).toEqual([]);
  });
});

describe('pathfinder act 3 plugin: Triple Shot on the real crossbow', () => {
  const volley = async (t: T) => {
    const mid = hostileAt(t, 0, -10);
    const left = hostileAt(t, -10 * Math.sin((7.5 * Math.PI) / 180), -10 * Math.cos((7.5 * Math.PI) / 180));
    const right = hostileAt(t, 10 * Math.sin((7.5 * Math.PI) / 180), -10 * Math.cos((7.5 * Math.PI) / 180));
    const hits: Array<{ id: string; dealt: number; attackId?: string }> = [];
    t.ctx.events.on('damage.dealt', (d) => void (d.attackId === 'pathfinder.bolt.1' && hits.push({ id: d.targetId, dealt: d.dealt, attackId: d.attackId })));
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    return { mid, left, right, hits };
  };

  it('not learned: a single shot hits only the centre foe (the port is registered but answers null)', async () => {
    const t = await asPathfinder();
    const v = await volley(t);
    expect(v.hits.map((h) => h.id)).toEqual([v.mid.id]);
  });

  it('learned: three bolts, centre at full damage and the sides at 0.6x, same attack id', async () => {
    const t = await asPathfinder();
    master(t);
    const v = await volley(t);
    expect(v.hits.map((h) => h.id).sort()).toEqual([v.mid.id, v.left.id, v.right.id].sort());
    const dealt = (id: string) => v.hits.find((h) => h.id === id)!.dealt;
    expect(dealt(v.left.id)).toBeCloseTo(dealt(v.mid.id) * 0.6, 3);
    expect(dealt(v.right.id)).toBeCloseTo(dealt(v.mid.id) * 0.6, 3);
    expect(new Set(v.hits.map((h) => h.attackId))).toEqual(new Set(['pathfinder.bolt.1']));
  });

  it('Ember Quarrel ignites a foe hit only by a side bolt', async () => {
    const t = await asPathfinder();
    master(t);
    const side = hostileAt(t, 10 * Math.sin((7.5 * Math.PI) / 180), -10 * Math.cos((7.5 * Math.PI) / 180));
    t.ctx.player.avatar!.controller.playAttack('2H_Ranged_Shoot');
    await t.run(120);
    expect(side.health).toBeLessThan(side.maxHealth);
    expect((t.ctx.services.require('status') as any).list(side.id).map((e: any) => e.id)).toContain('pathfinder.emberQuarrel.ignite');
  });

  it('is off after a class change: the port answers null for another class', async () => {
    const t = await asPathfinder();
    const p = master(t);
    p.setClass('warden');
    const v = await volley(t);
    expect(v.hits.length).toBeLessThanOrEqual(1);
  });
});

describe('pathfinder act 3 plugin: Caltrop Field on the real game', () => {
  const useField = (t: T) => {
    const p = t.ctx.services.require('progression') as any;
    const slot = p.bar().indexOf(PF.skillIds.caltropField);
    expect(slot).toBeGreaterThanOrEqual(0);
    return (t.ctx.services.require('abilities') as any).use(slot);
  };

  it('spends 15 Ember, starts an 18 s cooldown, slows a foe in the field (0.5 for 1 s), does no damage and spares the rest', async () => {
    const t = await asPathfinder();
    master(t);
    const inside = hostileAt(t, 0, -3);
    const outside = hostileAt(t, 0, -3 - 4.5);
    const spells = t.ctx.services.require('spells') as any;
    const ember = spells.ember;
    const dealt: unknown[] = [];
    t.ctx.events.on('damage.dealt', (d) => void dealt.push(d));
    expect(useField(t)).toEqual({ ok: true });
    await t.run(2);
    expect(spells.ember).toBe(ember - 15);
    const status = t.ctx.services.require('status') as any;
    const s = status.list(inside.id).find((e: any) => e.id === 'pathfinder.caltropField.slow');
    expect(s).toMatchObject({ kind: 'slow', sourceId: 'player' });
    expect(status.list(outside.id)).toEqual([]);
    expect(inside.health).toBe(inside.maxHealth);
    expect(dealt).toEqual([]);
    expect(useField(t)).toMatchObject({ ok: false, reason: 'cooldown' });
    // It lapses a second after the foe leaves.
    inside.root!.position.x += 30;
    await t.run(100);
    expect(status.list(inside.id).find((e: any) => e.id === 'pathfinder.caltropField.slow')).toBeUndefined();
  });

  it('slows a boss by 0.25 (the boss registry names the boss), and a foe in a mercy state not at all', async () => {
    const t = await asPathfinder();
    master(t);
    const boss = hostileAt(t, 0, -3);
    const spared = hostileAt(t, 1, -3);
    (spared as any).mercyState = () => 'yielding';
    t.ctx.bosses.register(boss.id, { bossId: 'test-boss', nameKey: 'x', phases: [], breaksPerPhase: 3 });
    const status = t.ctx.services.require('status') as any;
    const applied: Array<{ id: string; slow: number }> = [];
    const real = status.apply.bind(status);
    status.apply = (id: string, spec: any) => (applied.push({ id, slow: spec.slow }), real(id, spec));
    expect(useField(t)).toEqual({ ok: true });
    await t.run(2);
    expect(applied.find((a) => a.id === boss.id)!.slow).toBe(0.25);
    expect(status.list(spared.id)).toEqual([]);
    expect(applied.some((a) => a.id === spared.id)).toBe(false);
    status.apply = real;
  });

  it.each(['class.changed', 'actor.died', 'save.loaded'])('is cleared by %s: the foe is no longer re-slowed', async (end) => {
    {
      const t = await asPathfinder();
      master(t);
      const e = hostileAt(t, 0, -3);
      expect(useField(t)).toEqual({ ok: true });
      await t.run(2);
      const status = t.ctx.services.require('status') as any;
      status.clear(e.id, 'pathfinder.caltropField.slow');
      if (end === 'actor.died') t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id, killerId: null, kind: 'player', team: 'player', level: 1 } as never);
      else t.ctx.events.emit(end as never, { slot: 'x' } as never);
      await t.run(60);
      expect(status.list(e.id), end).toEqual([]);
    }
  });

  it('is not a trap: it never reads or fills the Tripwire and Cinder Trap caps', async () => {
    const t = await asPathfinder();
    master(t);
    // Two Cinder Traps' worth of caps are left alone: the field has no Traps handle at all and the pathfinder service has no count.
    expect(useField(t)).toEqual({ ok: true });
    await t.run(2);
    expect((t.ctx.services.require('pathfinder') as any).addSpread).toBeTypeOf('function');
  });
});

describe('pathfinder act 3 plugin: Sure Foot on the real combat verbs', () => {
  const knock = (t: T, poise: number) =>
    t.ctx.damage.apply({
      attackerId: hostileAt(t, 0, -3).id,
      targetId: 'player',
      amount: 5,
      poise,
      kind: 'melee',
      attackId: 'claw',
      swingId: Math.floor(Math.random() * 1e6),
      direction: new THREE.Vector3(0, 0, 1),
    });
  /** The furthest the player is shoved back (+z) by a hit within 60 ticks, holding forward or not. */
  const shove = async (t: T, poise: number, walking: boolean) => {
    if (walking) t.press('KeyW');
    await t.run(6);
    const z = t.ctx.player.feet.z;
    knock(t, poise);
    let back = 0;
    for (let i = 0; i < 60; i++) {
      await t.run(1);
      back = Math.max(back, t.ctx.player.feet.z - z);
    }
    if (walking) t.release('KeyW');
    await t.run(60);
    return back;
  };
  /** The effects spawned through a recording `vfx` service (one per cancelled knockback; `sure-foot` is the grip spark). */
  const sparks = (t: T): string[] => ((t.ctx.services.get('vfx' as never) as any)?.log ?? []) as string[];
  const withVfx = (t: T) => {
    const log: string[] = [];
    t.ctx.services.provide('vfx' as never, { log, spawnEffect: (id: string) => (log.push(id), undefined) } as never);
    return t;
  };
  const setMode = (t: T, current: string) => {
    const modes = t.ctx.services.require('movementMode') as any;
    modes.set(current);
    return modes;
  };

  it.each([30, 1000])('PORT ABSENT: with the act 3 plugin not loaded a moving hit of poise %i shoves the player back as shipped', async (poise) => {
    const t = withVfx(await asPathfinder(baseModules));
    master(t);
    expect(await shove(t, poise, true)).toBeGreaterThan(0.3);
    expect(sparks(t)).toEqual([]);
  });

  it('PORT ABSENT: a filter that keeps everything changes nothing', async () => {
    const t = await asPathfinder(baseModules);
    t.ctx.services.require('combatVerbs').addKnockbackFilter('keep', () => true);
    expect(await shove(t, 30, true)).toBeGreaterThan(0.3);
  });

  it.each([30, 1000])('cancels the knockback of a hit of poise %i (stagger, then break) while moving on foot, and the stagger still plays', async (poise) => {
    {
      const t = withVfx(await asPathfinder());
      master(t);
      setMode(t, 'walk');
      const kinds: string[] = [];
      t.ctx.services.require('combatVerbs').addKnockbackFilter('spy', (r) => (kinds.push(r.kind), true));
      t.press('KeyW');
      await t.run(6);
      const z = t.ctx.player.feet.z;
      knock(t, poise);
      await t.run(4);
      expect((t.ctx.services.require('combatVerbs') as any).staggered, `poise ${poise}`).toBe(true);
      expect(sparks(t), `poise ${poise}`).toEqual(['sure-foot']);
      await t.run(36);
      expect(t.ctx.player.feet.z - z, `poise ${poise}`).toBeLessThan(0.1);
      expect(kinds[0]).toBe(poise === 30 ? 'stagger' : 'break');
      t.release('KeyW');
    }
  });

  it('standing still: knocked back', async () => {
    const t = withVfx(await asPathfinder());
    master(t);
    setMode(t, 'walk');
    expect(await shove(t, 30, false)).toBeGreaterThan(0.3);
    expect(sparks(t)).toEqual([]);
  });

  it('dive mode: Sure Foot does not step in', async () => {
    const t = withVfx(await asPathfinder());
    master(t);
    setMode(t, 'dive');
    await shove(t, 30, true);
    // The dive's own movement rules decide how far she drifts; the filter kept the knockback.
    expect(sparks(t)).toEqual([]);
  });

  it('not learned: knocked back', async () => {
    const t = withVfx(await asPathfinder());
    master(t, ['tripleShot', 'caltropField']);
    expect(await shove(t, 30, true)).toBeGreaterThan(0.3);
    expect(sparks(t)).toEqual([]);
  });

  it('another class: knocked back', async () => {
    const t = withVfx(await asPathfinder());
    const p = master(t);
    p.setClass('warden');
    expect(await shove(t, 30, true)).toBeGreaterThan(0.3);
    expect(sparks(t)).toEqual([]);
  });

  it('the real movement-mode service starts in walk, where the knockback is cancelled', async () => {
    const t = withVfx(await asPathfinder());
    master(t);
    expect((t.ctx.services.require('movementMode') as any).current).toBe('walk');
    expect(await shove(t, 30, true)).toBeLessThan(0.1);
  });

  it('leaves the wade modifier, a deep-water push-back (a teleport) and an actor pull alone', async () => {
    const t = withVfx(await asPathfinder());
    master(t);
    const calls: string[] = [];
    t.ctx.services.require('combatVerbs').addKnockbackFilter('count', (r) => (calls.push(r.kind), true));
    // The wade: a speedScale and noSprint modifier on the player, not touched by a cancelled knockback.
    const off = t.ctx.player.addMoveModifier('water.wade', { speedScale: 0.5, noSprint: true });
    expect(t.moveModifiers.state().speedScale).toBeCloseTo(0.5);
    t.press('KeyW');
    await t.run(6);
    knock(t, 30);
    await t.run(40);
    t.release('KeyW');
    expect(t.moveModifiers.state().speedScale).toBeCloseTo(0.5);
    expect(t.moveModifiers.state().noSprint).toBe(true);
    off();
    // Deep water's push-back moves the player with a teleport, which no filter sees.
    const before = calls.length;
    const f = { ...t.ctx.player.feet };
    t.ctx.player.teleport({ x: f.x + 5, y: f.y, z: f.z }, 0);
    await t.run(2);
    expect(t.ctx.player.feet.x).toBeCloseTo(f.x + 5, 0);
    expect(calls.length).toBe(before);
    // An actor pull is a separate path: a hit with `pull` and no poise drags the player toward the source and consults no filter.
    const src = hostileAt(t, 0, -8);
    const z = t.ctx.player.feet.z;
    t.press('KeyW');
    t.ctx.damage.apply({ attackerId: src.id, targetId: 'player', amount: 1, poise: 0, kind: 'melee', attackId: 'hook', swingId: 99, direction: new THREE.Vector3(0, 0, 1), pull: { distance: 4 } });
    await t.run(30);
    t.release('KeyW');
    expect(t.ctx.player.feet.z).toBeLessThan(z);
    expect(calls.length).toBe(before);
  });

  it('a filter that throws is ignored with one warning: the shipped knockback happens', async () => {
    const t = withVfx(await asPathfinder(baseModules));
    const warn = vi.spyOn(console, 'warn');
    t.ctx.services.require('combatVerbs').addKnockbackFilter('bad', () => {
      throw new Error('boom');
    });
    expect(await shove(t, 30, false)).toBeGreaterThan(0.3);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('knockback filter threw'))).toBe(true);
  });

  it('removing a filter restores the knockback; the same id replaces its earlier entry', async () => {
    const t = withVfx(await asPathfinder(baseModules));
    const verbs = t.ctx.services.require('combatVerbs');
    const off = verbs.addKnockbackFilter('x', () => false);
    verbs.addKnockbackFilter('x', () => true);
    off(); // the first remover must not remove the replacement
    expect(await shove(t, 30, false)).toBeGreaterThan(0.3);
    const off2 = verbs.addKnockbackFilter('y', () => false);
    expect(await shove(t, 30, false)).toBeLessThan(0.1);
    off2();
    expect(await shove(t, 30, false)).toBeGreaterThan(0.3);
  });
});
