// Act 4 L9 (Act 3 playthrough M3): through the real input, J opens the journal and one Escape closes it, and the same frame
// does not reopen it; Escape with the journal shut opens nothing.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { PLUGIN_TEST_TIMEOUT } from '../core/testing/bootPlugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import questsPlugin from './quests.plugin';

// No DOM in vitest: the panel is a bare element, so the modal opens and closes through the real HUD and input.
vi.mock('./JournalPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./JournalPanel')>()),
  createJournalPanel: () => ({ element: { remove() {} } as unknown as HTMLElement, refresh() {}, dispose() {} }),
}));

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function setup() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const statuses = await game.loadPlugins(modules(corePlugin, questsPlugin), {});
  const press = (code: string) => {
    win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
    game.fixedUpdate();
    win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
    game.fixedUpdate();
  };
  return { game, ctx: game.ctx, statuses, press, dispose: () => (game.dispose(), world.dispose()) };
}

describe('journal and Escape', () => {
  it('J opens, one Escape closes and it stays closed; Escape while shut opens nothing', async () => {
    const t = await setup();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.press('Escape');
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.press('KeyJ');
    expect(t.ctx.hud.modalOpen).toBe('journal');
    t.press('Escape');
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.game.fixedUpdate();
    expect(t.ctx.hud.modalOpen).toBeNull();
    // J still toggles it as before.
    t.press('KeyJ');
    expect(t.ctx.hud.modalOpen).toBe('journal');
    t.press('KeyJ');
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.dispose();
  }, PLUGIN_TEST_TIMEOUT);
});
