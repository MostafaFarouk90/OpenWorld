import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core.plugin';
import type { GamePlugin } from '../plugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame, pluginModules } from './bootPlugins';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

describe('bootPlugins', () => {
  it('has a timeout of at least 30 s', () => {
    expect(PLUGIN_TEST_TIMEOUT).toBeGreaterThanOrEqual(30_000);
  });

  it('boots corePlugin alone within the timeout and provides its services', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = makeTestGame(physics);
    const started = Date.now();
    const statuses = await bootPlugins(game, [corePlugin]);
    expect(Date.now() - started).toBeLessThan(PLUGIN_TEST_TIMEOUT);
    expect(statuses.map((s) => s.id)).toEqual(['core']);
    expect(statuses[0].state).toBe('ok');
    expect(game.ctx.services.get('groupStanding')).toBeDefined();
  }, PLUGIN_TEST_TIMEOUT);

  it('loads exactly the given plugins and nothing else', () => {
    const a = { id: 'a' } as GamePlugin;
    const b = { id: 'b' } as GamePlugin;
    expect(Object.keys(pluginModules([a, b])).sort()).toEqual(['/src/test/a.plugin.ts', '/src/test/b.plugin.ts']);
    expect(pluginModules([])).toEqual({});
  });

  it('cannot boot twice on one game', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const game = makeTestGame(physics);
    await bootPlugins(game, [corePlugin]);
    await expect(bootPlugins(game, [corePlugin])).rejects.toThrow(/already loaded/);
  }, PLUGIN_TEST_TIMEOUT);
});
