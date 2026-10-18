import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import navPlugin from '../nav/nav.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { groundDistance } from '../waystones/ground';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { HARROWMARK_SITES } from './harrowmark/sites';
import { TILTED_ANVIL_BACKROOM_GATE } from './harrowmark/tiltedAnvil';
import { InteriorError } from './InteriorController';
import interiorsPlugin from './interiors.plugin';
import { UNDERWAYS_ARENA_GATE } from './underways/generate';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
};

/** Thread 17's outside door anchors (`DOORS` in its harrowmark.layout.ts): x, z and compass heading (yaw = heading + 180). */
const OUTSIDE: Record<string, { x: number; z: number; heading: number }> = {
  'harrowmark.tilted-anvil.door': { ...HARROWMARK_SITES['tilted-anvil'], heading: 180 },
  'harrowmark.tilted-anvil-back.door': { x: 8200, z: 1683.5, heading: 0 },
  'harrowmark.keep-hall.door': { ...HARROWMARK_SITES['keep-hall'], heading: 180 },
  'harrowmark.counting-house.door': { ...HARROWMARK_SITES['counting-house'], heading: 270 },
  'harrowmark.archive.door': { ...HARROWMARK_SITES.archive, heading: 270 },
  'harrowmark.underways.door': { ...HARROWMARK_SITES.underways, heading: 90 },
};
const OPEN_ALL = ['world.harrowmark.inn.room', 'story.m08.keepOpen', 'story.m09.houseOpen', 'story.d02.underwaysOpen'];

let physics: PhysicsWorld;
const worlds: World[] = [];
const games: Game[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  for (const g of games.splice(0)) g.dispose();
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot() {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9db8d3, 720, 4560);
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
  games.push(game);
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  game.ctx.anchors.define({ id: 'waystone.chapel', position: { x: 40, y: heightAt(40, 45), z: 45 }, yaw: 0, tags: ['waystone', 'waystone-lit'] });
  const statuses = await game.loadPlugins(modules);
  const events: { type: string; payload: { interiorId: string; doorId: string } }[] = [];
  for (const type of ['interior.entered', 'interior.exited'] as const) game.ctx.events.on(type, (p) => events.push({ type, payload: p }));
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  // Thread 17 defines its door anchors after this plugin.
  for (const [id, a] of Object.entries(OUTSIDE)) {
    game.ctx.anchors.define({ id, position: { x: a.x, y: heightAt(a.x, a.z), z: a.z }, yaw: ((a.heading + 180) * Math.PI) / 180 });
  }
  const svc = () => game.ctx.services.get('interiors')!;
  const anchor = (id: string) => game.ctx.anchors.get(id);
  return { game, scene, statuses, run, events, svc, anchor };
}

type Booted = Awaited<ReturnType<typeof boot>>;

async function settle<T>(t: Booted, p: Promise<T>): Promise<T> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 600 && !done; i++) await t.run(1);
  return p;
}

async function reason(t: Booted, p: Promise<unknown>): Promise<string> {
  try {
    await settle(t, p);
    return 'resolved';
  } catch (e) {
    return e instanceof InteriorError ? e.reason : String(e);
  }
}

