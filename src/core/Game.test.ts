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
import { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import type { GameEventMap } from './events';
import { Game } from './Game';
import { MoveModifiers } from './MoveModifiers';
import { Scope } from './scope';
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
    expect(() => c.interaction.register({ id: 'use:bad', kind: 'use', position: (o) => o, onInteract: () => {} })).not.toThrow();
    expect(() => c.triggers.add({ id: 'bad-trigger', shape: { type: 'sphere', center: { x: 0, y: 0, z: 0 }, radius: 1 } })).not.toThrow();
    t.game.dispose();
    t.world.dispose();
  });

  it('a failing plugin releases the input contexts, binding listeners and pauses it took', async () => {
    const t = setup();
    const onBind = vi.fn();
    const bad: GamePlugin = {
      id: 'bad',
      setup(ctx) {
        ctx.input.contexts.push('cutscene', 'bad');
        ctx.input.bindings.onChange(onBind);
        ctx.clock.setPaused('bad.menu', true);
        throw new Error('boom');
      },
    };
    await t.game.loadPlugins(modules(corePlugin, bad));
    const c = t.game.ctx;
    expect(c.input.contexts.top()).toBe('gameplay');
    expect(c.clock.paused).toBe(false);
    c.input.bindings.rebind('jump', 0, { device: 'key', code: 'KeyP' });
    expect(onBind).not.toHaveBeenCalled();
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

describe('round-1 core additions', () => {
  it('freeze holds the player in the air with no gravity; removal lets it fall', () => {
    const t = setup();
    t.run(30);
    t.game.ctx.player.teleport({ x: 0, y: 5, z: 0 });
    const unfreeze = t.game.ctx.player.addMoveModifier('test.cutscene', { freeze: true });
    key(t.win, 'keydown', 'KeyW');
    t.run(30);
    const held = t.game.ctx.player.feet.clone();
    expect(held.y).toBeGreaterThan(4.9);
    expect(Math.hypot(held.x, held.z)).toBeLessThan(0.05);
    unfreeze();
    t.run(90);
    expect(t.game.ctx.player.feet.y).toBeLessThan(1);
    t.world.dispose();
  });

  it('a lockActions modifier added in the intent phase applies to that same tick', () => {
    const t = setup();
    t.run(30);
    let added = false;
    t.game.systems.add({
      id: 'test.intent-lock',
      fixedPhase: 'intent',
      fixedUpdate: (_d, ctx) => {
        if (!added && ctx.input.actions.pressed('jump')) {
          added = true;
          ctx.player.addMoveModifier('test.drink', { lockActions: ['jump'] });
        }
      },
    });
    const jump = vi.spyOn(t.world.player.controller, 'fixedUpdate');
    key(t.win, 'keydown', 'Space');
    t.run(1);
    expect(added).toBe(true);
    expect(jump.mock.calls.at(-1)![0].jump).toBe(false);
    t.world.dispose();
  });

  it('teleport.ready() turns true only after a physics step at a resident destination', () => {
    const t = setup();
    t.run(5);
    const far = { x: 400, y: 0, z: 0 };
    expect(t.game.ctx.terrain.isResident(far.x, far.z, 2)).toBe(false);
    const handle = t.game.ctx.player.teleport(far);
    expect(handle.ready()).toBe(false);
    let ticks = 0;
    while (!handle.ready() && ticks < 120) {
      const residentBefore = t.game.ctx.terrain.isResident(far.x, far.z, 2);
      t.run(1);
      ticks++;
      // ready never turns true in the same tick the patches first became resident.
      if (handle.ready()) expect(residentBefore).toBe(true);
    }
    expect(handle.ready()).toBe(true);
    expect(t.game.ctx.terrain.isResident(far.x, far.z, 2)).toBe(true);
    t.world.dispose();
  });

  it('isResident rejects bad input and needs every overlapping patch', () => {
    const t = setup();
    expect(t.game.ctx.terrain.isResident(NaN, 0)).toBe(false);
    expect(t.game.ctx.terrain.isResident(0, 0, -1)).toBe(false);
    expect(t.game.ctx.terrain.isResident(0, 0, 0)).toBe(true);
    expect(t.game.ctx.terrain.isResident(0, 0, 10_000)).toBe(false);
    t.world.dispose();
  });

  it('clock.frozen covers hit-stop and pause', () => {
    const t = setup();
    expect(t.game.clock.frozen).toBe(false);
    t.game.clock.hitStop(0.02);
    expect(t.game.clock.frozen).toBe(true);
    t.run(2);
    expect(t.game.clock.frozen).toBe(false);
    t.game.clock.setPaused('menu', true);
    expect(t.game.clock.frozen).toBe(true);
    t.world.dispose();
  });

  it('combat registrations of an actor are removed when it despawns, closing an open window', () => {
    const t = setup();
    const actor = t.game.ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 10, spawnTag: 'spawn.m01' });
    const system = t.world.combat.combat;
    const tracer = { attacker: {}, tick: () => [] } as never;
    let open = true;
    const window = { clipName: 'Swing', start: 0, end: 1, currentTime: () => (open ? 0.5 : null) };
    t.game.ctx.combat.addAttacker(actor.id, tracer, window);
    const set = { update: () => {}, tickFlash: () => {} } as never;
    t.game.ctx.combat.addTarget(set, actor.id);
    expect(system.targetCount).toBe(1);
    t.game.ctx.combat.pollWindows();
    t.game.ctx.actors.despawn(actor.id);
    expect(system.targetCount).toBe(0);
    expect(ofType(t.events, 'attack.window').map((w) => w.phase)).toEqual(['open', 'close']);
    open = false;
    t.world.dispose();
  });

  it('actor.died carries the spawnTag', () => {
    const t = setup();
    const actor = t.game.ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 10, spawnTag: 'spawn.m01' });
    t.game.ctx.damage.apply({ attackerId: 'player', targetId: actor.id, amount: 10, kind: 'melee' });
    expect(ofType(t.events, 'actor.died')[0]).toMatchObject({ actorId: actor.id, spawnTag: 'spawn.m01' });
    t.world.dispose();
  });

  it('exposes headless defaults for camera rig and assets', () => {
    const t = setup();
    expect(t.game.ctx.cameraRig).toBeNull();
    expect(t.game.ctx.assets).toBeNull();
    t.world.dispose();
  });
});

