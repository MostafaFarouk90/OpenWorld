import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { TrainingDummies } from '../world/TrainingDummies';
import { HEAVY_CHOP_CLIP } from '../combat/heavyBlow';
import dialoguePlugin from '../dialogue/dialogue.plugin';
import questsPlugin from './quests.plugin';
import { R02Yard, R02_DUMMY_ANCHORS } from './r02Yard';

describe('R02Yard (unit)', () => {
  const spot = { feet: { x: 0, y: 0, z: 0 }, yaw: 0 };
  function rig(opts: { wired?: boolean; missing?: string[] } = {}) {
    let active = false;
    let wired = opts.wired ?? true;
    const placed: number[] = [];
    let disposed = 0;
    const warn = vi.fn();
    const dummies = {
      placeBlocking: (s: readonly unknown[]) => {
        if (!wired) return [];
        placed.push(s.length);
        return s.map(() => ({}) as never);
      },
      disposeBlocking: () => { disposed++; },
    };
    let provided = true;
    const yard = new R02Yard({
      active: () => active,
      spot: (id) => (opts.missing?.includes(id) ? null : spot),
      dummies: () => (provided ? dummies : undefined),
      warn,
    });
    return {
      yard, placed, warn,
      disposed: () => disposed,
      setActive: (v: boolean) => { active = v; yard.markDirty(); },
      setWired: (v: boolean) => { wired = v; },
      setProvided: (v: boolean) => { provided = v; },
    };
  }

  it('places three dummies when R02 becomes active and removes them when it ends', () => {
    const r = rig();
    r.yard.update();
    expect(r.placed).toEqual([]);
    r.setActive(true);
    r.yard.update();
    r.yard.update();
    expect(r.placed).toEqual([3]);
    expect(r.yard.standing).toBe(true);
    r.setActive(false);
    r.yard.update();
    expect(r.disposed()).toBe(1);
    expect(r.yard.standing).toBe(false);
  });

  it('retries while the service is missing or not wired, without throwing', () => {
    const r = rig({ wired: false });
    r.setProvided(false);
    r.setActive(true);
    r.yard.update();
    r.setProvided(true);
    r.yard.update();
    expect(r.yard.standing).toBe(false);
    r.setWired(true);
    r.yard.update();
    expect(r.placed).toEqual([3]);
  });

  it('skips a missing anchor with one warning', () => {
    const r = rig({ missing: [R02_DUMMY_ANCHORS[1]] });
    r.setActive(true);
    r.yard.update();
    expect(r.placed).toEqual([2]);
    expect(r.warn).toHaveBeenCalledTimes(1);
  });

  it('dispose removes standing dummies', () => {
    const r = rig();
    r.setActive(true);
    r.yard.update();
    r.yard.dispose();
    expect(r.disposed()).toBe(1);
  });
});

// ---- headless game: the real quests plugin, R02 and the real blocking dummies ----

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

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
  const ctx = game.ctx;
  // What startWorld does for the dummies service (startWorld.ts).
  const dummies = new TrainingDummies(() => {});
  ctx.services.provide('dummies', dummies);
  dummies.configureBlocking({
    scene: ctx.scene, actors: ctx.actors, damage: ctx.damage, events: ctx.events, combat: ctx.combat,
    playerFeet: () => ctx.player.feet,
  });
  ctx.systems.add({ id: 'world.blockingDummies', fixedPhase: 'afterCombat', order: 50, fixedUpdate: (dt) => dummies.updateBlocking(dt) });
  for (const [i, id] of R02_DUMMY_ANCHORS.entries()) {
    if (!ctx.anchors.find(id)) ctx.anchors.define({ id, position: new THREE.Vector3(-49 + i * 4, 0, 108), yaw: 0, tags: ['dummy'] } as never);
  }
  await game.loadPlugins(modules(corePlugin, questsPlugin, dialoguePlugin));
  const quests = ctx.services.require('quests');
  const dummyIds = () => [...ctx.actors.all()].filter((a) => a.kind === 'blocking-dummy').map((a) => a.id);
  const ticks = (n: number) => { for (let i = 0; i < n; i++) game.fixedUpdate(); };
  const hit = (targetId: string, attackId?: string) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId, amount: 5, poise: 5, kind: 'melee', attackId, direction: new THREE.Vector3(0, 0, -1) });
  const talkStane = () => ctx.events.emit('dialogue.ended' as never, { npcId: 'stane', dialogueId: 'npc-stane', reason: 'completed' } as never);
  const done = () => { game.dispose(); world.dispose(); };
  return { game, ctx, quests, dummyIds, ticks, hit, talkStane, done };
}

describe('R02 on the real blocking dummies', () => {
  it('spawns the dummies only while R02 is active, and the quest completes on real hits, parries and guard breaks', async () => {
    const t = await boot();
    t.ticks(2);
    expect(t.dummyIds()).toHaveLength(0);
    expect(t.quests.start('r02')).toBe(true);
    t.ticks(1);
    const ids = t.dummyIds();
    expect(ids).toHaveLength(3);

    // o2 cannot count before o1 (sequential): an open hit now is ignored.
    t.ticks(80); // guard drops after 1.2 s
    t.hit(ids[0]);
    expect(t.quests.objectives('r02')[1].progress ?? 0).toBe(0);
    t.talkStane();
    expect(t.quests.objectiveDone('r02', 'o1')).toBe(true);

    for (let i = 0; i < 3; i++) t.hit(ids[0]);
    expect(t.quests.objectiveDone('r02', 'o2')).toBe(true);
    for (let i = 0; i < 3; i++) t.ctx.events.emit('player.parried', { attackerId: ids[1] });
    expect(t.quests.objectiveDone('r02', 'o3')).toBe(true);
    // Guards up again on a fresh cycle: heavy chops break them.
    t.ticks(70);
    t.hit(ids[2], HEAVY_CHOP_CLIP);
    t.hit(ids[1], HEAVY_CHOP_CLIP);
    expect(t.quests.objectiveDone('r02', 'o4')).toBe(true);
    t.talkStane();
    expect(t.quests.state('r02')).toBe('completed');
    t.ticks(1);
    expect(t.dummyIds()).toHaveLength(0);
    t.done();
  });

  it('re-derives on load: a save with R02 active brings the dummies back, one without removes them', async () => {
    const t = await boot();
    t.quests.start('r02');
    t.ticks(1);
    const saved = t.ctx.persist.all().find((p) => p.key === 'quests')!.serialize();
    t.quests.fail('r02');
    t.ticks(1);
    expect(t.dummyIds()).toHaveLength(0);
    t.ctx.persist.all().find((p) => p.key === 'quests')!.load(JSON.parse(JSON.stringify(saved)), 1);
    t.ctx.events.emit('save.loaded', { slot: 'main' } as never);
    t.ticks(1);
    expect(t.dummyIds()).toHaveLength(3);
    t.done();
  });
});
