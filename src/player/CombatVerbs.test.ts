import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../actors/Actor';
import type { DamageRequest } from '../actors/DamageResolver';
import { KnightAvatar } from '../characters/KnightAvatar';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import corePlugin from '../core/core.plugin';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { CombatVerbs } from './CombatVerbs';
import combatVerbsPlugin from './combatVerbs.plugin';

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
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

function setup(opts: { tutorialComplete?: boolean } = {}) {
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
  ctx.state.setFlag('tutorial.complete', opts.tutorialComplete ?? true);
  // Plain keys for the mouse bindings the tests press.
  ctx.input.bindings.rebind('block', 0, { device: 'key', code: 'KeyB' });
  ctx.input.bindings.rebind('dodge', 0, { device: 'key', code: 'KeyN' });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const avatar = new KnightAvatar(
    { model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null },
    { warn: () => {} },
  );
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  const verbs = new CombatVerbs(ctx);
  verbs.install();
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (code: string) => win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
  const release = (code: string) => win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
  /** A hostile standing 3 m ahead of the player (the player faces -Z). */
  const enemy = (z = -3): Actor => {
    const root = new THREE.Object3D();
    root.position.set(world.spawn.x, world.spawn.y, world.spawn.z + z);
    scene.add(root);
    return ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 60, maxPoise: 20, root });
  };
  const hit = (from: Actor, extra: Partial<DamageRequest> = {}) =>
    ctx.damage.apply({
      attackerId: from.id,
      targetId: 'player',
      amount: 10,
      poise: 10,
      kind: 'melee',
      attackId: 'claw',
      swingId: 1,
      direction: new THREE.Vector3(0, 0, 1),
      ...extra,
    });
  const of = <K extends keyof GameEventMap>(t: K) => events.filter((e) => e.type === t).map((e) => e.payload as GameEventMap[K]);
  const prompts = { success: vi.fn(), show: vi.fn(), hide: vi.fn(), count: () => 0, showHintsAlways: false };
  ctx.services.provide('prompts', prompts as never);
  const controller = avatar.controller;
  run(2);
  return { game, ctx, world, verbs, run, press, release, enemy, hit, of, prompts, controller, events, actor: ctx.player.actor };
}

describe('block and parry', () => {
  it('a held block absorbs 80% of a frontal hit, costs stamina and reports the success', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    expect(t.controller.currentAction).toBe('block');
    const before = t.actor.stamina;
    const r = t.hit(e)!;
    expect(r.outcome).toBe('blocked');
    expect(r.dealt).toBeCloseTo(2);
    expect(t.actor.stamina).toBeCloseTo(before - 15);
    t.run(2);
    expect(t.of('player.blocked')).toHaveLength(1);
    expect(t.prompts.success).toHaveBeenCalledWith('block');
    expect(t.controller.currentAction).toBe('blockHit');
  });

  it('a hit from behind is a plain hit', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    expect(t.hit(e, { direction: new THREE.Vector3(0, 0, -1) })!.outcome).toBe('hit');
  });

  it('without the guard up a hit lands in full and no block event fires', () => {
    const t = setup();
    const r = t.hit(t.enemy())!;
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(10);
    expect(t.of('player.blocked')).toHaveLength(0);
  });

  it('block with too little stamina is a guard break: full damage and an event', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    t.actor.stamina = 5;
    const r = t.hit(e)!;
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(10);
    expect(t.actor.stamina).toBe(0);
    t.run(1);
    expect(t.of('player.guardBroken')).toHaveLength(1);
  });

  it('a press 12 ticks before the window opens parries and breaks the attacker', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(1);
    t.run(12);
    t.game.events.emit('attack.window', { actorId: e.id, attackId: 'claw', swingId: 1, phase: 'open' });
    const r = t.hit(e)!;
    expect(r.outcome).toBe('parried');
    expect(r.dealt).toBe(0);
    expect(e.poise).toBe(0);
    t.run(1);
    expect(t.of('player.parried')).toHaveLength(1);
    expect(t.of('actor.staggered').some((s) => s.actorId === e.id)).toBe(true);
  });

  it('a press one tick too early is only a block', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(1);
    t.run(13);
    t.game.events.emit('attack.window', { actorId: e.id, attackId: 'claw', swingId: 1, phase: 'open' });
    expect(t.hit(e)!.outcome).toBe('blocked');
  });

  it('a red-telegraphed swing hits through a held block', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    t.game.events.emit('telegraph', { actorId: e.id, kind: 'dodge', attackId: 'sweep', moveId: 'sweep', swingId: 2, leadSeconds: 0.5 });
    t.game.events.emit('attack.window', { actorId: e.id, attackId: 'sweep', swingId: 2, phase: 'open' });
    expect(t.hit(e, { attackId: 'sweep', swingId: 2 })!.outcome).toBe('hit');
  });
});

