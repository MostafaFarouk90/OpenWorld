// The traversal plugin booted on a reduced manifest (core + traversal; contracts v0.7 item 24) against the real game:
// the services, the mode rules through K0's real hooks (save safe point, the loader's position sanitizer), the load
// reset, other systems' teleports, the sled's direct-hit rule, the seated ferry's immunity and the drowning floor.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../core/testing/bootPlugins';
import { InteractionSystem, type Interactable } from '../interaction/InteractionSystem';
import { PLAYER_ID } from '../actors/teams';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { saveSafePoint, sanitizePosition } from '../save/save.plugin';
import { heightAt } from '../terrain/heightfield';
import traversal, { FERRY_RUNNING_FLAG } from './traversal.plugin';
import { M24_VOLUME_ID } from './sites';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

const X = 40;
const Z = 40;

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, traversal]);
  expect(statuses.map((s) => s.state)).toEqual(['ok', 'ok']);
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const g = heightAt(X, Z);
  // A test pool: a dive volume whose surface stands 5 m over the ground, so a player on the ground is under water.
  ctx.services.require('water').register({ id: 'water.test.pool', kind: 'dive', surfaceY: g + 5, area: { box: { x0: X - 6, z0: Z - 6, x1: X + 6, z1: Z + 6 } } });
  ctx.services.require('water').registerRoute({
    id: 'dive.test.pool',
    volumeId: 'water.test.pool',
    points: [{ x: X - 5, y: g + 2, z: Z }, { x: X + 5, y: g + 2, z: Z }],
    airPockets: [],
    entryStand: { x: X - 10, y: heightAt(X - 10, Z) + 0.05, z: Z },
  } as never);
  return { game, ctx, run, g };
}

async function diving() {
  const b = await boot();
  b.ctx.player.teleport({ x: X - 10, y: heightAt(X - 10, Z) + 0.3, z: Z });
  b.run(20);
  b.ctx.player.teleport({ x: X, y: b.g + 0.5, z: Z });
  b.run(5);
  expect(b.ctx.services.require('water').state).toBe('diving');
  return b;
}

