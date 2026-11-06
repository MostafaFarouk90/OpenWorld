import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { GREYFEN_CODEX } from '../../enemies/fen/codex';
import { ACT2_CODEX_ENTRIES, ACT2_CODEX_STRINGS_EN } from '../act2';
import { ACT3_CODEX_ENTRIES } from '../act3/entries';
import { ACT3_CODEX_STRINGS_EN } from '../act3/strings.en';
import codexPlugin from '../codex.plugin';
import { CODEX_ENTRIES, CodexRegistry } from '../entries';
import { CODEX_STRINGS_EN } from '../strings.en';
import { ASH_MASK } from '../../weather/tuning';
import codexAct4, { act4CodexEntries, wasteCreatureEntries } from './codexAct4.plugin';
import { ACT4_CODEX_ENTRIES, ACT4_CODEX_IDS as ID } from './entries';
import { ACT4_CODEX_STRINGS_EN } from './strings.en';
import { ACT4_FLAG_UNLOCKS, ACT4_QUEST_UNLOCKS, act4Backfill } from './unlocks';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

const ROWS = [
  { kind: 'waste-strider', slug: 'waste-strider', strings: { 'codex.bestiary.waste-strider.name': 'Waste Strider', 'codex.bestiary.waste-strider.body': 'Long legs.' } },
  { kind: 'cinder-gnat-swarm', slug: 'cinder-gnat-swarm', strings: { 'codex.bestiary.cinder-gnat-swarm.name': 'Cinder Gnats', 'codex.bestiary.cinder-gnat-swarm.body': 'Many.' } },
];

describe('Act 4 entries and strings', () => {
  it('unique ids that no other table uses, every id in the id table', () => {
    const others = new Set([...CODEX_ENTRIES, ...ACT2_CODEX_ENTRIES, ...GREYFEN_CODEX, ...ACT3_CODEX_ENTRIES].map((e) => e.id));
    const ids = ACT4_CODEX_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(others.has(id), id).toBe(false);
    expect(new Set(Object.values(ID))).toEqual(new Set(ids));
  });

  it('every entry has a name and a body, every string belongs to an entry, no key is shared with another codex table', () => {
    const keys = new Set<string>();
    for (const e of ACT4_CODEX_ENTRIES) {
      for (const k of [e.nameKey, e.bodyKey]) {
        expect(ACT4_CODEX_STRINGS_EN[k], k).toBeTruthy();
        keys.add(k);
      }
    }
    expect(new Set(Object.keys(ACT4_CODEX_STRINGS_EN))).toEqual(keys);
    for (const t of [CODEX_STRINGS_EN, ACT2_CODEX_STRINGS_EN, ACT3_CODEX_STRINGS_EN]) {
      for (const k of keys) expect(Object.prototype.hasOwnProperty.call(t, k), k).toBe(false);
    }
  });

  it('the registry takes them beside every earlier set with no duplicate warning', () => {
    const warn = vi.fn();
    const r = new CodexRegistry(undefined, warn);
    for (const set of [ACT2_CODEX_ENTRIES, GREYFEN_CODEX, ACT3_CODEX_ENTRIES, act4CodexEntries(ROWS)]) r.register(set);
    expect(warn).not.toHaveBeenCalled();
    expect(r.of('bestiary').map((e) => e.id)).toEqual(expect.arrayContaining([ID.bellowsEngine, ID.eormen, 'waste-strider', 'cinder-gnat-swarm']));
  });

  it("L5's rows become bestiary entries with their strings; a bad row is skipped", () => {
    const { entries, strings } = wasteCreatureEntries([...ROWS, null as never, { kind: 3, slug: 'x', strings: {} } as never]);
    expect(entries.map((e) => [e.id, e.tab, e.nameKey])).toEqual([
      ['waste-strider', 'bestiary', 'codex.bestiary.waste-strider.name'],
      ['cinder-gnat-swarm', 'bestiary', 'codex.bestiary.cinder-gnat-swarm.name'],
    ]);
    expect(strings['codex.bestiary.cinder-gnat-swarm.name']).toBe('Cinder Gnats');
    // The shipped list is empty until L5's module is stacked: only L9's own entries.
    expect(act4CodexEntries()).toHaveLength(ACT4_CODEX_ENTRIES.length);
  });
});

