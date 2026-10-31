import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import codexPlugin from '../../codex/codex.plugin';
import corePlugin from '../../core/core.plugin';
import { bootPlugins, makeTestGame, PLUGIN_TEST_TIMEOUT } from '../../core/testing/bootPlugins';
import type { Interactable } from '../../interaction/InteractionSystem';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import progressionPlugin from '../../progression/progression.plugin';
import spellsPlugin from '../../spells/spells.plugin';
import waystonesPlugin from '../../waystones/waystones.plugin';
import type { World } from '../../world/World';
import shrinePlugin from '../shrine.plugin';
import hathrensMerePlugin from './hathrensMere.plugin';
import wyrmsHearthPlugin from './wyrmsHearth.plugin';
import lastAnvilPlugin from './lastAnvil.plugin';
import rubbingsPlugin from './rubbings.plugin';
import waysidePlugin from './wayside.plugin';

const T = PLUGIN_TEST_TIMEOUT;
const MERE_SITE = { x: 3000, y: 20, z: 12050 };
const ANVIL_SITE = { x: 14700, y: 60, z: 13900 };
const HEARTH_SITE = { x: 13600, y: 600, z: 15600 };

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

interface BootOpts {
  mere?: boolean;
  anvil?: boolean;
  carvings?: boolean;
  wayside?: boolean;
  hearth?: boolean;
  hearthStone?: boolean;
  quests?: boolean;
}

async function boot(opts: BootOpts = {}) {
  (globalThis as any).self ??= globalThis;
  const game = makeTestGame(physics);
  worlds.push(game.ctx.world as unknown as World);
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  if (opts.mere !== false) ctx.anchors.define({ id: 'greyfen.mere.shrine', position: MERE_SITE, yaw: 0 });
  if (opts.anvil !== false) ctx.anchors.define({ id: 'dragonspine.anvil.shrine', position: ANVIL_SITE, yaw: 0 });
  if (opts.hearth !== false) ctx.anchors.define({ id: 'dragonspine.hearth.shrine', position: HEARTH_SITE, yaw: 0 });
  if (opts.hearthStone !== false) ctx.anchors.define({ id: 'waystone.wyrms-hearth', position: { x: HEARTH_SITE.x + 24, y: HEARTH_SITE.y, z: HEARTH_SITE.z - 20 }, yaw: 0, tags: ['waystone'] });
  if (opts.carvings !== false) {
    for (let n = 1; n <= 6; n++) ctx.anchors.define({ id: `dragonspine.anvil.carving.${n}`, position: { x: ANVIL_SITE.x + n * 5, y: ANVIL_SITE.y, z: ANVIL_SITE.z - 20 }, yaw: 0 });
  }
  if (opts.wayside !== false) {
    for (let n = 1; n <= 6; n++) ctx.anchors.define({ id: `dragonspine.wayside.${n}`, position: { x: 14000 + n * 40, y: 50, z: 13000 }, yaw: 0 });
  }
  ctx.services.provide('enemies' as never, { setWarmthTier: () => {} } as never);

  // A quests stub: states by id, and the change feed the Mere listens to.
  const states = new Map<string, string>();
  const listeners = new Set<() => void>();
  if (opts.quests !== false) ctx.services.provide('quests' as never, {
    state: (id: string) => states.get(id) ?? 'inactive',
    onChange: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  } as never);
  const setQuest = (id: string, state: string) => {
    states.set(id, state);
    for (const l of [...listeners]) l();
  };
  // The inventory and status stubs: the real ones know no hathrens-scale item and no applied ignite yet.
  const held = { scale: 0 };
  ctx.services.provide('inventory' as never, { count: (id: string) => (id === 'hathrens-scale' ? held.scale : 0) } as never);
  const ignites = new Set(['ignite.a', 'ignite.b']);
  const cleared: string[] = [];
  ctx.services.provide(
    'status' as never,
    {
      list: () => [...ignites].map((id) => ({ id, kind: 'ignite', remaining: 3, sourceId: null })).concat([{ id: 'bleed.x', kind: 'bleed', remaining: 3, sourceId: null }]),
      clear: (_actor: string, id: string) => (cleared.push(id), ignites.delete(id)),
    } as never,
  );

  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const statuses = await bootPlugins(game, [
    corePlugin,
    waystonesPlugin,
    spellsPlugin,
    progressionPlugin,
    shrinePlugin,
    codexPlugin,
    rubbingsPlugin,
    hathrensMerePlugin,
    lastAnvilPlugin,
    waysidePlugin,
    wyrmsHearthPlugin,
  ]);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  const emitted: { type: string; payload: any }[] = [];
  for (const type of ['shrine.rekindled', 'warmth.changed', 'rubbing.taken', 'wayside.lit', 'scar.removed']) {
    (ctx.events as any).on(type, (payload: unknown) => emitted.push({ type, payload }));
  }
  ctx.state.setFlag('tutorial.heartshard-awakened', true);
  const player = ctx.actors.player;
  const use = (id: string) => interactables.get(id)!.onInteract(player);
  const enabled = (id: string) => interactables.get(id)?.enabled?.() ?? true;
  const load = () => ctx.events.emit('save.loaded', {} as never);
  return { game, ctx, statuses, run, interactables, emitted, setQuest, held, cleared, use, enabled, load };
}
type T = Awaited<ReturnType<typeof boot>>;
const tier = (t: T) => t.ctx.services.require('warmth').tier();
const spells = (t: T) => t.ctx.services.require('spells');
const rekindle = (t: T, id: string, cause: 'player' | 'script' = 'player') => t.ctx.services.require('waystones').rekindle(id, cause);