describe('dodge', () => {
  it('has i-frames from tick 2 to 16, spends stamina and reports a dodged swing once', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(3);
    expect(t.controller.currentAction).toBe('dodge');
    expect(t.actor.stamina).toBeLessThan(100);
    expect(t.actor.invulnerable).toBe(true);
    expect(t.hit(e)!.outcome).toBe('immune');
    expect(t.hit(e)!.outcome).toBe('immune');
    t.run(1);
    expect(t.of('player.dodged')).toHaveLength(1);
    expect(t.prompts.success).toHaveBeenCalledWith('dodge');
    t.run(20);
    expect(t.actor.invulnerable).toBe(false);
    expect(t.hit(e, { swingId: 9 })!.outcome).toBe('hit');
  });

  it('moves the player several metres', () => {
    const t = setup();
    const z0 = t.ctx.player.feet.z;
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(30);
    expect(Math.abs(t.ctx.player.feet.z - z0)).toBeGreaterThan(3);
  });

  it('is refused when exhausted and costs nothing', () => {
    const t = setup();
    t.actor.stamina = 1;
    t.verbs.stamina.forceDrain(5);
    expect(t.verbs.stamina.exhausted).toBe(true);
    t.press('KeyN');
    t.run(3);
    expect(t.controller.currentAction).toBeNull();
    expect(t.actor.invulnerable).toBe(false);
  });

  it('a stagger cancels the dodge and clears the invulnerability', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(20);
    expect(t.controller.currentAction).toBe('dodge');
    t.actor.poise = 5;
    t.hit(e, { poise: 20 });
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
    expect(t.actor.invulnerable).toBe(false);
  });

  it('costs no stamina before the tutorial ends', () => {
    const t = setup({ tutorialComplete: false });
    t.press('KeyN');
    t.run(2);
    expect(t.actor.stamina).toBe(100);
  });
});

describe('poise and stagger', () => {
  it('a light hit flinches, a heavy hit staggers with poise left, a broken bar staggers longer', () => {
    const t = setup();
    const e = t.enemy();
    t.hit(e, { poise: 10 });
    t.run(2);
    expect(t.controller.currentAction).toBe('flinch');
    t.run(30);
    expect(t.controller.currentAction).toBeNull();
    t.actor.restorePoise();
    t.hit(e, { poise: 30, swingId: 2 });
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
    expect(t.actor.poise).toBeGreaterThan(0);
    t.run(60);
    expect(t.controller.currentAction).toBeNull();
    t.actor.poise = 5;
    t.hit(e, { poise: 10, swingId: 3 });
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
    t.run(50);
    expect(t.controller.currentAction).toBe('stagger');
    t.run(30);
    expect(t.controller.currentAction).toBeNull();
  });

  it('poise refills after four quiet seconds', () => {
    const t = setup();
    t.hit(t.enemy(), { poise: 10 });
    expect(t.actor.poise).toBe(30);
    t.run(239);
    expect(t.actor.poise).toBe(30);
    t.run(3);
    expect(t.actor.poise).toBe(t.actor.maxPoise);
  });

  it('a stagger from damage.stagger alone also reacts', () => {
    const t = setup();
    t.ctx.damage.stagger('player', null, 999);
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
  });
});

