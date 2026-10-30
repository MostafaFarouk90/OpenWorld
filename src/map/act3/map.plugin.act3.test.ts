// The map plugin's wiring of the block chips, on a reduced manifest (core + waystones + map + a stand-in for the services it
// reads): the model the view gets re-derives from the live services, keeps its array while nothing changed, and degrades to
// no chips when the services are missing.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import type { GamePlugin } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import waystonesPlugin from '../../waystones/waystones.plugin';
import mapPlugin from '../map.plugin';
import type { MapViewModel } from '../viewTypes';

const captured = vi.hoisted(() => ({ model: null as unknown }));
vi.mock('../MapView', () => ({
  createMapModal: (deps: { model: unknown }) => {
    captured.model = deps.model;
    return { id: 'map.modal', element: {}, update() {}, dispose() {}, focusDefault() {} };
  },
}));
vi.mock('../Minimap', () => ({ createMinimap: () => ({ id: 'minimap', element: {}, update() {}, dispose() {} }) }));

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
  captured.model = null;
});

interface Fakes {
  level: number | undefined;
  locked: Record<string, number>;
  done: Set<string>;
  open: string[];
}

async function boot(withServices = true) {
  (globalThis as { self?: unknown }).self ??= globalThis;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const fakes: Fakes = { level: 20, locked: {}, done: new Set(), open: ['brightwater', 'harrowmark', 'greyfen', 'dragonspine'] };
  const game = makeTestGame(physics);
  const ctx = game.ctx;
  const provide = (c: typeof ctx, n: string, v: unknown) => (c.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
  const stand: GamePlugin = {
    id: 'map-stand-in',
    dependsOn: ['core'],
    setup(c) {
      if (!withServices) return;
      provide(c, 'containment', { openRegions: () => fakes.open });
      provide(c, 'progression', { get level() { return fakes.level; } });
      provide(c, 'quests', { state: (id: string) => (fakes.done.has(id) ? 'completed' : 'inactive') });
      provide(c, 'warmth', {
        tier: () => 3,
        blockLevel: (b: string) => fakes.locked[b],
        preview: (b: string) => fakes.locked[b] ?? (b === 'greyfen' ? 22 : 24),
      });
    },
  };
  const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, stand, mapPlugin]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  // Open the map: the modal factory is mocked, so the model the plugin built is captured. Core sets up without a document;
  // the map's input system only looks for one when the key is pressed.
  (globalThis as { document?: unknown }).document = {};
  const sample = InputManager.prototype.sampleTick;
  vi.spyOn(InputManager.prototype, 'sampleTick').mockImplementation(function (this: InputManager) {
    const r = sample.call(this);
    const actions = { ...r.actions, pressed: (a: string) => a === 'map' } as typeof r.actions;
    return { snapshot: r.snapshot, actions };
  });
  game.fixedUpdate();
  const model = captured.model as MapViewModel;
  expect(model).toBeTruthy();
  return { game, ctx, fakes, model };
}

describe('map plugin block chips', () => {
  it('serves a chip per open block from the live services, and registers the strings', async () => {
    const { ctx, model } = await boot();
    const chips = model.blocks!();
    expect(chips.map((c) => [c.block, c.level, c.locked])).toEqual([['greyfen', 22, false], ['dragonspine-lower', 24, false]]);
    expect(ctx.strings.t('map.block.locked', { level: 22, top: 27 })).toBe('Level 22 to 27');
    expect(ctx.strings.t('map.block.preview', { level: 22, player: 20 })).toBe('Tuned for level 22. You are level 20.');
  }, PLUGIN_TEST_TIMEOUT);

  it('reuses the array while nothing changed, and re-derives on a lock, a level up, a finished block and a load', async () => {
    const { ctx, fakes, model } = await boot();
    const first = model.blocks!();
    expect(model.blocks!()).toBe(first);
    fakes.locked.greyfen = 22;
    const locked = model.blocks!();
    expect(locked).not.toBe(first);
    expect(locked.find((c) => c.block === 'greyfen')).toMatchObject({ locked: true, level: 22, top: 27 });
    fakes.level = 25;
    expect(model.blocks!().find((c) => c.block === 'greyfen')!.tone).toBe('gold');
    // A load changes the state under the plugin with no event it listens to: the next read shows it.
    fakes.locked = { greyfen: 22, 'dragonspine-lower': 24 };
    fakes.level = 21;
    ctx.events.emit('save.loaded', { slot: 'test' });
    expect(model.blocks!().map((c) => [c.block, c.locked])).toEqual([['greyfen', true], ['dragonspine-lower', true]]);
    // Finishing the whole Greyfen block hides its chip, the other stays.
    for (const q of ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'r12', 'r13', 'r14']) fakes.done.add(q);
    expect(model.blocks!().map((c) => c.block)).toEqual(['dragonspine-lower']);
  }, PLUGIN_TEST_TIMEOUT);

  it('hides a block while its region is closed, and when the player level is unknown', async () => {
    const { fakes, model } = await boot();
    fakes.open = ['brightwater', 'harrowmark', 'greyfen'];
    expect(model.blocks!().map((c) => c.block)).toEqual(['greyfen']);
    fakes.level = undefined;
    expect(model.blocks!()).toEqual([]);
  }, PLUGIN_TEST_TIMEOUT);

  it('without the services the model gives no chips and the map still works', async () => {
    const { model } = await boot(false);
    expect(model.blocks!()).toEqual([]);
    expect(model.regions!().length).toBeGreaterThan(0);
  }, PLUGIN_TEST_TIMEOUT);
});
