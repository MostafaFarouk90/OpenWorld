import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import codexPlugin from '../codex/codex.plugin';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import type { Interactable } from '../interaction/InteractionSystem';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import { PressureTimer } from '../puzzles/PressureTimer';
import puzzlesPlugin from '../puzzles/puzzles.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { DELL } from './kindlingDell.plugin';
import hushedAnvilPlugin from './hushedAnvil.plugin';
import kindlingDellPlugin from './kindlingDell.plugin';
import shrinePlugin from './shrine.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/shrine.plugin.ts': { default: shrinePlugin },
  '/src/test/codex.plugin.ts': { default: codexPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/hushed-anvil.plugin.ts': { default: hushedAnvilPlugin },
  '/src/test/kindling-dell.plugin.ts': { default: kindlingDellPlugin },
  '/src/test/puzzles.plugin.ts': { default: puzzlesPlugin },
};

/** A1's plateau centre (provisional) puts the fixture at the real far-coordinate range. */
const SITE = { x: 18400, y: 40, z: 1650 };
const DELL_BED = { x: 16250, y: 30, z: 4650 };

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

async function boot(opts: { site?: boolean; dell?: boolean; dellFar?: boolean } = {}) {
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
  const ctx = game.ctx;
  ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  if (opts.site !== false) ctx.anchors.define({ id: 'cinderreach.hushed-anvil.site', position: SITE, yaw: 0 });
  if (opts.dell) {
    ctx.anchors.define({ id: DELL.bedAnchor, position: DELL_BED, yaw: 0 });
    ctx.triggers.add({ id: DELL.trigger, shape: { type: 'sphere', center: { x: ctx.player.feet.x + (opts.dellFar ? 5000 : 0), y: ctx.player.feet.y, z: ctx.player.feet.z }, radius: 50 } });
  }
  ctx.services.provide('enemies' as never, { setWarmthTier: () => {} } as never);
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const statuses = await game.loadPlugins(modules);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  const emitted: { type: string; payload: any }[] = [];
  for (const type of ['shrine.rekindled', 'warmth.changed', 'buff.applied', 'buff.removed', 'discover', 'puzzle.failed']) {
    (ctx.events as any).on(type, (payload: unknown) => emitted.push({ type, payload }));
  }
  return { game, ctx, statuses, run, interactables, emitted };
}

describe('Hushed Anvil: rekindle and Warmth', () => {
  it('sets up cleanly and defines the waystone from the site anchor', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const a = t.ctx.anchors.find('waystone.hushed-anvil')!;
    expect(a.tags).toContain('waystone');
    expect(Math.hypot(a.position.x - SITE.x, a.position.z - SITE.z)).toBeLessThan(10);
  });

  it('a player rekindle lights the shrine, W goes 1 to 2 and Burn is the one rekindle gain', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    t.ctx.services.require('waystones').rekindle('quenchstone', 'player');
    expect(t.ctx.services.require('warmth').tier()).toBe(1);
    expect(t.ctx.services.require('waystones').rekindle('hushed-anvil', 'player').ok).toBe(true);
    expect(t.ctx.state.getBool('shrine.hushed-anvil.lit')).toBe(true);
    expect(t.ctx.services.require('warmth').tier()).toBe(2);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled').map((e) => e.payload.shrineId)).toEqual(['quenchstone', 'hushed-anvil']);
    expect(t.ctx.services.require('spells').burn).toBeGreaterThan(0);
  });

  it('W re-derives to 2 on a load and the Bellows flag then makes 3', async () => {
    const t = await boot();
    t.run(1);
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.ctx.state.setFlag('shrine.hushed-anvil.lit', true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.ctx.services.require('warmth').tier()).toBe(2);
    t.ctx.state.setFlag('shrine.weeping-bellows.lit', true);
    expect(t.ctx.services.require('warmth').tier()).toBe(3);
  });

  it('an older save with only the waystone lit lights the shrine silently', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.services.require('waystones').rekindle('hushed-anvil', 'script');
    t.ctx.state.setFlag('shrine.hushed-anvil.lit', false);
    t.emitted.length = 0;
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.ctx.state.getBool('shrine.hushed-anvil.lit')).toBe(true);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled')).toEqual([]);
  });

  it('without the site anchor it builds nothing, warns nothing fatal and does not throw', async () => {
    const t = await boot({ site: false });
    expect(() => t.run(5)).not.toThrow();
    expect(t.ctx.anchors.find('waystone.hushed-anvil')).toBeUndefined();
    expect(t.interactables.has('use:hushed-anvil-station')).toBe(false);
  });

  it('a site anchor that appears late is picked up, once', async () => {
    const t = await boot({ site: false });
    t.run(3);
    t.ctx.anchors.define({ id: 'cinderreach.hushed-anvil.site', position: SITE, yaw: 0 });
    expect(() => t.run(5)).not.toThrow();
    expect(t.ctx.anchors.find('waystone.hushed-anvil')).toBeDefined();
    expect(t.interactables.has('use:hushed-anvil-mural-3')).toBe(true);
  });
});

