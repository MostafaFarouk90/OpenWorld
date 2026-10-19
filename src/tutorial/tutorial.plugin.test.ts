import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import type { TutorialDirector } from './TutorialDirector';
import { tutorialFromQuery } from './tutorial.plugin';

let physics: PhysicsWorld;
const disposers: (() => void)[] = [];

beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const d of disposers.splice(0)) d();
  vi.restoreAllMocks();
});

/** Every real plugin, headless (no document: no start screen, no DOM widgets). */
async function boot(opts: { cameraRig?: ThirdPersonCamera } = {}) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, cameraRig: opts.cameraRig, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(PLUGIN_MODULES);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    game.dispose();
    world.dispose();
  };
  disposers.push(dispose);
  const director = (globalThis as { __tutorial?: TutorialDirector }).__tutorial!;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  return { game, world, moveModifiers, events, statuses, director, run, dispose };
}

describe('tutorial plugin on the real game', () => {
  it('sets up with every other plugin and registers its quests, anchors and persistable', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'tutorial')?.state).toBe('ok');
    const quests = t.game.ctx.services.get('quests')!;
    for (const id of ['t01', 't02', 't04', 't15', 't-skirmish']) expect(quests.get(id)).toBeDefined();
    expect(t.game.ctx.anchors.find('tutorial.gaut.chapel')).toBeDefined();
  });

  it('begin(full) starts T01 with its quest, the verb locks and no Second Wind', async () => {
    const t = await boot();
    t.director.begin('full');
    t.run(2);
    expect(t.director.beat).toBe('t01');
    expect(t.game.ctx.services.get('quests')!.state('t01')).toBe('active');
    expect(t.moveModifiers.isActionLocked('attack2')).toBe(true);
    expect(t.moveModifiers.isActionLocked('surge')).toBe(true);
    expect(t.moveModifiers.isActionLocked('attack1')).toBe(false);
    expect(t.game.ctx.services.get('combatVerbs')!.secondWindCharges).toBe(0);
    expect(t.events.some((e) => e.type === 'tutorial.beat')).toBe(true);
  });

  it('T05 sets the Heartshard flag, plays the crack cutscene and asks for the churchyard wraiths after it', async () => {
    const t = await boot();
    const enemies = t.game.ctx.services.get('enemies')!;
    const spawn = vi.spyOn(enemies, 'spawnGroup');
    t.director.begin('full', 't05');
    t.run(2);
    expect(t.game.ctx.state.getBool('tutorial.heartshard-awakened')).toBe(true);
    expect(t.game.ctx.input.contexts.top()).toBe('cutscene');
    expect(spawn).not.toHaveBeenCalled();
    t.run(200);
    expect(t.game.ctx.input.contexts.top()).toBe('gameplay');
    // Headless there is no enemy model, so the spawn finds nothing and is retried.
    expect(spawn).toHaveBeenCalledWith('t05.churchyard', expect.objectContaining({ aggro: true }));
    const started = t.events.filter((e) => e.type === 'cutscene.started').length;
    const ended = t.events.filter((e) => e.type === 'cutscene.ended').length;
    expect(started).toBe(ended);
  });

  it('T12 to T13 starts M01 (journal) while the gated spawner keeps its wraiths back', async () => {
    const t = await boot();
    t.director.begin('full', 't13');
    t.run(2);
    expect(t.game.ctx.services.get('quests')!.state('m01')).toBe('active');
    expect(t.game.ctx.services.get('enemies')!.alive('m01.lanes')).toHaveLength(0);
    expect(t.game.ctx.services.get('progression')!.level).toBe(2);
  });

  it('a lethal hit in a crisis beat after Second Wind restarts the beat instead of killing', async () => {
    const t = await boot();
    t.director.begin('full', 't09');
    t.run(2);
    const p = t.game.ctx.player.actor;
    const hit = () =>
      t.game.ctx.damage.apply({ attackerId: null, targetId: p.id, amount: p.maxHealth * 3, poise: 0, kind: 'script', unblockable: true });
    hit();
    expect(p.dead).toBe(false); // Second Wind
    t.run(120); // past its invulnerability
    hit();
    expect(p.dead).toBe(false); // tutorial restart
    expect(t.director.restartInFlight).toBe(true);
  });

  it('skipping T04 while the real vow dialogue is open lands on T05, not past it', async () => {
    const t = await boot();
    t.director.begin('full', 't04');
    t.run(2);
    t.director.onEvent({ type: 'trigger', id: 'trg.t04.chapel' });
    t.director.onEvent({ type: 'interact', id: 'kneel:chapel' });
    t.run(2);
    expect(t.game.ctx.services.get('dialogue')!.active).toBeTruthy();
    t.director.skipCurrent();
    t.run(2);
    expect(t.director.beat).toBe('t05');
    const beats = t.events.filter((e) => e.type === 'tutorial.beat').map((e) => e.payload as { beatId: string; state: string });
    expect(beats.filter((b) => b.beatId === 't05' && b.state === 'started')).toHaveLength(1);
    expect(beats.some((b) => b.beatId === 't05' && b.state === 'skipped')).toBe(false);
  });

    it('the cutscene camera renders in the tutorial world band, after VFX and damage numbers', async () => {
    const t = await boot();
    // Probes at the band edges pin the order inside 300..399.
    t.game.systems.add({ id: 'probe.299', renderPhase: 'world', order: 299, render: () => {} });
    t.game.systems.add({ id: 'probe.400', renderPhase: 'world', order: 400, render: () => {} });
    const order = t.game.systems.order('world');
    const at = order.indexOf('tutorial-cutscene-camera');
    expect(at).toBeGreaterThan(order.indexOf('probe.299'));
    expect(at).toBeLessThan(order.indexOf('probe.400'));
    expect(at).toBeGreaterThan(order.indexOf('enemies.render'));
  });

    it('teardown mid-cutscene emits cutscene.ended once and lifts the locks', async () => {
    const t = await boot();
    t.director.begin('full', 't05');
    t.run(2);
    t.dispose();
    const started = t.events.filter((e) => e.type === 'cutscene.started').length;
    const ended = t.events.filter((e) => e.type === 'cutscene.ended').length;
    expect(started).toBe(1);
    expect(ended).toBe(1);
    expect(t.moveModifiers.isActionLocked('attack2')).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(false);
  });
});

