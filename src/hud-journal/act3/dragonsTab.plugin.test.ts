// The dragons' trust tab through the real quests journal on a reduced manifest: hidden before M32, shown after, re-derived on load.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import questsPlugin from '../../quests/quests.plugin';
import type { JournalTabs } from '../../quests/journalTabs';
import hudJournalPlugin from '../hudJournal.plugin';
import { asFake, fakeRoot } from '../fakeDom';
import { DRAGONS_TAB_FLAG, TAB_DRAGONS } from './DragonsTab';
import dragonsTabPlugin from './dragonsTab.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

async function boot(plugins = [corePlugin, questsPlugin, hudJournalPlugin, dragonsTabPlugin], expectOk = true) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, plugins);
  if (expectOk) expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  return { statuses, game, ctx: game.ctx, journal: game.ctx.services.get('journal') as JournalTabs };
}
const ids = (j: JournalTabs) => j.visible().map((t) => t.id);

describe('hud-journal-act3 plugin', () => {
  it('registers the tab, hidden before M32 and shown after, beside the shipped tabs', async () => {
    const t = await boot();
    expect(ids(t.journal)).not.toContain(TAB_DRAGONS);
    expect(t.journal.get(TAB_DRAGONS)).toBeDefined();
    t.ctx.state.setFlag(DRAGONS_TAB_FLAG, true);
    expect(ids(t.journal)).toContain(TAB_DRAGONS);
    const root = fakeRoot();
    t.journal.get(TAB_DRAGONS)!.render(root);
    expect(asFake(root).byClass('favour-name').map((e) => e.textContent)).toEqual(['Trust of the dragons']);
    expect(t.ctx.strings.t('hud.journal.dragons.tab')).toBe("Dragons' Trust");
  }, PLUGIN_TEST_TIMEOUT);

  it('re-derives on load: a save without M32 complete hides it, one with it shows it, and favour is read live', async () => {
    const t = await boot();
    t.ctx.state.setFlag(DRAGONS_TAB_FLAG, true);
    const root = fakeRoot();
    t.journal.get(TAB_DRAGONS)!.render(root);
    t.ctx.state.addFavour('dragons', 8, 'quest');
    expect(asFake(root).byClass('favour-last')[0].textContent).toBe('Last change: +8 Quest');
    (t.ctx.state as any).flags.set(DRAGONS_TAB_FLAG, false); // a load replaces the flags without events
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(ids(t.journal)).not.toContain(TAB_DRAGONS);
    expect(asFake(root).byClass('favour-last')[0].textContent).toBe('No change yet');
    (t.ctx.state as any).flags.set(DRAGONS_TAB_FLAG, true);
    t.game.events.emit('save.loaded', { slot: 'y' });
    expect(ids(t.journal)).toContain(TAB_DRAGONS);
  }, PLUGIN_TEST_TIMEOUT);

  it('is skipped cleanly when the quests plugin (and so the journal service) is absent', async () => {
    const t = await boot([corePlugin, dragonsTabPlugin], false);
    expect(t.journal).toBeUndefined();
    expect(t.statuses.find((s) => s.id === 'hud-journal-act3')?.state).toBe('skipped');
  }, PLUGIN_TEST_TIMEOUT);
});