describe('keyboard lock', () => {
  it('forwards lock changes to game events and exposes supported and locked', () => {
    const t = setup();
    expect(t.game.ctx.input.keyboardLock).toEqual({ supported: false, locked: false });
    t.input.keyboardLocked = true;
    expect(ofType(t.events, 'input.keyboardLock').at(-1)).toEqual({ supported: false, locked: true });
    expect(t.game.ctx.input.keyboardLock.locked).toBe(true);
    t.game.dispose();
    t.input.keyboardLocked = false;
    expect(ofType(t.events, 'input.keyboardLock')).toHaveLength(1);
    t.world.dispose();
  });
});

describe('core plugin mercy wiring', () => {
  async function loaded() {
    const t = setup();
    await t.game.loadPlugins(modules(corePlugin));
    const c = t.game.ctx;
    const wolf = c.actors.spawn({ kind: 'wolf', team: 'hostile', maxHealth: 100 });
    c.events.emit('mercy', { verb: 'spare', creature: 'wolf', tier: 'normal', track: 'halvard', actorId: wolf.id });
    expect(c.state.isMercied(wolf.id)).toBe(true);
    return { t, c, wolf };
  }

  it('a player hit revokes the credit', async () => {
    const { t, c, wolf } = await loaded();
    c.damage.apply({ attackerId: 'player', targetId: wolf.id, amount: 1, kind: 'melee' });
    expect(c.state.isMercied(wolf.id)).toBe(false);
    expect(c.state.favour('halvard')).toBe(30);
    t.world.dispose();
  });

  it('blocked and immune hits, scripted kills and hostile hits do not revoke', async () => {
    const { t, c, wolf } = await loaded();
    wolf.invulnerable = true;
    c.damage.apply({ attackerId: 'player', targetId: wolf.id, amount: 1, kind: 'melee' });
    wolf.invulnerable = false;
    const other = c.actors.spawn({ kind: 'soldier', team: 'hostile', maxHealth: 10 });
    c.damage.apply({ attackerId: other.id, targetId: wolf.id, amount: 1, kind: 'melee' });
    c.damage.apply({ attackerId: null, targetId: wolf.id, amount: 1, kind: 'fall' });
    expect(c.state.isMercied(wolf.id)).toBe(true);
    c.damage.kill(wolf.id);
    expect(c.state.favour('halvard')).toBe(31);
    t.world.dispose();
  });

  it('despawn ends the revocation window', async () => {
    const { t, c, wolf } = await loaded();
    c.actors.despawn(wolf.id);
    expect(c.state.isMercied(wolf.id)).toBe(false);
    expect(c.state.favour('halvard')).toBe(31);
    t.world.dispose();
  });
});

