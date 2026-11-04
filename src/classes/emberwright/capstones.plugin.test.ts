import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../../characters/KnightAvatar';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import combatVerbsPlugin from '../../player/combatVerbs.plugin';
import progressionPlugin from '../../progression/progression.plugin';
import { resetClassSkills } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import classesPlugin from '../classes.plugin';
import statusPlugin from '../../status/status.plugin';
import emberwrightAct3Plugin from './act3.plugin';
import emberwrightCapstonesPlugin from './capstones.plugin';
import emberwrightPlugin from './emberwright.plugin';
import { SKILL } from './skills';
import { getSkill } from '../../progression/skills';
import { BOLT, CAPSTONE_SKILL, COLOSSUS, KEEPERS_BREATH, SUNFIRE_NOVA } from './tuning';

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

let warns: string[] = [];
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warns = [];
  vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void warns.push(String(m)));
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetClassSkills();
});
afterEach(() => vi.restoreAllMocks());

const plugins = [corePlugin, statusPlugin, progressionPlugin, inventoryPlugin, combatVerbsPlugin, spellsPlugin, classesPlugin, emberwrightPlugin, emberwrightAct3Plugin, emberwrightCapstonesPlugin];
const modules = (list = plugins): Record<string, PluginModule> => Object.fromEntries(list.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot(list = plugins) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const ctx = game.ctx;
  ctx.state.setFlag('tutorial.complete', true);
  ctx.input.bindings.rebind('dodge', 0, { device: 'key', code: 'KeyN' });
  const statuses = await game.loadPlugins(modules(list));
  const avatar = new KnightAvatar({ model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null }, { warn: () => {} });
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (code: string) => win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
  const release = (code: string) => win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
  run(2);
  const progression = () => ctx.services.require('progression');
  /** The Emberwright with Act 3 begun, the master's book given and every tier 1 to 4 skill learned. */
  const asMaster = () => {
    ctx.state.setFlag('story.gate.a3', true);
    ctx.state.setFlag('trainer.emberwright.masterBook', true);
    progression().setClass('emberwright');
    progression().grantSkillPoint(40, 'test');
    for (const id of Object.values(SKILL)) progression().learn(id);
  };
  const enemy = (z: number, yaw = 0, x = 0, kind = 'blighted-soldier') => {
    const root = new THREE.Object3D();
    root.position.set(world.spawn.x + x, world.spawn.y, world.spawn.z + z);
    root.rotation.y = yaw;
    scene.add(root);
    root.updateMatrixWorld(true);
    return ctx.actors.spawn({ kind, team: 'hostile', maxHealth: 200, maxPoise: 20, root });
  };
  const slotOf = (id: string) => progression().bar().indexOf(id);
  /** The bar holds six; the Emberwright has more actives than that by tier 4, so a skill not on it is put in slot 0 first. */
  const use = (id: string) => {
    if (slotOf(id) < 0) progression().assign(0, id);
    return ctx.services.require('abilities').use(slotOf(id));
  };
  const lockOn = (id: string | null) => Object.defineProperty(ctx.services.require('lockOn'), 'targetId', { get: () => id, configurable: true });
  return { game, ctx, world, statuses, run, press, release, progression, asMaster, enemy, slotOf, use, lockOn };
}

type Booted = Awaited<ReturnType<typeof boot>>;