describe('Second Wind, death and respawn', () => {
  it('saves a lethal hit once before the tutorial ends: half health, burst on hostiles, no death', () => {
    const t = setup({ tutorialComplete: false });
    const e = t.enemy();
    e.poise = 20;
    t.actor.health = 5;
    const r = t.hit(e, { amount: 50 })!;
    expect(r.saved).toBe(true);
    expect(t.actor.health).toBe(50);
    expect(e.poise).toBe(0);
    expect(t.actor.invulnerable).toBe(true);
    expect(t.of('actor.saved')).toHaveLength(1);
    expect(t.of('actor.died')).toHaveLength(0);
    t.run(91);
    expect(t.actor.invulnerable).toBe(false);
    t.actor.health = 5;
    expect(t.hit(e, { amount: 50, swingId: 2 })!.killed).toBe(true);
  });

  it('is off after the tutorial until thread 9 re-arms it', () => {
    const t = setup();
    t.actor.health = 5;
    expect(t.hit(t.enemy(), { amount: 50 })!.killed).toBe(true);
    const t2 = setup();
    t2.ctx.services.get('combatVerbs')!.reArm(1);
    t2.actor.health = 5;
    expect(t2.hit(t2.enemy(), { amount: 50 })!.saved).toBe(true);
  });

  it('a scripted kill (a fall) also goes through the handler', () => {
    const t = setup({ tutorialComplete: false });
    t.ctx.damage.kill('player');
    expect(t.actor.dead).toBe(false);
    expect(t.actor.health).toBe(50);
  });

  it('dies, plays the death clip, locks actions and respawns at the world spawn without a waystone', () => {
    const t = setup();
    const e = t.enemy();
    t.hit(e, { amount: 500 });
    t.run(2);
    expect(t.actor.dead).toBe(true);
    expect(t.controller.currentAction).toBe('dying');
    expect(t.of('player.died')).toHaveLength(1);
    t.press('KeyN');
    t.run(5);
    expect(t.controller.currentAction).toBe('dying');
    t.run(160);
    expect(t.actor.dead).toBe(false);
    expect(t.actor.health).toBe(t.actor.maxHealth);
    expect(t.of('player.respawned')[0].source).toBe('world');
    expect(t.actor.invulnerable).toBe(true);
    t.run(100);
    expect(t.actor.invulnerable).toBe(false);
    expect(t.controller.currentAction).toBeNull();
  });

  it('respawns at the last rested waystone when its anchor exists', () => {
    const t = setup();
    t.ctx.anchors.define({ id: 'waystone.mill', position: { x: t.world.spawn.x + 20, y: t.world.spawn.y, z: t.world.spawn.z }, yaw: 0 });
    t.game.events.emit('rest', { waystoneId: 'mill' });
    t.hit(t.enemy(), { amount: 500 });
    t.run(170);
    expect(t.of('player.respawned')[0].source).toBe('waystone');
  });

  it('uses the waystones service when it exists', () => {
    const t = setup();
    const respawnPlayer = vi.fn();
    t.ctx.services.provide('waystones' as never, { respawnPlayer } as never);
    t.hit(t.enemy(), { amount: 500 });
    t.run(170);
    expect(respawnPlayer).toHaveBeenCalledTimes(1);
    expect(t.actor.dead).toBe(false);
  });

  it('drops a gold pouch of 10% after the tutorial and recovers it; none without an inventory or before the tutorial', () => {
    const t = setup();
    const inv = { gold: 105, takeGold: vi.fn((n: number) => n), addGold: vi.fn() };
    t.ctx.services.provide('inventory' as never, inv as never);
    t.hit(t.enemy(), { amount: 500 });
    t.run(2);
    expect(t.verbs.pouch.pouch?.gold).toBe(10);
    expect(inv.takeGold).toHaveBeenCalledWith(10);
    t.verbs.pouch.recover(inv);
    expect(inv.addGold).toHaveBeenCalledWith(10);

    const bare = setup();
    bare.hit(bare.enemy(), { amount: 500 });
    bare.run(2);
    expect(bare.verbs.pouch.pouch).toBeNull();

  });

  it('the player persistable round-trips health, stamina, waystone and pouch, and revives a dead player on load', () => {
    const t = setup();
    t.ctx.services.provide('inventory' as never, { gold: 200, takeGold: (n: number) => n, addGold: () => {} } as never);
    t.game.events.emit('rest', { waystoneId: 'mill' });
    t.actor.health = 40;
    t.actor.stamina = 33;
    const entry = t.ctx.persist.all().find((p) => p.key === 'player')!;
    const saved = JSON.parse(JSON.stringify(entry.serialize()));
    t.hit(t.enemy(), { amount: 500 });
    t.run(2);
    expect(t.actor.dead).toBe(true);
    entry.load(saved, 1);
    expect(t.actor.dead).toBe(false);
    expect(t.actor.health).toBe(40);
    expect(t.actor.stamina).toBe(33);
    expect(t.verbs.lastRestedWaystoneId).toBe('mill');
    t.run(200);
    expect(t.of('player.respawned')).toHaveLength(0);
    entry.load('garbage', 1);
    entry.load({ health: Number.NaN }, 1);
    expect(t.actor.health).toBe(40);
  });
});

