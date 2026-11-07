// The Act 4 journal parts through the real quests journal on a reduced manifest: the Ashwalkers' tab (hidden before M43,
// re-derived on load), the act start pointer and M37's "still needed" list (from L10's real M37 def) as journal notes.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import questsPlugin from '../../quests/quests.plugin';
import type { JournalTabs } from '../../quests/journalTabs';
import { M37_NEEDS } from '../../quests/content/act4/harrowmark/m37.quest';
import { asFake, fakeRoot } from '../fakeDom';
import hudJournalPlugin from '../hudJournal.plugin';
import hudJournalAct4, { ASHWALKERS_TAB } from './hudJournalAct4.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

async function boot(plugins = [corePlugin, questsPlugin, hudJournalPlugin, hudJournalAct4], expectOk = true) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, plugins);
  if (expectOk) expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  return { statuses, game, ctx: game.ctx, journal: game.ctx.services.get('journal') as JournalTabs };
}
const ids = (j: JournalTabs) => j.visible().map((t) => t.id);

describe('hud-journal-act4 plugin', () => {
  it('the Ashwalkers tab: hidden before M43, shown after, re-derived on load, reads the ashwalkers track only', async () => {
    const t = await boot();
    expect(ids(t.journal)).not.toContain(ASHWALKERS_TAB.id);
    t.ctx.state.setFlag(ASHWALKERS_TAB.flag, true);
    expect(ids(t.journal)).toContain(ASHWALKERS_TAB.id);
    const root = fakeRoot();
    t.journal.get(ASHWALKERS_TAB.id)!.render(root);
    expect(asFake(root).byClass('favour-name').map((e) => e.textContent)).toEqual(['Standing with the walkers']);
    t.ctx.state.addFavour('dragons', 5, 'quest');
    expect(asFake(root).byClass('favour-last')[0].textContent).toBe('No change yet');
    t.ctx.state.addFavour('ashwalkers', 6, 'quest');
    expect(asFake(root).byClass('favour-last')[0].textContent).toBe('Last change: +6 Quest');
    expect(asFake(root).byClass('favour-value')[0].textContent).toBe(String(t.ctx.state.favour('ashwalkers')));
    (t.ctx.state as any).flags.set(ASHWALKERS_TAB.flag, false); // a load replaces the flags without events
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(ids(t.journal)).not.toContain(ASHWALKERS_TAB.id);
  }, PLUGIN_TEST_TIMEOUT);

  it('the act start pointer is a journal note from the gate until the first quest is accepted', async () => {
    const t = await boot();
    expect(t.journal.notes()).toEqual([]);
    t.ctx.state.setFlag('story.gate.a4', true);
    expect(t.journal.notes().map((n) => n.id)).toEqual(['start.a4']);
    expect(t.journal.notes()[0].title).toContain('Wystan');
    (t.ctx.state as any).flags.set('story.gate.a4', false);
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(t.journal.notes()).toEqual([]);
  }, PLUGIN_TEST_TIMEOUT);

  it("M37's still-needed list from its real def: listed while some are done, gone once all are", async () => {
    const t = await boot();
    const q = t.ctx.services.require('quests');
    expect(q.get('m37')).toBeDefined();
    expect(t.journal.notes()).toEqual([]);
    t.ctx.state.setFlag('story.gate.a4', true);
    expect(q.complete('m35') || (q.start('m35'), q.complete('m35'))).toBe(true);
    const note = t.journal.notes().find((n) => n.id === 'needed.m37')!;
    expect(note.lines).toHaveLength(M37_NEEDS.length - 1);
    for (const id of M37_NEEDS.slice(1)) expect(q.complete(id) || (q.start(id), q.complete(id))).toBe(true);
    expect(t.journal.notes().find((n) => n.id === 'needed.m37')).toBeUndefined();
  }, PLUGIN_TEST_TIMEOUT);

  it('is skipped cleanly without the quests plugin', async () => {
    const t = await boot([corePlugin, hudJournalAct4], false);
    expect(t.statuses.find((s) => s.id === 'hud-journal-act4')?.state).toBe('skipped');
  }, PLUGIN_TEST_TIMEOUT);
});
