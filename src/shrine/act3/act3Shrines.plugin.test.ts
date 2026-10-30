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
import lastAnvilPlugin from './lastAnvil.plugin';
import rubbingsPlugin from './rubbings.plugin';
import waysidePlugin from './wayside.plugin';

const T = PLUGIN_TEST_TIMEOUT;
const MERE_SITE = { x: 3000, y: 20, z: 12050 };
const ANVIL_SITE = { x: 14700, y: 60, z: 13900 };

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
  ctx.services.provide('quests' as never, {
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

describe('Hathren\'s Mere', () => {
  it('sets up cleanly, defines the waystone anchor 14 m from the site and builds the shore', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const a = t.ctx.anchors.find('waystone.hathrens-mere')!;
    expect(a.tags).toContain('waystone');
    expect(Math.hypot(a.position.x - MERE_SITE.x, a.position.z - MERE_SITE.z)).toBeCloseTo(14, 5);
    expect(t.ctx.scene.getObjectByName('hathrens-mere-basin')).toBeDefined();
  }, T);

  it('keeps an existing waystone anchor instead of defining a second', async () => {
    (globalThis as any).self ??= globalThis;
    const t = await boot({ mere: false });
    t.ctx.anchors.define({ id: 'waystone.hathrens-mere', position: { x: 1, y: 0, z: 1 }, yaw: 0, tags: ['waystone'] });
    t.ctx.anchors.define({ id: 'greyfen.mere.shrine', position: MERE_SITE, yaw: 0 });
    expect(() => t.run(3)).not.toThrow();
    expect(t.ctx.anchors.find('waystone.hathrens-mere')!.position.x).toBe(1);
  }, T);

  it('opens on story.m26.netsCut, on M26 active and on M26 completed, and not during M23 to M25', async () => {
    const t = await boot();
    t.run(2);
    expect(t.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(false);
    t.ctx.state.setFlag('story.m26.netsCut', true);
    expect(t.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(true);
    const u = await boot();
    u.run(2);
    u.setQuest('m25', 'active'); // M23 to M25: closed
    expect(u.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(false);
    u.setQuest('m26', 'active');
    expect(u.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(true);
    u.setQuest('m26', 'completed');
    expect(u.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(true);
  }, T);

  it('re-derives the gate on a load', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('story.m26.netsCut', true);
    t.ctx.state.setFlag('shrine.hathrens-mere.open', false);
    t.load();
    expect(t.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(true);
  }, T);

  it('the stone refuses before the gate; after it a player press lights the shrine once: W + 1 and exactly one rekindle of Burn', async () => {
    const t = await boot();
    t.run(2);
    const before = tier(t);
    const burn = spells(t).burn;
    t.use('waystone:hathrens-mere'); // M26 inactive, nets not cut: locked
    expect(t.ctx.services.require('waystones').isLit('hathrens-mere')).toBe(false);
    expect(spells(t).burn).toBe(burn);
    t.ctx.state.setFlag('story.m26.netsCut', true);
    t.use('waystone:hathrens-mere');
    expect(t.ctx.state.getBool('shrine.hathrens-mere.lit')).toBe(true);
    expect(tier(t)).toBe(before + 1);
    expect(spells(t).burn - burn).toBe(10);
    t.use('waystone:hathrens-mere'); // now a rest, not a second rekindle
    t.run(3);
    t.load();
    expect(tier(t)).toBe(before + 1);
    expect(spells(t).burn - burn).toBeLessThanOrEqual(10); // only the natural decay since: no second charge
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled').map((e) => e.payload.shrineId)).toEqual(['hathrens-mere']);
  }, T);

  it('M26 active opens the stone with the nets flag never written', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('m26', 'active');
    t.use('waystone:hathrens-mere');
    expect(t.ctx.state.getBool('shrine.hathrens-mere.lit')).toBe(true);
  }, T);

  it('a lit Mere stone is unlocked and its rest works, even with M26 inactive and no flags (a jump)', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('shrine.hathrens-mere.lit', true);
    t.run(2);
    expect(t.ctx.state.getBool('shrine.hathrens-mere.open')).toBe(true);
    const rests: unknown[] = [];
    (t.ctx.events as any).on('rest', (p: unknown) => rests.push(p));
    t.use('waystone:hathrens-mere');
    expect(rests).toEqual([{ waystoneId: 'hathrens-mere' }]);
    expect(t.cleared.sort()).toEqual(['ignite.a', 'ignite.b']);
  }, T);

  it('a shrine flag set by a script lights the waystone with no Burn', async () => {
    const t = await boot();
    t.run(2);
    const burn = spells(t).burn;
    t.ctx.state.setFlag('shrine.hathrens-mere.lit', true);
    t.run(2);
    expect(t.ctx.services.require('waystones').isLit('hathrens-mere')).toBe(true);
    expect(spells(t).burn).toBe(burn);
    expect(tier(t)).toBe(1);
  }, T);

  it('the rest clears ignite only after the shrine is lit, and leaves other statuses', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.events.emit('rest', { waystoneId: 'hathrens-mere' });
    expect(t.cleared).toEqual([]);
    rekindle(t, 'hathrens-mere');
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    expect(t.cleared).toEqual([]);
    t.ctx.events.emit('rest', { waystoneId: 'hathrens-mere' });
    expect(t.cleared.sort()).toEqual(['ignite.a', 'ignite.b']);
  }, T);

  it('Hathren\'s Scale eases min(3, Scars) once, across a save and load and a drop and pick-up', async () => {
    const t = await boot();
    t.run(2);
    const s = spells(t);
    s.useShard(100, 'test');
    for (let i = 0; i < 4; i++) s.useShard(1, 'test');
    expect(s.scars).toBe(4);
    t.held.scale = 1;
    t.run(1);
    expect(t.ctx.state.getBool('shrine.hathrens-mere.scaleUsed')).toBe(true);
    expect(s.scars).toBe(1);
    expect(t.emitted.filter((e) => e.type === 'scar.removed')).toHaveLength(1);
    t.load(); // save, quit, load: the flag is in the save
    t.held.scale = 0;
    t.run(1);
    t.held.scale = 1;
    t.run(2);
    s.useShard(1, 'test');
    t.load();
    t.run(2);
    expect(s.scars).toBe(2);
    expect(t.emitted.filter((e) => e.type === 'scar.removed')).toHaveLength(1);
  }, T);

  it('with 0 Scars the Scale is still spent', async () => {
    const t = await boot();
    t.run(2);
    t.held.scale = 1;
    t.run(1);
    expect(t.ctx.state.getBool('shrine.hathrens-mere.scaleUsed')).toBe(true);
    expect(spells(t).scars).toBe(0);
  }, T);

  it('without the site anchor it builds nothing, logs once and does not throw', async () => {
    const t = await boot({ mere: false });
    expect(() => t.run(6)).not.toThrow();
    expect(t.ctx.anchors.find('waystone.hathrens-mere')).toBeUndefined();
    const logs = (console.info as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('greyfen.mere.shrine'));
    expect(logs).toHaveLength(1);
  }, T);
});

describe('the Last Anvil', () => {
  it('sets up cleanly and defines the waystone anchor only when K4 has not', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.anchors.find('waystone.last-anvil')!.tags).toContain('waystone');
    const u = await boot({ anvil: false });
    u.ctx.anchors.define({ id: 'waystone.last-anvil', position: { x: 2, y: 0, z: 2 }, yaw: 0, tags: ['waystone'] });
    u.ctx.anchors.define({ id: 'dragonspine.anvil.shrine', position: ANVIL_SITE, yaw: 0 });
    expect(() => u.run(3)).not.toThrow();
    expect(u.ctx.anchors.find('waystone.last-anvil')!.position.x).toBe(2);
  }, T);

  it('the three steps are enabled in order, only while M30 is active or completed, and persist through a load', async () => {
    const t = await boot();
    t.run(2);
    for (const s of ['sweep', 'relight', 'sound']) expect(t.enabled(`use:last-anvil-${s}`)).toBe(false);
    t.setQuest('m30', 'active');
    expect(t.enabled('use:last-anvil-sweep')).toBe(true);
    expect(t.enabled('use:last-anvil-relight')).toBe(false);
    t.use('use:last-anvil-relight'); // out of order: refused
    t.use('use:last-anvil-sound');
    expect(t.ctx.state.getBool('world.last-anvil.relit')).toBe(false);
    t.use('use:last-anvil-sweep');
    expect(t.enabled('use:last-anvil-sweep')).toBe(false);
    expect(t.enabled('use:last-anvil-relight')).toBe(true);
    t.use('use:last-anvil-relight');
    t.load();
    expect(t.ctx.state.getBool('world.last-anvil.swept')).toBe(true);
    expect(t.ctx.state.getBool('world.last-anvil.relit')).toBe(true);
    expect(t.enabled('use:last-anvil-sound')).toBe(true);
    t.setQuest('m30', 'completed');
    expect(t.enabled('use:last-anvil-sound')).toBe(true);
    t.use('use:last-anvil-sound');
    expect(t.ctx.state.getBool('world.last-anvil.sounded')).toBe(true);
  }, T);

  it('the stone stays locked until sounded; the rekindle then lights the shrine and the Rim Beacon flag, once', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('m30', 'active');
    t.use('waystone:last-anvil'); // locked: refuses
    expect(t.ctx.services.require('waystones').isLit('last-anvil')).toBe(false);
    for (const s of ['sweep', 'relight', 'sound']) t.use(`use:last-anvil-${s}`);
    const before = tier(t);
    t.use('waystone:last-anvil');
    expect(t.ctx.services.require('waystones').isLit('last-anvil')).toBe(true);
    expect(t.ctx.state.getBool('shrine.last-anvil.lit')).toBe(true);
    expect(t.ctx.state.getBool('world.last-anvil.rimBeacon')).toBe(true);
    expect(tier(t)).toBe(before + 1);
    t.use('waystone:last-anvil'); // a rest, not a rekindle
    t.load();
    expect(tier(t)).toBe(before + 1);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled').map((e) => e.payload.shrineId)).toEqual(['last-anvil']);
  }, T);

  it('a shrine flag set by a script lights and opens the stone with no Burn', async () => {
    const t = await boot();
    t.run(2);
    const burn = spells(t).burn;
    t.ctx.state.setFlag('shrine.last-anvil.lit', true);
    t.run(2);
    expect(t.ctx.services.require('waystones').isLit('last-anvil')).toBe(true);
    expect(t.ctx.state.getBool('shrine.last-anvil.open')).toBe(true);
    expect(t.ctx.state.getBool('world.last-anvil.rimBeacon')).toBe(true);
    expect(spells(t).burn).toBe(burn);
    expect(tier(t)).toBe(1);
    const rests: unknown[] = [];
    (t.ctx.events as any).on('rest', (p: unknown) => rests.push(p));
    t.use('waystone:last-anvil');
    expect(rests).toEqual([{ waystoneId: 'last-anvil' }]);
  }, T);

  it('W counts the Mere and the Anvil once each, whatever the repeats', async () => {
    const t = await boot();
    t.run(2);
    expect(tier(t)).toBe(0);
    rekindle(t, 'hathrens-mere');
    rekindle(t, 'last-anvil');
    rekindle(t, 'hathrens-mere');
    rekindle(t, 'last-anvil');
    t.run(3);
    t.load();
    expect(tier(t)).toBe(2);
    expect(t.emitted.filter((e) => e.type === 'warmth.changed').map((e) => e.payload.tier)).toEqual([1, 2]);
  }, T);

  it('without the site anchor it builds nothing, logs once and does not throw', async () => {
    const t = await boot({ anvil: false, carvings: false });
    expect(() => t.run(6)).not.toThrow();
    expect(t.interactables.has('use:last-anvil-sweep')).toBe(false);
    const logs = (console.info as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('dragonspine.anvil.shrine'));
    expect(logs).toHaveLength(1);
  }, T);
});