describe('lock-on', () => {
  it('Tab locks the enemy ahead, reports it, and releases when it dies', () => {
    const t = setup();
    const e = t.enemy(-6);
    t.press('Tab');
    t.run(2);
    t.release('Tab');
    expect(t.ctx.services.get('lockOn')!.targetId).toBe(e.id);
    expect(t.of('lockon.changed').at(-1)).toEqual({ targetId: e.id });
    expect(t.prompts.success).toHaveBeenCalledWith('lockOn');
    t.ctx.damage.kill(e.id, 'player');
    t.run(2);
    expect(t.ctx.services.get('lockOn')!.targetId).toBeNull();
    expect(t.of('lockon.changed').at(-1)).toEqual({ targetId: null });
  });

  it('with nothing to lock Tab does nothing; Tab again unlocks', () => {
    const t = setup();
    t.press('Tab');
    t.run(2);
    t.release('Tab');
    expect(t.of('lockon.changed')).toHaveLength(0);
    const e = t.enemy(-6);
    t.press('Tab');
    t.run(2);
    t.release('Tab');
    expect(t.verbs.lockOn.target).toBe(e.id);
    t.press('Tab');
    t.run(2);
    expect(t.verbs.lockOn.target).toBeNull();
  });

  it('a neutral actor is never a target', () => {
    const t = setup();
    const root = new THREE.Object3D();
    root.position.set(t.world.spawn.x, t.world.spawn.y, t.world.spawn.z - 5);
    t.ctx.actors.spawn({ kind: 'npc:edda', team: 'neutral', maxHealth: 10, root });
    t.press('Tab');
    t.run(2);
    expect(t.verbs.lockOn.target).toBeNull();
  });
});

describe('skills and services', () => {
  it('riposte makes the next stab unblockable and reports the trigger; nothing happens unlearned', () => {
    const t = setup();
    const reportTrigger = vi.fn();
    t.ctx.services.provide('abilities' as never, { reportTrigger } as never);
    t.ctx.services.provide('progression' as never, { learned: (id: string) => id === 'skill.knight.riposteEdge' } as never);
    const e = t.enemy();
    t.press('KeyB');
    t.run(1);
    t.run(5);
    t.game.events.emit('attack.window', { actorId: e.id, attackId: 'claw', swingId: 1, phase: 'open' });
    expect(t.hit(e)!.outcome).toBe('parried');
    const stab = t.ctx.damage.apply({
      attackerId: 'player', targetId: e.id, amount: 5, poise: 5, kind: 'melee', attackId: '1H_Melee_Attack_Stab', swingId: 4,
    })!;
    expect(stab.unblockable).toBe(true);
    expect(reportTrigger).toHaveBeenCalledWith('skill.knight.riposteEdge');
  });

  it('exposes busy and staggered through the combatVerbs service', () => {
    const t = setup();
    const svc = t.ctx.services.get('combatVerbs')!;
    expect(svc.busy).toBe(false);
    t.ctx.damage.stagger('player', null, 999);
    t.run(2);
    expect(svc.busy).toBe(true);
    expect(svc.staggered).toBe(true);
  });
});

describe('plugin', () => {
  it('sets up with the core plugin, registers its services and tears down cleanly', async () => {
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const world = new World(scene, physics, {
      colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
      moveModifier: () => moveModifiers.state(),
    });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
    const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
    const statuses = await game.loadPlugins(modules(corePlugin, combatVerbsPlugin));
    expect(statuses.every((s) => s.state === 'ok')).toBe(true);
    expect(game.ctx.services.get('lockOn')).toBeDefined();
    expect(game.ctx.services.get('combatVerbs')).toBeDefined();
    expect(game.systems.has('verbs.intent')).toBe(true);
    game.dispose();
    expect(game.ctx.services.get('lockOn')).toBeUndefined();
    world.dispose();
  });
});