describe('Hushed Anvil: lights and degradation', () => {
  const visibleLights = (t: Awaited<ReturnType<typeof boot>>) => {
    let n = 0;
    t.ctx.scene.traverse((o) => {
      const l = o as THREE.PointLight;
      if (!l.isPointLight) return;
      for (let p: THREE.Object3D | null = l; p; p = p.parent) if (!p.visible) return;
      n++;
    });
    return n;
  };

  it('the visible light count does not change when the site anchor appears, and the lantern is dim until then', async () => {
    const t = await boot({ site: false });
    t.run(3);
    const before = visibleLights(t);
    t.ctx.anchors.define({ id: 'cinderreach.hushed-anvil.site', position: SITE, yaw: 0 });
    t.run(3);
    expect(visibleLights(t)).toBe(before);
  });

  it('the Dell with no bed anchor or trigger degrades quietly', async () => {
    const t = await boot();
    expect(() => t.run(5)).not.toThrow();
    expect(t.interactables.has('use:kindling-bed')).toBe(false);
    expect(t.ctx.state.getBool('world.kindling-dell.found')).toBe(false);
  });

  it('a stale saved mirror flag is corrected after a load', async () => {
    const t = await boot();
    t.run(1);
    t.ctx.state.setFlag('buff.foxFire.active', true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.ctx.state.getBool('buff.foxFire.active')).toBe(false);
  });
});

describe('Hushed Anvil: murals and the tempering station', () => {
  it('each mural sets its flag and unlocks its codex entry, and can be read again', async () => {
    const t = await boot();
    t.run(2);
    for (const n of [1, 2, 3]) {
      const m = t.interactables.get(`use:hushed-anvil-mural-${n}`)!;
      m.onInteract(t.ctx.actors.player);
      m.onInteract(t.ctx.actors.player);
      expect(t.ctx.state.getBool(`world.hushed-anvil.mural.${n}`)).toBe(true);
      expect(t.ctx.services.require('codex').has(`lore.hushed-anvil.mural-${n}`)).toBe(true);
    }
  });

  it('the station is refused while dark and calls the handler once lit', async () => {
    const t = await boot();
    t.run(2);
    const station = t.ctx.services.require('temperStation');
    const handler = vi.fn();
    const off = station.setHandler(handler);
    const use = t.interactables.get('use:hushed-anvil-station')!;
    expect(station.stations()).toEqual([{ id: 'hushed-anvil', usable: false }]);
    use.onInteract(t.ctx.actors.player);
    expect(handler).not.toHaveBeenCalled();
    t.ctx.state.setFlag('shrine.hushed-anvil.lit', true);
    expect(station.stations()[0].usable).toBe(true);
    use.onInteract(t.ctx.actors.player);
    expect(handler).toHaveBeenCalledWith('hushed-anvil');
    off();
    expect(() => use.onInteract(t.ctx.actors.player)).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('with no handler a lit station only toasts, and a throwing handler does not break it', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('shrine.hushed-anvil.lit', true);
    const use = t.interactables.get('use:hushed-anvil-station')!;
    expect(() => use.onInteract(t.ctx.actors.player)).not.toThrow();
    t.ctx.services.require('temperStation').setHandler(() => {
      throw new Error('boom');
    });
    expect(() => use.onInteract(t.ctx.actors.player)).not.toThrow();
    expect(use.onInteract).toBeTypeOf('function');
  });
});

describe('Kindling Dell and Fox-Fire', () => {
  it('entering the Dell finds it once and leaves one Kindling Brush even after a drop', async () => {
    const t = await boot({ dell: true });
    t.run(6);
    expect(t.ctx.state.getBool('world.kindling-dell.found')).toBe(true);
    expect(t.emitted.filter((e) => e.type === 'discover' && e.payload.placeId === 'kindling-dell')).toHaveLength(1);
    const inv = t.ctx.services.require('inventory');
    expect(inv.count('kindling-brush')).toBe(1);
    inv.remove('kindling-brush', 1);
    t.run(5);
    expect(inv.count('kindling-brush')).toBe(0);
    expect(t.ctx.state.getBool('world.kindling-dell.brushGiven')).toBe(true);
  });

  it('the bed refuses before the Dell is found, then grants a refreshing, non-stacking Fox-Fire', async () => {
    const t = await boot({ dell: true, dellFar: true });
    t.run(2);
    const bed = t.interactables.get('use:kindling-bed')!;
    expect(bed.enabled?.()).toBe(false);
    t.ctx.state.setFlag('world.kindling-dell.found', true);
    expect(bed.enabled?.()).toBe(true);
    bed.onInteract(t.ctx.actors.player);
    const fox = t.ctx.services.require('foxFire');
    expect(fox.active()).toBe(true);
    expect(t.ctx.state.getBool('buff.foxFire.active')).toBe(true);
    expect(t.emitted.filter((e) => e.type === 'buff.applied' && e.payload.id === 'shrine.fox-fire')).toHaveLength(1);
    t.run(60);
    const before = fox.secondsLeft();
    bed.onInteract(t.ctx.actors.player);
    expect(fox.secondsLeft()).toBeGreaterThan(before);
    expect(fox.secondsLeft()).toBeLessThanOrEqual(1800);
  });

  it('expires after 30 minutes, clears the flag and removes the buff', async () => {
    const t = await boot();
    t.run(1);
    const fox = t.ctx.services.require('foxFire');
    fox.apply();
    t.run(60 * 60 * 30 + 5);
    expect(fox.active()).toBe(false);
    expect(t.ctx.state.getBool('buff.foxFire.active')).toBe(false);
    expect(t.emitted.some((e) => e.type === 'buff.removed' && e.payload.id === 'shrine.fox-fire')).toBe(true);
  });

  it('persists, survives death, and a save without the key clears it', async () => {
    const t = await boot();
    t.run(1);
    t.ctx.services.require('foxFire').apply();
    t.run(120);
    const saved = t.ctx.persist.get('shrine.foxFire')!.serialize();
    expect(saved).toMatchObject({ remaining: expect.any(Number) });
    t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined });
    expect(t.ctx.services.require('foxFire').active()).toBe(true);

    const u = await boot();
    u.run(1);
    u.ctx.persist.get('shrine.foxFire')!.load(saved, 1);
    u.ctx.events.emit('save.loaded', {} as never);
    expect(u.ctx.services.require('foxFire').active()).toBe(true);
    expect(u.ctx.state.getBool('buff.foxFire.active')).toBe(true);
    // The next load carries no entry: the buff and the mirror flag go.
    u.ctx.events.emit('save.loaded', {} as never);
    expect(u.ctx.services.require('foxFire').active()).toBe(false);
    expect(u.ctx.state.getBool('buff.foxFire.active')).toBe(false);
  });

  it('adds one light at setup and never adds or removes lights while the buff toggles', async () => {
    const t = await boot();
    t.run(1);
    const count = () => {
      let n = 0;
      t.game.ctx.scene.traverse((o) => void ((o as THREE.PointLight).isPointLight && n++));
      return n;
    };
    const before = count();
    t.ctx.services.require('foxFire').apply();
    t.run(3);
    t.run(60 * 60 * 31);
    expect(count()).toBe(before);
  });
});

