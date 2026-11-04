// The glide booted in the traversal plugin (core + traversal) against the real game: the service, the ledge prompts
// and their M34 gate, the mode rules through K0's real hooks (the save's safe point and the loader, fast travel, the
// mount, companions), and each ending's restore: a direct hit, the core containment push, a load mid-glide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../core/testing/bootPlugins';
import { InteractionSystem, type Interactable } from '../../interaction/InteractionSystem';
import { PLAYER_ID } from '../../actors/teams';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { saveSafePoint, sanitizePosition } from '../../save/save.plugin';
import { heightAt } from '../../terrain/heightfield';
import traversal from '../traversal.plugin';
import { GLIDE_LANES, GLIDE_OPEN_FLAG, fallbackStand, glideInteractId } from './lanes';

// A fresh physics world per test: an earlier test's capsule left on the ledge would be stood on.
let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

const AERIE = GLIDE_LANES.find((l) => l.site.id === 'summit-aerie')!;
const STAND = fallbackStand(AERIE.site, heightAt);

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // The scoped context binds `register` at boot, so the spy goes on before it.
  const registered: Interactable[] = [];
  const reg = InteractionSystem.prototype.register;
  vi.spyOn(InteractionSystem.prototype, 'register').mockImplementation(function (this: InteractionSystem, i) {
    registered.push(i);
    return reg.call(this, i);
  });
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, traversal]);
  expect(statuses.map((s) => s.state)).toEqual(['ok', 'ok']);
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  return { game, ctx, run, registered };
}

/** On the Aerie ledge with M34 done, launched and out over the chasm. */
async function gliding() {
  const b = await boot();
  b.ctx.state.setFlag(GLIDE_OPEN_FLAG, true);
  b.ctx.player.teleport({ x: STAND.x, y: STAND.y + 0.3, z: STAND.z });
  b.run(30);
  const why: string[] = [];
  b.ctx.events.on('glide.ended', (e) => why.push(e.reason));
  expect(b.ctx.services.require('glide').launch('summit-aerie')).toBeNull();
  b.run(120);
  expect(why).toEqual([]);
  expect(b.ctx.services.require('glide').state).toBe('gliding');
  return b;
}

describe('the glide in the traversal plugin', () => {
  it('provides the glide service and six ledge prompts, shown only once M34 is done', async () => {
    const { ctx, registered } = await boot();
    const glide = ctx.services.require('glide');
    expect(glide.state).toBe('idle');
    expect(glide.catchArmed).toBe(false);
    const ledges = GLIDE_LANES.map((l) => registered.find((i) => i.id === glideInteractId(l.site.id)));
    expect(ledges.every(Boolean)).toBe(true);
    expect(ledges.every((i) => i!.enabled!() === false)).toBe(true);
    expect(glide.refusal('summit-aerie')).toBe('closed');
    ctx.state.setFlag(GLIDE_OPEN_FLAG, true);
    expect(ledges.every((i) => i!.enabled!() === true)).toBe(true);
    expect(ctx.strings.t('glide.prompt')).toContain('glide to');
    for (const l of GLIDE_LANES) expect(ctx.strings.t(`glide.dest.${l.site.id}`)).not.toBe(`glide.dest.${l.site.id}`);
    expect(registered.find((i) => i.id === 'glide:let-go')!.enabled!()).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('mid-glide: glide mode, a save stores the ledge (which the loader keeps), fast travel and the mount refused, companions hidden', async () => {
    const { ctx, registered } = await gliding();
    const modes = ctx.services.require('movementMode');
    expect(modes.current).toBe('glide');
    expect(ctx.world.player.controller.moveMode).toBe('glide');
    expect(modes.rule()).toMatchObject({ save: 'safePoint', fastTravel: 'refused', mount: 'refused', companions: 'hidden' });
    const saved = saveSafePoint(modes, { x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z, yaw: 0 })!;
    expect(saved.x).toBeCloseTo(STAND.x);
    expect(saved.z).toBeCloseTo(STAND.z);
    const loaded = sanitizePosition(saved)!;
    expect(loaded.y).toBeGreaterThanOrEqual(heightAt(STAND.x, STAND.z));
    expect(loaded.y - heightAt(STAND.x, STAND.z)).toBeLessThan(5);
    expect(ctx.services.require('glide').catchArmed).toBe(true);
    expect(registered.find((i) => i.id === 'glide:let-go')!.enabled!()).toBe(true);
    expect(registered.find((i) => i.id === glideInteractId('summit-aerie'))!.enabled!()).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('a direct hit ends the glide into a fall; a status tick does not', async () => {
    const { ctx } = await gliding();
    const ended: string[] = [];
    ctx.events.on('glide.ended', (e) => ended.push(e.reason));
    ctx.damage.apply({ attackerId: 'cold', targetId: PLAYER_ID, amount: 1, kind: 'status' });
    expect(ended).toEqual([]);
    ctx.damage.apply({ attackerId: 'hawk', targetId: PLAYER_ID, amount: 1, kind: 'melee' });
    expect(ended).toEqual(['hit']);
    expect(ctx.services.require('movementMode').current).toBe('walk');
    expect(ctx.world.player.controller.moveMode).toBe('walk');
    expect(ctx.services.require('glide').catchArmed).toBe(true);
  }, PLUGIN_TEST_TIMEOUT);

  it('the core containment push ends it as contained and returns the player to the ledge', async () => {
    const { ctx, run } = await gliding();
    const ended: string[] = [];
    ctx.events.on('glide.ended', (e) => ended.push(e.reason));
    const f = ctx.player.feet;
    ctx.events.emit('containment.pushed', { from: { x: f.x, y: f.y, z: f.z }, to: { x: f.x, y: f.y, z: f.z } });
    expect(ended).toEqual(['contained']);
    run(40);
    expect(Math.hypot(ctx.player.feet.x - STAND.x, ctx.player.feet.z - STAND.z)).toBeLessThan(1);
    expect(ctx.services.require('glide').catchArmed).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('save.loaded mid-glide: idle, walk mode, the controller walking, no locks, no glide.ended', async () => {
    const { ctx, run } = await gliding();
    const ended: string[] = [];
    ctx.events.on('glide.ended', (e) => ended.push(e.reason));
    ctx.player.teleport({ x: STAND.x, y: STAND.y + 0.3, z: STAND.z });
    ctx.events.emit('save.loaded', { slot: 'test' });
    run(2);
    expect(ended).toEqual([]);
    expect(ctx.services.require('glide').state).toBe('idle');
    expect(ctx.services.require('movementMode').current).toBe('walk');
    expect(ctx.world.player.controller.moveMode).toBe('walk');
    expect(ctx.services.require('glide').catchArmed).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);
});
