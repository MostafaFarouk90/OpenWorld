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
async function boot() {
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

describe('tutorialFromQuery', () => {
  it('reads modes and beat jumps and ignores junk', () => {
    expect(tutorialFromQuery('?tutorial=veteran')).toEqual({ mode: 'veteran' });
    expect(tutorialFromQuery('?tutorial=t09')).toEqual({ mode: 'full', at: 't09' });
    expect(tutorialFromQuery('?tutorial=skirmish')).toBeNull();
    expect(tutorialFromQuery('?tutorial=bogus')).toBeNull();
    expect(tutorialFromQuery('')).toBeNull();
  });
});
