// Act 4 L3: the weather plugin on a reduced manifest (core, waystones, weather): the service, the storm row of the
// movement modes, fast travel refused with the storm line, the boss and scene holds, the Ashmare's edge, the save entry.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../core/testing/bootPlugins';
import type { Game } from '../core/Game';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import waystonesPlugin from '../waystones/waystones.plugin';
import { isStorming } from './precedence';
import { ASHMARE_DISMISSED_KEY, ASHMARE_POST_ANCHOR } from './ashmareEdge';
import { STORM_TOAST_KEYS } from './WeatherRuntime';
import { WEATHER_STRINGS_EN } from './strings.en';
import { WEATHER_PERSIST_KEY, createWeatherPlugin, resolveWeatherData } from './weather.plugin';

const X = 10000;
const Z = 4800;

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

async function boot(opts: { post?: boolean } = {}) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const game = makeTestGame(physics);
  games.push(game);
  const a = game.ctx.anchors;
  const ground = (x: number, z: number) => ({ x, y: heightAt(x, z), z });
  a.define({ id: 'waste.test.rope.0', position: ground(X, 4600), yaw: 0 });
  a.define({ id: 'waste.test.rope.1', position: ground(X, 5500), yaw: 0 });
  a.define({ id: 'waste.test.shelter.1', position: ground(X, 4700), yaw: 0 });
  if (opts.post) a.define({ id: ASHMARE_POST_ANCHOR, position: ground(X + 20, 4430), yaw: 0 });
  const weather = createWeatherPlugin({
    visuals: false,
    ropes: [{ id: 'rope.test', points: ['waste.test.rope.0', 'waste.test.rope.1'], shelters: ['waste.shelter.1'] }],
    shelters: [{ id: 'waste.shelter.1', at: 'waste.test.shelter.1', radius: 6 }],
  });
  const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, weather]);
  for (const s of statuses) expect(s.state, `${s.id}: ${s.error ?? ''}`).toBe('ok');
  const toasts: string[] = [];
  game.events.on('hud.toast', (e) => {
    if (e.textKey) toasts.push(e.textKey);
  });
  const ctx = game.ctx;
  const place = (x: number, z: number) => {
    ctx.player.teleport({ x, y: heightAt(x, z) + 0.05, z });
    game.fixedUpdate();
  };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) game.fixedUpdate();
  };
  return { game, ctx, toasts, place, run };
}