describe('traversal plugin', () => {
  it('provides water, ferry and carry; the M24 pool is registered; the carry persistable exists', async () => {
    const { ctx } = await boot();
    expect(ctx.services.require('water')).toBeDefined();
    expect(ctx.services.require('ferry').stops()).toEqual(['reedgate', 'mere', 'greywatch', 'mireweather']);
    expect(ctx.services.require('carry').heldSled).toBeNull();
    expect(ctx.services.require('water').volumeAt({ x: 3630, y: 3, z: 10100 })?.id).toBe(M24_VOLUME_ID);
    expect(ctx.persist.get('traversal.carry')?.version).toBe(1);
  }, PLUGIN_TEST_TIMEOUT);

  it('diving sets the movement mode, and a save stores the dry entry stand, which the loader keeps dry', async () => {
    const { ctx } = await diving();
    const modes = ctx.services.require('movementMode');
    expect(modes.current).toBe('dive');
    expect(ctx.world.player.controller.moveMode).toBe('swim');
    const saved = saveSafePoint(modes, { x: X, y: 0, z: Z, yaw: 0 })!;
    expect(saved.x).toBeCloseTo(X - 10);
    const loaded = sanitizePosition(saved)!;
    expect(ctx.services.require('water').volumeAt({ x: loaded.x, y: loaded.y + 0.1, z: loaded.z })).toBeNull();
    expect(loaded.y).toBeGreaterThanOrEqual(heightAt(X - 10, Z));
  }, PLUGIN_TEST_TIMEOUT);

  it('save.loaded mid-dive: walk mode, controller walk, no K7 modifier, and the dive does not restart in that tick', async () => {
    const { ctx, run } = await diving();
    ctx.player.teleport({ x: X - 10, y: heightAt(X - 10, Z) + 0.3, z: Z });
    ctx.events.emit('save.loaded', { slot: 'test' });
    expect(ctx.services.require('movementMode').current).toBe('walk');
    expect(ctx.world.player.controller.moveMode).toBe('walk');
    run(1);
    expect(ctx.services.require('water').state).not.toBe('diving');
    expect(ctx.input.actions.down('attack1')).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it("another system's teleport (a waystone's or a cutscene's ctx.player.teleport) ends the dive", async () => {
    const { ctx, run } = await diving();
    ctx.player.teleport({ x: X + 200, y: heightAt(X + 200, Z) + 0.3, z: Z });
    run(2);
    expect(ctx.services.require('water').state).toBe('dry');
    expect(ctx.services.require('movementMode').current).toBe('walk');
    expect(ctx.world.player.controller.moveMode).toBe('walk');
  }, PLUGIN_TEST_TIMEOUT);

  it('the drowning hit is never lethal, even far above the player health', async () => {
    const { ctx } = await boot();
    const r = ctx.damage.apply({ attackerId: null, targetId: PLAYER_ID, amount: 99999, kind: 'script', attackId: 'traversal.drown' });
    expect(r?.killed).toBe(false);
    expect(ctx.player.actor.health).toBe(1);
  }, PLUGIN_TEST_TIMEOUT);

  it('a direct hit drops the sled; a cold tick, a Burn tick or scripted damage do not', async () => {
    // The scoped context binds `register` at boot, so the spy goes on before it.
    const registered: Interactable[] = [];
    const reg = InteractionSystem.prototype.register;
    vi.spyOn(InteractionSystem.prototype, 'register').mockImplementation(function (this: InteractionSystem, i) {
      registered.push(i);
      return reg.call(this, i);
    });
    const { ctx, run } = await boot();
    const carry = ctx.services.require('carry');
    const f = ctx.player.feet;
    carry.addSled({ id: 'sled.test', route: { id: 'sled.test', checkpoints: [{ x: f.x, y: f.y, z: f.z }], corridorHalfWidth: 30, maxDrop: 10 } });
    ctx.events.emit('npc.carry.resetHaul', { id: 'sled.test' });
    run(30);
    expect(carry.heldSled).toBeNull();
    // Take it through the sled's interactable (no key input here: call its onInteract).
    const sled = registered.find((i) => i.id === 'sled:test');
    expect(sled).toBeDefined();
    sled!.onInteract(ctx.player.actor);
    expect(carry.heldSled).toBe('sled.test');
    ctx.damage.apply({ attackerId: null, targetId: PLAYER_ID, amount: 3, kind: 'status', statusKind: 'ignite' as never });
    ctx.damage.apply({ attackerId: null, targetId: PLAYER_ID, amount: 3, kind: 'script' });
    ctx.damage.apply({ attackerId: 'cold', targetId: PLAYER_ID, amount: 3, kind: 'status' });
    expect(carry.heldSled).toBe('sled.test');
    ctx.damage.apply({ attackerId: 'hawk', targetId: PLAYER_ID, amount: 3, kind: 'melee' });
    expect(carry.heldSled).toBeNull();
    // Fast travel by a waystone while hauling sends it back; a payload-less "reset haul" warns and never throws.
    sled!.onInteract(ctx.player.actor);
    expect(carry.heldSled).toBe('sled.test');
    ctx.events.emit('fastTravel', { fromId: 'a', toId: 'b' });
    expect(carry.heldSled).toBeNull();
    expect(() => (ctx.events.emit as (t: string, p?: unknown) => void)('npc.carry.resetHaul')).not.toThrow();
    // Never from the saddle.
    ctx.services.provide('mount', { mounted: () => true } as never);
    expect(sled!.enabled?.()).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('seated on the ferry the player is immune; a save stores the departure stop; fast travel and the mount are refused', async () => {
    const { ctx, run } = await boot();
    ctx.services.provide('inventory', { has: () => true, count: () => 1 } as never);
    ctx.state.setFlag(FERRY_RUNNING_FLAG, true);
    expect(ctx.services.require('ferry').ride('reedgate', 'mere')).toBeNull();
    run(3);
    const modes = ctx.services.require('movementMode');
    expect(modes.current).toBe('ferry');
    expect(modes.rule().fastTravel).toBe('refused');
    expect(modes.rule().mount).toBe('refused');
    const saved = saveSafePoint(modes, null)!;
    expect(saved.x).toBeCloseTo(3600);
    expect(saved.z).toBeCloseTo(10100);
    const before = ctx.player.actor.health;
    const r = ctx.damage.apply({ attackerId: 'leech', targetId: PLAYER_ID, amount: 10, kind: 'melee' });
    expect(r?.outcome).toBe('immune');
    expect(ctx.player.actor.health).toBe(before);
    ctx.events.emit('save.loaded', { slot: 'test' });
    expect(ctx.services.require('ferry').riding).toBe(false);
    expect(ctx.damage.apply({ attackerId: 'leech', targetId: PLAYER_ID, amount: 1, kind: 'melee' })?.outcome).toBe('hit');
  }, PLUGIN_TEST_TIMEOUT);

  it("K15's setMenu hook: a menu that opens takes the stop interact; none, null, a closed menu or a throwing one leave the default boarding", async () => {
    const registered: Interactable[] = [];
    const reg = InteractionSystem.prototype.register;
    vi.spyOn(InteractionSystem.prototype, 'register').mockImplementation(function (this: InteractionSystem, i) {
      registered.push(i);
      return reg.call(this, i);
    });
    // Each boot registers its own; the newest is the one under test.
    const stopAt = (id: string) => registered.filter((i) => i.id === `ferry:${id}`).at(-1)!;
    const fresh = async () => {
      const b = await boot();
      b.ctx.services.provide('inventory', { has: () => true, count: () => 1 } as never);
      b.ctx.state.setFlag(FERRY_RUNNING_FLAG, true);
      return b;
    };
    // No menu set: the default destination boards.
    const a = await fresh();
    stopAt('reedgate').onInteract(a.ctx.player.actor);
    expect(a.ctx.services.require('ferry').riding).toBe(true);
    // A menu that opens: nothing boards, and it was asked for this stop.
    const b = await fresh();
    const asked: string[] = [];
    b.ctx.services.require('ferry').setMenu((s) => (asked.push(s), true));
    stopAt('reedgate').onInteract(b.ctx.player.actor);
    expect(asked).toEqual(['reedgate']);
    // The prompt is neutral while a menu is set, and names the destination otherwise.
    expect(stopAt('reedgate').promptKey).toBe('ferry.prompt.menu');
    b.ctx.services.require('ferry').setMenu(null);
    expect(stopAt('reedgate').promptKey).toBe('ferry.prompt');
    b.ctx.services.require('ferry').setMenu((s) => (asked.push(s), true));
    expect(b.ctx.services.require('ferry').riding).toBe(false);
    // The menu rides a chosen leg with `ride`; the default is untouched (the next default still starts at the first leg).
    expect(b.ctx.services.require('ferry').ride('reedgate', 'mere')).toBeNull();
    // A closed menu, a removed menu and a throwing one fall back.
    for (const set of [(f: ReturnType<typeof b.ctx.services.require<'ferry'>>) => f.setMenu(() => false), (f: ReturnType<typeof b.ctx.services.require<'ferry'>>) => (f.setMenu(() => true), f.setMenu(null)), (f: ReturnType<typeof b.ctx.services.require<'ferry'>>) => f.setMenu(() => { throw new Error('x'); })]) {
      const c = await fresh();
      set(c.ctx.services.require('ferry'));
      stopAt('reedgate').onInteract(c.ctx.player.actor);
      expect(c.ctx.services.require('ferry').riding).toBe(true);
    }
  }, PLUGIN_TEST_TIMEOUT);
});
