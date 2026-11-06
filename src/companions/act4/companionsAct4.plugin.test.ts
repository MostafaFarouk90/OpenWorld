// L4: the companions-act4 plugin on a reduced manifest (core, companions, companions-act4).
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import companionsPlugin, { companionControllers } from '../companions.plugin';
import { TOBB } from '../tobb';
import { HROLF } from '../hrolf';
import { GAUT_FALLEN_FLAG } from './banter';
import act4Plugin, { STORM_ROPE_SLOT } from './companionsAct4.plugin';
import { ONE_SHOT } from './oneShots';
import { act4BarkKey } from './strings.en';

const TIMEOUT = 30_000;
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

async function boot() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const w = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world: w, input, moveModifiers, report: () => {} });
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const mods: Record<string, PluginModule> = Object.fromEntries([corePlugin, companionsPlugin, act4Plugin].map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));
  await game.loadPlugins(mods);
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const said = () => events.filter((e) => e.type === 'companion.banter').map((e) => (e.payload as GameEventMap['companion.banter']).lineKey);
  const done = () => {
    game.dispose();
    w.dispose();
  };
  ctx.state.setFlag(TOBB.joinFlag, true);
  run(180);
  return { game, ctx, run, said, events, done };
}

describe('companions-act4', () => {
  it('registers the Act 4 strings', async () => {
    const t = await boot();
    expect(t.ctx.strings.t(act4BarkKey('tobb', 'waste', 1))).toMatch(/Ashen Waste/); // through Tobb's own table
    t.done();
  }, TIMEOUT);

  it('entering the Waste says a Waste line', async () => {
    const t = await boot();
    t.ctx.events.emit('region.entered', { regionId: 'ashen-waste', previous: null } as never);
    t.run(2);
    expect(t.said().some((k) => k.startsWith('companion.tobb.bark.area.a4.waste.'))).toBe(true);
    t.done();
  }, TIMEOUT);

  it('meeting the walkers (M42 done) says the walkers line once on the rise', async () => {
    const t = await boot();
    t.ctx.state.setFlag('story.m42.complete', true);
    t.run(2);
    expect(t.said()).toContain(act4BarkKey('tobb', 'walkers', 1));
    t.done();
  }, TIMEOUT);

  it('bond rank 2 says the bond line once; repeating setRank or waiting never repeats it (the latch flag is persisted state)', async () => {
    const t = await boot();
    const svc = t.ctx.services.require('companions');
    expect(svc.setRank('tobb', 2)).toBe(true);
    t.run(120);
    const bond = act4BarkKey('tobb', 'bond2', 1);
    expect(t.said().filter((k) => k === bond)).toHaveLength(1);
    expect(svc.setRank('tobb', 2)).toBe(false);
    t.run(600);
    expect(t.said().filter((k) => k === bond)).toHaveLength(1);
    expect(t.ctx.state.getFlag(ONE_SHOT.bondSaidFlag('tobb'))).toBe(true);
    t.done();
  }, TIMEOUT);

  it('a companion not yet joined at rank 2 says nothing', async () => {
    const t = await boot();
    t.ctx.state.setFlag(HROLF.rankFlag, 2);
    t.run(120);
    expect(t.said().some((k) => k.includes('hrolf'))).toBe(false);
    t.done();
  }, TIMEOUT);

  it('the mourning line comes after M39 and a rest, once', async () => {
    const t = await boot();
    t.ctx.events.emit('rest', { waystoneId: 'x' } as never);
    t.run(120);
    const mourn = act4BarkKey('tobb', 'mourning', 1);
    expect(t.said()).not.toContain(mourn);
    t.ctx.state.setFlag(GAUT_FALLEN_FLAG, true);
    t.ctx.events.emit('rest', { waystoneId: 'x' } as never);
    t.run(120);
    t.ctx.events.emit('rest', { waystoneId: 'x' } as never);
    t.run(120);
    expect(t.said().filter((k) => k === mourn)).toHaveLength(1);
    t.done();
  }, TIMEOUT);

  it('a storm says the storm line once on its start', async () => {
    const t = await boot();
    t.ctx.events.emit('weather.changed', { kind: 'storm', from: 'warning' });
    t.run(2);
    expect(t.said().filter((k) => k.startsWith('companion.tobb.bark.area.a4.storm.'))).toHaveLength(1);
    t.done();
  }, TIMEOUT);

  it('in the storm mode companions take the rope slot right behind Cael, and their own slot when it ends', async () => {
    const t = await boot();
    const tobb = companionControllers().find((c) => c.def.id === 'tobb')!;
    const slot = () => (tobb as unknown as { slotOverride: unknown }).slotOverride;
    expect(slot()).toBeNull();
    const f = t.ctx.player.feet;
    const release = t.ctx.services.require('movementMode').push('storm', { position: { x: f.x, y: f.y, z: f.z }, yaw: 0 });
    t.run(2);
    expect(slot()).toEqual(STORM_ROPE_SLOT);
    release();
    t.run(2);
    expect(slot()).toBeNull();
    t.done();
  }, TIMEOUT);
});
