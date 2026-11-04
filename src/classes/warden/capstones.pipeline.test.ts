// Real pipeline: the capstones on a reduced manifest (core, status, progression, classes, combat verbs, spells, warden and its Act 3
// plugins) through the real DamageResolver, status engine and abilities service. Only the avatar is a stand-in (no rig is loaded in
// tests). Margins at the radius edges: the feet settle off the spawn point, so exact boundaries live in capstones.test.ts.
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import combatVerbsPlugin from '../../player/combatVerbs.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import progressionPlugin from '../../progression/progression.plugin';
import spellsPlugin from '../../spells/spells.plugin';
import statusPlugin from '../../status/status.plugin';
import { xpForLevel } from '../../progression/tuning';
import classesPlugin from '../classes.plugin';
import wardenAct3Plugin from './act3.plugin';
import wardenCapstonesPlugin from './capstones.plugin';
import wardenPlugin from './warden.plugin';
import { MOUNTAIN_UNMOVED, SKILL_IDS, VOICE_OF_THE_MOUNTAIN, WYRMBREAKER } from './tuning';

let physics: PhysicsWorld;
beforeAll(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

const CHAINS = {
  hewer: ['cleavingSwing', 'deepWound', 'whirlingHew', 'skullsplitter', 'wyrmbreaker'],
  stonehide: ['thickSkin', 'boulderShoulder', 'gritTeeth', 'earthroot', 'mountainUnmoved'],
  howlcaller: ['warHowl', 'emberRage', 'bloodChant', 'frenziedHearth', 'voiceOfTheMountain'],
} as const;

async function boot(branch: keyof typeof CHAINS) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const ctx = game.ctx;
  const controller = { playOneShot: vi.fn(() => true), currentAction: null as string | null };
  const root = new THREE.Object3D();
  Object.defineProperty(ctx.player, 'avatar', { get: () => ({ root, controller }), configurable: true });
  const statuses = await bootPlugins(game, [corePlugin, statusPlugin, progressionPlugin, classesPlugin, combatVerbsPlugin, spellsPlugin, wardenPlugin, wardenAct3Plugin, wardenCapstonesPlugin]);
  expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  ctx.state.setFlag('story.gate.a3', true);
  ctx.state.setFlag('trainer.warden.masterBook', true);
  const progression = ctx.services.require('progression');
  progression.setClass('warden');
  progression.grantXp(xpForLevel(30), 'test');
  for (const name of CHAINS[branch]) expect(progression.learn(`warden.${name}`), name).toEqual({ ok: true });
  progression.assign(0, `warden.${CHAINS[branch][4]}`);
  const abilities = ctx.services.require('abilities');
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(5);
  const foe = (id: string, dx: number, dz: number, maxPoise = 100) => {
    const f = ctx.player.feet;
    const r = new THREE.Object3D();
    r.position.set(f.x + dx, f.y, f.z + dz);
    r.updateMatrixWorld(true);
    return ctx.actors.spawn({ id, kind: 'wolf', team: 'hostile', maxHealth: 400, maxPoise, root: r });
  };
  return { game, ctx, controller, abilities, run, foe, status: ctx.services.require('status') };
}

describe('Warden capstones in the real pipeline', () => {
  it('Voice of the Mountain: poise and a stun through the real resolver and status engine; the boss takes poise only; the far foe nothing', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot('howlcaller');
    const near = t.foe('near', 3, 0);
    const edge = t.foe('edge', 0, 11);
    const far = t.foe('far', 14, 0);
    const boss = t.foe('boss', 0, -5);
    t.ctx.bosses.register('boss', { bossId: 'test-boss', nameKey: 'boss.test', phases: [0.5], breaksPerPhase: 3 } as never);
    const yielded = t.foe('yielded', 2, 2);
    yielded.mercyState = () => 'yielding';
    expect(t.abilities.use(0)).toEqual({ ok: true });
    expect(t.status.has('near', 'stun')).toBe(true);
    expect(t.status.has('edge', 'stun')).toBe(true);
    expect(t.status.has('far', 'stun')).toBe(false);
    expect(t.status.has('boss', 'stun')).toBe(false);
    expect(t.status.has('yielded', 'stun')).toBe(false);
    expect(near.poise).toBe(100 - VOICE_OF_THE_MOUNTAIN.poise);
    expect(edge.poise).toBe(60);
    expect(boss.poise).toBe(60);
    expect(far.poise).toBe(100);
    expect(yielded.poise).toBe(100);
    expect(near.health).toBe(400);
    // The stun ends by itself.
    t.run(60 * 3 + 10);
    expect(t.status.has('near', 'stun')).toBe(false);
  });

  it('Mountain Unmoved: a heavy hit on the player takes no poise for 10 s, and does again afterwards', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot('stonehide');
    const wolf = t.foe('wolf', 3, 0);
    const player = t.ctx.actors.player;
    const hit = () => {
      player.poise = player.maxPoise;
      return t.ctx.damage.apply({ attackerId: wolf.id, targetId: player.id, amount: 1, poise: 30, kind: 'melee', attackId: 'x', unblockable: true });
    };
    expect(player.maxPoise).toBeGreaterThan(0);
    hit();
    const normal = player.maxPoise - player.poise;
    expect(normal).toBeGreaterThan(0);
    expect(t.abilities.use(0)).toEqual({ ok: true });
    hit();
    expect(player.poise).toBe(player.maxPoise);
    t.run(60 * MOUNTAIN_UNMOVED.seconds + 10);
    hit();
    expect(player.maxPoise - player.poise).toBe(normal);
  });

  it('Wyrmbreaker: charge, chop, fissure hit through the real resolver, then +25% from any source for 8 s', { timeout: PLUGIN_TEST_TIMEOUT }, async () => {
    const t = await boot('hewer');
    const inLine = t.foe('inLine', 0, -6);
    const beside = t.foe('beside', 3, -6);
    expect(t.abilities.use(0)).toEqual({ ok: true });
    t.run(WYRMBREAKER.chargeTicks + 2);
    expect(t.controller.playOneShot).toHaveBeenCalledWith(WYRMBREAKER.clip, { lockMove: true });
    expect(inLine.health).toBe(400);
    t.run(WYRMBREAKER.hitTick + 2);
    expect(inLine.health).toBeLessThan(400);
    expect(beside.health).toBe(400);
    const dealt = (id: string) => {
      const before = t.ctx.actors.get(id)!.health;
      t.ctx.damage.apply({ attackerId: null, targetId: id, amount: 10, poise: 0, kind: 'script' });
      return before - t.ctx.actors.get(id)!.health;
    };
    expect(dealt('beside')).toBeCloseTo(10);
    expect(dealt('inLine')).toBeCloseTo(12.5);
    t.run(60 * WYRMBREAKER.crackSeconds + 10);
    expect(dealt('inLine')).toBeCloseTo(10);
    expect(SKILL_IDS.wyrmbreaker).toBe('warden.wyrmbreaker');
  });
});
