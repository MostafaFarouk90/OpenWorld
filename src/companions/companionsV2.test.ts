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
import companionsPlugin, { COMPANIONS_PERSIST_KEY, COMPANIONS_PERSIST_VERSION, PARTY_GATE_FLAG } from './companions.plugin';
import { TOBB } from './tobb';
import { COMPANION_DOWNED_SECONDS } from './tuning';
import './types';

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
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const JOIN = TOBB.joinFlag;

async function boot(before?: (g: Game) => void) {
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
  before?.(game);
  await game.loadPlugins(modules(corePlugin, companionsPlugin));
  const ctx = game.ctx;
  const svc = () => ctx.services.require('companions');
  const persistable = () => ctx.persist.get(COMPANIONS_PERSIST_KEY)!;
  /** Loads a saved entry the way the save loader does: the entry, then `save.loaded`. */
  const load = (data: unknown, version: number) => {
    persistable().load(data, version);
    ctx.events.emit('save.loaded', { slot: 'test' });
  };
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { ctx, svc, persistable, load, done };
}

describe('companions v2: def', () => {
  it("Tobb is support, has no combat and kneels for the shared 8 s", () => {
    expect(TOBB.role).toBe('support');
    expect(TOBB.combat).toBeUndefined();
    expect(TOBB.downed).toEqual({ kneelSeconds: 8 });
    expect(COMPANION_DOWNED_SECONDS).toBe(8);
  });
});

describe('companions v2: party', () => {
  it('with Tobb joined he is active (A5: a runtime join stores the set with the joiner in the first seat)', async () => {
    const t = await boot();
    expect(t.svc().active()).toEqual([]);
    t.svc().join('tobb');
    expect(t.svc().active()).toEqual(['tobb']);
    expect(t.svc().isActive('tobb')).toBe(true);
    expect(t.svc().isActive('nobody')).toBe(false);
    expect(t.persistable().serialize()).toMatchObject({ active: ['tobb'] });
    t.done();
  });

  it('maxActive is 1 while story.gate.a3 is falsy and 2 once it is set (read live)', async () => {
    const t = await boot();
    expect(t.svc().maxActive()).toBe(1);
    t.ctx.state.setFlag(PARTY_GATE_FLAG, true);
    expect(t.svc().maxActive()).toBe(2);
    t.ctx.state.clearFlag(PARTY_GATE_FLAG);
    expect(t.svc().maxActive()).toBe(1);
    t.done();
  });

  it('setActive accepts joined ids within the limit, including the empty party', async () => {
    const t = await boot();
    t.svc().join('tobb');
    expect(t.svc().setActive([])).toBe(true);
    expect(t.svc().active()).toEqual([]);
    expect(t.svc().isActive('tobb')).toBe(false);
    expect(t.svc().setActive(['tobb'])).toBe(true);
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });

  it('setActive refuses an unknown, unjoined, duplicated or over-limit list and changes nothing', async () => {
    const t = await boot();
    // Unjoined while Tobb has not joined.
    expect(t.svc().setActive(['tobb'])).toBe(false);
    t.svc().join('tobb');
    expect(t.svc().setActive([])).toBe(true);
    expect(t.svc().setActive(['ghost'])).toBe(false);
    expect(t.svc().setActive(['tobb', 'ghost'])).toBe(false);
    expect(t.svc().setActive(['tobb', 'tobb'])).toBe(false);
    t.ctx.state.setFlag(PARTY_GATE_FLAG, true);
    expect(t.svc().setActive(['tobb', 'tobb'])).toBe(false);
    t.ctx.state.clearFlag(PARTY_GATE_FLAG);
    expect(t.svc().setActive(['tobb', 'ghost'])).toBe(false);
    expect(t.svc().active()).toEqual([]);
    expect(t.persistable().serialize()).toMatchObject({ active: [] });
    t.done();
  });

  it('a companion who joins takes the first seat; with no room the others leave the party (A5 joiner rule)', async () => {
    const t = await boot();
    // A stored empty set (limit 1): Tobb joining takes the free seat.
    t.load({ positions: {}, active: [] }, 2);
    t.svc().join('tobb');
    expect(t.svc().active()).toEqual(['tobb']);
    // The seat is full: Hrolf joining takes it and Tobb waits (A0 shipped "with no room he is not"; A5 reverses it).
    t.svc().join('hrolf');
    expect(t.svc().active()).toEqual(['hrolf']);
    expect(t.svc().isActive('tobb')).toBe(false);
    t.done();
  });

  it('leaving drops him from active() and rejoining restores him', async () => {
    const t = await boot();
    t.svc().join('tobb');
    t.svc().leave('tobb');
    expect(t.svc().active()).toEqual([]);
    expect(t.svc().isActive('tobb')).toBe(false);
    t.svc().join('tobb');
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });
});

describe('companions v2: persistence', () => {
  it('is version 2', () => {
    expect(COMPANIONS_PERSIST_VERSION).toBe(2);
  });

  it('a v1 save (no active) loads with Tobb active', async () => {
    const t = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    t.load({ positions: {} }, 1);
    expect(t.svc().active()).toEqual(['tobb']);
    expect(t.persistable().serialize()).toMatchObject({ active: null });
    t.done();
  });

  it('a v2 round trip keeps the party, including an empty one', async () => {
    const a = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    expect(a.svc().setActive([])).toBe(true);
    const empty = a.persistable().serialize();
    expect(empty).toMatchObject({ active: [] });
    a.done();

    const b = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    b.load(empty, 2);
    expect(b.svc().active()).toEqual([]);
    expect(b.svc().setActive(['tobb'])).toBe(true);
    const full = b.persistable().serialize();
    expect(full).toMatchObject({ active: ['tobb'] });
    b.done();

    const c = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    c.load(empty, 2);
    c.load(full, 2);
    expect(c.svc().active()).toEqual(['tobb']);
    c.done();
  });

  it('the load handler stores the raw list; only save.loaded drops unknown and unjoined ids and caps it', async () => {
    const t = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    t.persistable().load({ positions: {}, active: ['ghost', 'tobb', 'tobb', 'hrolf'] }, 2);
    // Not validated yet.
    expect(t.persistable().serialize()).toMatchObject({ active: ['ghost', 'tobb', 'tobb', 'hrolf'] });
    t.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(t.persistable().serialize()).toMatchObject({ active: ['tobb'] });
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });

  it('save.loaded caps to maxActive: the validated list is empty when the limit cannot hold it', async () => {
    const t = await boot();
    // Joined only after the entry loaded (the state entry may load later): still counted at save.loaded.
    t.persistable().load({ positions: {}, active: ['tobb'] }, 2);
    t.ctx.state.setFlag(JOIN, true);
    t.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });

  it('a non-array active (corrupt data) is treated as never set', async () => {
    const t = await boot((g) => g.ctx.state.setFlag(JOIN, true));
    t.load({ positions: {}, active: 'tobb' }, 2);
    expect(t.persistable().serialize()).toMatchObject({ active: null });
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });
});
