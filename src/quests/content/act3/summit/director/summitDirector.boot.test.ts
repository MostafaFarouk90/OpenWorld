// The summit director on a reduced real manifest (core, nav, region, npcs, interiors, waystones, inventory, traversal, wayside shrines, dragonspine, enemies,
// quests, dialogue and the director): its own wiring against the real registries.
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
import directorPlugin from './summitDirector.plugin';
import { SUMMIT_QUEST_IDS } from '../summit.content';
import { SUMMIT_NPC_DEFS } from '../npcs';
import { skarlArmFlag } from '../../../../../bosses/skarl/armGate';
import { D06_LINES_DONE } from '../d06.quest';

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

describe('the summit director plugin on a reduced real manifest', () => {
  it('boots with every plugin ok, the five quests registered, the summit cast placed and the director\'s two anchors defined', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    // the handler, the captive and the led-off Skarl stand only when their flags hold
    for (const f of ['story.m33.anchor5', 'story.d06.started', 'story.d06.sparedStaged']) t.ctx.state.setFlag(f, true);
    t.run(40);
    const quests = t.ctx.services.get('quests')!;
    for (const id of SUMMIT_QUEST_IDS) expect(quests.get(id), id).toBeDefined();
    const npcs = t.ctx.services.get('npcs')!;
    for (const d of SUMMIT_NPC_DEFS) expect(npcs.get(d.id), d.id).toBeDefined();
    expect(npcs.get('thorgar')).toBeDefined();
    for (const a of ['dragonspine.d06.thorgar', 'dragonspine.m34.thorgar']) expect(t.ctx.anchors.get(a), a).toBeDefined();
    expect(t.ctx.strings.t('npc.skarl-led.name')).toBe('Corvin Skarl');
  }, PLUGIN_TEST_TIMEOUT);

  it("M31 waits for the Greyfen, the lower slopes and R16 in the real quest service (the Greyfen's quests are another block's, so none can be started here)", async () => {
    const t = await boot();
    const quests = t.ctx.services.get('quests')!;
    expect(quests.start('m31')).toBe(false);
    expect(quests.start('d06')).toBe(false);
    t.run(2);
    expect(t.ctx.state.getBool('story.m31.started')).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it("K8's Skarl waits for the lines-scene flag while the director runs, and not after it is disposed", async () => {
    const t = await boot();
    t.run(2);
    expect(skarlArmFlag()).toBe(D06_LINES_DONE);
    directorPlugin.dispose?.();
    expect(skarlArmFlag()).toBeNull();
    expect(() => directorPlugin.setup(t.ctx)).not.toThrow();
    expect(skarlArmFlag()).toBe(D06_LINES_DONE);
    directorPlugin.dispose?.();
  }, PLUGIN_TEST_TIMEOUT);
});