describe('weather plugin', () => {
  it('provides the weather service; a forced storm in the Waste pushes the storm mode and refuses fast travel with the storm line', async () => {
    const t = await boot();
    const w = t.ctx.services.get('weather')!;
    expect(w).toBeDefined();
    t.place(X, Z);
    const off = w.forceStorm('test');
    t.run(0.1);
    expect(w.state().kind).toBe('storm');
    expect(isStorming(t.ctx.services)).toBe(true);
    const modes = t.ctx.services.get('movementMode')!;
    expect(modes.current).toBe('storm');
    expect(modes.rule()).toMatchObject({ fastTravel: 'refused', mount: 'refused', companions: 'follow' });
    expect(t.ctx.services.get('waystones')!.travelBlockedReason()).toBe('storm');
    expect(WEATHER_STRINGS_EN['map.blocked.storm']).toBeTruthy();
    off();
    t.run(0.1);
    expect(modes.current).toBe('walk');
    expect(t.ctx.services.get('waystones')!.travelBlockedReason()).toBeNull();
  }, PLUGIN_TEST_TIMEOUT);

  it('is clear in Harrowmark even with a storm forced', async () => {
    const t = await boot();
    const w = t.ctx.services.get('weather')!;
    t.place(8500, 2000);
    w.forceStorm('test');
    t.run(0.1);
    expect(w.state().kind).toBe('clear');
    expect(t.ctx.services.get('movementMode')!.current).toBe('walk');
  }, PLUGIN_TEST_TIMEOUT);

  it('holds the weather clear through a boss fight and a scene', async () => {
    const t = await boot();
    const w = t.ctx.services.get('weather')!;
    t.place(X, Z);
    w.forceStorm('test');
    const ev = t.game.events as unknown as { emit(n: string, p: unknown): void };
    ev.emit('boss.started', { bossId: 'eormen', actorId: 'a' });
    t.run(0.1);
    expect(w.state()).toMatchObject({ kind: 'clear', held: true });
    ev.emit('boss.ended', { bossId: 'eormen', actorId: 'a', reason: 'despawned' });
    t.run(0.1);
    expect(w.state().kind).toBe('storm');
    ev.emit('scene.started', { id: 'scene-m45-voice' });
    t.run(0.1);
    expect(w.state().kind).toBe('clear');
    ev.emit('scene.ended', { id: 'scene-m45-voice', reason: 'finished' });
    t.run(0.1);
    expect(w.state().kind).toBe('storm');
  }, PLUGIN_TEST_TIMEOUT);

  it('exposure ticks off the rope through the real damage resolver and stops at 10%', async () => {
    const t = await boot();
    const w = t.ctx.services.get('weather')!;
    t.place(X + 40, Z);
    w.forceStorm('test');
    const a = t.ctx.player.actor;
    t.run(3.1);
    expect(a.health).toBeCloseTo(a.maxHealth * 0.98, 6);
    expect(t.toasts).toContain(STORM_TOAST_KEYS.exposed);
    t.run(300);
    expect(a.health).toBeCloseTo(a.maxHealth * 0.1, 6);
    expect(a.dead).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('is safe on the rope: no damage', async () => {
    const t = await boot();
    t.place(X + 1, Z);
    t.ctx.services.get('weather')!.forceStorm('test');
    t.run(10);
    expect(t.ctx.player.actor.health).toBe(t.ctx.player.actor.maxHealth);
  }, PLUGIN_TEST_TIMEOUT);

  it('sets a rider down at the Waste edge with the horse at the Ashgate post, once per approach', async () => {
    const t = await boot({ post: true });
    const calls: { reason: string; at?: { x: number; z: number } }[] = [];
    let mounted = true;
    t.ctx.services.provide('mount', {
      mounted: () => mounted,
      summon: () => {},
      dismount: (reason: string, at?: { x: number; z: number }) => {
        calls.push({ reason, at });
        mounted = false;
      },
      stamina: () => null,
      addSpeedCap: () => () => {},
      addStaminaBonus: () => () => {},
    } as never);
    t.place(X, 4450);
    expect(calls).toHaveLength(0);
    t.place(X, 4497);
    expect(calls).toHaveLength(1);
    expect(calls[0].reason).toBe('script');
    expect(calls[0].at).toMatchObject({ x: X + 20, z: 4430 });
    expect(t.toasts.filter((k) => k === ASHMARE_DISMISSED_KEY)).toHaveLength(1);
  }, PLUGIN_TEST_TIMEOUT);

  it('without the post anchor the horse stands 6 m outside the edge', async () => {
    const t = await boot();
    const calls: { at?: { x: number; z: number } }[] = [];
    t.ctx.services.provide('mount', {
      mounted: () => true,
      summon: () => {},
      dismount: (_r: string, at?: { x: number; z: number }) => calls.push({ at }),
      stamina: () => null,
      addSpeedCap: () => () => {},
      addStaminaBonus: () => () => {},
    } as never);
    t.place(X, 4498);
    expect(calls[0].at!.z).toBeCloseTo(4492, 0);
  }, PLUGIN_TEST_TIMEOUT);

  it('registers its save entry and round-trips the clock', async () => {
    const t = await boot();
    t.place(X, Z);
    t.run(5);
    const persist = t.ctx.persist as unknown as { serializeAll?: () => Record<string, { data: unknown }> };
    const w = t.ctx.services.get('weather') as unknown as { serialize(): { t: number }; load(d: unknown): void };
    const saved = w.serialize();
    expect(saved.t).toBeGreaterThan(4.9);
    w.load({ seed: 4042, t: 300, lastShelterId: 'waste.shelter.1' });
    expect(w.serialize()).toEqual({ seed: 4042, t: 300, lastShelterId: 'waste.shelter.1' });
    expect(WEATHER_PERSIST_KEY).toBe('weather');
    void persist;
  }, PLUGIN_TEST_TIMEOUT);
});

describe('resolveWeatherData', () => {
  it('resolves anchors and drops missing points with one warning', () => {
    const warns: string[] = [];
    const find = (id: string) => (id === 'a' ? { position: { x: 1, z: 2 } } : id === 'b' ? { position: { x: 3, z: 4 } } : undefined);
    const out = resolveWeatherData(find, [{ id: 'r', points: ['a', 'zz', 'b'], shelters: [] }], [{ id: 's', at: 'gone', radius: 5 }], (m) => warns.push(m));
    expect(out.ropes[0].points).toEqual([{ x: 1, z: 2 }, { x: 3, z: 4 }]);
    expect(out.shelters).toEqual([]);
    expect(warns).toHaveLength(1);
  });
});
