import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { BURN } from '../vfx/tuning';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import shrinePlugin from './shrine.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/shrine.plugin.ts': { default: shrinePlugin },
};

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

async function boot(opts: { stub?: (game: Game) => void } = {}) {
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
  const here = game.ctx.player.feet;
  const at = (dx: number, dz: number) => ({ x: here.x + dx, y: here.y, z: here.z + dz });
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  game.ctx.anchors.define({ id: 'waystone.quenchstone', position: at(0, 0), yaw: 0, tags: ['waystone'] });
  game.ctx.anchors.define({ id: 'shrine.quenchstone.basin', position: at(0, 0), yaw: 0 });
  for (let n = 1; n <= 5; n++) game.ctx.anchors.define({ id: `wardstone.${n}`, position: at((n - 1) * 100, -2), yaw: 0 });
  game.ctx.triggers.add({ id: 'trg.shrine.basin', shape: { type: 'sphere', center: at(0, 0), radius: 6 } });
  const warmthCalls: number[] = [];
  game.ctx.services.provide('enemies' as never, { setWarmthTier: (w: number) => warmthCalls.push(w) } as never);
  opts.stub?.(game);
  const statuses = await game.loadPlugins(modules);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  const ctx = game.ctx;
  const emitted: { type: string; payload: unknown }[] = [];
  for (const type of ['warmth.changed', 'shrine.rekindled', 'buff.applied', 'buff.removed', 'wardstone.struck', 'wardstone.missed', 'wardstones.complete']) {
    (ctx.events as any).on(type, (payload: unknown) => emitted.push({ type, payload }));
  }
  return { game, ctx, statuses, run, warmthCalls, emitted };
}

