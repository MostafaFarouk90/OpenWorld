// N3 caldera-lava plugin on a reduced manifest (core, waystones, lava, haze): the real damage resolver, the real safe
// teleport, the real character controller and colliders. A walk into lava is burned and thrown to a lip and never killed;
// a cooled crust carries Cael and drops him into the lava when it melts (thrown, not killed); lava-stair is pushed with the
// last lip; a load in lava lands on a lip; the lava takes no glow pool light.
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { Game } from '../../core/Game';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import heatHazePlugin from '../../rendering/heatHaze.plugin';
import { heightAt } from '../../terrain/heightfield';
import waystonesPlugin from '../../waystones/waystones.plugin';
import { HAZE_FLAG, VENT_OPEN_S } from '../lava';
import lavaPlugin from './lava.plugin';
import { LAVA_STRINGS_EN } from './strings.en';
import { LAVA_STRING_KEYS, VENT } from './tuning';

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

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const game = makeTestGame(physics);
  games.push(game);
  const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, lavaPlugin, heatHazePlugin]);
  for (const s of statuses) expect(s.state, s.id).toBe('ok');
  const ctx = game.ctx;
  const events: { name: string; e: unknown }[] = [];
  for (const name of ['lava.entered', 'lava.thrown', 'vent.opened', 'vent.closing', 'vent.closed', 'hud.toast'] as const) {
    (game.events as unknown as { on(n: string, f: (e: unknown) => void): void }).on(name, (e) => events.push({ name, e }));
  }
  const ground = (x: number, z: number) => heightAt(x, z);
  const place = (x: number, z: number, dy = 0.05) => {
    ctx.player.teleport({ x, y: ground(x, z) + dy, z });
    game.fixedUpdate();
  };
  const run = async (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      game.fixedUpdate();
      if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0)); // let safe teleports resolve
    }
  };
  const g0 = ground(X, Z);
  const lava = ctx.services.get('lava')!;
  // a 6 x 20 m test pool whose surface is 0.6 m above the ground: standing feet are in it
  lava.add({
    id: 'test.pool',
    shape: { kind: 'box', x0: X - 3, z0: Z - 10, x1: X + 3, z1: Z + 10 },
    surfaceY: g0 + 0.6,
    damagePctPerS: 15,
    safeLips: [
      { x: X - 6, y: ground(X - 6, Z) + 0.05, z: Z },
      { x: X + 6, y: ground(X + 6, Z) + 0.05, z: Z },
    ],
  });
  return { game, ctx, events, place, run, lava, g0 };
}