describe('act4Backfill', () => {
  const none = { flagSet: () => false, questState: () => undefined, items: () => undefined };
  it('nothing from an empty state', () => {
    expect(act4Backfill(none)).toEqual([]);
  });

  it('flags, accepted quests and the mask item each unlock their entries; inactive quests do not', () => {
    for (const u of ACT4_FLAG_UNLOCKS) expect(act4Backfill({ ...none, flagSet: (k) => k === u.flag })).toContain(u.entry);
    for (const u of ACT4_QUEST_UNLOCKS) {
      expect(act4Backfill({ ...none, questState: (q) => (q === u.quest ? 'active' : undefined) })).toContain(u.entry);
      expect(act4Backfill({ ...none, questState: (q) => (q === u.quest ? 'inactive' : undefined) })).not.toContain(u.entry);
    }
    expect(act4Backfill({ ...none, items: () => [{ id: ASH_MASK.itemId, count: 1 }] })).toEqual([ID.mask]);
    expect(act4Backfill({ ...none, items: () => [{ id: ASH_MASK.itemId, count: 0 }] })).toEqual([]);
  });

  it('the people, places and lore named in the plan all have a way to unlock', () => {
    const reachable = new Set([...ACT4_FLAG_UNLOCKS.map((u) => u.entry), ...ACT4_QUEST_UNLOCKS.map((u) => u.entry)]);
    for (const id of Object.values(ID)) {
      // The bosses also unlock on boss.started through the codex plugin's own rule.
      expect(reachable.has(id), id).toBe(true);
    }
  });
});

describe('codex-act4 plugin', () => {
  async function boot() {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const game = makeTestGame(physics);
    const statuses = await bootPlugins(game, [corePlugin, codexPlugin, codexAct4]);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const ctx = game.ctx;
    const codex = ctx.services.require('codex');
    const emit = (ctx.events.emit as unknown as (t: string, p?: unknown) => void).bind(ctx.events);
    return { game, ctx, codex, emit, has: (id: string) => codex.has(id) };
  }

  it('registers its strings and starts with every entry locked', async () => {
    const t = await boot();
    expect(t.ctx.strings.t('codex.lore.person-gaut.name')).toBe('Sir Gaut Halvard');
    for (const id of Object.values(ID)) expect(t.has(id), id).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('live signals unlock their entries', async () => {
    const t = await boot();
    t.emit('discover', { placeId: 'waste.husk-cathedral', kind: 'poi' });
    expect(t.has(ID.huskCathedral)).toBe(true);
    t.emit('weather.changed', { kind: 'clear', from: 'storm' });
    expect(t.has(ID.storms)).toBe(false);
    t.emit('weather.changed', { kind: 'warning', from: 'clear' });
    expect(t.has(ID.storms)).toBe(true);
    t.emit('dialogue.started', { dialogueId: 'x', npcId: 'ebba' });
    expect(t.has(ID.ebba)).toBe(true);
    t.emit('quest.started', { questId: 'm38' });
    expect(t.has(ID.councilChamber)).toBe(true);
    t.emit('escort.started', { escortId: 'm35.oswin' });
    expect(t.has(ID.escorts)).toBe(true);
    t.ctx.state.setFlag('story.m39.complete', true);
    expect(t.has(ID.gaut)).toBe(true);
    // The codex plugin's own rule: a boss fight starting unlocks a registered bestiary entry.
    t.emit('boss.started', { bossId: 'bellows-engine' });
    expect(t.has(ID.bellowsEngine)).toBe(true);
    // Nothing else came with them.
    expect(t.has(ID.eormen)).toBe(false);
    expect(t.has(ID.vey)).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a load re-derives from flags (a string outcome counts) without events', async () => {
    const t = await boot();
    const flags = (t.ctx.state as any).flags as Map<string, unknown>;
    flags.set('boss.eormen.outcome', 'released');
    flags.set('story.m44.dreamSeen', true);
    expect(t.has(ID.eormen)).toBe(false);
    t.emit('save.loaded', { slot: 'a' });
    expect(t.has(ID.eormen)).toBe(true);
    expect(t.has(ID.dream)).toBe(true);
    expect(t.has(ID.vey)).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);
});
