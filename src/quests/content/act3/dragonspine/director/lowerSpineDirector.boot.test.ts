// The lower Dragonspine director on a reduced real manifest (core, nav, region, npcs, interiors, waystones, inventory, traversal,
// wayside shrines, dragonspine, enemies, quests, dialogue and the director): the plugin's own wiring against the real registries.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../../../core/core.plugin';
import type { Game } from '../../../../../core/Game';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../../../../core/testing/bootPlugins';
import dialoguePlugin from '../../../../../dialogue/dialogue.plugin';
import dragonspinePlugin from '../../../../../dragonspine/dragonspine.plugin';
import enemiesPlugin from '../../../../../enemies/enemies.plugin';
import interiorsPlugin from '../../../../../interiors/interiors.plugin';
import inventoryPlugin from '../../../../../inventory/inventory.plugin';
import navPlugin from '../../../../../nav/nav.plugin';
import npcsPlugin from '../../../../../npcs/npcs.plugin';
import { PhysicsWorld } from '../../../../../physics/PhysicsWorld';
import regionPlugin from '../../../../../region/region.plugin';
import waysidePlugin from '../../../../../shrine/act3/wayside.plugin';
import traversalPlugin from '../../../../../traversal/traversal.plugin';
import waystonesPlugin from '../../../../../waystones/waystones.plugin';
import questsPlugin from '../../../../quests.plugin';
import directorPlugin from './lowerSpineDirector.plugin';
import { DRAGONSPINE_QUEST_IDS } from '../dragonspine.content';
import { R17_BUNDLE_ITEM } from '../r17.quest';

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
  const statuses = await bootPlugins(game, [
    corePlugin, navPlugin, regionPlugin, npcsPlugin, interiorsPlugin, waystonesPlugin, inventoryPlugin, traversalPlugin, waysidePlugin, dragonspinePlugin,
    enemiesPlugin, questsPlugin, dialoguePlugin, directorPlugin,
  ]);
  const run = (n: number) => { for (let i = 0; i < n; i++) game!.fixedUpdate(); };
  return { game: game!, ctx: game!.ctx, statuses, run };
}

describe('the lower Dragonspine director plugin on a reduced real manifest', () => {
  it('boots with every plugin ok, the seven quests registered and the cast and anchors in place', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    t.run(40);
    const quests = t.ctx.services.get('quests')!;
    for (const id of DRAGONSPINE_QUEST_IDS) expect(quests.get(id), id).toBeDefined();
    const npcs = t.ctx.services.get('npcs')!;
    for (const id of ['thorgar', 'eadgyth', 'ansgar', 'egg-thief', 'pilgrim-1', 'lodge-hunter-cave']) expect(npcs.get(id), id).toBeDefined();
    expect(t.ctx.anchors.get('dragonspine.r15.cache')).toBeDefined();
  }, PLUGIN_TEST_TIMEOUT);

  it('M28 starts behind the Act 3 gate; accepting it writes story.m28.started and the group steps arm on the tick', async () => {
    const t = await boot();
    t.run(2);
    const quests = t.ctx.services.get('quests')!;
    expect(quests.start('m28')).toBe(false);
    t.ctx.state.setFlag('story.gate.a3', true);
    expect(quests.start('m28')).toBe(true);
    t.run(4);
    expect(t.ctx.state.getBool('story.m28.started')).toBe(true);
    expect(t.ctx.state.getBool('story.r16.started')).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it("R15 puts the three sleds on K4's routes through the real carry service, and completion removes them", async () => {
    const t = await boot();
    t.ctx.state.setFlag('story.gate.a3', true);
    const quests = t.ctx.services.get('quests')!;
    const carry = t.ctx.services.get('carry')!;
    quests.start('m28');
    quests.complete('m28');
    t.run(2);
    expect(quests.state('m28')).toBe('completed');
    expect(carry.checkpoint('sled.r15.1')).toBeNull(); // no sled before R15
    expect(quests.start('r15')).toBe(true);
    t.run(4);
    for (const id of ['sled.r15.1', 'sled.r15.2', 'sled.r15.3']) expect(carry.checkpoint(id), id).not.toBeNull();
    quests.complete('r15');
    t.run(4);
    expect(carry.checkpoint('sled.r15.1')).toBeNull();
    expect(t.ctx.state.getBool('story.r15.complete')).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('the R17 light gate is installed on the real wayside service and refuses without the bundle', async () => {
    const t = await boot();
    t.run(2);
    const wayside = t.ctx.services.get('waysideShrines') as unknown as { light(n: number): boolean };
    expect(wayside.light(3)).toBe(false);
    expect(R17_BUNDLE_ITEM).toBe('forge-candle-bundle');
  }, PLUGIN_TEST_TIMEOUT);

  it('disposes cleanly and sets up again on the same game', async () => {
    const t = await boot();
    t.run(2);
    directorPlugin.dispose?.();
    expect(() => directorPlugin.setup(t.ctx)).not.toThrow();
    t.run(2);
    directorPlugin.dispose?.();
  }, PLUGIN_TEST_TIMEOUT);
});
