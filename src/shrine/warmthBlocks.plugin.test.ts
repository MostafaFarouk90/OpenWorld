import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../core/testing/bootPlugins';
import { blockBaseLevel, type Act3BlockId } from '../enemies/level';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import shrinePlugin from './shrine.plugin';

const T = PLUGIN_TEST_TIMEOUT;
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
  const game = makeTestGame(physics);
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  // The spawners' lock as EnemyManager exposes it; `W` follows the shrine plugin's setWarmthTier.
  const enemies = {
    W: 0,
    P: 18 as number | undefined,
    locks: {} as Record<string, number>,
    setWarmthTier(w: number) {
      this.W = w;
    },
    blockPreview(b: Act3BlockId) {
      return this.P === undefined ? undefined : blockBaseLevel(b, this.W, this.P);
    },
    blockLevel(b: Act3BlockId) {
      return this.locks[b];
    },
    lockBlockLevel(b: string, l: number) {
      return (this.locks[b] ??= Math.round(l));
    },
  };
  ctx.services.provide('enemies' as never, enemies as never);
  const states = new Map<string, string>();
  ctx.services.provide('quests' as never, { state: (id: string) => states.get(id) ?? 'inactive', onChange: () => () => {} } as never);
  const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, spellsPlugin, progressionPlugin, shrinePlugin]);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const start = (id: string) => {
    states.set(id, 'active');
    ctx.events.emit('quest.started', { questId: id });
  };
  const light = (...ids: string[]) => ids.forEach((id) => ctx.state.setFlag(`shrine.${id}.lit`, true));
  return { game, ctx, enemies, states, statuses, run, start, light };
}

describe('Warmth blocks on the shrine plugin', () => {
  it('provides the four block methods and installs the reward provider', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const w = t.ctx.services.require('warmth');
    for (const m of ['lockBlock', 'blockLevel', 'preview', 'rewardScale'] as const) expect(typeof w[m]).toBe('function');
    expect(t.ctx.services.require('questRewardScale').scale('m24')).toBe(1); // unlocked: identity
  }, T);

  it('M23 started locks Greyfen at the preview and writes the flag; the Mere then raises only the spine preview', async () => {
    const t = await boot();
    t.run(2);
    t.light('quenchstone', 'hushed-anvil', 'weeping-bellows'); // W3
    const w = t.ctx.services.require('warmth');
    expect(w.preview!('greyfen')).toBe(18);
    expect(w.preview!('dragonspine-lower')).toBe(20);
    t.start('m23');
    expect(w.blockLevel!('greyfen')).toBe(18);
    expect(t.ctx.state.getNumber('warmth.block.greyfen.level')).toBe(18);
    expect(t.ctx.state.hasFlag('warmth.block.dragonspine-lower.level')).toBe(false);
    expect(w.preview!('dragonspine-lower')).toBe(20); // accepting M23 does not change W
    t.light('hathrens-mere'); // W4
    expect(w.preview!('dragonspine-lower')).toBe(23);
    expect(w.preview!('greyfen')).toBe(18);
    t.start('m28');
    expect(w.blockLevel!('dragonspine-lower')).toBe(23);
    expect(t.ctx.state.getNumber('warmth.block.dragonspine-lower.level')).toBe(23);
  }, T);

  it('quest rewards scale through questRewardScale: m24 at L 21 pays 21/18, m22 pays 1', async () => {
    const t = await boot();
    t.run(2);
    t.light('quenchstone', 'hushed-anvil', 'weeping-bellows', 'last-anvil');
    t.start('m23');
    const scale = t.ctx.services.require('questRewardScale');
    expect(t.enemies.locks.greyfen).toBe(21);
    expect(scale.scale('m24')).toBeCloseTo(21 / 18, 10);
    expect(Math.round(600 * scale.scale('m24'))).toBe(700);
    expect(scale.scale('m22')).toBe(1);
    expect(scale.scale('r15')).toBe(1); // spine quest before its lock
  }, T);

  it('a load that restores M23 active changes neither the lock nor the flag', async () => {
    const t = await boot();
    t.run(2);
    t.light('quenchstone');
    t.start('m23');
    const L = t.enemies.locks.greyfen;
    t.light('hushed-anvil', 'weeping-bellows');
    t.enemies.P = 30;
    t.ctx.events.emit('save.loaded', {} as never);
    t.run(3);
    expect(t.enemies.locks.greyfen).toBe(L);
    expect(t.ctx.state.getNumber('warmth.block.greyfen.level')).toBe(L);
  }, T);

  it('a lock lost on load is restored from the flag, and a missing flag with M23 completed locks at the preview', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('warmth.block.greyfen.level', 21);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.enemies.locks.greyfen).toBe(21);
    t.states.set('m28', 'completed');
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.enemies.locks['dragonspine-lower']).toBe(t.enemies.blockPreview('dragonspine-lower'));
    expect(t.ctx.state.getNumber('warmth.block.dragonspine-lower.level')).toBe(t.enemies.locks['dragonspine-lower']);
  }, T);

  it('a level that appears later is locked on a later tick', async () => {
    const t = await boot();
    t.enemies.P = undefined;
    t.run(2);
    t.start('m23');
    t.run(3);
    expect(t.enemies.locks.greyfen).toBeUndefined();
    t.enemies.P = 18;
    t.run(1);
    expect(t.enemies.locks.greyfen).toBe(t.enemies.blockPreview('greyfen'));
    expect(t.ctx.state.hasFlag('warmth.block.greyfen.level')).toBe(true);
  }, T);

  it('mirrors a lock made through the enemies service (the ?act3= jump) into the flag', async () => {
    const t = await boot();
    t.run(2);
    t.enemies.lockBlockLevel('dragonspine-lower', 20);
    t.run(1);
    expect(t.ctx.state.getNumber('warmth.block.dragonspine-lower.level')).toBe(20);
  }, T);
});
