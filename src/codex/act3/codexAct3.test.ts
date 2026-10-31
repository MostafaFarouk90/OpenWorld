import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import type { GamePlugin } from '../../core/plugins';
import { ACT3_BLOCKS } from '../../enemies/level';
import { GREYFEN_CODEX } from '../../enemies/fen/codex';
import { FEN_STRINGS_EN } from '../../enemies/fen/strings.en';
import { K10_STRINGS_EN } from '../../gear/sockets/strings.en';
import { StubDocument, textOf } from '../../hud/dom';
import { HUD_STRINGS_EN } from '../../hud/strings.en';
import { MAP_ACT3_STRINGS_EN } from '../../map/act3/strings.en';
import { MAP_STRINGS_EN } from '../../map/strings.en';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { ACT3_WAYSTONES } from '../../region/act3/act3Places';
import { discoveredFlag } from '../../region/region.plugin';
import { REGION_INFO } from '../../region/regions';
import { TRAVERSAL_STRINGS_EN } from '../../traversal/strings.en';
import { ACT2_CODEX_ENTRIES, ACT2_CODEX_STRINGS_EN } from '../act2';
import codexPlugin from '../codex.plugin';
import { createCodexModal } from '../CodexView';
import { CODEX_ENTRIES, CodexRegistry } from '../entries';
import { CODEX_STRINGS_EN } from '../strings.en';
import { HUD_JOURNAL_ACT3_STRINGS_EN } from '../../hud-journal/act3/strings.en';
import { HUD_JOURNAL_STRINGS_EN } from '../../hud-journal/strings.en';
import { ACT3_HUD_STRINGS_EN } from '../../hud/act3/strings.en';
import codexAct3 from './codexAct3.plugin';
import { ACT3_CODEX_ENTRIES, ACT3_CODEX_IDS as ID } from './entries';
import { ACT3_CODEX_STRINGS_EN } from './strings.en';
import { DRAGONSPINE_OPEN_FLAG as DRAGONSPINE_OPEN_FLAG_OWNER } from '../../quests/act3Jump';
import { areaAt, SUMMIT_BOX } from '../../region/areas';
import { GLIDE_LANES } from '../../traversal/glide/lanes';
import { DRAGONSPINE_DISCOVERED_FLAG, DRAGONSPINE_OPEN_FLAG, SUMMIT_AREA, ACT3_DISCOVER_UNLOCKS, ACT3_FLAG_UNLOCKS, ACT3_ITEM_UNLOCKS, GREYFEN_DISCOVERED_FLAG, GREYFEN_GATE_FLAG, act3Backfill, blockLevelFlagOf } from './unlocks';

