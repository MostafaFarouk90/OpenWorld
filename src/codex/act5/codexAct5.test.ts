import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { GREYFEN_CODEX } from '../../enemies/fen/codex';
import { ACT2_CODEX_ENTRIES, ACT2_CODEX_STRINGS_EN } from '../act2';
import { ACT3_CODEX_ENTRIES } from '../act3/entries';
import { ACT3_CODEX_STRINGS_EN } from '../act3/strings.en';
import { ACT4_CODEX_ENTRIES } from '../act4/entries';
import { ACT4_CODEX_STRINGS_EN } from '../act4/strings.en';
import codexPlugin from '../codex.plugin';
import { CODEX_ENTRIES } from '../entries';
import { CODEX_STRINGS_EN } from '../strings.en';
import codexAct5, { calderaCreatureEntries } from './codexAct5.plugin';
import { ACT5_CODEX_ENTRIES, ACT5_CODEX_IDS as ID } from './entries';
import { ACT5_CODEX_STRINGS_EN } from './strings.en';
import { ACT5_FLAG_UNLOCKS, ACT5_QUEST_UNLOCKS, act5Backfill } from './unlocks';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

describe('Act 5 entries and strings', () => {
  it('ids are unique and no earlier table uses them; the id table matches', () => {
    const others = new Set([...CODEX_ENTRIES, ...ACT2_CODEX_ENTRIES, ...GREYFEN_CODEX, ...ACT3_CODEX_ENTRIES, ...ACT4_CODEX_ENTRIES].map((e) => e.id));
    const ids = ACT5_CODEX_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(others.has(id), id).toBe(false);
    expect(new Set(Object.values(ID))).toEqual(new Set(ids));
  });
  it('every entry has a name and body; no string key is shared with another codex table', () => {
    for (const e of ACT5_CODEX_ENTRIES) {
      expect(ACT5_CODEX_STRINGS_EN[e.nameKey], e.nameKey).toBeTruthy();
      expect(ACT5_CODEX_STRINGS_EN[e.bodyKey], e.bodyKey).toBeTruthy();
    }
    const entryKeys = new Set(ACT5_CODEX_ENTRIES.flatMap((e) => [e.nameKey, e.bodyKey]));
    for (const k of Object.keys(ACT5_CODEX_STRINGS_EN)) expect(entryKeys.has(k), k).toBe(true);
    const others = new Set([...Object.keys(CODEX_STRINGS_EN), ...Object.keys(ACT2_CODEX_STRINGS_EN), ...Object.keys(ACT3_CODEX_STRINGS_EN), ...Object.keys(ACT4_CODEX_STRINGS_EN)]);
    for (const k of Object.keys(ACT5_CODEX_STRINGS_EN)) expect(others.has(k), k).toBe(false);
  });
  it('every unlock names a real entry', () => {
    const ids = new Set(ACT5_CODEX_ENTRIES.map((e) => e.id));
    for (const u of [...ACT5_FLAG_UNLOCKS, ...ACT5_QUEST_UNLOCKS]) expect(ids.has(u.entry), u.entry).toBe(true);
  });
  it("N5's rows: a kind row keeps its kind id, a skin row gets its own id so it cannot collide with the base kind", () => {
    const r = calderaCreatureEntries([
      { kind: 'warhost-soldier', slug: 'warhost-soldier', strings: { 'codex.bestiary.warhost-soldier.name': 'W', 'codex.bestiary.warhost-soldier.body': 'b' } },
      { kind: 'blighted-soldier', slug: 'grisel-loyalist', skin: 'footman-grisel', strings: { 'codex.bestiary.grisel-loyalist.name': 'G', 'codex.bestiary.grisel-loyalist.body': 'b' } },
      { kind: 3 as never, slug: 'x', strings: {} },
    ]);
    expect(r.entries.map((e) => e.id)).toEqual(['warhost-soldier', 'skin.grisel-loyalist']);
    expect(r.skinIds).toEqual(['skin.grisel-loyalist']);
    expect(Object.keys(r.strings)).toHaveLength(4);
  });
});

describe('act5Backfill', () => {
  const none = { flagSet: () => false, questState: () => undefined, items: () => undefined };
  it('a save with nothing yields nothing', () => expect(act5Backfill(none)).toEqual([]));
  it('re-derives flags, quest states and items', () => {
    const ids = act5Backfill({
      flagSet: (k) => k === 'boss.vey.outcome',
      questState: (q) => (q === 'm52' ? 'completed' : q === 'd10' ? 'active' : undefined),
      items: () => [{ id: 'sunplate', count: 1 }, { id: 'forge-heart-fragment', count: 0 }],
    });
    expect(new Set(ids)).toEqual(new Set([ID.vey, ID.siege, ID.hammerHall, ID.heartshard, ID.sunforged]));
  });
  it('a throwing item list is the plugin\'s problem, an empty one is fine', () => {
    expect(act5Backfill({ ...none, items: () => [] })).toEqual([]);
  });
});

describe('codex-act5 plugin', () => {
  it('unlocks live, re-derives on load, and tolerates a missing codex', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const game = makeTestGame(physics);
    const st = await bootPlugins(game, [corePlugin, codexPlugin, codexAct5]);
    expect(st.filter((s) => s.state !== 'ok')).toEqual([]);
    const codex = game.ctx.services.require('codex');
    const has = (id: string): boolean => codex.has(id);
    expect(has(ID.vey)).toBe(false);
    game.ctx.state.setFlag('boss.vey.outcome', 'spared');
    expect(has(ID.vey)).toBe(true);
    game.ctx.events.emit('lava.entered' as never, { volumeId: 'v' } as never);
    expect(has(ID.lava)).toBe(true);
    const bare = makeTestGame(physics);
    const st2 = await bootPlugins(bare, [corePlugin, codexAct5]);
    expect(st2.find((s) => s.id === 'codex-act5')?.state).toBe('skipped');
  }, PLUGIN_TEST_TIMEOUT);
});
