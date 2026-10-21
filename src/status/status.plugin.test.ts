import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../actors/Actor';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import statusPlugin from './status.plugin';
import type { ActorStatusView } from './view';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/status.plugin.ts': { default: statusPlugin },
};

let physics: PhysicsWorld;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as any).self ??= globalThis;
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  worlds.push(world);
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const statuses = await game.loadPlugins(modules);
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const status = game.ctx.services.require('status');
  const wolf = (team: 'hostile' | 'neutral' = 'hostile', maxHealth = 100): Actor =>
    game.ctx.actors.spawn({ kind: 'ash-wolf', team, maxHealth, maxPoise: 20 });
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) game.fixedUpdate(); };
  const of = <K extends keyof GameEventMap>(t: K) => events.filter((e) => e.type === t).map((e) => e.payload as GameEventMap[K]);
  const mercy = (actorId: string) =>
    game.events.emit('mercy', { verb: 'spare', tier: 'normal', track: 'oswin', creature: 'ash-wolf', actorId } as never);
  return { game, status, statuses, wolf, run, of, player: game.ctx.player, events, mercy };
}

describe('status plugin', () => {
  it('loads and provides the service', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'status')?.state).toBe('ok');
    expect(t.status).toBeTruthy();
  });

  it('a player bleed drains health once a second, then expires with both events', async () => {
    const t = await boot();
    const w = t.wolf();
    expect(t.status.apply(w.id, { id: 'bleed:sword', kind: 'bleed', dps: 5, seconds: 3, sourceId: 'player' })).toBe(true);
    expect(t.of('status.applied')).toEqual([{ actorId: w.id, id: 'bleed:sword', kind: 'bleed' }]);
    t.run(1.1);
    expect(w.health).toBe(95);
    t.run(2.2);
    expect(w.health).toBe(85);
    expect(t.of('status.expired')).toEqual([{ actorId: w.id, id: 'bleed:sword', kind: 'bleed' }]);
    expect(t.status.list(w.id)).toEqual([]);
    const ticks = t.events.filter((e) => e.type === 'damage.dealt').map((e) => e.payload);
    expect(ticks).toHaveLength(3);
    expect(ticks[0]).toMatchObject({ kind: 'status', outcome: 'hit', dealt: 5, statusKind: 'bleed' });
  });

  it('a lethal tick kills with the source credited and clears the statuses', async () => {
    const t = await boot();
    const w = t.wolf('hostile', 4);
    t.status.apply(w.id, { id: 'ign', kind: 'ignite', dps: 5, seconds: 5, sourceId: 'player' });
    t.run(1.1);
    expect(w.dead).toBe(true);
    expect(t.of('actor.died')[0]!.killerId).toBe('player');
    expect(t.status.list(w.id)).toEqual([]);
    expect(t.of('status.expired')).toHaveLength(1);
  });

  it('despawn clears and refuses a later apply', async () => {
    const t = await boot();
    const w = t.wolf();
    t.status.apply(w.id, { id: 'b', kind: 'bleed', dps: 1, seconds: 5, sourceId: 'player' });
    t.game.ctx.actors.despawn(w.id);
    expect(t.of('status.expired')).toHaveLength(1);
    expect(t.status.apply(w.id, { id: 'b', kind: 'bleed', dps: 1, seconds: 5, sourceId: 'player' })).toBe(false);
  });

  it('a hostile source cannot bleed another hostile: the first dropped tick ends it', async () => {
    const t = await boot();
    const a = t.wolf();
    const b = t.wolf();
    t.status.apply(b.id, { id: 'b', kind: 'bleed', dps: 5, seconds: 10, sourceId: a.id });
    t.run(1.1);
    expect(b.health).toBe(100);
    expect(t.status.list(b.id)).toEqual([]);
  });

  it('enemy stun and slow appear on actor.data.status and leave with the effect', async () => {
    const t = await boot();
    const w = t.wolf();
    t.status.apply(w.id, { id: 'stun', kind: 'stun', seconds: 2, sourceId: 'player' });
    t.status.apply(w.id, { id: 'slow', kind: 'slow', slow: 0.4, seconds: 4, sourceId: 'player' });
    let view = w.data['status'] as ActorStatusView;
    expect(view).toMatchObject({ stunned: true, slow: 0.4 });
    t.run(2.2);
    view = w.data['status'] as ActorStatusView;
    expect(view).toMatchObject({ stunned: false, stunRemaining: 0, slow: 0.4 });
    t.run(2);
    expect(w.data['status']).toBeUndefined();
  });

  describe('mercy', () => {
    it('clears the statuses the player put on a mercied actor, and the mercy stands', async () => {
      const t = await boot();
      const w = t.wolf();
      t.status.apply(w.id, { id: 'b', kind: 'bleed', dps: 5, seconds: 10, sourceId: 'player' });
      t.status.apply(w.id, { id: 'theirs', kind: 'slow', slow: 0.2, seconds: 10, sourceId: null });
      t.mercy(w.id);
      expect(t.status.list(w.id).map((e) => e.id)).toEqual(['theirs']);
      t.run(3);
      expect(w.health).toBe(100);
      expect(t.of('mercy.revoked')).toEqual([]);
      expect(t.game.ctx.state.mercyCount()).toBe(1);
    });

    it('a player-sourced tick after a mercy revokes it (core rule)', async () => {
      const t = await boot();
      const w = t.wolf();
      t.mercy(w.id);
      t.status.apply(w.id, { id: 'late', kind: 'bleed', dps: 2, seconds: 3, sourceId: 'player' });
      t.run(1.1);
      expect(t.of('mercy.revoked')).toHaveLength(1);
    });

    it('a tick from a hostile source does not revoke a mercy', async () => {
      const t = await boot();
      const w = t.wolf();
      const other = t.wolf('neutral');
      t.mercy(w.id);
      t.status.apply(w.id, { id: 'env', kind: 'bleed', dps: 2, seconds: 3, sourceId: null });
      t.status.apply(w.id, { id: 'n', kind: 'bleed', dps: 2, seconds: 3, sourceId: other.id });
      t.run(1.1);
      expect(t.of('mercy.revoked')).toEqual([]);
    });
  });

  describe('on the player', () => {
    it('slow scales the speed and stun locks movement and actions; both lift on expiry', async () => {
      const t = await boot();
      t.status.apply('player', { id: 'slow', kind: 'slow', slow: 0.5, seconds: 2, sourceId: null });
      const state = () => t.game.moveModifiers.state();
      expect(state().speedScale).toBeCloseTo(0.5);
      t.status.apply('player', { id: 'stun', kind: 'stun', seconds: 1, sourceId: null });
      expect(state()).toMatchObject({ speedScale: 0, lockMove: true });
      expect(t.game.moveModifiers.isActionLocked('attack1')).toBe(true);
      for (const a of ['interact', 'mercy', 'sneak', 'dodge'] as const) expect(t.game.moveModifiers.isActionLocked(a)).toBe(true);
      expect(t.game.moveModifiers.isActionLocked('inventory')).toBe(false);
      t.run(1.2);
      expect(state()).toMatchObject({ lockMove: false });
      expect(state().speedScale).toBeCloseTo(0.5);
      t.run(1);
      expect(state().speedScale).toBe(1);
      expect(t.game.moveModifiers.size).toBe(0);
    });

    it('v0.6 root: speed 0, movement keys and actions free; the longer of two roots wins; lifts on expiry', async () => {
      const t = await boot();
      const state = () => t.game.moveModifiers.state();
      t.status.apply('player', { id: 'root.a', kind: 'root', seconds: 1, sourceId: null });
      t.status.apply('player', { id: 'root.b', kind: 'root', seconds: 2, sourceId: null });
      expect(t.status.has('player', 'root')).toBe(true);
      expect(state()).toMatchObject({ speedScale: 0, lockMove: false });
      for (const a of ['attack1', 'dodge', 'mercy'] as const) expect(t.game.moveModifiers.isActionLocked(a)).toBe(false);
      t.run(1.2);
      expect(state().speedScale).toBe(0);
      t.run(1);
      expect(state().speedScale).toBe(1);
      expect(t.game.moveModifiers.size).toBe(0);
    });

    it('dying clears the player status and the modifier', async () => {
      const t = await boot();
      t.status.apply('player', { id: 'stun', kind: 'stun', seconds: 30, sourceId: null });
      t.game.ctx.damage.kill('player');
      expect(t.game.moveModifiers.size).toBe(0);
      expect(t.status.list('player')).toEqual([]);
    });

    it('statuses are not saved: a load clears them', async () => {
      const t = await boot();
      const w = t.wolf();
      t.status.apply(w.id, { id: 'b', kind: 'bleed', dps: 1, seconds: 30, sourceId: 'player' });
      t.status.apply('player', { id: 'slow', kind: 'slow', slow: 0.3, seconds: 30, sourceId: null });
      t.game.events.emit('save.loaded', { slot: 'x' });
      expect(t.status.list(w.id)).toEqual([]);
      expect(t.game.moveModifiers.size).toBe(0);
    });
  });

  it('dispose leaves nothing behind', async () => {
    const t = await boot();
    const w = t.wolf();
    t.status.apply(w.id, { id: 'b', kind: 'bleed', dps: 1, seconds: 30, sourceId: 'player' });
    t.game.dispose();
    expect(t.game.ctx.services.get('status')).toBeUndefined();
    expect(w.data['status']).toBeUndefined();
  });
});