describe('entries and strings', () => {
  it('has seventeen entries: ten lore places and seven how-tos, with unique ids that no other table uses', () => {
    const tabs = ACT3_CODEX_ENTRIES.map((e) => e.tab);
    expect(tabs.filter((x) => x === 'lore')).toHaveLength(10);
    expect(tabs.filter((x) => x === 'howto')).toHaveLength(7);
    const others = new Set([...CODEX_ENTRIES, ...ACT2_CODEX_ENTRIES, ...GREYFEN_CODEX].map((e) => e.id));
    const ids = ACT3_CODEX_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(others.has(id), id).toBe(false);
    expect(new Set(Object.values(ID))).toEqual(new Set(ids));
  });

  it('every entry has a name and a body, and every string belongs to an entry', () => {
    const keys = new Set<string>();
    for (const e of ACT3_CODEX_ENTRIES) {
      for (const k of [e.nameKey, e.bodyKey]) {
        expect(ACT3_CODEX_STRINGS_EN[k], k).toBeTruthy();
        keys.add(k);
      }
      expect(e.nameKey).toMatch(/^codex\.(lore|howto)\.[a-z-]+\.name$/);
    }
    expect(new Set(Object.keys(ACT3_CODEX_STRINGS_EN))).toEqual(keys);
  });

  it('the registry takes them all (no duplicate against the built-ins and the Act 2 set)', () => {
    const warn = vi.fn();
    const r = new CodexRegistry(undefined, warn);
    r.register(ACT2_CODEX_ENTRIES);
    r.register(GREYFEN_CODEX);
    r.register(ACT3_CODEX_ENTRIES);
    expect(warn).not.toHaveBeenCalled();
    expect(r.of('lore').map((e) => e.id)).toEqual(expect.arrayContaining([ID.greyfen, ID.reedgate, ID.greywatch, ID.mireweather, ID.mere, ID.dragonspine, ID.wyrmwatchLodge, ID.rimePass, ID.lastAnvil, ID.frostfangAerie]));
    expect(r.of('howto').map((e) => e.id)).toEqual(expect.arrayContaining([ID.wading, ID.diving, ID.ferry, ID.blockLevels, ID.shardGems, ID.gliding, ID.summit]));
  });

  it('no string key is used by any other shipped table that this PR touches or sits beside', () => {
    const mine = Object.keys({ ...ACT3_CODEX_STRINGS_EN, ...MAP_ACT3_STRINGS_EN, ...ACT3_HUD_STRINGS_EN, ...HUD_JOURNAL_ACT3_STRINGS_EN });
    const others = [HUD_JOURNAL_STRINGS_EN, CODEX_STRINGS_EN, ACT2_CODEX_STRINGS_EN, FEN_STRINGS_EN, K10_STRINGS_EN, TRAVERSAL_STRINGS_EN, MAP_STRINGS_EN, HUD_STRINGS_EN];
    for (const k of mine) for (const t of others) expect(Object.prototype.hasOwnProperty.call(t, k), k).toBe(false);
    expect(new Set(mine).size).toBe(mine.length);
  });

  it('the Greyfen bestiary entries (leech, shambler) show in the bestiary tab with their strings once seen', () => {
    const registry = new CodexRegistry();
    registry.register(GREYFEN_CODEX);
    expect(registry.of('bestiary').map((e) => e.id)).toEqual(expect.arrayContaining(['fen-leech', 'peat-shambler']));
    const unlocked = new Set<string>();
    const t = (k: string) => ({ ...CODEX_STRINGS_EN, ...FEN_STRINGS_EN } as Record<string, string>)[k] ?? `?${k}`;
    const w = createCodexModal({ has: (id) => unlocked.has(id), markRead: () => {}, isRead: () => false, tally: () => null, entries: registry, glyph: () => 'F', t, doc: new StubDocument() });
    // Unseen: no name leaks.
    expect(textOf(w.element as never)).not.toContain('Fen Leech');
    unlocked.add('fen-leech').add('peat-shambler');
    w.update?.(1);
    w.select('fen-leech');
    expect(textOf(w.element as never)).toContain('Fen Leech');
    w.select('peat-shambler');
    const text = textOf(w.element as never);
    expect(text).toContain('Peat Shambler');
    expect(text).not.toContain('?codex');
  });
});

