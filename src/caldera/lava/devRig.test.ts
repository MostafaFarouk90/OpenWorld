// N3 dev rig: it builds every piece on a reduced manifest and its console helpers drive them; and the production build
// cannot contain it (the rig is imported only behind `import.meta.env.DEV`, which Vite replaces with false).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import act5CorePlugin from '../act5Core.plugin';
import corePlugin from '../../core/core.plugin';
import type { Game } from '../../core/Game';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import heatHazePlugin from '../../rendering/heatHaze.plugin';
import { heightAt } from '../../terrain/heightfield';
import waystonesPlugin from '../../waystones/waystones.plugin';
import { RIG_ARENA, installLavaRig } from './devRig';
import lavaPlugin from './lava.plugin';

let physics: PhysicsWorld;
const games: Game[] = [];

beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

afterEach(() => {
  for (const g of games.splice(0)) g.dispose();
  vi.restoreAllMocks();
});

type Rig = {
  info(): { built: boolean; pieces: Record<string, unknown> };
  set(p: string, s: string): boolean;
  reset(): void;
  wheel(): string;
  gap(): number;
  haze(): unknown;
};

describe('the lava dev rig', () => {
  it('builds the channel, vent, crossing, pool, floor and platforms, and its helpers drive them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const game = makeTestGame(physics);
    games.push(game);
    const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, act5CorePlugin, lavaPlugin, heatHazePlugin]);
    for (const s of statuses) expect(s.state, s.id).toBe('ok');
    const ctx = game.ctx;
    ctx.player.teleport({ x: 11000, y: heightAt(11000, 6750) + 0.05, z: 6750 });
    game.fixedUpdate();
    const undo = installLavaRig(ctx, { now: true });
    const rig = (globalThis as { __lavarig?: Rig }).__lavarig!;
    expect(rig.info().built).toBe(true);
    expect(Object.keys(rig.info().pieces).sort()).toEqual(['channel', 'crossing', 'floor', 'island', 'platforms', 'platformsFar', 'pool', 'wheel']);
    const lava = ctx.services.get('lava')!;
    expect(lava.volumes().map((v) => v.id).sort()).toEqual(['dev.channel', 'dev.gap', 'dev.pool']);
    expect(lava.crossings().map((c) => c.id)).toEqual(['dev.crossing']);
    expect(rig.wheel()).toBe('opened');
    expect(rig.set('floor', 'broken')).toBe(true);
    expect(rig.set('lava', 'level:1')).toBe(true);
    expect(rig.set('platforms', 'still')).toBe(true);
    const arenas = ctx.services.get('bossArena')!;
    expect(arenas.state(RIG_ARENA, 'floor')).toBe('broken');
    for (let i = 0; i < 300; i++) game.fixedUpdate();
    expect(lava.surface('dev.pool')).toBeGreaterThan(heightAt(11000 - 28, 6735) + 1.2);
    rig.reset();
    expect(arenas.state(RIG_ARENA, 'floor')).toBeUndefined();
    expect(typeof rig.gap()).toBe('number');
    undo();
    expect((globalThis as { __lavarig?: Rig }).__lavarig).toBeUndefined();
    expect(lava.volumes()).toEqual([]);
  }, PLUGIN_TEST_TIMEOUT);

  it('is imported only behind import.meta.env.DEV (so a production build drops it)', () => {
    const src = readFileSync(new URL('./lava.plugin.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^import[^\n]*devRig/m);
    const at = src.indexOf("import('./devRig')");
    expect(at).toBeGreaterThan(0);
    expect(src.lastIndexOf('if (import.meta.env.DEV)', at)).toBeGreaterThan(0);
  });
});