const DIED = { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never;
const igniteIds = (t: Booted, id: string) => t.ctx.services.require('status').list(id).filter((s) => s.kind === 'ignite').map((s) => s.id);
/** The Emberwright with Act 3 begun, the book given and only the capstone `id` learned on top of the tier 1 to 4 skills. */
const asCapstone = (t: Booted, id: string) => {
  t.ctx.state.setFlag('story.gate.a3', true);
  t.ctx.state.setFlag('trainer.emberwright.masterBook', true);
  t.progression().setClass('emberwright');
  t.progression().grantSkillPoint(60, 'test');
  for (const sid of Object.values(SKILL)) t.progression().learn(sid);
  expect(t.progression().learn(id)).toMatchObject({ ok: true });
  expect(t.progression().learned(id)).toBe(true);
};
const controller = (t: Booted) => t.ctx.world.avatar!.controller as unknown as { currentAction: string | null };
const untilIdle = (t: Booted) => {
  for (let i = 0; i < 180 && controller(t).currentAction !== null; i++) t.run(1);
  t.run(1);
};
const hitPlayer = (t: Booted, from: string, over: Record<string, unknown> = {}) =>
  t.ctx.damage.apply({ attackerId: from, targetId: 'player', amount: 1, poise: 0, kind: 'melee', attackId: 'test.hit', ...over });
const dodge = (t: Booted) => {
  t.run(2);
  t.press('KeyN');
  t.run(2);
  t.release('KeyN');
};
const ticks = (seconds: number) => Math.round(seconds * 60);

describe('emberwright capstones plugin: boot and bar', () => {
  it('boots clean and the three capstone rows carry their cooldown and Ember cost (cost stays 5)', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'emberwright-capstones')?.state).toBe('ok');
    t.asMaster();
    expect(getSkill(CAPSTONE_SKILL.sunfireNova)).toMatchObject({ kind: 'active', cooldown: 45, emberCost: 40, cost: 5, capstone: true });
    expect(getSkill(CAPSTONE_SKILL.colossusOfSlag)).toMatchObject({ kind: 'active', cooldown: 90, emberCost: 50, cost: 5, capstone: true });
    expect(getSkill(CAPSTONE_SKILL.breathOfTheKeepers)).toMatchObject({ kind: 'active', cooldown: 30, emberCost: 35, cost: 5, capstone: true });
    expect(warns.filter((w) => w.includes('emberwright'))).toEqual([]);
  });

  it('only one capstone can be learned', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    expect(t.progression().learn(CAPSTONE_SKILL.colossusOfSlag)).toMatchObject({ ok: false, reason: 'excluded' });
    expect(t.progression().learned(CAPSTONE_SKILL.colossusOfSlag)).toBe(false);
  });

  it('is refused in another class, unlearned, and a second setup replaces the first without duplicate registrations', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    t.enemy(-5);
    t.progression().setClass('warden');
    t.progression().assign(0, CAPSTONE_SKILL.sunfireNova);
    expect(t.ctx.services.require('abilities').use(0)).toMatchObject({ ok: false });
    // A second setup on the same context starts from nothing (no duplicate lethal handler or system).
    expect(() => emberwrightCapstonesPlugin.setup(t.ctx)).not.toThrow();
    expect(() => emberwrightCapstonesPlugin.setup(t.ctx)).not.toThrow();
    t.run(5);
    expect(warns.filter((w) => w.includes('already registered'))).toEqual([]);
  });
});