describe('caldera-lava plugin', () => {
  it('a walk into lava burns, throws to the nearest lip through the safe teleport, and never kills', async () => {
    const t = await boot();
    const a = t.ctx.player.actor;
    t.place(X + 6, Z); // on the east lip
    await t.run(0.2);
    t.place(X + 1, Z);
    await t.run(4); // the safe teleport's fade, settle and reveal (3 s headless: no terrain chunks)
    const thrown = t.events.filter((e) => e.name === 'lava.thrown');
    expect(t.events.some((e) => e.name === 'lava.entered')).toBe(true);
    expect(thrown.length).toBe(1);
    expect((thrown[0]!.e as { to: { x: number } }).to.x).toBe(X + 6);
    expect(Math.abs(t.ctx.player.feet.x - (X + 6))).toBeLessThan(0.5);
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(a.health).toBeGreaterThan(a.maxHealth * 0.9);
    // from 11% of max: dipped in again and again, never under 10%, never dead
    t.ctx.damage.apply({ attackerId: null, targetId: a.id, amount: a.health - a.maxHealth * 0.11, poise: 0, kind: 'script', unblockable: true });
    for (let k = 0; k < 4; k++) {
      t.place(X - 1, Z + k);
      await t.run(4);
    }
    expect(a.dead).toBe(false);
    expect(a.health).toBeGreaterThanOrEqual(a.maxHealth * 0.1 - 1e-6);
  }, PLUGIN_TEST_TIMEOUT);

  it('pushes lava-stair while in lava with the last safe lip as the save point', async () => {
    const t = await boot();
    const modes = t.ctx.services.get('movementMode')!;
    t.place(X - 6, Z);
    await t.run(0.1);
    expect(modes.current).toBe('walk');
    t.place(X, Z);
    expect(modes.current).toBe('lava-stair');
    expect(modes.safePoint?.position.x).toBe(X - 6);
    expect(modes.rule()).toMatchObject({ save: 'safePoint', fastTravel: 'allowed' });
    await t.run(4);
    expect(modes.current).toBe('walk');
  }, PLUGIN_TEST_TIMEOUT);

  it('a vent wheel cools a crust Cael can stand on; when it melts he drops in and is thrown, not killed', async () => {
    const t = await boot();
    t.lava.addVent({ id: 'test.vent', at: { x: X, y: t.g0, z: Z }, openS: VENT_OPEN_S, closedS: 10, wheel: 'test.wheel', volumeId: 'test.pool', crust: { kind: 'box', x0: X - 3, z0: Z - 2, x1: X + 3, z1: Z + 2 } });
    expect(t.lava.vents()).toEqual([{ id: 'test.vent', at: { x: X, y: t.g0, z: Z }, state: 'closed', wheel: 'test.wheel' }]);
    expect(t.lava.turnWheel('test.vent')).toBe('opened');
    await t.run(0.1);
    expect(t.lava.vents()[0]!.state).toBe('open');
    t.place(X, Z, 0.85); // on the crust (its top 0.18 m over the surface)
    await t.run(1);
    expect(t.events.some((e) => e.name === 'lava.thrown')).toBe(false);
    expect(t.ctx.player.feet.y).toBeGreaterThan(t.g0 + 0.5); // standing on the crust
    expect(t.lava.turnWheel('test.vent')).toBe('already-open');
    await t.run(VENT_OPEN_S - 1 - VENT.closingWarnS + 0.2);
    expect(t.events.some((e) => e.name === 'vent.closing')).toBe(true);
    await t.run(VENT.closingWarnS + 4.5);
    expect(t.events.some((e) => e.name === 'vent.closed')).toBe(true);
    expect(t.events.filter((e) => e.name === 'lava.thrown').length).toBe(1);
    expect(t.ctx.player.actor.dead).toBe(false);
    expect(t.lava.turnWheel('test.vent')).toBe('hot');
    expect(t.events.some((e) => e.name === 'hud.toast' && (e.e as { textKey: string }).textKey === LAVA_STRING_KEYS.wheelHot)).toBe(true);
    expect(LAVA_STRINGS_EN[LAVA_STRING_KEYS.wheelHot]).toBeTruthy();
  }, PLUGIN_TEST_TIMEOUT);

  it('a load in lava lands Cael on a lip with no damage; vents close on load', async () => {
    const t = await boot();
    t.lava.addVent({ id: 'test.vent', at: { x: X, y: t.g0, z: Z }, openS: 6, closedS: 10, wheel: 'w', volumeId: 'test.pool', crust: { kind: 'box', x0: X - 3, z0: Z - 2, x1: X + 3, z1: Z + 2 } });
    t.lava.turnWheel('test.vent');
    await t.run(0.1);
    const a = t.ctx.player.actor;
    t.ctx.player.teleport({ x: X - 2, y: t.g0 + 0.05, z: Z + 8 });
    (t.game.events as unknown as { emit(n: string, p: unknown): void }).emit('save.loaded', { slot: 'test' });
    const h = a.health;
    await t.run(0.3);
    expect(Math.abs(t.ctx.player.feet.x - (X - 6))).toBeLessThan(0.5);
    expect(a.health).toBe(h);
    expect(t.lava.vents()[0]!.state).toBe('closed');
    expect(t.events.filter((e) => e.name === 'lava.thrown').length).toBe(0);
  }, PLUGIN_TEST_TIMEOUT);

  it('draws the volume with one surface mesh and haze strips tracked by the haze pass; no point lights; the undo cleans up', async () => {
    const t = await boot();
    const group = t.ctx.scene.getObjectByName('caldera-lava:test.pool')!;
    expect(group).toBeDefined();
    const meshes: THREE.Mesh[] = [];
    group.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    expect(meshes.filter((m) => !m.userData[HAZE_FLAG]).length).toBe(1);
    expect(meshes.filter((m) => m.userData[HAZE_FLAG]).length).toBeGreaterThan(0);
    t.game.render(1, 1 / 60);
    expect(t.ctx.services.get('heatHaze')!.stats().tracked).toBe(meshes.filter((m) => m.userData[HAZE_FLAG]).length);
    let lights = 0;
    t.ctx.scene.traverse((o) => (o as THREE.Light).isLight && (o as THREE.PointLight).isPointLight && lights++);
    expect(lights).toBe(0);
    expect(() => t.lava.add({ id: 'test.pool', shape: { kind: 'circle', x: 0, z: 0, r: 1 }, surfaceY: 0, damagePctPerS: 15, safeLips: [{ x: 0, y: 0, z: 2 }] })).toThrow(/already/);
    expect(t.lava.volumes().map((v) => v.id)).toEqual(['test.pool']);
    expect(t.lava.at(X, t.g0, Z)).toBe('test.pool');
    expect(t.lava.nearest(X + 10, Z)!.distance).toBeCloseTo(7, 6);
  }, PLUGIN_TEST_TIMEOUT);
});
