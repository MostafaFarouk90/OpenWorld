import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../characters/KnightAvatar';
import { KNIGHT } from '../config/constants';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import type { GameEventMap } from './events';
import { Game } from './Game';
import { MoveModifiers } from './MoveModifiers';
import { PLUGIN_MODULES } from './pluginManifest';
import type { GamePlugin, PluginModule } from './plugins';
import corePlugin from './core.plugin';

const SLICE = '1H_Melee_Attack_Slice_Horizontal';
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

function key(win: EventTarget, type: 'keydown' | 'keyup', code: string): void {
  win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} }));
}

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

function setup(opts: { report?: (m: string, e?: unknown) => void } = {}) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, report: opts.report ?? (() => {}) });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const attachKnight = () => {
    const avatar = new KnightAvatar(
      { model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null },
      { warn: () => {} },
    );
    world.setAvatar(avatar);
    game.attachAvatar(avatar);
    return avatar;
  };
  const addDummy = (x: number, z: number) => {
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(KNIGHT.modelScale);
    model.position.set(world.spawn.x + x, world.spawn.y, world.spawn.z + z);
    world.combat.addDummy(model, gltf.animations);
    return game.addDummy(model);
  };
  return { scene, world, game, input, win, events, run, attachKnight, addDummy, moveModifiers };
}

const ofType = <K extends keyof GameEventMap>(events: Array<{ type: keyof GameEventMap; payload: unknown }>, t: K) =>
  events.filter((e) => e.type === t).map((e) => e.payload as GameEventMap[K]);

describe('Game tick', () => {
  it('runs the fixed phases in order around the world step, with animation before combat', () => {
    const t = setup();
    const log: string[] = [];
    for (const phase of ['input', 'intent', 'animation', 'afterCombat', 'rules', 'late'] as const) {
      t.game.systems.add({ id: `test.${phase}`, fixedPhase: phase, fixedUpdate: () => log.push(phase) });
    }
    const worldStep = t.world.fixedUpdate.bind(t.world);
    vi.spyOn(t.world, 'fixedUpdate').mockImplementation((input, move, hooks) => {
      log.push('world');
      worldStep(input, move, hooks);
    });
    vi.spyOn(t.world.combat, 'fixedUpdate').mockImplementation(() => (log.push('combat'), []));
    t.attachKnight();
    t.run(1);
    expect(log).toEqual(['input', 'intent', 'world', 'animation', 'combat', 'afterCombat', 'rules', 'late']);
    t.game.dispose();
    t.world.dispose();
  });

  it('runs the animation phase even when the Knight has not loaded', () => {
    const t = setup();
    const seen = vi.fn();
    t.game.systems.add({ id: 'test.anim', fixedPhase: 'animation', fixedUpdate: seen });
    t.run(3);
    expect(seen).toHaveBeenCalledTimes(3);
    t.world.dispose();
  });

  it('hit-stop skips whole ticks and keeps a press latched for the next simulated tick', () => {
    const t = setup();
    const ticks = vi.fn();
    t.game.systems.add({ id: 'test.input', fixedPhase: 'input', fixedUpdate: (_dt, ctx) => ticks(ctx.input.actions.pressed('jump')) });
    t.game.clock.hitStop(0.05); // three 1/60 steps
    key(t.win, 'keydown', 'Space');
    key(t.win, 'keyup', 'Space');
    t.run(3);
    expect(ticks).not.toHaveBeenCalled();
    t.run(1);
    expect(ticks).toHaveBeenCalledWith(true);
    t.run(1);
    expect(ticks).toHaveBeenLastCalledWith(false);
    t.world.dispose();
  });

  it('pause stops simulation until every reason is cleared', () => {
    const t = setup();
    const ticks = vi.fn();
    t.game.systems.add({ id: 'test.rules', fixedPhase: 'rules', fixedUpdate: ticks });
    t.game.clock.setPaused('menu', true);
    t.game.clock.setPaused('cutscene', true);
    t.game.clock.setPaused('menu', false);
    t.run(2);
    expect(ticks).not.toHaveBeenCalled();
    t.game.clock.setPaused('cutscene', false);
    t.run(2);
    expect(ticks).toHaveBeenCalledTimes(2);
    expect(t.game.clock.tick).toBe(2);
    t.world.dispose();
  });

  it('a system added during a tick first runs on the next tick', () => {
    const t = setup();
    const late = vi.fn();
    t.game.systems.add({
      id: 'test.adder',
      fixedPhase: 'input',
      fixedUpdate: (_dt, ctx) => {
        if (!ctx.systems.has('test.late')) ctx.systems.add({ id: 'test.late', fixedPhase: 'rules', fixedUpdate: late });
      },
    });
    t.run(1);
    expect(late).not.toHaveBeenCalled();
    t.run(1);
    expect(late).toHaveBeenCalledTimes(1);
    t.world.dispose();
  });

  it('render phases run around the camera update, then the HUD', () => {
    const t = setup();
    const log: string[] = [];
    for (const phase of ['world', 'afterCamera', 'hud'] as const) {
      t.game.systems.add({ id: `test.r.${phase}`, renderPhase: phase, render: () => log.push(phase) });
    }
    t.game.render(0.5, 1 / 60, () => log.push('camera'));
    expect(log).toEqual(['world', 'camera', 'afterCamera', 'hud']);
    t.world.dispose();
  });
});