describe('emberwright capstones plugin: Sunfire Nova on the real pipeline', () => {
  it('charges 0.6 s, then a 10 m ring hits each foe once for 30 fire damage and poise 40, ignites it, and the ground burns; costs 40 Ember and starts the cooldown', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    // Margins either side of the 10 m edge: the player's feet settle off the spawn (the exact edge is pinned in capstones.test.ts).
    const a = t.enemy(-5);
    const edge = t.enemy(-9);
    const out = t.enemy(-11.5);
    const mercy = t.enemy(-3, 0, 2);
    mercy.mercyState = () => 'yielding';
    const dealt: Array<{ targetId: string; element?: string; amount: number; kind: string; attackId?: string; poise: number }> = [];
    t.ctx.events.on('damage.dealt', (r) => void (r.attackId === 'emberwright.sunfireNova' && dealt.push(r)));
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(CAPSTONE_SKILL.sunfireNova)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - SUNFIRE_NOVA.emberCost);
    expect(t.use(CAPSTONE_SKILL.sunfireNova)).toMatchObject({ ok: false, reason: 'cooldown' });
    t.run(ticks(0.55));
    expect(dealt).toEqual([]);
    expect(a.health).toBe(a.maxHealth);
    t.run(ticks(0.06) + ticks(0.55));
    expect(dealt.map((d) => d.targetId).sort()).toEqual([a.id, edge.id].sort());
    expect(dealt.every((d) => d.element === 'fire' && d.kind === 'spell' && Math.abs(d.amount - BOLT.damage * 3) < 1e-9 && d.poise === 40)).toBe(true);
    expect(a.health).toBeLessThanOrEqual(a.maxHealth - 30);
    expect(a.poise).toBe(0);
    expect(out.health).toBe(out.maxHealth);
    expect(mercy.health).toBe(mercy.maxHealth);
    expect(igniteIds(t, a.id)).toContain('emberwright.sunfireNova.ignite');
    expect(igniteIds(t, out.id)).toEqual([]);
    expect(igniteIds(t, mercy.id)).toEqual([]);
  });

  it('the ground burns 6 m wide for 6 s and goes out; a foe walking in later catches fire, one outside never does', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    const near = t.enemy(-5);
    t.use(CAPSTONE_SKILL.sunfireNova);
    t.run(ticks(1.3));
    const inside = t.enemy(-4, 0, 1);
    const outside = t.enemy(-7.5, 0, 0);
    t.run(ticks(0.7));
    expect(igniteIds(t, inside.id)).toContain('emberwright.sunfireNova.ignite');
    expect(igniteIds(t, outside.id)).toEqual([]);
    expect(near.health).toBeLessThan(near.maxHealth);
    t.run(ticks(6));
    const late = t.enemy(-3, 0, 0);
    t.run(ticks(1.2));
    expect(igniteIds(t, late.id)).toEqual([]);
  });

  it('a foe already burning from Ember Bolt is not given a second ignite', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    const a = t.enemy(-5);
    t.ctx.services.require('status').apply(a.id, { id: 'emberwright.ignite', kind: 'ignite', dps: 2, seconds: 30, sourceId: 'player' });
    t.use(CAPSTONE_SKILL.sunfireNova);
    t.run(ticks(2));
    expect(igniteIds(t, a.id)).toEqual(['emberwright.ignite']);
    expect(a.health).toBeLessThan(a.maxHealth - 29);
  });

  it('is refused with no foe within 10 m: nothing is spent and no cooldown starts', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    t.enemy(-13);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(CAPSTONE_SKILL.sunfireNova)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-target' });
    expect(spells.ember).toBe(ember);
    t.enemy(-5);
    expect(t.use(CAPSTONE_SKILL.sunfireNova)).toEqual({ ok: true });
  });

  it('rides out a flinch: a light hit during the charge does not break it', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.sunfireNova);
    const a = t.enemy(-5);
    t.use(CAPSTONE_SKILL.sunfireNova);
    t.run(ticks(0.2));
    hitPlayer(t, a.id);
    t.run(2);
    expect(controller(t).currentAction).toBe('flinch');
    t.run(ticks(1.3));
    expect(a.health).toBeLessThan(a.maxHealth);
  });

  it('a stagger or a dodge breaks the charge: no ring, the Ember comes back, the movement is free', async () => {
    for (const how of ['stagger', 'dodge'] as const) {
      const t = await boot();
      asCapstone(t, CAPSTONE_SKILL.sunfireNova);
      const a = t.enemy(-5);
      const spells = t.ctx.services.require('spells');
      t.use(CAPSTONE_SKILL.sunfireNova);
      const spent = spells.ember;
      t.run(ticks(0.2));
      if (how === 'stagger') hitPlayer(t, a.id, { poise: 9999 });
      else dodge(t);
      t.run(2);
      expect(controller(t).currentAction === 'stagger' || controller(t).currentAction === 'dodge', how).toBe(true);
      untilIdle(t);
      t.run(ticks(1.5));
      expect(a.health, how).toBe(a.maxHealth);
      expect(spells.ember, how).toBeGreaterThan(spent);
    }
  });

  it('death, a class change and a load stop the ground and the charge', async () => {
    for (const how of ['death', 'class', 'load', 'charge-death'] as const) {
      const t = await boot();
      asCapstone(t, CAPSTONE_SKILL.sunfireNova);
      const a = t.enemy(-5);
      t.use(CAPSTONE_SKILL.sunfireNova);
      t.run(ticks(how === 'charge-death' ? 0.3 : 1.3));
      const hp = a.health;
      const ignitesBefore = igniteIds(t, a.id).length;
      if (how === 'class') t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'emberwright', free: true, cost: 0 });
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'death' || how === 'charge-death') t.ctx.events.emit('actor.died', DIED);
      t.ctx.services.require('status').clear(a.id);
      t.run(ticks(2));
      expect(igniteIds(t, a.id), how).toEqual([]);
      expect(a.health, how).toBeGreaterThanOrEqual(hp);
      expect(ignitesBefore, how).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('emberwright capstones plugin: Breath of the Keepers on the real pipeline', () => {
  it('channels 2 s: eight ticks of 4 fire damage and an ignite on a foe in the cone, none on one outside it, and the Emberwright heals 3% a tick', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.breathOfTheKeepers);
    const inside = t.enemy(-5);
    const beside = t.enemy(-5, 0, 6); // 50 degrees off: outside the 35
    const far = t.enemy(-9.5);
    const hits: string[] = [];
    t.ctx.events.on('damage.dealt', (r) => void (r.attackId === 'emberwright.breath' && hits.push(r.targetId)));
    const player = t.ctx.actors.player;
    player.health = player.maxHealth * 0.5;
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(CAPSTONE_SKILL.breathOfTheKeepers)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - KEEPERS_BREATH.emberCost);
    expect(t.use(CAPSTONE_SKILL.breathOfTheKeepers)).toMatchObject({ ok: false, reason: 'cooldown' });
    t.run(ticks(2.3));
    expect(hits.filter((h) => h === inside.id)).toHaveLength(8);
    expect(inside.health).toBeLessThanOrEqual(inside.maxHealth - 8 * 4);
    expect(inside.health).toBeGreaterThan(inside.maxHealth - 8 * 4 - 12);
    expect(beside.health).toBe(beside.maxHealth);
    expect(far.health).toBe(far.maxHealth);
    expect(igniteIds(t, inside.id)).toContain('emberwright.breath.ignite');
    expect(player.health).toBeCloseTo(player.maxHealth * (0.5 + 8 * 0.03), 3);
  });

  it('heals an ally in the cone 3% of its own maximum a tick, and one outside not at all', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.breathOfTheKeepers);
    const mk = (id: string, x: number, z: number) => {
      const root = new THREE.Object3D();
      root.position.set(t.world.spawn.x + x, t.world.spawn.y, t.world.spawn.z + z);
      t.ctx.scene.add(root);
      root.updateMatrixWorld(true);
      const a = t.ctx.actors.spawn({ id, kind: 'companion', team: 'ally', maxHealth: 200, maxPoise: 20, root });
      a.health = 50;
      return a;
    };
    const inCone = mk('ally-in', 0, -4);
    const outCone = mk('ally-out', 5, 0);
    t.use(CAPSTONE_SKILL.breathOfTheKeepers);
    t.run(ticks(2.3));
    expect(inCone.health).toBeCloseTo(50 + 8 * 6, 3);
    expect(outCone.health).toBe(50);
  });

  it('skips a foe in a mercy state, rides out a flinch, and is ended by a stagger (the ticks already breathed stay)', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.breathOfTheKeepers);
    const kneel = t.enemy(-4);
    kneel.mercyState = () => 'yielding';
    const ok = t.enemy(-5, 0, 1);
    t.use(CAPSTONE_SKILL.breathOfTheKeepers);
    t.run(ticks(0.4));
    hitPlayer(t, ok.id);
    t.run(2);
    expect(controller(t).currentAction).toBe('flinch');
    t.run(ticks(0.6));
    const mid = ok.health;
    expect(mid).toBeLessThan(ok.maxHealth);
    hitPlayer(t, ok.id, { poise: 9999 });
    t.run(2);
    expect(controller(t).currentAction).toBe('stagger');
    const hp = ok.health;
    t.run(ticks(2));
    // Only the burn can still tick: no more breath hits.
    expect(ok.health).toBeGreaterThan(hp - 6);
    expect(kneel.health).toBe(kneel.maxHealth);
  });
});

