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
import { KNIGHT_ATTACKS } from '../characters/knightClips';
import { CombatVerbs, type CombatVerbsService } from './CombatVerbs';
import { STAMINA } from './tuning';
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
    const before = t.actor.stamina;
    t.press('KeyN');
    t.run(3);
    expect(t.controller.currentAction).toBeNull();
    expect(t.actor.invulnerable).toBe(false);
    expect(t.actor.stamina).toBeGreaterThanOrEqual(before);
  });

  it('a stagger cancels the dodge and clears the invulnerability', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(5);
    expect(t.controller.currentAction).toBe('dodge');
    expect(t.actor.invulnerable).toBe(true);
    t.ctx.damage.stagger('player', e.id, 999);
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
    expect(t.actor.invulnerable).toBe(false);
    expect(t.hit(e, { swingId: 7 })!.outcome).toBe('hit');
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

  it('an inn rest (placeId only) keeps the last rested waystone (v0.5)', () => {
    const t = setup();
    t.ctx.anchors.define({ id: 'waystone.mill', position: { x: t.world.spawn.x + 20, y: t.world.spawn.y, z: t.world.spawn.z }, yaw: 0 });
    t.game.events.emit('rest', { waystoneId: 'mill' });
    t.game.events.emit('rest', { placeId: 'harrowmark.inn' });
    expect(t.verbs.lastRestedWaystoneId).toBe('mill');
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
    expect(inv.takeGold).toHaveBeenCalledWith(10, 'death');
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
    t.ctx.services.provide('progression' as never, { learned: (id: string) => id === 'knight.riposteEdge' } as never);
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
    expect(reportTrigger).toHaveBeenCalledWith('knight.riposteEdge');
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

describe('review fixes', () => {
  it('a corpse does not slide: death after a knockback stops the forced move', () => {
    const t = setup();
    const e = t.enemy();
    t.hit(e, { poise: 30 });
    t.run(2);
    expect(t.controller.currentAction).toBe('stagger');
    t.hit(e, { amount: 500, swingId: 2 });
    t.run(2);
    const z = t.ctx.player.feet.z;
    t.run(60);
    expect(Math.abs(t.ctx.player.feet.z - z)).toBeLessThan(0.05);
  });

  it('a knockback keeps the Knight facing the enemy', () => {
    const t = setup();
    const e = t.enemy();
    const yaw0 = t.ctx.player.facingYaw;
    t.hit(e, { poise: 30 });
    t.run(30);
    expect(Math.cos(t.ctx.player.facingYaw - yaw0)).toBeGreaterThan(0.99);
  });

  it('a pending waystones.respawnPlayer() holds the player down until it resolves; a rejection falls back', async () => {
    const t = setup();
    let resolve!: () => void;
    t.ctx.services.provide('waystones' as never, { respawnPlayer: () => new Promise<void>((r) => (resolve = r)) } as never);
    t.hit(t.enemy(), { amount: 500 });
    t.run(170);
    expect(t.actor.dead).toBe(true);
    resolve();
    await Promise.resolve();
    t.run(2);
    expect(t.actor.dead).toBe(false);
    expect(t.of('player.respawned')[0].source).toBe('waystone');

    const r = setup();
    r.ctx.services.provide('waystones' as never, { respawnPlayer: () => Promise.reject(new Error('no')) } as never);
    r.hit(r.enemy(), { amount: 500 });
    r.run(170);
    await Promise.resolve();
    await Promise.resolve();
    r.run(30);
    expect(r.actor.dead).toBe(false);
    expect(r.of('player.respawned')[0].source).toBe('world');
  });

  it('an external revive during the death timeline leaves nothing locked', () => {
    const t = setup();
    t.hit(t.enemy(), { amount: 500 });
    t.run(5);
    t.ctx.damage.revive('player', 1, 'script');
    t.run(200);
    expect(t.controller.currentAction).toBeNull();
    expect(t.game.moveModifiers.sources()).not.toContain('player-dead');
  });

  it('disposing while blocking releases the guard animation', () => {
    const t = setup();
    t.press('KeyB');
    t.run(5);
    expect(t.controller.currentAction).toBe('block');
    t.verbs.dispose();
    expect(t.controller.currentAction).toBeNull();
  });

  it('a held block still guards a second hit 13 ticks after the first', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    expect(t.hit(e)!.outcome).toBe('blocked');
    t.run(14);
    expect(t.hit(e, { swingId: 2 })!.outcome).toBe('blocked');
  });

  it('exhaustion locks sprint; too little stamina locks the heavy attack', () => {
    const t = setup();
    t.actor.stamina = 5;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack3')).toBe(true);
    expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(false);
    t.actor.stamina = 1;
    t.verbs.stamina.forceDrain(5);
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('sprint')).toBe(true);
    t.actor.stamina = 100;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack3')).toBe(false);
  });

  it('Rim Bash needs the skill; learned, block plus attack 1 staggers the enemy in front and reports it', () => {
    const t = setup();
    const reportTrigger = vi.fn();
    t.ctx.services.provide('abilities' as never, { reportTrigger } as never);
    let learned = false;
    t.ctx.services.provide('progression' as never, { learned: () => learned } as never);
    const e = t.enemy(-1.5);
    t.press('KeyB');
    t.run(5);
    t.press('Digit1');
    t.run(2);
    t.release('Digit1');
    expect(e.poise).toBe(20);
    expect(reportTrigger).not.toHaveBeenCalled();
    t.run(40);
    learned = true;
    t.press('Digit1');
    t.run(2);
    expect(e.poise).toBe(0);
    expect(reportTrigger).toHaveBeenCalledWith('knight.rimBash');
  });
});

describe('class kit: Iron Stance', () => {
  const ironSetup = (learned: () => boolean = () => true) => {
    const t = setup();
    t.ctx.services.provide('progression' as never, { learned: (id: string) => id === 'knight.ironStance' && learned() } as never);
    return t;
  };
  const ironMods = (t: ReturnType<typeof setup>) => t.game.moveModifiers.sources().filter((s) => s === 'verbs.ironStance');

  it('with the skill a held block does not lock movement and adds the half-speed, facing-locked modifier only while blocking', () => {
    const t = ironSetup();
    t.run(3);
    expect(ironMods(t)).toHaveLength(0);
    t.press('KeyB');
    t.run(20);
    expect(t.controller.currentAction).toBe('block');
    expect(t.controller.movementLocked).toBe(false);
    expect(ironMods(t)).toHaveLength(1);
    const state = t.game.moveModifiers.state();
    expect(state.speedScale).toBeCloseTo(0.5);
    expect(state.lockFacing).toBe(true);
    expect(state.lockMove).toBe(false);
  });

  it('guarding with Iron Stance cannot sprint: the sprint action is locked', () => {
    const t = ironSetup();
    expect(t.game.moveModifiers.isActionLocked('sprint')).toBe(false);
    t.press('KeyB');
    t.run(20);
    expect(t.game.moveModifiers.isActionLocked('sprint')).toBe(true);
    t.release('KeyB');
    t.run(3);
    expect(t.game.moveModifiers.isActionLocked('sprint')).toBe(false);
  });

  it('removes the modifier when block is released, and never stacks it while held', () => {
    const t = ironSetup();
    t.press('KeyB');
    t.run(30);
    expect(ironMods(t)).toHaveLength(1);
    t.release('KeyB');
    t.run(3);
    expect(t.controller.currentAction).toBeNull();
    expect(ironMods(t)).toHaveLength(0);
    expect(t.game.moveModifiers.state().speedScale).toBe(1);
  });

  it('the modifier is not present while merely idle or while dodging', () => {
    const t = ironSetup();
    t.press('KeyN');
    t.run(5);
    expect(t.controller.currentAction).toBe('dodge');
    expect(ironMods(t)).toHaveLength(0);
  });

  it('without the skill nothing changes: block locks movement and no modifier is added', () => {
    const t = ironSetup(() => false);
    t.press('KeyB');
    t.run(20);
    expect(t.controller.currentAction).toBe('block');
    expect(t.controller.movementLocked).toBe(true);
    expect(ironMods(t)).toHaveLength(0);
    expect(t.game.moveModifiers.state().speedScale).toBe(1);
  });

  it('without any progression service nothing changes either', () => {
    const t = setup();
    t.press('KeyB');
    t.run(20);
    expect(t.controller.movementLocked).toBe(true);
    expect(ironMods(t)).toHaveLength(0);
  });

  it('removes the modifier and restores the lock when the skill is unlearned mid-block', () => {
    let learned = true;
    const t = ironSetup(() => learned);
    t.press('KeyB');
    t.run(20);
    expect(ironMods(t)).toHaveLength(1);
    learned = false;
    t.run(2);
    expect(ironMods(t)).toHaveLength(0);
    expect(t.controller.movementLocked).toBe(true);
  });

  it('removes the modifier on dispose', () => {
    const t = ironSetup();
    t.press('KeyB');
    t.run(20);
    expect(ironMods(t)).toHaveLength(1);
    t.verbs.dispose();
    expect(ironMods(t)).toHaveLength(0);
  });

  it('widens the guard arc to 135 degrees: a hit from 120 degrees is blocked, 140 is not; unlearned it is a hit', () => {
    const dirAt = (deg: number) => new THREE.Vector3(Math.sin((deg * Math.PI) / 180), 0, Math.cos((deg * Math.PI) / 180));
    const t = ironSetup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    expect(t.hit(e, { direction: dirAt(120), swingId: 1 })!.outcome).toBe('blocked');
    t.run(14);
    expect(t.hit(e, { direction: dirAt(140), swingId: 2 })!.outcome).toBe('hit');
    const plain = setup();
    const e2 = plain.enemy();
    plain.press('KeyB');
    plain.run(20);
    expect(plain.hit(e2, { direction: dirAt(120) })!.outcome).toBe('hit');
  });
});

describe('class kit: Flowing Cuts', () => {
  const flowSetup = (learned: () => boolean = () => true) => {
    const t = setup();
    t.ctx.services.provide('progression' as never, { learned: (id: string) => id === 'knight.flowingCuts' && learned() } as never);
    return t;
  };
  /** Starts attack 1 and runs until `until` says the attack is in the wanted phase. */
  const attackUntil = (t: ReturnType<typeof setup>, until: (a: { normalizedTime: number; activeStart: number; activeEnd: number }) => boolean) => {
    t.press('Digit1');
    t.run(1);
    t.release('Digit1');
    for (let i = 0; i < 80; i++) {
      const a = t.controller.activeAttack();
      if (a && until(a)) return a;
      t.run(1);
    }
    throw new Error('attack never reached the wanted phase');
  };
  const dodgePress = (t: ReturnType<typeof setup>) => {
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(1);
  };

  it('a dodge press during the recovery cancels the attack into a dodge and spends the stamina', () => {
    const t = flowSetup();
    const a = attackUntil(t, (x) => x.normalizedTime > x.activeEnd);
    expect(a.normalizedTime).toBeGreaterThan(a.activeEnd);
    const before = t.actor.stamina;
    dodgePress(t);
    expect(t.controller.currentAction).toBe('dodge');
    expect(t.controller.state).not.toBe('attack');
    expect(t.actor.stamina).toBeLessThan(before - 5);
  });

  it('a dodge press during the active window does not cancel', () => {
    const t = flowSetup();
    attackUntil(t, (x) => x.normalizedTime >= x.activeStart && x.normalizedTime <= x.activeEnd);
    const before = t.actor.stamina;
    t.press('KeyN');
    t.run(1);
    expect(t.controller.currentAction).toBeNull();
    expect(t.actor.stamina).toBeGreaterThanOrEqual(before);
  });

  it('a dodge press before the window opens does not cancel', () => {
    const t = flowSetup();
    attackUntil(t, (x) => x.normalizedTime < x.activeStart);
    t.press('KeyN');
    t.run(1);
    expect(t.controller.currentAction).toBeNull();
    expect(t.controller.state).toBe('attack');
  });

  it('without the skill the recovery cannot be cancelled', () => {
    const t = flowSetup(() => false);
    attackUntil(t, (x) => x.normalizedTime > x.activeEnd);
    const before = t.actor.stamina;
    dodgePress(t);
    expect(t.controller.currentAction).toBeNull();
    expect(t.actor.stamina).toBeGreaterThanOrEqual(before);
  });

  it('with too little stamina the dodge is refused and the attack carries on', () => {
    const t = flowSetup();
    attackUntil(t, (x) => x.normalizedTime > x.activeEnd);
    t.actor.stamina = 1;
    t.press('KeyN');
    t.run(1);
    expect(t.controller.currentAction).toBeNull();
    expect(t.controller.state).toBe('attack');
  });

  it('a dodge pressed while idle behaves as before with the skill learned', () => {
    const t = flowSetup();
    dodgePress(t);
    expect(t.controller.currentAction).toBe('dodge');
  });
});

describe('class kit: attack sets and speed', () => {
  const K = KNIGHT_ATTACKS;
  /** Stab, Chop, Slice_Horizontal, Slice_Diagonal with the heavy attack in slot 1. */
  const rogue = { attacks: [K[3], K[2], K[0], K[1]], heavyIndex: 0 };
  const classKit = (classId?: string) => {
    const t = setup();
    t.ctx.services.provide('progression' as never, { classId, learned: () => false } as never);
    return t;
  };
  const svc = (t: ReturnType<typeof setup>) => t.ctx.services.get('combatVerbs' as never) as unknown as CombatVerbsService;

  it('provides registerAttackSet and addAttackSpeedMultiplier on the combatVerbs service', () => {
    const t = setup();
    const s = svc(t);
    expect(typeof s.registerAttackSet).toBe('function');
    expect(typeof s.addAttackSpeedMultiplier).toBe('function');
    expect(s.registerAttackSet('x', rogue).ok).toBe(true);
    expect(s.registerAttackSet('x', rogue)).toEqual({ ok: false, reason: 'duplicate' });
    expect(s.registerAttackSet('y', { attacks: [], heavyIndex: 0 })).toEqual({ ok: false, reason: 'bad-set' });
  });

  it('the Knight set is on the controller without a class or with an unregistered one', () => {
    for (const id of [undefined, 'ghost']) {
      const t = classKit(id);
      t.run(2);
      K.forEach((a, i) => expect(t.controller.attackClip(i + 1)).toBe(a.clip));
    }
  });

  it('a registered class set is applied to the controller', () => {
    const t = classKit('x');
    svc(t).registerAttackSet('x', rogue);
    t.run(2);
    expect(t.controller.attackClip(1)).toBe(K[3].clip);
    expect(t.controller.attackClip(3)).toBe(K[0].clip);
    t.press('Digit1');
    t.run(2);
    expect(t.controller.activeAttack()?.clip).toBe(K[3].clip);
  });

  it('retries next tick when an attack was playing, and leaves the old set alone meanwhile', () => {
    const t = setup();
    t.ctx.services.provide('progression' as never, { classId: 'knight', learned: () => false } as never);
    svc(t).registerAttackSet('x', rogue);
    t.press('Digit1');
    t.run(2);
    t.release('Digit1');
    expect(t.controller.state).toBe('attack');
    const prog = t.ctx.services.get('progression' as never) as unknown as { classId: string };
    prog.classId = 'x';
    t.run(5);
    expect(t.controller.attackClip(1)).toBe(K[0].clip);
    t.run(120);
    expect(t.controller.state).not.toBe('attack');
    expect(t.controller.attackClip(1)).toBe(K[3].clip);
  });

  it('does not re-apply the set every tick once applied', () => {
    const t = classKit('x');
    svc(t).registerAttackSet('x', rogue);
    t.run(2);
    const spy = vi.spyOn(t.controller, 'setAttackSet');
    t.run(5);
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to the Knight set when the class registration is disposed', () => {
    const t = classKit('x');
    const r = svc(t).registerAttackSet('x', rogue);
    t.run(2);
    expect(t.controller.attackClip(1)).toBe(K[3].clip);
    if (!r.ok) throw new Error('expected ok');
    r.dispose();
    const prog = t.ctx.services.get('progression' as never) as unknown as { classId: string };
    prog.classId = 'y';
    t.run(2);
    expect(t.controller.attackClip(1)).toBe(K[0].clip);
  });

  it('the Knight heavy attack (slot 3) costs stamina and locks attack3 when stamina is short', () => {
    const t = classKit(undefined);
    t.actor.stamina = 5;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack3')).toBe(true);
    expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(false);
  });

  it('heavyIndex 0 locks attack1 (not attack3) when stamina is short and frees it again', () => {
    const t = classKit('x');
    svc(t).registerAttackSet('x', rogue);
    t.actor.stamina = 5;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(true);
    expect(t.game.moveModifiers.isActionLocked('attack3')).toBe(false);
    t.actor.stamina = 100;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(false);
  });

  it('heavyIndex 3 locks attack4', () => {
    const t = classKit('x');
    svc(t).registerAttackSet('x', { attacks: rogue.attacks, heavyIndex: 3 });
    t.actor.stamina = 5;
    t.run(2);
    expect(t.game.moveModifiers.isActionLocked('attack4')).toBe(true);
    expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(false);
  });

  it('only the heavy slot of the set spends the heavy stamina cost', () => {
    const heavy = classKit('x');
    svc(heavy).registerAttackSet('x', rogue);
    heavy.run(2);
    heavy.actor.stamina = 80;
    heavy.press('Digit1');
    heavy.run(3);
    heavy.release('Digit1');
    expect(heavy.controller.activeAttack()?.clip).toBe(K[3].clip);
    expect(heavy.actor.stamina).toBeLessThan(80 - STAMINA.heavyAttackCost + 5);

    const light = classKit('x');
    svc(light).registerAttackSet('x', rogue);
    light.run(2);
    light.actor.stamina = 80;
    light.press('Digit2');
    light.run(3);
    light.release('Digit2');
    expect(light.controller.activeAttack()?.clip).toBe(K[2].clip);
    expect(light.actor.stamina).toBeGreaterThanOrEqual(80);
  });

  it('the attack speed multiplier reaches the controller each tick and resets to 1 when removed', () => {
    const t = setup();
    const spy = vi.spyOn(t.controller, 'setAttackSpeed');
    let v = 1.5;
    const off = svc(t).addAttackSpeedMultiplier('song', () => v);
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1.5);
    v = 1.25;
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1.25);
    svc(t).addAttackSpeedMultiplier('other', 1.2);
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1.25 * 1.2);
    off();
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1.2);
  });

  it('with no multiplier the controller gets 1; a throwing multiplier is ignored with a warning', () => {
    const t = setup();
    const spy = vi.spyOn(t.controller, 'setAttackSpeed');
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1);
    svc(t).addAttackSpeedMultiplier('bad', () => {
      throw new Error('boom');
    });
    t.run(1);
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"bad"'));
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

describe('class kit swap (v0.5)', () => {
  it('re-binds to the new avatar: the old target and clip listener are undone, blocking works on the new kit', () => {
    const t = setup();
    const old = t.world.avatar!;
    const oldBoxes = t.world.combat.playerHurtboxes!;
    const addTarget = vi.spyOn(t.ctx.combat, 'addTarget');
    const next = new KnightAvatar({ model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null }, { warn: () => {} });
    expect(t.ctx.player.swapAvatar(next)).toBe(true);
    t.run(2);
    const newBoxes = t.world.combat.playerHurtboxes!;
    expect(newBoxes).not.toBe(oldBoxes);
    expect(addTarget).toHaveBeenCalledWith(newBoxes, 'player');
    // The old controller's clips no longer count as player attacks.
    t.prompts.success.mockClear();
    old.controller.events.emit({ type: 'clipStart', clip: '1H_Melee_Attack_Slice_Horizontal' } as never);
    expect(t.prompts.success).not.toHaveBeenCalled();
    // The new kit blocks.
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    expect(next.controller.currentAction).toBe('block');
    expect(t.hit(e)!.outcome).toBe('blocked');
  });

  it('a hostile still hits the player after a swap', () => {
    const t = setup();
    const next = new KnightAvatar({ model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null }, { warn: () => {} });
    t.ctx.player.swapAvatar(next);
    t.run(2);
    const r = t.hit(t.enemy())!;
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(10);
  });
});

describe('status ticks (contracts section 10)', () => {
  const tick = (t: ReturnType<typeof setup>, from: Actor) =>
    t.hit(from, { kind: 'status', statusId: 'bleed:t', statusKind: 'bleed', amount: 3, poise: 0, unblockable: true, direction: undefined, attackId: undefined, swingId: undefined })!;

  it('a held block neither blocks nor pays stamina for a tick', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyB');
    t.run(20);
    const stamina = t.actor.stamina;
    const r = tick(t, e);
    expect(r.outcome).toBe('hit');
    expect(r.dealt).toBe(3);
    expect(t.actor.stamina).toBe(stamina);
    t.run(2);
    expect(t.of('player.blocked')).toHaveLength(0);
    expect(t.controller.currentAction).toBe('block');
  });

  it('dodge i-frames do not stop a tick, report no dodge and do not stop real hits being dodged', () => {
    const t = setup();
    const e = t.enemy();
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(3);
    expect(t.actor.invulnerable).toBe(true);
    const health = t.actor.health;
    const r = tick(t, e);
    expect(r.outcome).toBe('hit');
    expect(t.actor.health).toBe(health - 3);
    expect(t.hit(e)!.outcome).toBe('immune');
    t.run(2);
    expect(t.of('player.dodged')).toHaveLength(1);
  });

  it('other invulnerability (a respawn grace) still stops a tick', () => {
    const t = setup();
    const e = t.enemy();
    t.verbs.invuln.add('respawn');
    t.verbs.invuln.add('dodge');
    expect(tick(t, e).outcome).toBe('immune');
    expect(t.of('player.dodged')).toHaveLength(0);
  });

  it('a tick does not make the player flinch', () => {
    const t = setup();
    const e = t.enemy();
    tick(t, e);
    t.run(3);
    expect(t.controller.currentAction).toBeNull();
  });
});
