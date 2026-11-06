// Act 4 L11's guest slot (companions.plugin.ts `companionGuestFlag`): while the flag is set a joined, benched companion's
// controller follows (its gate reads active); the party list, the stored set and setActive are untouched; an unjoined id never
// follows; clearing the flag benches him again.
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import companionsPlugin, { COMPANIONS_PERSIST_KEY, companionControllers, companionGuestFlag } from './companions.plugin';
import './types';

vi.setConfig({ testTimeout: 60_000 });

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  physics.dispose();
  vi.restoreAllMocks();
});

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot() {
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
  await game.loadPlugins(modules(corePlugin, companionsPlugin));
  const ctx = game.ctx;
  const svc = () => ctx.services.require('companions');
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { ctx, svc, done };
}

/** The controller's follow gate (what decides whether he follows or waits at his bench post). */
const gate = (id: string): boolean => (companionControllers().find((c) => c.def.id === id) as unknown as { isActive(): boolean }).isActive();

describe('companions: the quest guest slot', () => {
  it('the flag id is story.party.guest.<id>', () => {
    expect(companionGuestFlag('hrolf')).toBe('story.party.guest.hrolf');
  });

  it('a joined, benched companion follows while the flag is set; the party list and stored set never change', async () => {
    const t = await boot();
    t.svc().join('tobb');
    expect(t.svc().setActive([])).toBe(true);
    expect(gate('tobb')).toBe(false);
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    expect(gate('tobb')).toBe(true);
    expect(t.svc().active()).toEqual([]);
    expect(t.svc().isActive('tobb')).toBe(false);
    expect(t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.serialize()).toMatchObject({ active: [] });
    t.ctx.state.clearFlag(companionGuestFlag('tobb'));
    expect(gate('tobb')).toBe(false);
    t.done();
  });

  it('a seated companion with the flag is listed once and follows', async () => {
    const t = await boot();
    t.svc().join('tobb');
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    expect(t.svc().active()).toEqual(['tobb']);
    expect(gate('tobb')).toBe(true);
    t.done();
  });

  it('the flag never brings an unjoined companion', async () => {
    const t = await boot();
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    t.ctx.state.setFlag(companionGuestFlag('ghost'), true);
    expect(t.svc().active()).toEqual([]);
    expect(gate('tobb')).toBe(false);
    t.done();
  });
});
