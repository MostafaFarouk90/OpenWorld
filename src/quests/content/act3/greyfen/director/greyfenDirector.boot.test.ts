// The Greyfen director on a reduced real manifest (core, nav, region, npcs, interiors, waystones, greyfen, quests, dialogue,
// enemies and the director): the plugin's own wiring, the extra anchors against the real registry, the trigger, the cast.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../../../core/core.plugin';
import type { Game } from '../../../../../core/Game';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../../../../core/testing/bootPlugins';
import dialoguePlugin from '../../../../../dialogue/dialogue.plugin';
import enemiesPlugin from '../../../../../enemies/enemies.plugin';
import greyfenPlugin from '../../../../../greyfen/greyfen.plugin';
import interiorsPlugin from '../../../../../interiors/interiors.plugin';
import navPlugin from '../../../../../nav/nav.plugin';
import npcsPlugin from '../../../../../npcs/npcs.plugin';
import { PhysicsWorld } from '../../../../../physics/PhysicsWorld';
import regionPlugin from '../../../../../region/region.plugin';
import waystonesPlugin from '../../../../../waystones/waystones.plugin';
import questsPlugin from '../../../../quests.plugin';
import directorPlugin from './greyfenDirector.plugin';
import { EXTRA_ANCHORS } from '../extraAnchors';
import { M27_BLINDS_END } from '../m27.quest';

let physics: PhysicsWorld;
let game: Game | null = null;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  game?.dispose();
  game = null;
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as { self?: unknown }).self ??= globalThis;
  game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, navPlugin, regionPlugin, npcsPlugin, interiorsPlugin, waystonesPlugin, greyfenPlugin, enemiesPlugin, questsPlugin, dialoguePlugin, directorPlugin]);
  const run = (n: number) => { for (let i = 0; i < n; i++) game!.fixedUpdate(); };
  return { game: game!, ctx: game!.ctx, statuses, run };
}

describe('the Greyfen director plugin on a reduced real manifest', () => {
  it('boots with every plugin ok and defines the extra anchors in radians beside K3\'s', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    t.run(40);
    for (const e of EXTRA_ANCHORS) {
      const a = t.ctx.anchors.get(e.id);
      expect(a, e.id).toBeDefined();
      expect(Math.abs(a!.yaw), e.id).toBeLessThanOrEqual(2 * Math.PI + 1e-9); // radians, not degrees
      const near = t.ctx.anchors.get(e.near)!;
      expect(Math.hypot(a!.position.x - (near.position.x + e.dx), a!.position.z - (near.position.z + e.dz)), e.id).toBeLessThan(1e-6);
    }
  }, PLUGIN_TEST_TIMEOUT);

  it('adds the blinds-end trigger (a second add of the same id is refused) and registers the minor cast', async () => {
    const t = await boot();
    t.run(2);
    const at = t.ctx.anchors.get('greyfen.m27.blind.4')!;
    expect(() => t.ctx.triggers.add({ id: M27_BLINDS_END, shape: { type: 'sphere', center: at.position, radius: 1 } })).toThrow(/duplicate/);
    const npcs = t.ctx.services.get('npcs')!;
    for (const id of ['reedgate-folk-1', 'reedgate-folk-2', 'reedgate-folk-3']) expect(npcs.get(id), id).toBeDefined();
  }, PLUGIN_TEST_TIMEOUT);

  it('M23 starts behind the Act 3 gate and its first step is current; the group steps arm on the tick', async () => {
    const t = await boot();
    t.run(2);
    const quests = t.ctx.services.get('quests')!;
    expect(quests.get('m23')).toBeDefined();
    expect(quests.start('m23')).toBe(false); // the gate is closed
    t.ctx.state.setFlag('story.gate.a3', true);
    expect(quests.start('m23')).toBe(true);
    t.run(40);
    expect(quests.isObjectiveCurrent('m23', 'brief')).toBe(true);
    expect(t.ctx.state.getBool('story.m23.started')).toBe(true);
    expect(t.ctx.state.getBool('story.m23.knotOut.1')).toBe(false); // armed only when its step is current
  }, PLUGIN_TEST_TIMEOUT);
});