describe('unlock tables name real signals', () => {
  it("the waystone flags and discover ids are the Act 3 waystones'", () => {
    for (const id of ['reedgate', 'greywatch', 'mireweather-hut', 'hathrens-mere']) {
      expect(ACT3_WAYSTONES).toHaveProperty(id);
      expect(ACT3_FLAG_UNLOCKS.some((u) => u.flag === `waystone.${id}.lit`)).toBe(true);
      expect(ACT3_DISCOVER_UNLOCKS[`waystone.${id}`]).toBeTruthy();
    }
  });

  it("the Dragonspine waystones, region and phase flag are K1's, K0's and K16's", () => {
    for (const id of ['wyrmwatch-lodge', 'rime-pass', 'last-anvil', 'frostfang-aerie']) {
      expect(ACT3_WAYSTONES).toHaveProperty(id);
      expect(ACT3_FLAG_UNLOCKS.some((u) => u.flag === `waystone.${id}.lit`)).toBe(true);
      expect(ACT3_DISCOVER_UNLOCKS[`waystone.${id}`]).toBeTruthy();
    }
    expect(discoveredFlag('dragonspine')).toBe(DRAGONSPINE_DISCOVERED_FLAG);
    expect(REGION_INFO).toHaveProperty('dragonspine');
    expect(DRAGONSPINE_OPEN_FLAG).toBe(DRAGONSPINE_OPEN_FLAG_OWNER);
    expect(areaAt(SUMMIT_BOX.x0 + 10, SUMMIT_BOX.z0 + 10)).toBe(SUMMIT_AREA);
    expect(areaAt(12000, 12000)).toBe('dragonspine-lower');
    expect(GLIDE_LANES.some((l) => l.def.id.includes('summit'))).toBe(true);
  });

  it("the region id, its discovered flag and its opening gate are the region plugin's and K0's", () => {
    expect(REGION_INFO.greyfen.openWhen).toEqual({ all: [GREYFEN_GATE_FLAG] });
    expect(discoveredFlag('greyfen')).toBe(GREYFEN_DISCOVERED_FLAG);
    expect(ACT3_DISCOVER_UNLOCKS.greyfen).toBe(ID.greyfen);
  });

  it("the block-level flags are K9's mirror for every block in the table", () => {
    for (const b of Object.keys(ACT3_BLOCKS)) {
      expect(blockLevelFlagOf(b)).toBe(`warmth.block.${b}.level`);
      expect(ACT3_FLAG_UNLOCKS).toContainEqual({ flag: `warmth.block.${b}.level`, entry: ID.blockLevels });
    }
  });

  it('act3Backfill re-derives each entry from flags and items, and nothing from an empty state', () => {
    const none = { flagSet: () => false, items: () => [] };
    expect(act3Backfill(none)).toEqual([]);
    expect(act3Backfill({ ...none, items: () => undefined })).toEqual([]);
    const flags = (...f: string[]) => ({ flagSet: (k: string) => f.includes(k), items: () => [] });
    expect(act3Backfill(flags('story.gate.a3')).sort()).toEqual([ID.greyfen, ID.blockLevels].sort());
    expect(act3Backfill(flags('place.greyfen.discovered'))).toEqual([ID.greyfen]);
    expect(act3Backfill(flags('waystone.reedgate.lit'))).toEqual([ID.reedgate]);
    expect(act3Backfill(flags('waystone.greywatch.lit'))).toEqual([ID.greywatch]);
    expect(act3Backfill(flags('waystone.mireweather-hut.lit'))).toEqual([ID.mireweather]);
    expect(act3Backfill(flags('waystone.hathrens-mere.lit'))).toEqual([ID.mere]);
    expect(act3Backfill(flags('story.m24.complete'))).toEqual([ID.diving]);
    expect(act3Backfill(flags('warmth.block.dragonspine-lower.level'))).toEqual([ID.blockLevels]);
    const items = (...i: Array<[string, number]>) => ({ flagSet: () => false, items: () => i.map(([id, count]) => ({ id, count })) });
    expect(act3Backfill(items(['gear.fen-boots', 1]))).toEqual([ID.wading]);
    expect(act3Backfill(items(['key.ferry-token', 1]))).toEqual([ID.ferry]);
    expect(act3Backfill(items(['shard-gem.bulwark', 2]))).toEqual([ID.shardGems]);
    // Zero counts and look-alike ids unlock nothing.
    expect(act3Backfill(items(['shard-gem.bulwark', 0], ['key.ferry-token', 0], ['gear.fen-boots-old', 1]))).toEqual([]);
    expect(ACT3_ITEM_UNLOCKS.map((u) => u.entry).sort()).toEqual([ID.ferry, ID.wading].sort());
  });
});

