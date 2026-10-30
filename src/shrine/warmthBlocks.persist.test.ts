import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { Game } from '../core/Game';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../core/testing/bootPlugins';
import enemiesPlugin from '../enemies/enemies.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import questsPlugin from '../quests/quests.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import { SHRINE_IDS } from './warmth';
import shrinePlugin from './shrine.plugin';

// The real spawners' persistable and the real quests persistable, through the Persist registry (plan review B4a, S3).
const T = PLUGIN_TEST_TIMEOUT;
const FLAG = 'warmth.block.greyfen.level';
let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function boot() {
  (globalThis as any).self ??= globalThis;
  const game: Game = makeTestGame(physics);
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  await bootPlugins(game, [corePlugin, waystonesPlugin, spellsPlugin, progressionPlugin, enemiesPlugin, questsPlugin, shrinePlugin]);
  ctx.strings.register('en', { 'test.m23.title': 'M23', 'test.m23.objective': 'Go' });
  ctx.services.require('quests').register({
    id: 'm23',
    titleKey: 'test.m23.title',
    summaryKey: 'test.m23.title',
    objectives: [{ id: 'o', type: 'talk', target: 'x', textKey: 'test.m23.objective' }],
  } as never);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const flagWrites: unknown[] = [];
  (ctx.events as any).on('flag.changed', (e: { key: string }) => e.key === FLAG && flagWrites.push(e));
  const enemies = () => ctx.services.require('enemies');
  return { game, ctx, run, enemies, flagWrites };
}
type B = Awaited<ReturnType<typeof boot>>;

/** Session A: a high-level player, Greyfen locked at W0 by starting M23, then every shrine lit (so a fresh preview differs). */
async function sessionA() {
  const a = await boot();
  a.run(2);
  a.ctx.services.require('progression').grantXp(1e9, 'test');
  a.run(1);
  expect(a.ctx.services.require('quests').start('m23')).toBe(true);
  const L = a.enemies().blockLevel('greyfen')!;
  expect(L).toBeGreaterThan(0);
  for (const id of SHRINE_IDS) a.ctx.state.setFlag(`shrine.${id}.lit`, true);
  a.run(2);
  expect(a.enemies().blockPreview('greyfen')).not.toBe(L); // the later preview moved; the lock must not
  return { a, L, entries: a.ctx.persist.saveAll() };
}
const load = (b: B, entries: ReturnType<B['ctx']['persist']['saveAll']>) => {
  b.ctx.persist.loadAll(entries, b.ctx.events, 'test');
  b.run(2);
};

describe('the Warmth lock through a real save and load', () => {
  it('a save after the lock reloads the same level and flag; the restored active M23 writes nothing and locks nothing again', async () => {
    const { L, entries } = await sessionA();
    const b = await boot();
    b.run(2);
    load(b, entries);
    expect(b.ctx.services.require('quests').state('m23')).toBe('active');
    expect(b.enemies().blockLevel('greyfen')).toBe(L);
    expect(b.ctx.state.getNumber(FLAG)).toBe(L);
    expect(b.ctx.services.require('warmth').blockLevel!('greyfen')).toBe(L);
    expect(b.flagWrites).toEqual([]); // the flag already matched; no second write
  }, T);

  it('a spawners entry with lockedBlockLevels stripped is restored from the flag, not from the new preview', async () => {
    const { L, entries } = await sessionA();
    const stripped = entries.map((e) => {
      if (e.key !== 'enemies') return e;
      const { lockedBlockLevels: _gone, ...rest } = e.data as Record<string, unknown>;
      return { ...e, data: rest };
    });
    expect(stripped.find((e) => e.key === 'enemies')).toBeDefined();
    const b = await boot();
    b.run(2);
    load(b, stripped);
    expect(b.enemies().blockLevel('greyfen')).toBe(L);
    expect(b.ctx.state.getNumber(FLAG)).toBe(L);
  }, T);

  it('a save with no spawners entry and an M23 that is active, no flag: locks at the load-time preview', async () => {
    const { entries } = await sessionA();
    const rest = entries
      .filter((e) => e.key !== 'enemies')
      .map((e) => (e.key === 'state' ? { ...e, data: stripFlag(e.data, FLAG) } : e));
    const b = await boot();
    b.run(2);
    load(b, rest);
    // The level is whatever the preview was at the load (the player level may still be settling), so only that it locked and mirrored.
    const L = b.enemies().blockLevel('greyfen');
    expect(L).toBeGreaterThan(0);
    expect(b.ctx.state.getNumber(FLAG)).toBe(L);
  }, T);
});

function stripFlag(data: unknown, key: string): unknown {
  const d = JSON.parse(JSON.stringify(data));
  const flags = d.flags;
  if (Array.isArray(flags)) d.flags = flags.filter((f: unknown) => (Array.isArray(f) ? f[0] !== key : (f as { key?: string }).key !== key));
  else if (flags && typeof flags === 'object') delete flags[key];
  return d;
}