describe('arrival facing', () => {
  const rig = () =>
    new ThirdPersonCamera(
      new THREE.PerspectiveCamera(60),
      { consumeMouseDelta: () => ({ dx: 0, dy: 0 }), consumeWheel: () => 0 } as never,
      { raycast: () => null } as never,
      {} as never,
    );
  /** Degrees between the camera's forward and the direction to an anchor. */
  const offAxis = (t: Awaited<ReturnType<typeof boot>>, cam: ThirdPersonCamera, anchor: string) => {
    const a = t.game.ctx.anchors.find(anchor)!.position;
    const p = t.game.ctx.player.feet;
    const f = cam.toWorld(0, 1);
    const dx = a.x - p.x;
    const dz = a.z - p.z;
    return (Math.acos((f.x * dx + f.z * dz) / Math.hypot(dx, dz)) * 180) / Math.PI;
  };

  it('a fresh run starts looking at the village gate and the scarecrow', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    cam.yaw = 0; // as booted: looking south, away from the village
    t.director.begin('full');
    t.run(2);
    expect(offAxis(t, cam, 'brightwater.scarecrow')).toBeLessThan(15);
  });

  it('a ?tutorial= jump faces that beat\'s first target (T05: the churchyard wraiths)', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    t.director.begin('full', 't05');
    t.run(2);
    expect(offAxis(t, cam, 'spawn.t05.wraith-3')).toBeLessThan(40);
  });

  it('a save load arrives facing the saved heading', async () => {
    const cam = rig();
    const t = await boot({ cameraRig: cam });
    // The save plugin restores the player through the waystones' safe teleport (save.plugin.ts).
    void t.game.ctx.services.get('waystones')!.safeTeleport({ x: 0, y: 0, z: 40 }, Math.PI / 2);
    t.run(120); // past the fade-out
    expect(cam.yaw).toBeCloseTo(Math.PI / 2);
    expect(t.game.ctx.player.facingYaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('tutorialFromQuery', () => {
  it('reads modes and beat jumps and ignores junk', () => {
    expect(tutorialFromQuery('?tutorial=veteran')).toEqual({ mode: 'veteran' });
    expect(tutorialFromQuery('?tutorial=t09')).toEqual({ mode: 'full', at: 't09' });
    expect(tutorialFromQuery('?tutorial=skirmish')).toBeNull();
    expect(tutorialFromQuery('?tutorial=bogus')).toBeNull();
    expect(tutorialFromQuery('')).toBeNull();
  });
});
