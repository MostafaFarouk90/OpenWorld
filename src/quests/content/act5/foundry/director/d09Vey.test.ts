// D09's floor 3 on N6's real Vey (winVeyForTest): the real core, quests and vey plugins with stand-in enemies and interiors
// services (N6's harness shape) and this block's completion and recheck rules. Both outcomes complete the `vey` step, write
// boss.vey.outcome, and D09's rewards pay their part of the favour split.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../../../core/core.plugin';
import { Game } from '../../../../../core/Game';
import { MoveModifiers } from '../../../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../../../core/plugins';
import { InputManager } from '../../../../../input/InputManager';
import { PhysicsWorld } from '../../../../../physics/PhysicsWorld';
import { TerrainColliders } from '../../../../../world/TerrainColliders';
import { World } from '../../../../../world/World';
import questsPlugin from '../../../../quests.plugin';
import { BossArenas } from '../../../../../bosses/arena';
import veyPlugin from '../../../../../bosses/act5/vey/vey.plugin';
import { winVeyForTest } from '../../../../../bosses/act5/vey/testing';
import { ARENA } from '../../../../../bosses/act5/vey/tuning';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installComplete, installDoneWhenRecheck } from './generic';
import { VEY_OUTCOME } from '../flags';
import { D09_OUTCOME_SEEN } from '../d09.quest';
import { phaseHolds } from '../../../../../region/regions';

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function setup() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null as never, cameraRig: null as never, report: () => {} });
  const stub = (id: string, name: string, value: unknown): GamePlugin => ({
    id, dependsOn: ['core'], setup(c) { (c.services.provide as (n: string, v: unknown) => void)(name, value); },
  });
  const enemies = stub('enemies', 'enemies', { spawnGroup: () => [], reset: () => {}, alive: () => [], despawnGroup: () => {}, view: () => undefined });
  const interiors = stub('interiors', 'interiors', { current: ARENA.interiorId, setBlocker: () => {} });
  const act5Core: GamePlugin = {
    id: 'act5-core', dependsOn: ['core'],
    setup(c) {
      const arenas = new BossArenas({ warn: () => {} });
      (c.services.provide as (n: string, v: unknown) => void)('bossArena', arenas);
      c.events.on('boss.ended', (e) => arenas.onBossEnded(e.bossId));
    },
  };
  const offs: Off[] = [];
  let tick = (): void => {};
  const foundry: GamePlugin = {
    id: 'foundry-test', dependsOn: ['core', 'quests'],
    setup(c) {
      const k = makeKit(c, () => {}, offs);
      tick = k.tick;
      installComplete(k.kit);
      installDoneWhenRecheck(k.kit);
      c.systems.add({ id: 'foundry-test.tick', fixedPhase: 'rules', order: 11, fixedUpdate: () => tick() });
    },
  };
  await game.loadPlugins(modules(corePlugin, questsPlugin, enemies, interiors, act5Core, veyPlugin, foundry));
  const ctx = game.ctx;
  const p = ctx.player.feet.clone();
  const o = { x: p.x, y: p.y, z: p.z - 140 };
  const loc = (x: number, z: number) => ({ x: o.x + x, y: o.y, z: o.z + z });
  ctx.anchors.define({ id: ARENA.entry, position: loc(0, 136), yaw: Math.PI });
  ctx.anchors.define({ id: ARENA.mouth, position: loc(0, 132.8), yaw: Math.PI });
  ctx.anchors.define({ id: ARENA.centre, position: loc(0, 145), yaw: 0 });
  ARENA.caches.forEach((id, i) => ctx.anchors.define({ id, position: loc(i % 2 ? 14 : -14, 141 + i * 3), yaw: 0 }));
  const quests = ctx.services.get('quests')!;
  const run = (n: number) => { for (let i = 0; i < n; i++) game.fixedUpdate(); };
  return { game, ctx, quests, run, teardown: () => { for (const off of offs.splice(0)) off(); game.dispose?.(); } };
}

describe('D09 on the real Vey', () => {
  it('both outcomes finish the vey step and pay the split on top of the boss row', async () => {
    for (const outcome of ['spared', 'defeated'] as const) {
      const t = await setup();
      const { ctx, quests } = t;
      for (const f of ['story.m52.complete', ...phaseHolds('caldera')]) ctx.state.setFlag(f, true);
      quests.start('m53');
      quests.complete('m53');
      expect(quests.start('d09')).toBe(true);
      for (const o of ['brief', 'enter', 'patrol', 'stoker', 'plate', 'slag', 'guards', 'gallery']) quests.completeObjective('d09', o);
      t.run(2);
      expect(quests.isObjectiveCurrent('d09', 'vey')).toBe(true);
      expect(ctx.state.getFlag('story.d09.started')).toBe(true);
      const before = { halvard: ctx.state.favour('halvard'), oswin: ctx.state.favour('oswin') };
      winVeyForTest({ ctx, step: () => t.game.fixedUpdate() }, outcome);
      t.run(3);
      expect(ctx.state.getFlag(VEY_OUTCOME)).toBe(outcome);
      expect(quests.objectiveDone('d09', 'vey')).toBe(true);
      ctx.state.setFlag(D09_OUTCOME_SEEN, true);
      t.run(3);
      expect(quests.state('d09')).toBe('completed');
      expect(ctx.state.getFlag('story.d09.complete')).toBe(true);
      const d = { halvard: ctx.state.favour('halvard') - before.halvard, oswin: ctx.state.favour('oswin') - before.oswin };
      // D09 pays Halvard -4 on the Spare (N6's BOSS_MERCY row pays Oswin +4 through the real enemies service's mercy ledger,
      // stubbed here and tested on N6's side), and Halvard +4, Oswin -2 on the defeat
      if (outcome === 'spared') expect(d.halvard).toBe(-4);
      else expect(d).toEqual({ halvard: 4, oswin: -2 });
      t.teardown();
    }
  }, 120_000);
});
