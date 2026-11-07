import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import questsPlugin from '../../quests/quests.plugin';
import type { JournalTabs } from '../../quests/journalTabs';
import hudJournalPlugin from '../hudJournal.plugin';
import hudJournalAct5 from './hudJournalAct5.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

async function boot(plugins = [corePlugin, questsPlugin, hudJournalPlugin, hudJournalAct5], expectOk = true) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, plugins);
  if (expectOk) expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  return { statuses, game, ctx: game.ctx, journal: game.ctx.services.get('journal') as JournalTabs };
}

describe('hud-journal-act5 plugin', () => {
  it('the Act 5 pointer shows after the gate and clears when M47 is accepted; no quest def means no other note', async () => {
    const t = await boot();
    expect(t.journal.notes()).toEqual([]);
    t.ctx.state.setFlag('story.gate.a5', true);
    expect(t.journal.notes().map((n) => n.id)).toEqual(['start.a5']);
    expect(t.journal.notes()[0].title).toContain('Rimfoot');
  }, PLUGIN_TEST_TIMEOUT);

  it('the Scar line runs from M54 started to the choice and reads the live count; a load past M54 shows no last-chance warning', async () => {
    const t = await boot();
    const provide = (n: string, v: unknown) => (t.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
    let scars = 9;
    provide('spells', { get scars() { return scars; } });
    expect(t.journal.notes()).toEqual([]);
    t.ctx.state.setFlag('story.m54.started', true);
    let note = t.journal.notes().find((n) => n.id === 'scars.a5')!;
    expect(note.lines![0]).toContain("takes Cael's life");
    expect(note.lines).toHaveLength(2);
    scars = 3;
    note = t.journal.notes().find((n) => n.id === 'scars.a5')!;
    expect(note.lines![0]).toContain('would live');
    t.ctx.state.setFlag('aelfreda.rite.a5', true);
    expect(t.journal.notes().find((n) => n.id === 'scars.a5')!.lines).toHaveLength(1);
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(t.journal.notes().find((n) => n.id === 'lastchance.m54')).toBeUndefined();
    t.ctx.state.setFlag('story.m56.choice', 'rekindle');
    expect(t.journal.notes().find((n) => n.id === 'scars.a5')).toBeUndefined();
  }, PLUGIN_TEST_TIMEOUT);

  it('is skipped cleanly without the quests plugin', async () => {
    const t = await boot([corePlugin, hudJournalAct5], false);
    expect(t.statuses.find((s) => s.id === 'hud-journal-act5')?.state).toBe('skipped');
  }, PLUGIN_TEST_TIMEOUT);
});