const ID = 'wyrms-hearth';
const OPEN = 'shrine.wyrms-hearth.open';
const LIT = 'shrine.wyrms-hearth.lit';

describe("the Wyrm's Hearth", () => {
  it('sets up cleanly and builds the slag nest at the site anchor', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.scene.getObjectByName('wyrms-hearth-basin')).toBeDefined();
    expect(t.ctx.scene.getObjectByName('wyrms-hearth')!.position.x).toBe(HEARTH_SITE.x);
  }, T);

  it('never redefines an existing waystone anchor, and defines one only when it is missing', async () => {
    const t = await boot();
    t.run(3);
    expect(t.ctx.anchors.find('waystone.wyrms-hearth')!.position.x).toBe(HEARTH_SITE.x + 24);
    const u = await boot({ hearthStone: false });
    u.run(3);
    const a = u.ctx.anchors.find('waystone.wyrms-hearth')!;
    expect(a.tags).toContain('waystone');
    expect(Math.hypot(a.position.x - HEARTH_SITE.x, a.position.z - HEARTH_SITE.z)).toBeCloseTo(10, 5);
  }, T);

  it('opens on each input alone and not with M34 inactive', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('m33', 'active');
    expect(t.ctx.state.getBool(OPEN)).toBe(false);
    t.setQuest('m34', 'active');
    expect(t.ctx.state.getBool(OPEN)).toBe(true);
    t.setQuest('m34', 'completed');
    expect(t.ctx.state.getBool(OPEN)).toBe(true);
    const u = await boot();
    u.run(2);
    u.ctx.state.setFlag('story.m34.complete', true);
    expect(u.ctx.state.getBool(OPEN)).toBe(true);
    const v = await boot();
    v.run(2);
    v.ctx.state.setFlag(LIT, true);
    expect(v.ctx.state.getBool(OPEN)).toBe(true);
  }, T);

  it('re-derives on a load: M34 restored active stays open, M34 restored inactive stays closed', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('m34', 'active');
    t.ctx.state.setFlag(OPEN, false);
    t.load();
    expect(t.ctx.state.getBool(OPEN)).toBe(true);
    const u = await boot();
    u.run(2);
    u.setQuest('m34', 'inactive'); // a save from before M34
    u.ctx.state.setFlag(OPEN, true); // a stale value
    u.load();
    u.run(2);
    expect(u.ctx.state.getBool(OPEN)).toBe(false);
  }, T);

  it('refuses a press while closed; once open it lights with exactly 10 Burn, and a second press is a rest', async () => {
    const t = await boot();
    t.run(2);
    const before = tier(t);
    const burn = spells(t).burn;
    t.use('waystone:wyrms-hearth');
    expect(t.ctx.services.require('waystones').isLit(ID)).toBe(false);
    expect(spells(t).burn).toBe(burn);
    t.setQuest('m34', 'active');
    t.use('waystone:wyrms-hearth');
    expect(t.ctx.state.getBool(LIT)).toBe(true);
    expect(tier(t)).toBe(before + 1);
    expect(spells(t).burn - burn).toBe(10);
    const rests: unknown[] = [];
    (t.ctx.events as any).on('rest', (p: unknown) => rests.push(p));
    t.use('waystone:wyrms-hearth');
    expect(rests).toEqual([{ waystoneId: ID }]);
    t.run(3);
    expect(spells(t).burn - burn).toBeLessThanOrEqual(10);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled').map((e) => e.payload.shrineId)).toEqual([ID]);
  }, T);

  it('a shrine flag set by a script rekindles the stone with no Burn, and opens it', async () => {
    const t = await boot();
    t.run(2);
    const burn = spells(t).burn;
    t.ctx.state.setFlag(LIT, true);
    t.run(2);
    expect(t.ctx.services.require('waystones').isLit(ID)).toBe(true);
    expect(spells(t).burn).toBe(burn);
    expect(t.ctx.state.getBool(OPEN)).toBe(true);
    const rests: unknown[] = [];
    (t.ctx.events as any).on('rest', (p: unknown) => rests.push(p));
    t.use('waystone:wyrms-hearth');
    expect(rests).toEqual([{ waystoneId: ID }]);
  }, T);

  it('W reaches 6 with the six Act 1 to 3 shrines and stays 6 across repeated rekindles and a load', async () => {
    const t = await boot();
    t.run(2);
    for (const id of ['quenchstone', 'hushed-anvil', 'weeping-bellows']) t.ctx.state.setFlag(`shrine.${id}.lit`, true);
    expect(tier(t)).toBe(3);
    t.setQuest('m34', 'active');
    for (const id of ['hathrens-mere', 'last-anvil', ID, 'hathrens-mere', ID, 'last-anvil']) rekindle(t, id);
    t.run(3);
    expect(tier(t)).toBe(6);
    t.load();
    t.run(2);
    expect(tier(t)).toBe(6);
  }, T);

  it('without the site anchor it builds nothing, logs once and does not throw', async () => {
    const t = await boot({ hearth: false });
    expect(() => t.run(6)).not.toThrow();
    expect(t.ctx.scene.getObjectByName('wyrms-hearth-basin')).toBeUndefined();
    const logs = (console.info as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('dragonspine.hearth.shrine'));
    expect(logs).toHaveLength(1);
  }, T);

  it('a missing quests service reads as closed and never throws', async () => {
    const t = await boot({ quests: false });
    expect(() => t.run(4)).not.toThrow();
    expect(t.ctx.state.getBool(OPEN)).toBe(false);
  }, T);
});