describe('Game combat with the real Knight', () => {
  it('a sword swing on a dummy is one damage.dealt with attack, swing and direction, inside one window', () => {
    const t = setup();
    const avatar = t.attachKnight();
    const dummy = t.addDummy(0, -1.0);
    t.run(2);
    expect(avatar.controller.playAttack(SLICE)).toBe(true);
    t.run(90);
    const dealt = ofType(t.events, 'damage.dealt');
    expect(dealt).toHaveLength(1);
    expect(dealt[0]).toMatchObject({ attackerId: 'player', targetId: dummy.id, outcome: 'hit', attackId: SLICE, killed: false });
    expect(dealt[0].dealt).toBeGreaterThan(0);
    expect(dealt[0].direction!.length()).toBeCloseTo(1);
    expect(dealt[0].direction!.z).toBeLessThan(-0.9); // the dummy stands to the -Z of the player
    expect(dummy.health).toBe(dummy.maxHealth); // immortal dummies refill
    const windows = ofType(t.events, 'attack.window');
    expect(windows.map((w) => w.phase)).toEqual(['open', 'close']);
    expect(windows[0]).toMatchObject({ actorId: 'player', attackId: SLICE });
    expect(windows[1].swingId).toBe(windows[0].swingId);
    t.game.dispose();
    t.world.dispose();
  });

  it('a hit on a mercied creature revokes its favour credit once the core plugin is set up', async () => {
    const t = setup();
    await t.game.loadPlugins(modules(corePlugin));
    t.attachKnight();
    const dummy = t.addDummy(0, -1.0);
    const before = t.game.ctx.state.favour('ashwalkers');
    t.game.events.emit('mercy', { verb: 'release', tier: 'normal', track: 'ashwalkers', creature: 'ash-wraith', actorId: dummy.id });
    expect(t.game.ctx.state.favour('ashwalkers')).toBe(before + 1);
    t.run(2);
    t.world.avatar!.controller.playAttack(SLICE);
    t.run(90);
    expect(t.game.ctx.state.favour('ashwalkers')).toBe(before);
    expect(ofType(t.events, 'mercy.revoked')).toEqual([{ actorId: dummy.id, track: 'ashwalkers', removed: 1 }]);
    t.game.dispose();
    t.world.dispose();
  });
});

describe('PlayerHandle', () => {
  it('lockMove keeps the player in place, speedScale slows it, removal restores', () => {
    const t = setup();
    t.run(60); // settle
    const start = t.game.ctx.player.feet.clone();
    const remove = t.game.ctx.player.addMoveModifier('test.carry', { lockMove: true });
    key(t.win, 'keydown', 'KeyW');
    t.run(30);
    expect(t.game.ctx.player.feet.distanceTo(start)).toBeLessThan(0.02);
    remove();
    t.run(30);
    const free = t.game.ctx.player.feet.distanceTo(start);
    expect(free).toBeGreaterThan(0.5);
    const slowStart = t.game.ctx.player.feet.clone();
    const removeSlow = t.game.ctx.player.addMoveModifier('test.flask', { speedScale: 0.5 });
    t.run(30);
    expect(t.game.ctx.player.feet.distanceTo(slowStart)).toBeCloseTo(free * 0.5, 1);
    removeSlow();
    t.world.dispose();
  });

  it('lockActions silences those actions for every reader', () => {
    const t = setup();
    const seen: boolean[] = [];
    t.game.systems.add({ id: 'test.read', fixedPhase: 'intent', fixedUpdate: (_d, ctx) => seen.push(ctx.input.actions.pressed('jump')) });
    const remove = t.game.ctx.player.addMoveModifier('test.kneel', { lockActions: ['jump'] });
    key(t.win, 'keydown', 'Space');
    t.run(1);
    key(t.win, 'keyup', 'Space');
    remove();
    key(t.win, 'keydown', 'Space');
    t.run(1);
    expect(seen).toEqual([false, true]);
    t.world.dispose();
  });

  it('teleport moves the player, builds the collider patch there and turns it', () => {
    const t = setup();
    t.run(10);
    const update = vi.spyOn(t.world.colliders, 'update');
    const keysBefore = t.world.colliders.keys;
    t.game.ctx.player.teleport({ x: 120, y: 0, z: -80 }, Math.PI / 2);
    expect(update).toHaveBeenCalledWith(120, -80);
    expect(t.world.colliders.keys.some((k) => !keysBefore.includes(k))).toBe(true);
    expect(t.game.ctx.player.feet.x).toBeCloseTo(120);
    expect(t.game.ctx.player.feet.z).toBeCloseTo(-80);
    expect(t.game.ctx.player.facingYaw).toBeCloseTo(Math.PI / 2);
    t.run(60);
    expect(Math.abs(t.game.ctx.player.feet.y)).toBeLessThan(0.1);
    t.world.dispose();
  });
});