describe('plugin scope retention', () => {
  it('despawning many enemies does not grow the scope', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    const spawnOne = () => {
      const enemy = ctx.actors.spawn({ kind: 'wolf', team: 'hostile', maxHealth: 10 });
      ctx.actors.bindOwner(enemy, {});
      ctx.combat.addAttacker(enemy.id, { attacker: {}, tick: () => [] } as never, { clipName: 'Bite', start: 0, end: 1, currentTime: () => null });
      ctx.combat.addTarget({ update: () => {}, tickFlash: () => {} } as never, enemy.id);
      return enemy;
    };
    spawnOne();
    t.game.ctx.actors.despawn(t.game.ctx.actors.ofTeam('hostile')[0].id);
    const baseline = scope.size; // the one despawn listener
    for (let i = 0; i < 200; i++) {
      const enemy = spawnOne();
      // Some despawn through the plugin's own context, some through another system.
      (i % 2 ? ctx : t.game.ctx).actors.despawn(enemy.id);
    }
    expect(scope.size).toBe(baseline);
    expect(t.world.combat.combat.targetCount).toBe(0);
    // A live enemy is still torn down on close.
    const live = spawnOne();
    expect(scope.size).toBe(baseline + 4);
    scope.close();
    expect(t.game.ctx.actors.get(live.id)).toBeUndefined();
    expect(t.world.combat.combat.targetCount).toBe(0);
    t.world.dispose();
  });

  it('an id despawned and respawned inside a dispatch keeps the new actor and its registrations', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    const first = ctx.actors.spawn({ id: 'boss', kind: 'boss', team: 'hostile', maxHealth: 10 });
    ctx.combat.addTarget({ update: () => {}, tickFlash: () => {} } as never, first.id);
    let second: ReturnType<typeof ctx.actors.spawn> | undefined;
    ctx.events.once('rest', () => {
      ctx.actors.despawn('boss');
      second = ctx.actors.spawn({ id: 'boss', kind: 'boss', team: 'hostile', maxHealth: 10 });
      ctx.combat.addTarget({ update: () => {}, tickFlash: () => {} } as never, second.id);
    });
    t.game.events.emit('rest', { waystoneId: null } as never);
    expect(t.game.ctx.actors.get('boss')).toBe(second);
    expect(t.world.combat.combat.targetCount).toBe(1);
    scope.close();
    expect(t.game.ctx.actors.get('boss')).toBeUndefined();
    expect(t.world.combat.combat.targetCount).toBe(0);
    t.world.dispose();
  });

  it('closing a scope does not despawn a same-id replacement spawned elsewhere', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    ctx.actors.spawn({ id: 'guard', kind: 'npc', team: 'neutral', maxHealth: 10 });
    t.game.ctx.actors.despawn('guard');
    const other = t.game.ctx.actors.spawn({ id: 'guard', kind: 'npc', team: 'neutral', maxHealth: 10 });
    scope.close();
    expect(t.game.ctx.actors.get('guard')).toBe(other);
    t.world.dispose();
  });

  it('registrations on an actor that never despawns leave the scope when the plugin removes them', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    for (let i = 0; i < 100; i++) ctx.combat.addTarget({ update: () => {}, tickFlash: () => {} } as never, 'player')();
    expect(scope.size).toBe(1); // the despawn listener only
    expect(t.world.combat.combat.targetCount).toBe(0);
    t.world.dispose();
  });

  it('pausing and resuming the same reason repeatedly retains one entry at most', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    for (let i = 0; i < 100; i++) {
      ctx.clock.setPaused('menu', true);
      ctx.clock.setPaused('menu', true);
      ctx.clock.setPaused('menu', false);
    }
    expect(scope.size).toBe(0);
    ctx.clock.setPaused('menu', true);
    expect(scope.size).toBe(1);
    scope.close();
    expect(t.game.clock.paused).toBe(false);
    t.world.dispose();
  });

  it('removers the plugin calls itself leave the scope', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    for (let i = 0; i < 100; i++) {
      ctx.events.on('rest', () => {})();
      ctx.player.addMoveModifier('drink', { speedScale: 0.5 })();
    }
    expect(scope.size).toBe(0);
    expect(t.moveModifiers.size).toBe(0);
    t.world.dispose();
  });
});