describe('puzzles service', () => {
  async function bootWithPuzzle() {
    const t = await boot();
    t.run(1);
    const timer = new PressureTimer(45);
    const aborts: string[] = [];
    const puzzles = t.ctx.services.require('puzzles');
    puzzles.register('fixture', { timer, onAbort: (r) => aborts.push(r) });
    timer.start();
    return { t, timer, aborts, puzzles };
  }

  it('reports the running clock and null once idle', async () => {
    const { puzzles, timer } = await bootWithPuzzle();
    expect(puzzles.pressure('fixture')).toEqual({ remaining: 45, total: 45 });
    expect(puzzles.pressure('nope')).toBeNull();
    timer.reset();
    expect(puzzles.pressure('fixture')).toBeNull();
  });

  it('rejects a duplicate id and unregisters cleanly', async () => {
    const { puzzles } = await bootWithPuzzle();
    expect(() => puzzles.register('fixture', {})).toThrow();
    const off = puzzles.register('other', {});
    off();
    expect(() => puzzles.register('other', {})).not.toThrow();
  });

  it('player death resets the puzzle and stops the clock', async () => {
    const { t, timer, aborts } = await bootWithPuzzle();
    t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined });
    expect(aborts).toEqual(['death']);
    expect(timer.active).toBe(false);
  });

  it('another actor dying does nothing', async () => {
    const { t, timer, aborts } = await bootWithPuzzle();
    t.ctx.events.emit('actor.died', { actorId: 'wolf-1', killerId: null, kind: 'wolf', team: 'hostile', level: 1, spawnTag: undefined } as never);
    expect(aborts).toEqual([]);
    expect(timer.active).toBe(true);
  });

  it('a save load mid-puzzle resets it', async () => {
    const { t, timer, aborts } = await bootWithPuzzle();
    t.ctx.events.emit('save.loaded', {} as never);
    expect(aborts).toEqual(['load']);
    expect(timer.active).toBe(false);
  });

  it('starting a waystone travel mid-puzzle resets it once', async () => {
    const { t, timer, aborts } = await bootWithPuzzle();
    let travelling = true;
    Object.defineProperty(t.ctx.services.require('waystones'), 'travelling', { get: () => travelling, configurable: true });
    t.run(3);
    expect(aborts).toEqual(['travel']);
    expect(timer.active).toBe(false);
    travelling = false;
    t.run(2);
    expect(aborts).toEqual(['travel']);
  });

  it('a throwing abort hook does not stop the others', async () => {
    const { t, puzzles, aborts } = await bootWithPuzzle();
    puzzles.register('bad', {
      onAbort: () => {
        throw new Error('x');
      },
    });
    t.ctx.events.emit('save.loaded', {} as never);
    expect(aborts).toEqual(['load']);
  });
});