describe('codex-act3 plugin on a reduced manifest', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  }, PLUGIN_TEST_TIMEOUT);
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    codexAct3.dispose?.();
  });

  async function boot() {
    const game = makeTestGame(physics);
    const statuses = await bootPlugins(game, [corePlugin, codexPlugin, codexAct3]);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const ctx = game.ctx;
    const codex = ctx.services.require('codex');
    const emit = (ctx.events.emit as unknown as (t: string, p?: unknown) => void).bind(ctx.events);
    const has = (id: string) => codex.has(id);
    return { game, ctx, codex, emit, has };
  }

  it('registers its strings and starts with every entry locked', async () => {
    const { ctx, has } = await boot();
    expect(ctx.strings.t('codex.howto.diving.name')).toBe('Diving');
    for (const id of Object.values(ID)) expect(has(id), id).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('each live signal unlocks exactly its entry', async () => {
    const fresh = async (fn: (t: Awaited<ReturnType<typeof boot>>) => void, id: string) => {
      const x = await boot();
      fn(x);
      const unlocked = Object.values(ID).filter((e) => x.has(e));
      expect(unlocked, id).toEqual([id]);
    };
    await fresh((x) => x.emit('discover', { placeId: 'greyfen', kind: 'region' }), ID.greyfen);
    await fresh((x) => x.emit('region.entered', { regionId: 'greyfen', previous: null }), ID.greyfen);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.reedgate', kind: 'waystone' }), ID.reedgate);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.greywatch', kind: 'waystone' }), ID.greywatch);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.mireweather-hut', kind: 'waystone' }), ID.mireweather);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.hathrens-mere', kind: 'waystone' }), ID.mere);
    await fresh((x) => x.emit('water.entered', { kind: 'wade', volumeId: 'water.greyfen.x' }), ID.wading);
    await fresh((x) => x.emit('dive.started', { volumeId: 'water.greyfen.m24-pool' }), ID.diving);
    await fresh((x) => x.emit('ferry.boarded', { routeId: 'r', from: 'reedgate', to: 'mere' }), ID.ferry);
    await fresh((x) => x.emit('region.entered', { regionId: 'dragonspine', previous: null }), ID.dragonspine);
    await fresh((x) => x.emit('discover', { placeId: 'dragonspine', kind: 'region' }), ID.dragonspine);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.wyrmwatch-lodge', kind: 'waystone' }), ID.wyrmwatchLodge);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.rime-pass', kind: 'waystone' }), ID.rimePass);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.last-anvil', kind: 'waystone' }), ID.lastAnvil);
    await fresh((x) => x.emit('discover', { placeId: 'waystone.frostfang-aerie', kind: 'waystone' }), ID.frostfangAerie);
    await fresh((x) => x.emit('glide.started', { ledgeId: 'glide.summit-aerie' }), ID.gliding);
    await fresh((x) => x.emit('gear.socketed', { itemId: 'wyrm-tempered-oathblade', slot: 0, shardId: 'shard-gem.bulwark' }), ID.shardGems);
  }, PLUGIN_TEST_TIMEOUT);

  it('events that look alike unlock nothing: deep and dive water, other regions and places, other items, a zero count', async () => {
    const { emit, has } = await boot();
    emit('water.entered', { kind: 'deep', volumeId: 'water.greyfen.mere' });
    emit('water.entered', { kind: 'dive', volumeId: 'water.greyfen.m24-pool' });
    emit('discover', { placeId: 'harrowmark', kind: 'region' });
    emit('discover', { placeId: 'waystone.chapel', kind: 'waystone' });
    emit('region.entered', { regionId: 'harrowmark', previous: null });
    emit('inventory.changed', { itemId: 'iron-ore', count: 3 });
    emit('inventory.changed', { itemId: 'shard-gem.bulwark', count: 0 });
    emit('inventory.changed', { itemId: 'key.ferry-token', count: 0 });
    emit('flag.changed', { key: 'story.m05.complete', value: true, previous: undefined });
    for (const id of Object.values(ID)) expect(has(id), id).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('the Dragonspine flags unlock their entries live and on load, and the summit how-to follows the area', async () => {
    const a = await boot();
    a.ctx.state.setFlag('story.phase.dragonspineOpen', true);
    expect(a.has(ID.dragonspine)).toBe(true);
    const b = await boot();
    b.ctx.state.setFlag('waystone.rime-pass.lit', true);
    b.ctx.state.setFlag('waystone.last-anvil.lit', true);
    expect(b.has(ID.rimePass) && b.has(ID.lastAnvil)).toBe(true);
    expect(b.has(ID.wyrmwatchLodge) || b.has(ID.frostfangAerie)).toBe(false);
    const c = await boot();
    c.ctx.state.load({ flags: { 'waystone.frostfang-aerie.lit': true, 'waystone.wyrmwatch-lodge.lit': true, 'place.dragonspine.discovered': true } });
    c.emit('save.loaded', { slot: 'test' });
    for (const id of [ID.frostfangAerie, ID.wyrmwatchLodge, ID.dragonspine]) expect(c.has(id), id).toBe(true);
    // The summit: the lower slopes unlock nothing, the summit box unlocks the how-to once.
    const d = await boot();
    const mid = { x: (SUMMIT_BOX.x0 + SUMMIT_BOX.x1) / 2, z: (SUMMIT_BOX.z0 + SUMMIT_BOX.z1) / 2 };
    d.ctx.player.teleport({ x: 12000, y: 300, z: 12000 });
    for (let i = 0; i < 3; i++) d.game.fixedUpdate();
    expect(d.has(ID.summit)).toBe(false);
    d.ctx.player.teleport({ x: mid.x, y: 500, z: mid.z });
    for (let i = 0; i < 3; i++) d.game.fixedUpdate();
    expect(d.has(ID.summit)).toBe(true);
    expect(d.has(ID.gliding)).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('holding a shard-gem or the Ferry Token unlocks its how-to', async () => {
    const { emit, has } = await boot();
    emit('inventory.changed', { itemId: 'shard-gem.oathfire', count: 1 });
    emit('inventory.changed', { itemId: 'key.ferry-token', count: 1 });
    expect(has(ID.shardGems)).toBe(true);
    expect(has(ID.ferry)).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('a flag change re-derives (the gate opens the Greyfen and the block-level how-to; a block lock does the same)', async () => {
    const a = await boot();
    a.ctx.state.setFlag('story.gate.a3', true);
    expect(a.has(ID.greyfen)).toBe(true);
    expect(a.has(ID.blockLevels)).toBe(true);
    expect(a.has(ID.diving)).toBe(false);
    const b = await boot();
    b.ctx.state.setFlag('warmth.block.greyfen.level', 21);
    expect(b.has(ID.blockLevels)).toBe(true);
    expect(b.has(ID.greyfen)).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('backfills on save.loaded from flags and from the inventory', async () => {
    const t = await boot();
    t.ctx.state.load({ flags: { 'waystone.mireweather-hut.lit': true, 'story.m24.complete': true, 'place.greyfen.discovered': true } });
    const inv = { items: () => [{ id: 'gear.fen-boots', count: 1 }, { id: 'shard-gem.kindling', count: 1 }] };
    (t.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('inventory', inv);
    expect(t.has(ID.mireweather)).toBe(false);
    t.emit('save.loaded', { slot: 'test' });
    for (const id of [ID.mireweather, ID.diving, ID.greyfen, ID.wading, ID.shardGems]) expect(t.has(id), id).toBe(true);
    for (const id of [ID.reedgate, ID.mere, ID.ferry, ID.greywatch]) expect(t.has(id), id).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a throwing inventory does not break the load', async () => {
    const t = await boot();
    (t.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('inventory', { items: () => { throw new Error('boom'); } });
    t.ctx.state.load({ flags: { 'waystone.reedgate.lit': true } });
    expect(() => t.emit('save.loaded', { slot: 'test' })).not.toThrow();
    expect(t.has(ID.reedgate)).toBe(true); // the flags still count; only the item-driven entries wait
  }, PLUGIN_TEST_TIMEOUT);

  it('entries are registered on the real codex: the codex lists them, unlocks persist through its save', async () => {
    const t = await boot();
    t.codex.unlock(ID.ferry);
    const saved = t.ctx.persist.get('codex')!.serialize() as { unlocked: string[] };
    expect(saved.unlocked).toContain(ID.ferry);
  }, PLUGIN_TEST_TIMEOUT);

  it('binds lazily when the codex service appears after this plugin, and backfills then', async () => {
    const game = makeTestGame(physics);
    const unlocked: string[] = [];
    const registered: unknown[][] = [];
    const late: GamePlugin = {
      id: 'codex',
      dependsOn: ['core'],
      setup(ctx) {
        let ticks = 0;
        ctx.systems.add({
          id: 'late-codex',
          fixedPhase: 'rules',
          order: 0,
          fixedUpdate() {
            if (++ticks === 2) {
              (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('codex', {
                register: (e: unknown[]) => (registered.push(e), () => {}),
                unlock: (id: string) => void unlocked.push(id),
              });
            }
          },
        });
      },
    };
    const statuses = await bootPlugins(game, [corePlugin, late, codexAct3]);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    game.ctx.state.setFlag('waystone.greywatch.lit', true);
    game.fixedUpdate();
    expect(registered).toHaveLength(0);
    for (let i = 0; i < 4; i++) game.fixedUpdate();
    expect(registered).toHaveLength(1);
    expect(registered[0]).toHaveLength(ACT3_CODEX_ENTRIES.length);
    expect(unlocked).toContain(ID.greywatch);
  }, PLUGIN_TEST_TIMEOUT);

  it('with no codex service at all every signal is harmless', async () => {
    const game = makeTestGame(physics);
    const stub: GamePlugin = { id: 'codex', dependsOn: ['core'], setup() {} };
    const statuses = await bootPlugins(game, [corePlugin, stub, codexAct3]);
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const emit = (game.ctx.events.emit as unknown as (t: string, p?: unknown) => void).bind(game.ctx.events);
    expect(() => {
      emit('dive.started', { volumeId: 'x' });
      emit('save.loaded', { slot: 't' });
      game.ctx.state.setFlag('story.gate.a3', true);
      game.fixedUpdate();
    }).not.toThrow();
  }, PLUGIN_TEST_TIMEOUT);
});