describe('v0.4 core additions', () => {
  it('player.leap moves the player forward and emits player.leap start then land', () => {
    const t = setup();
    t.run(60);
    const start = t.game.ctx.player.feet.clone();
    const handle = t.game.ctx.player.leap({ yaw: 0, distance: 6, apex: 1 })!;
    expect(handle).not.toBeNull();
    expect(t.game.ctx.player.leap({ distance: 6, apex: 1 })).toBeNull(); // already leaping
    t.run(120);
    const phases = ofType(t.events, 'player.leap').map((e) => e.phase);
    expect(phases).toEqual(['start', 'land']);
    const land = ofType(t.events, 'player.leap')[1];
    expect(land.to).toBeDefined();
    expect(start.z - t.game.ctx.player.feet.z).toBeGreaterThan(5); // yaw 0 faces -Z
    expect(handle.landed).toBe(true);
    t.world.dispose();
  });

  it('a teleport mid-leap cancels it', () => {
    const t = setup();
    t.run(60);
    const handle = t.game.ctx.player.leap({ distance: 6, apex: 1 })!;
    t.run(5);
    t.game.ctx.player.teleport({ x: 30, y: 0, z: 30 });
    expect(handle.active).toBe(false);
    expect(ofType(t.events, 'player.leap').map((e) => e.phase)).toEqual(['start', 'cancel']);
    t.world.dispose();
  });

  it('gates and boss registrations made by a plugin are removed with its scope', () => {
    const t = setup();
    const scope = new Scope();
    const ctx = t.game.scopedContext(scope);
    const seen: boolean[] = [];
    ctx.gates.flag('story.slice.harrowmarkOpen', (open) => seen.push(open));
    const prior = ctx.actors.spawn({ kind: 'ashen-prior', team: 'hostile', maxHealth: 100, maxPoise: 30 });
    ctx.bosses.register(prior.id, { bossId: 'ashen-prior', nameKey: 'boss.ashen-prior', phases: [0.5], breaksPerPhase: 3 });
    expect(t.game.ctx.bosses.active()).toEqual(['ashen-prior']);
    scope.close();
    expect(t.game.ctx.bosses.active()).toEqual([]);
    t.game.ctx.state.setFlag('story.slice.harrowmarkOpen', true);
    expect(seen).toEqual([false]);
    t.world.dispose();
  });

  it('the boss release window ticks on simulated time only', () => {
    const t = setup();
    const ctx = t.game.ctx;
    const prior = ctx.actors.spawn({ kind: 'ashen-prior', team: 'hostile', maxHealth: 100, maxPoise: 10 });
    ctx.bosses.register(prior.id, { bossId: 'ashen-prior', nameKey: 'boss.ashen-prior', phases: [], breaksPerPhase: 1, releaseWindowSeconds: 0.5 });
    ctx.damage.stagger(prior.id, 'player', 10);
    expect(ctx.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    ctx.clock.setPaused('test.menu', true);
    t.run(60);
    expect(ctx.bosses.state('ashen-prior')!.releaseOpen).toBe(true);
    ctx.clock.setPaused('test.menu', false);
    t.run(40);
    expect(ctx.bosses.state('ashen-prior')!.releaseOpen).toBe(false);
    t.world.dispose();
  });

  it('a camera override made through a plugin scope is released on teardown, another plugin\'s stays', () => {
    const t = setup();
    const camera = new THREE.PerspectiveCamera(60);
    const input = { consumeMouseDelta: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0 } as never;
    const rig = new ThirdPersonCamera(camera, input, { raycast: () => null } as never, {} as never);
    const game = new Game({ scene: t.scene, physics, world: t.world, input: t.input, moveModifiers: t.moveModifiers, cameraRig: rig, report: () => {} });
    const a = new Scope();
    const b = new Scope();
    const ha = game.scopedContext(a).cameraRig!.override({ position: { x: 0, y: 5, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } });
    const hb = game.scopedContext(b).cameraRig!.override({ position: { x: 1, y: 5, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } });
    a.close();
    expect(ha.active).toBe(false);
    expect(hb.active).toBe(true);
    expect(rig.overridden).toBe(true);
    hb.release();
    expect(b.size).toBe(0); // a self-release leaves the scope
    expect(rig.overridden).toBe(false);
    expect(new Game({ scene: t.scene, physics, world: t.world, input: t.input, moveModifiers: t.moveModifiers }).scopedContext(new Scope()).cameraRig).toBeNull();
    game.dispose();
    t.world.dispose();
  });
});