const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the Harrowmark interiors on the real game', () => {
  it('sets up every interior with its grid, its door interactables and nothing failing', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    await t.run(2);
    const nav = t.game.ctx.services.get('nav')!;
    for (const id of ['harrowmark.tilted-anvil.entry', 'harrowmark.keep-hall.entry', 'harrowmark.counting-house.entry', 'harrowmark.archive.entry', 'harrowmark.underways.entry']) {
      expect(nav.hasGrid(t.anchor(id).position), id).toBe(true);
    }
    // Standing at each outside door shows its own interactable.
    for (const door of ['tilted-anvil', 'keep-hall', 'counting-house', 'archive', 'underways']) {
      const a = t.anchor(`harrowmark.${door}.door`);
      t.game.ctx.player.teleport({ ...a.position, y: a.position.y + 0.05 });
      await t.run(3);
      expect(t.game.ctx.interaction.focusFor('interact')?.id, door).toBe(`door:${door}`);
    }
  });

  it.each([
    ['tilted-anvil', 'tilted-anvil', 'harrowmark.tilted-anvil.door'],
    ['tilted-anvil', 'tilted-anvil-back', 'harrowmark.tilted-anvil-back.door'],
    ['keep-hall', 'keep-hall', 'harrowmark.keep-hall.door'],
    ['counting-house', 'counting-house', 'harrowmark.counting-house.door'],
    ['archive', 'archive', 'harrowmark.archive.door'],
    ['underways', 'underways', 'harrowmark.underways.door'],
  ])('enters %s by %s onto a real floor and exits back out by the same door', async (interior, door, outside) => {
    const t = await boot();
    for (const f of OPEN_ALL) t.game.ctx.state.setFlag(f, true);
    await t.run(2);
    await settle(t, t.svc().enter(interior, door));
    expect(t.svc().current).toBe(interior);
    const entry = t.anchor(`harrowmark.${door}.entry`).position;
    expect(near(t.game.ctx.player.feet, entry)).toBeLessThan(0.5);
    await t.run(60);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(entry.y - 0.2);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    await settle(t, t.svc().exit());
    expect(t.svc().current).toBeNull();
    expect(near(t.game.ctx.player.feet, t.anchor(outside).position)).toBeCloseTo(1.6, 0);
    expect(t.events.map((e) => [e.type, e.payload.doorId])).toEqual([
      ['interior.entered', door],
      ['interior.exited', door],
    ]);
  });

  it('enters by the back door and leaves by the front one through its exit', async () => {
    const t = await boot();
    t.game.ctx.state.setFlag('world.harrowmark.inn.room', true);
    await t.run(2);
    await settle(t, t.svc().enter('tilted-anvil', 'tilted-anvil-back'));
    await settle(t, t.svc().exit('tilted-anvil'));
    expect(near(t.game.ctx.player.feet, t.anchor('harrowmark.tilted-anvil.door').position)).toBeCloseTo(1.6, 0);
  });

  it('keeps each locked door shut until its flag is set, and never locks an exit', async () => {
    const t = await boot();
    await t.run(2);
    for (const [interior, door, flag] of [
      ['tilted-anvil', 'tilted-anvil-back', 'world.harrowmark.inn.room'],
      ['keep-hall', 'keep-hall', 'story.m08.keepOpen'],
      ['counting-house', 'counting-house', 'story.m09.houseOpen'],
      ['underways', 'underways', 'story.d02.underwaysOpen'],
    ] as const) {
      expect(await reason(t, t.svc().enter(interior, door)), door).toBe('locked');
      expect(t.svc().current).toBeNull();
      t.game.ctx.state.setFlag(flag, true);
      expect(await reason(t, t.svc().enter(interior, door)), door).toBe('resolved');
      // Clearing the flag while inside never traps the player.
      t.game.ctx.state.setFlag(flag, false);
      expect(await reason(t, t.svc().exit()), door).toBe('resolved');
    }
    // The front of the inn and the Archive are always open.
    expect(await reason(t, t.svc().enter('tilted-anvil', 'tilted-anvil'))).toBe('resolved');
    await settle(t, t.svc().exit());
    expect(await reason(t, t.svc().enter('archive', 'archive'))).toBe('resolved');
  });

  it('re-derives a lock from the flags after a load (no flag.changed)', async () => {
    const t = await boot();
    await t.run(2);
    expect(await reason(t, t.svc().enter('keep-hall', 'keep-hall'))).toBe('locked');
    t.game.ctx.state.load({ flags: { 'story.m08.keepOpen': true } });
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await t.run(1);
    expect(await reason(t, t.svc().enter('keep-hall', 'keep-hall'))).toBe('resolved');
  });

  it('closes the back-room corridor at start and opens it with the room', async () => {
    const t = await boot();
    await t.run(2);
    const nav = t.game.ctx.services.get('nav')!;
    const from = t.anchor('harrowmark.tilted-anvil.entry').position;
    const bed = t.anchor('inn.room').position;
    const end = () => nav.path(from, bed)!.at(-1)!;
    expect(near(end(), bed)).toBeGreaterThan(1);
    t.game.ctx.state.setFlag('world.harrowmark.inn.room', true);
    await t.run(1);
    expect(near(end(), bed)).toBeLessThan(0.6);
    // The collider opened with it: a ray along the corridor no longer hits the gate.
    expect(t.svc().setBlocker(TILTED_ANVIL_BACKROOM_GATE, true)).toBe(true);
    expect(t.svc().setBlocker(UNDERWAYS_ARENA_GATE, false)).toBe(true);
  });

  it('offers the M09 invoices until each is taken', async () => {
    const t = await boot();
    await t.run(2);
    const desk = t.anchor('m09.invoice-1').position;
    t.game.ctx.state.setFlag('story.m09.houseOpen', true);
    await settle(t, t.svc().enter('counting-house', 'counting-house'));
    t.game.ctx.player.teleport({ ...desk, y: desk.y + 0.05 });
    await t.run(5);
    const focus = () => t.game.ctx.interaction.focusFor('interact')?.id;
    expect(focus()).toMatch(/^use:m09-invoice-\d$/);
    for (const n of [1, 2, 3]) t.game.ctx.state.setFlag(`story.m09.invoice.${n}`, true);
    await t.run(2);
    expect(focus() ?? '').not.toMatch(/^use:m09-invoice/);
  });

  it('hides an actor posted in the Keep hall while the player is outdoors, and shows it inside', async () => {
    const t = await boot();
    t.game.ctx.state.setFlag('story.m08.keepOpen', true);
    await t.run(2);
    const root = new THREE.Group();
    const post = t.anchor('npc-post.edric.hall').position;
    root.position.set(post.x, post.y, post.z);
    t.scene.add(root);
    t.game.ctx.actors.spawn({ kind: 'npc', team: 'neutral', maxHealth: 1, hittable: false, root });
    const frame = () => t.game.render(1, 1 / 60);
    frame();
    expect(root.visible).toBe(false);
    // Another writer setting it visible every frame (the companion) loses to the hider, which renders later.
    root.visible = true;
    frame();
    expect(root.visible).toBe(false);
    await settle(t, t.svc().enter('keep-hall', 'keep-hall'));
    frame();
    expect(root.visible).toBe(true);
  });

  it('moves a load whose saved spot is no longer floor to the entry', async () => {
    const a = await boot();
    t_open(a);
    await a.run(2);
    await settle(a, a.svc().enter('underways', 'underways'));
    const entries = a.game.ctx.persist.saveAll();

    const b = await boot();
    for (const e of entries) b.game.ctx.persist.get(e.key)?.load(e.data, e.version);
    // A stale spot inside the Underways' bounds but in solid rock (the layout changed since the save).
    const entry = b.anchor('harrowmark.underways.entry').position;
    const stale = { x: entry.x - 2.8, y: entry.y + 0.05, z: entry.z + 10 };
    b.game.ctx.player.teleport(stale);
    await b.run(3);
    b.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await b.run(30);
    expect(near(b.game.ctx.player.feet, entry)).toBeLessThan(0.5);
    expect(b.svc().current).toBe('underways');
    // The fade order is pinned in InteriorController.test.ts; here the doors work again once it has lifted.
    expect(b.svc().transitioning).toBe(false);
    expect(b.events.map((e) => e.type)).toEqual(['interior.entered']);
  });
});

function t_open(t: Booted): void {
  for (const f of OPEN_ALL) t.game.ctx.state.setFlag(f, true);
}