describe('the anvil rubbings', () => {
  it('six interactables sit at the carving anchors, hold 3 s, and are enabled while M30 is open and untaken', async () => {
    const t = await boot();
    t.run(2);
    for (let n = 1; n <= 6; n++) {
      const i = t.interactables.get(`use:anvil-rubbing-${n}`)!;
      expect(i.holdSeconds).toBe(3);
      const out = i.position(new (t.ctx.scene.position.constructor as any)());
      expect(out.x).toBe(ANVIL_SITE.x + n * 5);
      expect(i.enabled!()).toBe(false);
    }
    t.setQuest('m30', 'active');
    expect(t.enabled('use:anvil-rubbing-3')).toBe(true);
    t.use('use:anvil-rubbing-3');
    expect(t.enabled('use:anvil-rubbing-3')).toBe(false);
    expect(t.enabled('use:anvil-rubbing-4')).toBe(true);
  }, T);

  it('locked before M32 (collection entry only), readable after, re-derived on a load', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('m30', 'active');
    const codex = t.ctx.services.require('codex');
    const rub = t.ctx.services.require('anvilRubbings');
    expect(codex.has('lore.anvil-rubbings')).toBe(false);
    t.use('use:anvil-rubbing-1');
    expect(t.emitted.filter((e) => e.type === 'rubbing.taken').map((e) => e.payload.rubbingId)).toEqual(['anvil-1']);
    expect(t.ctx.state.getBool('world.rubbing.anvil-1.taken')).toBe(true);
    expect(codex.has('lore.anvil-rubbings')).toBe(true);
    expect(codex.has('lore.rubbing.anvil-1')).toBe(false);
    expect(rub.readable()).toBe(false);
    expect(rub.count()).toBe(1);
    t.use('use:anvil-rubbing-2');
    t.ctx.state.setFlag('story.m32.complete', true);
    expect(rub.readable()).toBe(true);
    expect(codex.has('lore.rubbing.anvil-1')).toBe(true);
    expect(codex.has('lore.rubbing.anvil-2')).toBe(true);
    expect(codex.has('lore.rubbing.anvil-3')).toBe(false); // untaken never unlocks
    t.use('use:anvil-rubbing-3'); // M32 first, then take
    expect(codex.has('lore.rubbing.anvil-3')).toBe(true);
    t.load();
    expect(codex.has('lore.rubbing.anvil-3')).toBe(true);
  }, T);

  it('K2 registering after the load works, and a duplicate id is refused', async () => {
    const t = await boot();
    t.run(2);
    const rub = t.ctx.services.require('anvilRubbings');
    t.ctx.state.setFlag('world.rubbing.rock-1.taken', true);
    t.ctx.state.setFlag('story.m32.complete', true);
    t.load();
    expect(t.ctx.services.require('codex').has('lore.rubbing.rock-1')).toBe(false);
    rub.register([{ id: 'rock-1' }, { id: 'anvil-2' }]);
    expect(t.ctx.services.require('codex').has('lore.rubbing.rock-1')).toBe(true);
    expect(rub.taken('rock-1')).toBe(true);
    expect((console.warn as any).mock.calls.some((c: unknown[]) => String(c[0]).includes('duplicate rubbing id "anvil-2"'))).toBe(true);
  }, T);
});