describe('shrine plugin on the real game', () => {
  it('sets up cleanly with its services', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.services.require('warmth').tier()).toBe(0);
    expect(t.ctx.services.require('shrine').nextWardstone()).toBe(1);
    expect(t.warmthCalls).toContain(0);
  });

  it('a player rekindle lights the shrine, gives W = 1 and charges exactly one rekindle of Burn', async () => {
    const t = await boot();
    t.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    expect(t.ctx.services.require('waystones').rekindle('quenchstone', 'player').ok).toBe(true);
    expect(t.ctx.state.getBool('shrine.quenchstone.lit')).toBe(true);
    expect(t.ctx.services.require('warmth').tier()).toBe(1);
    expect(t.warmthCalls.at(-1)).toBe(1);
    expect(t.emitted.filter((e) => e.type === 'warmth.changed')).toEqual([{ type: 'warmth.changed', payload: { tier: 1, previous: 0 } }]);
    expect(t.emitted.filter((e) => e.type === 'shrine.rekindled')).toHaveLength(1);
    // The shrine adds nothing of its own: the whole charge is spells' one rekindle gain.
    expect(t.ctx.services.require('spells').burn).toBe(BURN.rekindleGain);
  });

  it('a script rekindle lights the shrine without Burn', async () => {
    const t = await boot();
    t.ctx.services.require('waystones').rekindle('quenchstone', 'script');
    expect(t.ctx.state.getBool('shrine.quenchstone.lit')).toBe(true);
    expect(t.ctx.services.require('spells').burn).toBe(0);
    expect(t.ctx.services.require('warmth').tier()).toBe(1);
  });

  it('Burn caps at 100 when rekindling at Burn 95', async () => {
    const t = await boot();
    t.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    t.ctx.services.require('spells').addBurn(95, 'test');
    t.ctx.services.require('waystones').rekindle('quenchstone', 'player');
    expect(t.ctx.services.require('spells').burn).toBe(100);
  });

  it('rest: Cooled applies, health fills to the new maximum, Burn clears, Scars stay', async () => {
    const t = await boot();
    t.ctx.persist.get('burn')!.load({ burn: 60, scars: 3 }, 1);
    t.ctx.services.require('progression').refreshMaxHealth();
    const a = t.ctx.actors.player;
    // Burn 60 costs max health (slice 2 thread 2 turned the penalty on); the rest clears it, the 3 Scars (-6%) stay.
    const before = a.maxHealth;
    expect(before).toBeLessThan(120 * 0.94);
    a.health = 10;
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    expect(t.ctx.services.require('spells').burn).toBe(0);
    expect(t.ctx.services.require('spells').scars).toBe(3);
    expect(a.maxHealth).toBeCloseTo(120 * 0.94 * 1.1, 0);
    expect(a.health).toBe(a.maxHealth);
    expect(t.ctx.services.require('shrine').cooledSeconds()).toBe(1200);
    expect(t.emitted.filter((e) => e.type === 'buff.applied').at(-1)?.payload).toMatchObject({ id: 'shrine.cooled', seconds: 1200 });
    const cooledMax = a.maxHealth;
    t.run(60 * 60);
    expect(t.ctx.services.require('shrine').cooledSeconds()).toBeCloseTo(1140, 0);
    expect(a.maxHealth).toBeCloseTo(cooledMax, 3);
  });

  it('rest at another waystone gives no Cooled', async () => {
    const t = await boot();
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    expect(t.ctx.services.require('shrine').cooledSeconds()).toBe(0);
  });

  it('Cooled survives a save and load, restores health the load clamped, and re-announces', async () => {
    const t = await boot();
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    const a = t.ctx.actors.player;
    const cooledMax = a.maxHealth;
    a.health = cooledMax;
    const saved = t.ctx.persist.get('shrine.cooled')!.serialize();
    expect(saved).toMatchObject({ remaining: 1200, health: cooledMax });
    // A fresh game loads it; the uncooled max is lower, so health is clamped until Cooled returns.
    const u = await boot();
    const base = u.ctx.actors.player.maxHealth;
    u.ctx.actors.player.health = base;
    u.ctx.persist.get('shrine.cooled')!.load(saved, 1);
    u.emitted.length = 0;
    u.ctx.events.emit('save.loaded', {} as never);
    expect(u.ctx.actors.player.maxHealth).toBeCloseTo(base * 1.1, 3);
    expect(u.ctx.actors.player.health).toBeCloseTo(cooledMax, 3);
    expect(u.emitted.some((e) => e.type === 'buff.applied')).toBe(true);
  });

  it('a load with quenchstone and hushed-anvil lit sets W = 2 and tells the enemies', async () => {
    const t = await boot();
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.ctx.state.setFlag('shrine.hushed-anvil.lit', true);
    t.warmthCalls.length = 0;
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.ctx.services.require('warmth').tier()).toBe(2);
    expect(t.warmthCalls.at(-1)).toBe(2);
  });

  it('a load with the tier unchanged still overwrites the spawners', async () => {
    const t = await boot();
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.warmthCalls.length = 0;
    t.ctx.events.emit('save.loaded', {} as never);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.warmthCalls).toEqual([1, 1]);
  });

  it('the basin heals and clears Burn when lit, and does nothing when unlit', async () => {
    const t = await boot();
    const a = t.ctx.actors.player;
    t.ctx.services.require('spells').addBurn(40, 'test');
    a.health = a.maxHealth / 2;
    t.run(60);
    expect(t.ctx.services.require('spells').burn).toBeLessThan(40);
    expect(a.health).toBeLessThanOrEqual(a.maxHealth / 2 + 1e-6);
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.run(60);
    expect(t.ctx.services.require('spells').burn).toBe(0);
    expect(a.health).toBeGreaterThan(a.maxHealth / 2);
  });

  it('the basin never clears Scars', async () => {
    const t = await boot();
    t.ctx.persist.get('burn')!.load({ burn: 50, scars: 4 }, 1);
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.run(120);
    expect(t.ctx.services.require('spells').scars).toBe(4);
    expect(t.ctx.services.require('spells').burn).toBe(0);
  });

  it('the basin is idle while a hostile has noticed the player', async () => {
    const t = await boot();
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.ctx.services.require('spells').addBurn(40, 'test');
    t.ctx.events.emit('ai.aggro', { actorId: 'wolf', targetId: 'player' } as never);
    t.run(60);
    expect(t.ctx.services.require('spells').burn).toBeGreaterThan(30);
  });

  it('builds the basin and wardstone meshes from the anchors', async () => {
    const t = await boot();
    t.run(2);
    const names: string[] = [];
    t.ctx.scene.traverse((o) => names.push(o.name));
    expect(names).toContain('quenchstone-basin');
    for (let n = 1; n <= 5; n++) expect(names).toContain(`wardstone-${n}`);
  });

  it('opens thread 8\'s respecModal at a lit shrine and releases the permit on cancel', async () => {
    let held = 0;
    let released = 0;
    let opts: any = null;
    const t = await boot({
      stub: (g) => {
        g.ctx.services.provide('respecModal' as never, { open: (o: unknown) => ((opts = o), true) } as never);
      },
    });
    const prog = t.ctx.services.require('progression') as any;
    prog.allowRespec = () => (held++, () => void released++);
    prog.respecQuote = () => ({ free: true, gold: 0, canAfford: true });
    prog.respec = () => ({ ok: true });
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.run(2);
    const lectern = (t.ctx.interaction as any).items.get('use:quenchstone-respec');
    expect(lectern).toBeDefined();
    expect(lectern.enabled()).toBe(true);
    lectern.onInteract(t.ctx.actors.player);
    expect(opts.quote.free).toBe(true);
    opts.cancel();
    expect({ held, released }).toEqual({ held: 1, released: 1 });
  });

  it('animates the steam on render once lit', async () => {
    const t = await boot();
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    t.run(2);
    const steam = (() => {
      let found: THREE.Points | null = null;
      t.ctx.scene.traverse((o) => {
        if ((o as THREE.Points).isPoints) found = o as THREE.Points;
      });
      return found as THREE.Points | null;
    })();
    expect(steam).not.toBeNull();
    const before = Array.from((steam!.geometry.getAttribute('position') as THREE.BufferAttribute).array.slice(0, 6));
    t.game.render(0, 0.5);
    const after = Array.from((steam!.geometry.getAttribute('position') as THREE.BufferAttribute).array.slice(0, 6));
    expect(after).not.toEqual(before);
  });

  it('disposing leaves no mesh and no Cooled modifier behind', async () => {
    const t = await boot();
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    const a = t.ctx.actors.player;
    const max = a.maxHealth;
    t.run(2);
    t.game.dispose();
    const names: string[] = [];
    t.ctx.scene.traverse((o) => names.push(o.name));
    expect(names).not.toContain('quenchstone-basin');
    expect(a.maxHealth).toBeLessThanOrEqual(max);
  });

  it('a waystone lit without the shrine flag lights the shrine on the next tick', async () => {
    const t = await boot();
    t.ctx.services.require('waystones').rekindle('quenchstone', 'script');
    t.ctx.state.setFlag('shrine.quenchstone.lit', false);
    t.run(1);
    expect(t.ctx.state.getBool('shrine.quenchstone.lit')).toBe(true);
    expect(t.ctx.services.require('warmth').tier()).toBe(1);
  });

  it('loading a save without a Cooled entry drops a running buff', async () => {
    const t = await boot();
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.ctx.services.require('shrine').cooledSeconds()).toBe(0);
  });

  describe('wardstone input', () => {
    async function rhythm(opts: { prompts?: string[] } = {}) {
      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
      const t = await boot({
        stub: (g) => {
          if (opts.prompts)
            g.ctx.services.provide('prompts' as never, {
              show: (m: string, a: string, k: string) => opts.prompts!.push(`show:${m}:${a}:${k}`),
              hide: (m: string) => opts.prompts!.push(`hide:${m}`),
            } as never);
        },
      });
      let pressed = false;
      Object.defineProperty(t.ctx.input, 'actions', {
        get: () => ({ down: () => false, pressed: (a: string) => pressed && a === 'attack1', released: () => false, heldTicks: () => 0, axis: () => 0 }),
      });
      const beat = 60000 / 92;
      const press = (atMs: number) => {
        nowSpy.mockReturnValue(atMs);
        pressed = true;
        t.run(1);
        pressed = false;
      };
      return { t, press, beat, nowSpy };
    }
    const of = (t: Awaited<ReturnType<typeof boot>>, type: string) => t.emitted.filter((e) => e.type === type);

    it('is ignored until Tobb has joined', async () => {
      const r = await rhythm();
      for (let k = 1; k <= 3; k++) r.press(1000 + r.beat * k);
      expect(of(r.t, 'wardstone.struck')).toEqual([]);
      expect(of(r.t, 'wardstone.missed')).toEqual([]);
      expect(r.t.ctx.state.getBool('world.deadroad.wardstone.1')).toBe(false);
    });

    it('three strikes on three beats light the first stone once Tobb has joined', async () => {
      const r = await rhythm();
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      for (let k = 1; k <= 3; k++) r.press(1000 + r.beat * k);
      expect(of(r.t, 'wardstone.struck')).toHaveLength(1);
      expect(of(r.t, 'wardstone.struck')[0].payload).toMatchObject({ index: 1 });
      expect(r.t.ctx.state.getBool('world.deadroad.wardstone.1')).toBe(true);
      expect(r.t.ctx.services.require('shrine').nextWardstone()).toBe(2);
    });

    it('an off-beat strike is a miss', async () => {
      const r = await rhythm();
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      r.press(1000 + r.beat * 2 + r.beat / 2 - 1);
      expect(of(r.t, 'wardstone.missed')).toHaveLength(1);
    });

    it('a press exactly 120 ms late is a hit', async () => {
      const r = await rhythm();
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      r.press(1000 + r.beat + 120);
      expect(of(r.t, 'wardstone.missed')).toEqual([]);
    });

    it('a menu in the middle of a phrase does not produce a miss afterwards', async () => {
      const r = await rhythm();
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      r.press(1000 + r.beat);
      const release = r.t.ctx.input.contexts.push('dialogue', 'test');
      r.press(1000 + r.beat * 6);
      release();
      r.press(1000 + r.beat * 9);
      expect(of(r.t, 'wardstone.missed')).toEqual([]);
    });

    it('shows the strike prompt near the next stone once Tobb has joined, and hides it when leaving', async () => {
      const calls: string[] = [];
      const r = await rhythm({ prompts: calls });
      r.t.run(1);
      expect(calls).toEqual([]); // not before Tobb joins
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      r.t.run(2);
      expect(calls).toEqual(['show:wardstone-strike:attack1:prompt.wardstone-strike']);
      r.t.ctx.state.setFlag('story.m05.tobbJoined', false);
      r.t.run(1);
      expect(calls.at(-1)).toBe('hide:wardstone-strike');
    });

    it('does nothing in a menu context', async () => {
      const r = await rhythm();
      r.t.ctx.state.setFlag('story.m05.tobbJoined', true);
      const release = r.t.ctx.input.contexts.push('menu', 'test');
      r.press(1000 + r.beat);
      release();
      expect(of(r.t, 'wardstone.missed')).toEqual([]);
      r.nowSpy.mockRestore();
    });
  });
});