describe('Game plugins', () => {
  it('every real plugin found by the manifest sets up without failing', async () => {
    const t = setup();
    expect(Object.keys(PLUGIN_MODULES).length).toBeGreaterThanOrEqual(1);
    const statuses = await t.game.loadPlugins(PLUGIN_MODULES);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(statuses[0].id).toBe('core');
    t.game.dispose();
    t.world.dispose();
  });

  it('a failing plugin leaves no system, listener, string, widget, service, persistable, modifier or actor behind', async () => {
    const t = setup();
    const before = {
      systems: t.game.systems.size,
      listeners: t.game.events.listenerCount('damage.dealt'),
      actors: t.game.ctx.actors.size,
    };
    const bad: GamePlugin = {
      id: 'bad',
      dependsOn: ['core'],
      setup(ctx) {
        ctx.systems.add({ id: 'bad.system', fixedPhase: 'rules' });
        ctx.events.on('damage.dealt', () => {});
        ctx.strings.register('en', { 'bad.hello': 'hi' });
        ctx.hud.mount('top-right', { id: 'bad.widget', element: {} as HTMLElement });
        ctx.services.provide('bad' as never, {} as never);
        ctx.persist.register({ key: 'bad', version: 1, serialize: () => 1, load: () => {} });
        ctx.damage.addModifier('bad.mod', () => {});
        ctx.player.addMoveModifier('bad', { lockMove: true });
        ctx.actors.spawn({ kind: 'bad', team: 'hostile', maxHealth: 1 });
        ctx.interaction.register({ id: 'use:bad', kind: 'use', position: (o) => o, onInteract: () => {} });
        ctx.anchors.define({ id: 'bad.anchor', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
        ctx.triggers.add({ id: 'bad-trigger', shape: { type: 'sphere', center: { x: 0, y: 0, z: 0 }, radius: 1 } });
        throw new Error('boom');
      },
    };
    const dependant: GamePlugin = { id: 'needs-bad', dependsOn: ['bad'], setup: vi.fn() };
    const statuses = await t.game.loadPlugins(modules(corePlugin, bad, dependant));
    expect(statuses.find((s) => s.id === 'bad')).toMatchObject({ state: 'failed', reason: 'boom' });
    expect(statuses.find((s) => s.id === 'needs-bad')?.state).toBe('skipped');
    expect(dependant.setup).not.toHaveBeenCalled();
    const c = t.game.ctx;
    // core registered its own listener on damage.dealt; bad's is gone.
    expect(t.game.events.listenerCount('damage.dealt')).toBe(before.listeners + 1);
    expect(t.game.systems.has('bad.system')).toBe(false);
    expect(c.strings.has('bad.hello')).toBe(false);
    expect(c.hud.mounted('top-right')).toEqual([]);
    expect(c.services.has('bad')).toBe(false);
    expect(c.persist.get('bad')).toBeUndefined();
    expect(t.moveModifiers.size).toBe(0);
    expect(c.actors.size).toBe(before.actors);
    expect(c.anchors.find('bad.anchor')).toBeUndefined();
    expect(() => c.damage.addModifier('bad.mod', () => {})).not.toThrow(); // the id is free again
    expect(() => c.services.provide('bad' as never, {} as never)).not.toThrow();
    expect(t.game.systems.size).toBe(before.systems);
    t.game.dispose();
    t.world.dispose();
  });

  it('dispose tears plugins down and is idempotent', async () => {
    const t = setup();
    const dispose = vi.fn();
    await t.game.loadPlugins(modules(corePlugin, { id: 'p', setup: (ctx) => void ctx.events.on('rest', () => {}), dispose }));
    expect(t.game.events.listenerCount('rest')).toBe(1);
    t.game.dispose();
    t.game.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(t.game.events.listenerCount('rest')).toBe(0);
    t.world.dispose();
  });

  it('loading plugins twice throws', async () => {
    const t = setup();
    await t.game.loadPlugins({});
    await expect(t.game.loadPlugins({})).rejects.toThrow(/already loaded/);
    t.world.dispose();
  });
});
