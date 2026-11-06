// The Singing Slag in a reduced boot: the puzzle reads real attack-key presses on the strike stone, lights the shrine once
// (W = 7 through the shipped warmth service), emits waste.chime.solved, and the drift goes with the lit flag, also on a load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../core/testing/bootPlugins';
import type { GamePlugin } from '../../core/plugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import progressionPlugin from '../../progression/progression.plugin';
import shrinePlugin from '../../shrine/shrine.plugin';
import spellsPlugin from '../../spells/spells.plugin';
import { SHRINE_IDS, shrineFlag } from '../../shrine/warmth';
import { heightAt } from '../../terrain/heightfield';
import waystonesPlugin from '../../waystones/waystones.plugin';
import type { World } from '../../world/World';
import { SLAG } from '../wasteSites';
import { createChimePlugin } from './chime.plugin';
import { stepMsAt } from './chimePuzzle';
import { CHIME_FAILS_FLAG, CHIME_PHRASE_FLAG, CHIME_PHRASES } from './phrases';

const T = PLUGIN_TEST_TIMEOUT;
const STEP = stepMsAt();
const LIT = shrineFlag('singing-slag');

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

/** The real `waste` plugin builds the whole Waste; the chime only needs its id in the graph. */
const wasteStub: GamePlugin = { id: 'waste', dependsOn: ['core'], setup() {} };

async function boot() {
  (globalThis as any).self ??= globalThis;
  const game = makeTestGame(physics);
  worlds.push(game.ctx.world as unknown as World);
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  ctx.services.provide('enemies' as never, { setWarmthTier: () => {} } as never);
  const clock = { t: 10_000 };
  const statuses = await bootPlugins(game, [corePlugin, waystonesPlugin, spellsPlugin, progressionPlugin, shrinePlugin, wasteStub, createChimePlugin({ now: () => clock.t, heightAt: () => 0 })]);
  let key: string | null = null;
  Object.defineProperty(ctx.input, 'actions', {
    get: () => ({ down: () => false, pressed: (a: string) => a === key, released: () => false, heldTicks: () => 0, axis: () => 0 }),
  });
  const emitted: { type: string; payload: any }[] = [];
  for (const type of ['shrine.rekindled', 'waste.chime.solved', 'warmth.changed']) (ctx.events as any).on(type, (p: unknown) => emitted.push({ type, payload: p }));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (k: number, atMs: number) => {
    clock.t = atMs;
    key = `attack${k}`;
    tick();
    key = null;
  };
  const toStone = () => ctx.player.teleport({ x: SLAG.strike[0], y: heightAt(SLAG.strike[0], SLAG.strike[1]) + 0.3, z: SLAG.strike[1] });
  /** Plays phrase `n` from `clock.t` with the right keys on the beat, then lets it end. */
  const playPhrase = (n: number, wrong = false) => {
    const t0 = clock.t;
    press(1, t0);
    const ph = CHIME_PHRASES[n]!;
    ph.steps.forEach((s, i) => press(wrong && i === 0 ? (ph.keys[i]! % 4) + 1 : ph.keys[i]!, t0 + (4 + s) * STEP));
    clock.t = t0 + 20 * STEP;
    tick();
  };
  return { game, ctx, statuses, clock, tick, press, toStone, playPhrase, emitted };
}

describe('waste-chime plugin', () => {
  it('sets up cleanly and draws six pillars, the shrine and the drift', async () => {
    const t = await boot();
    t.tick(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (let n = 1; n <= 6; n++) expect(t.ctx.scene.getObjectByName(`waste-chime-pillar-${n}`)).toBeDefined();
    expect(t.ctx.scene.getObjectByName('waste-chime-core')).toBeDefined();
    expect(t.ctx.scene.getObjectByName('waste-chime-glass-drift')!.visible).toBe(true);
  }, T);

  it('ignores presses before M45 is under way or away from the stone', async () => {
    const t = await boot();
    t.toStone();
    t.tick(2);
    t.playPhrase(0);
    expect(t.ctx.state.getNumber(CHIME_PHRASE_FLAG)).toBe(0);
    t.ctx.state.setFlag('story.m45.started', true);
    t.ctx.player.teleport({ x: SLAG.strike[0] + 10, y: heightAt(SLAG.strike[0] + 10, SLAG.strike[1]) + 0.3, z: SLAG.strike[1] });
    t.tick(2);
    t.playPhrase(0);
    expect(t.ctx.state.getNumber(CHIME_PHRASE_FLAG)).toBe(0);
  }, T);

  it('three phrases struck with the attack keys light the shrine once, give W 7 and emit waste.chime.solved', async () => {
    const t = await boot();
    for (const id of SHRINE_IDS.filter((s) => s !== 'singing-slag' && s !== 'anvil-of-ages')) t.ctx.state.setFlag(shrineFlag(id), true);
    t.ctx.state.setFlag('story.m45.started', true);
    t.toStone();
    t.tick(2);
    t.playPhrase(0, true);
    expect(t.ctx.state.getNumber(CHIME_FAILS_FLAG)).toBe(1);
    t.clock.t += 24 * STEP; // the plaque's replay
    t.tick();
    for (let n = 0; n < 3; n++) t.playPhrase(n);
    expect(t.ctx.state.getBool(LIT)).toBe(true);
    expect(t.ctx.state.getNumber(CHIME_FAILS_FLAG)).toBe(0);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled').map((e) => e.payload.shrineId)).toEqual(['singing-slag']);
    expect(t.emitted.filter((e) => e.type === 'waste.chime.solved')).toHaveLength(1);
    expect(t.ctx.services.require('warmth').tier()).toBe(7);
    t.tick();
    expect(t.ctx.scene.getObjectByName('waste-chime-glass-drift')!.visible).toBe(false);
    // Lit: more presses do nothing.
    t.playPhrase(0);
    expect(t.emitted.filter((e) => e.type === 'waste.chime.solved')).toHaveLength(1);
  }, T);

  it('a load mid-phrase restarts it, keeps the phrases already struck, and the lit look follows the flag on a load', async () => {
    const t = await boot();
    t.ctx.state.setFlag('story.m45.started', true);
    t.toStone();
    t.tick(2);
    t.playPhrase(0);
    t.playPhrase(1);
    expect(t.ctx.state.getNumber(CHIME_PHRASE_FLAG)).toBe(2);
    t.press(1, t.clock.t);
    t.ctx.events.emit('save.loaded', {} as never);
    // Five steps on (off the old phrase's beat grid): without the restart the half-begun phrase would judge these presses.
    t.clock.t += 5 * STEP;
    // The half-begun phrase is gone: the next press starts phrase three afresh.
    t.playPhrase(2);
    expect(t.ctx.state.getBool(LIT)).toBe(true);
    const u = await boot();
    u.ctx.state.setFlag(LIT, true);
    u.ctx.events.emit('save.loaded', {} as never);
    u.tick();
    expect(u.ctx.scene.getObjectByName('waste-chime-glass-drift')!.visible).toBe(false);
  }, T);
});