describe('emberwright capstones plugin: Colossus of Slag on the real pipeline', () => {
  const golemOf = (t: Booted) => t.ctx.actors.get('colossus:1');
  const aggro = (t: Booted, id: string) => t.ctx.events.emit('ai.aggro', { actorId: id, targetId: 'player' });

  it('raises an ally actor (not hittable, not targetable, in the scene) for 30 s, costs 50 Ember, starts the 90 s cooldown, and removes it all at the end', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(CAPSTONE_SKILL.colossusOfSlag)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - COLOSSUS.emberCost);
    expect(t.use(CAPSTONE_SKILL.colossusOfSlag)).toMatchObject({ ok: false, reason: 'cooldown' });
    const g = golemOf(t)!;
    expect(g).toBeTruthy();
    expect(g.team).toBe('ally');
    expect(g.hittable).toBe(false);
    expect(g.untargetable).toBe(true);
    expect(g.root!.parent).toBe(t.ctx.scene);
    // Nothing can hurt it.
    expect(t.ctx.damage.apply({ attackerId: 'foe-x', targetId: g.id, amount: 5, poise: 0, kind: 'melee' })).toBeNull();
    // It rises from below the floor.
    const y0 = g.root!.position.y;
    t.run(ticks(1.6));
    expect(g.root!.position.y).toBeGreaterThan(y0 + 5);
    expect(Math.abs(g.root!.position.y - t.ctx.player.feet.y)).toBeLessThan(0.5);
    t.run(ticks(28));
    expect(golemOf(t)).toBeTruthy();
    t.run(ticks(0.8));
    expect(golemOf(t)).toBeUndefined();
    expect(g.root!.parent).toBeNull();
  });

  it('slams an engaged foe every 3 s for 15 damage and poise 40, never a calm one, a mercy one or one not fighting the player or an ally', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
    const fighting = t.enemy(-6);
    const calm = t.enemy(-6, 0, 3);
    const kneel = t.enemy(-5, 0, -2);
    kneel.mercyState = () => 'yielding';
    aggro(t, fighting.id);
    aggro(t, kneel.id);
    const hits: Array<{ targetId: string; attackerId: string | null; amount: number; poise: number; kind: string }> = [];
    t.ctx.events.on('damage.dealt', (r) => void (r.attackId === 'emberwright.colossus' && hits.push(r)));
    t.use(CAPSTONE_SKILL.colossusOfSlag);
    t.run(ticks(12));
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.attackerId === 'colossus:1' && h.targetId === fighting.id && Math.abs(h.amount - 15) < 1e-9 && h.poise === 40 && h.kind === 'melee')).toBe(true);
    expect(calm.health).toBe(calm.maxHealth);
    expect(kneel.health).toBe(kneel.maxHealth);
  });

  it('never kills: a weak foe is left at 1 HP however many times it is slammed, with no death and no kill credit', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
    const weak = t.enemy(-6);
    weak.health = 20;
    aggro(t, weak.id);
    const died: Array<{ actorId: string; killerId: string | null }> = [];
    t.ctx.events.on('actor.died', (e) => void died.push({ actorId: e.actorId, killerId: e.killerId }));
    t.use(CAPSTONE_SKILL.colossusOfSlag);
    t.run(ticks(16));
    expect(weak.dead).toBe(false);
    expect(weak.health).toBe(1);
    expect(died).toEqual([]);
    // The player finishes it and gets the kill.
    t.ctx.damage.apply({ attackerId: 'player', targetId: weak.id, amount: 5, poise: 0, kind: 'melee', attackId: 'test' });
    expect(died).toEqual([{ actorId: weak.id, killerId: 'player' }]);
  });

  it('follows the player', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
    t.use(CAPSTONE_SKILL.colossusOfSlag);
    t.run(ticks(2));
    const g = golemOf(t)!;
    const start = g.root!.position.x;
    t.ctx.player.teleport({ x: t.ctx.player.feet.x + 12, y: t.ctx.player.feet.y, z: t.ctx.player.feet.z }, 0);
    t.run(ticks(4));
    expect(g.root!.position.x).toBeGreaterThan(start + 3);
  });

  it('one at a time, and it ends on a class change, a load, the player\'s death and a respec', async () => {
    for (const how of ['recast', 'class', 'load', 'death', 'unlearn'] as const) {
      const t = await boot();
      asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
      t.use(CAPSTONE_SKILL.colossusOfSlag);
      t.run(ticks(0.5));
      expect(golemOf(t), how).toBeTruthy();
      if (how === 'recast') {
        // The cooldown is the service's; a second raise is only possible once it has passed.
        t.run(ticks(91));
        expect(golemOf(t), how).toBeUndefined();
        expect(t.use(CAPSTONE_SKILL.colossusOfSlag)).toEqual({ ok: true });
        expect([...t.ctx.actors.all()].filter((a) => a.kind === 'colossus')).toHaveLength(1);
        continue;
      }
      if (how === 'class') t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'emberwright', free: true, cost: 0 });
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'death') t.ctx.events.emit('actor.died', DIED);
      if (how === 'unlearn') t.progression().setClass('warden');
      t.run(3);
      expect(golemOf(t), how).toBeUndefined();
      expect([...t.ctx.actors.all()].filter((a) => a.kind === 'colossus'), how).toHaveLength(0);
    }
  });

  it('dispose removes the golem and the lethal handler (a plugin restart does not collide)', async () => {
    const t = await boot();
    asCapstone(t, CAPSTONE_SKILL.colossusOfSlag);
    t.use(CAPSTONE_SKILL.colossusOfSlag);
    t.run(ticks(0.5));
    emberwrightCapstonesPlugin.dispose?.();
    expect(golemOf(t)).toBeUndefined();
    expect(() => emberwrightCapstonesPlugin.setup(t.ctx)).not.toThrow();
    emberwrightCapstonesPlugin.dispose?.();
  });
});
