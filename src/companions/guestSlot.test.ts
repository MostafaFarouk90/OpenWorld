// Act 4 L11's guest slot (companions.plugin.ts `companionGuestFlag`): while the flag is set a joined companion walks with the
// party beyond the seats; the seats and setActive are untouched; an unjoined id is never added; clearing the flag drops him.
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
import companionsPlugin, { COMPANIONS_PERSIST_KEY, companionGuestFlag } from './companions.plugin';
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

describe('companions: the quest guest slot', () => {
  it('the flag id is story.party.guest.<id>', () => {
    expect(companionGuestFlag('hrolf')).toBe('story.party.guest.hrolf');
  });

  it('a joined companion off the seats walks as a guest while the flag is set, and leaves when it clears', async () => {
    const t = await boot();
    t.svc().join('tobb');
    expect(t.svc().setActive([])).toBe(true);
    expect(t.svc().active()).toEqual([]);
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    expect(t.svc().active()).toEqual(['tobb']);
    // the seats and the stored set are untouched: the guest is not written into the party
    expect(t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.serialize()).toMatchObject({ active: [] });
    t.ctx.state.clearFlag(companionGuestFlag('tobb'));
    expect(t.svc().active()).toEqual([]);
    t.done();
  });

  it('a seated companion with the flag is listed once', async () => {
    const t = await boot();
    t.svc().join('tobb');
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });

  it('the flag never brings an unjoined or unknown companion', async () => {
    const t = await boot();
    t.ctx.state.setFlag(companionGuestFlag('tobb'), true);
    t.ctx.state.setFlag(companionGuestFlag('ghost'), true);
    expect(t.svc().active()).toEqual([]);
    t.done();
  });
});