describe('the R17 wayside shrines', () => {
  it('are enabled only while R17 is active, write their flags and never count in W', async () => {
    const t = await boot();
    t.run(2);
    expect(t.interactables.size).toBeGreaterThan(0);
    for (let n = 1; n <= 6; n++) expect(t.enabled(`use:r17-wayside-${n}`)).toBe(false);
    t.setQuest('r17', 'active');
    expect(t.enabled('use:r17-wayside-2')).toBe(true);
    t.use('use:r17-wayside-2');
    expect(t.ctx.state.getBool('world.wayside.2.lit')).toBe(true);
    expect(t.emitted.filter((e) => e.type === 'wayside.lit').map((e) => e.payload.index)).toEqual([2]);
    expect(t.enabled('use:r17-wayside-2')).toBe(false);
    for (let n = 1; n <= 6; n++) t.use(`use:r17-wayside-${n}`);
    t.load();
    t.run(2);
    expect(t.ctx.services.require('waysideShrines').count()).toBe(6);
    expect(tier(t)).toBe(0);
    t.setQuest('r17', 'completed');
    expect(t.ctx.state.getBool('world.wayside.6.lit')).toBe(true);
  }, T);

  it('the light gate blocks, and a gate that throws reads as blocked', async () => {
    const t = await boot();
    t.run(2);
    t.setQuest('r17', 'active');
    const svc = t.ctx.services.require('waysideShrines');
    const off = svc.setLightGate(() => false);
    expect(t.enabled('use:r17-wayside-1')).toBe(false);
    t.use('use:r17-wayside-1');
    expect(t.ctx.state.getBool('world.wayside.1.lit')).toBe(false);
    off();
    svc.setLightGate(() => {
      throw new Error('boom');
    });
    expect(t.enabled('use:r17-wayside-1')).toBe(false);
    t.use('use:r17-wayside-1');
    expect(t.ctx.state.getBool('world.wayside.1.lit')).toBe(false);
  }, T);

  it('with no anchors it places nothing, logs once per anchor and does not throw', async () => {
    const t = await boot({ wayside: false });
    expect(() => t.run(6)).not.toThrow();
    expect(t.interactables.has('use:r17-wayside-1')).toBe(false);
    const logs = (console.info as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('dragonspine.wayside.1"'));
    expect(logs).toHaveLength(1);
  }, T);
});
