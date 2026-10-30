// The real Act 2 "act complete" fixture through every real plugin (the manifest includes quests): D01 to D04 are
// done, but the Slagmaw has no outcome flag, only a completed D04 quest. All four gems must arrive, once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from '../../integration/chapterHarness';

const FIXTURES = import.meta.glob<Record<string, unknown>>('../../save/__fixtures__/act2-act-complete.json', { eager: true, import: 'default' });

let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

describe('Act 2 fixture retro-grant', () => {
  it('pays four gems for D01 to D04 (Slagmaw by quest state), and nothing on a second load', async () => {
    const file = structuredClone(Object.values(FIXTURES)[0]);
    h = await bootFromSave(file, { models: false, virtualClock: true });
    expect(h.loaded).toBe(true);
    const flags = (file.entries as Record<string, { data: { flags?: Record<string, unknown> } }>)['world-state'].data.flags ?? {};
    expect(flags['boss.the-slagmaw.outcome']).toBeUndefined();
    const inv = h.ctx.services.require('inventory');
    const gems = () => inv.items().filter((i) => i.id.startsWith('shard-gem.'));
    // The fixture's class is the Knight: bosses 1 to 4 alternate A, B, A, B.
    expect(gems().sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'shard-gem.bulwark', count: 2 },
      { id: 'shard-gem.oathfire', count: 2 },
    ]);
    for (const b of ['ashen-prior', 'gaffer-grimtooth', 'thrandil-redmane', 'the-slagmaw']) expect(h.ctx.state.getFlag(`gear.shardgem.granted.${b}`), b).toBe(true);
    expect(h.ctx.state.getFlag('gear.shardgem.granted.murkjaw')).toBeUndefined();
    h.ctx.events.emit('save.loaded', { slot: 'again' });
    expect(gems().reduce((n, g) => n + g.count, 0)).toBe(4);
  }, 60_000);
});
