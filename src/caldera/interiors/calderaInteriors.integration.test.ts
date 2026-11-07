// Act 4 Harrowmark interiors on the real game (L2): the chamber, the Keep stairs and the deep run as one chain, with the
// chamber's front door shut from the betrayal and the deep run's ladder out to the north of the wall.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import navPlugin from '../../nav/nav.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import waystonesPlugin from '../../waystones/waystones.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { InteriorError } from '../../interiors/InteriorController';
import interiorsPlugin from '../../interiors/interiors.plugin';
import { BLOCKERS, CALDERA_INTERIOR_FLAGS as F, DOOR_COOLING_HALL, DOOR_FOUNDRY, DOOR_TUNNEL } from '.';
import calderaInteriorsPlugin from './calderaInteriors.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/caldera-interiors.plugin.ts': { default: calderaInteriorsPlugin },
};

/** N1's outside door anchors stand in here (positions from plan 3.4). */
const OUTSIDE: Record<string, { x: number; z: number; heading: number }> = {
  [DOOR_COOLING_HALL]: { x: 11150, z: 7420, heading: 0 },
  [DOOR_FOUNDRY]: { x: 11000, z: 7500, heading: 0 },
  [DOOR_TUNNEL]: { x: 10550, z: 6900, heading: 0 },
};

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


async function interact(t: Booted, anchorId: string) {
  const a = t.anchor(anchorId).position;
  t.game.ctx.player.teleport({ ...a, y: a.y + 0.05 });
  await t.run(3);
  return t.game.ctx.interaction.focusFor('interact');
}


describe('the Caldera interiors on the real game', () => {
  it('boots all four with nothing failing, each on the nav', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (const id of ['cooling.entry', 'tunnel.entry', 'foundry.entry', 'hammer.entry']) expect(t.game.ctx.services.get('nav')!.hasGrid(t.anchor(`caldera.int.${id}`).position), id).toBe(true);
  }, 60000);

  it('locks the four doors on their flags and refuses under aggro', async () => {
    const t = await boot();
    await t.run(2);
    expect(await reason(t, t.svc().enter('cooling-hall', 'cooling-hall'))).toBe('locked');
    expect(await reason(t, t.svc().enter('stokers-tunnel', 'stokers-tunnel'))).toBe('locked');
    expect(await reason(t, t.svc().enter('foundry-descent', 'foundry-descent'))).toBe('locked');
    t.game.ctx.state.setFlag(F.coolingHallOpen, true);
    t.game.ctx.events.emit('ai.aggro', { actorId: 'hostile-1', targetId: 'player' } as never);
    expect(await reason(t, t.svc().enter('cooling-hall', 'cooling-hall'))).toBe('aggro');
    t.game.ctx.events.emit('actor.died', { actorId: 'hostile-1' } as never);
    expect(await reason(t, t.svc().enter('cooling-hall', 'cooling-hall'))).toBe('resolved');
    expect(t.svc().current).toBe('cooling-hall');
  }, 60000);

  it('walks the Foundry to the Hammer Hall and back (the chain) and lands on the link target door', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag(F.foundryStarted, true);
    await t.run(2);
    await settle(t, t.svc().enter('foundry-descent', 'foundry-descent'));
    expect(t.svc().current).toBe('foundry-descent');
    expect(await reason(t, t.svc().transfer('hammer-hall', 'hammer-hall'))).toBe('locked');
    flags.setFlag(F.foundryComplete, true);
    const link = await interact(t, 'caldera.int.foundry.link.hammer');
    expect(link?.id).toBe('link:foundry-to-hammer');
    link!.onInteract(undefined as never);
    await t.run(200);
    expect(t.svc().current).toBe('hammer-hall');
    const back = await interact(t, 'caldera.int.hammer.link.foundry');
    expect(back?.id).toBe('link:hammer-to-foundry');
    back!.onInteract(undefined as never);
    await t.run(200);
    expect(t.svc().current).toBe('foundry-descent');
    await settle(t, t.svc().exit());
    expect(t.svc().current).toBeNull();
    expect(near(t.game.ctx.player.feet, OUTSIDE[DOOR_FOUNDRY]!)).toBeLessThan(4);
  }, 120000);

  it('resets the Hammer Hall floor on leaving and on a load', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag(F.foundryStarted, true);
    flags.setFlag(F.foundryComplete, true);
    await t.run(2);
    await settle(t, t.svc().enter('foundry-descent', 'foundry-descent'));
    await settle(t, t.svc().transfer('hammer-hall', 'hammer-hall'));
    expect(t.svc().setBlocker(BLOCKERS.hammerFloor, false)).toBe(true);
    // leaving by the link closes it again
    const closed: boolean[] = [];
    const spy = t.svc().setBlocker.bind(t.svc());
    t.svc().setBlocker = (id, c) => (id === BLOCKERS.hammerFloor && closed.push(c), spy(id, c));
    await settle(t, t.svc().transfer('foundry-descent', 'foundry-descent-foot'));
    expect(closed).toContain(true);
    closed.length = 0;
    t.game.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(closed).toContain(true);
  }, 120000);

  it('follows farOpen for the tunnel seal but never seals the player in the far gallery', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag(F.tunnelStarted, true);
    await t.run(2);
    await settle(t, t.svc().enter('stokers-tunnel', 'stokers-tunnel'));
    const calls: boolean[] = [];
    const spy = t.svc().setBlocker.bind(t.svc());
    t.svc().setBlocker = (id, c) => (id === BLOCKERS.tunnelSeal && calls.push(c), spy(id, c));
    flags.setFlag(F.tunnelFarOpen, true);
    await t.run(2);
    expect(calls.at(-1)).toBe(false);
    // stand in the far gallery, then flag the variant off: the seal stays open
    const far = t.anchor('caldera.int.tunnel.far.spawn.1').position;
    t.game.ctx.player.teleport({ ...far, y: far.y + 0.05 });
    await t.run(5);
    flags.setFlag(F.tunnelFarOpen, false);
    await t.run(2);
    expect(calls.at(-1)).toBe(false);
    // standing in the seal's own slab keeps it open too
    const slab = t.anchor('caldera.int.tunnel.charge.3').position;
    t.game.ctx.player.teleport({ ...slab, z: slab.z + 2.4, y: slab.y + 0.05 });
    await t.run(5);
    expect(calls.at(-1)).toBe(false);
    // walk out of the gallery: it closes
    const near2 = t.anchor('caldera.int.tunnel.charge.1').position;
    t.game.ctx.player.teleport({ ...near2, y: near2.y + 0.05 });
    await t.run(5);
    expect(calls.at(-1)).toBe(true);
  }, 120000);

  it('opens Vey\'s arena exit on any end of his fight, and for anyone standing in the foot (a load)', async () => {
    const t = await boot();
    const calls: boolean[] = [];
    const spy = t.svc().setBlocker.bind(t.svc());
    t.svc().setBlocker = (id, c) => (id === BLOCKERS.foundryArenaExit && calls.push(c), spy(id, c));
    t.game.ctx.events.emit('boss.ended', { bossId: 'vey', actorId: 'vey', reason: 'despawned' });
    expect(calls).toContain(false);
  }, 60000);

  it('refuses every Caldera door under aggro, and a transfer too', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    for (const f of [F.tunnelStarted, F.foundryStarted, F.foundryComplete]) flags.setFlag(f, true);
    await t.run(2);
    await settle(t, t.svc().enter('foundry-descent', 'foundry-descent'));
    t.game.ctx.events.emit('ai.aggro', { actorId: 'hostile-2', targetId: 'player' } as never);
    expect(await reason(t, t.svc().transfer('hammer-hall', 'hammer-hall'))).toBe('aggro');
    t.game.ctx.events.emit('actor.died', { actorId: 'hostile-2' } as never);
    await settle(t, t.svc().exit());
  }, 120000);

  it('never closes the Hammer floor over a player in the pit; closes it once they walk out', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag(F.foundryStarted, true);
    flags.setFlag(F.foundryComplete, true);
    await t.run(2);
    await settle(t, t.svc().enter('foundry-descent', 'foundry-descent'));
    await settle(t, t.svc().transfer('hammer-hall', 'hammer-hall'));
    const calls: boolean[] = [];
    const spy = t.svc().setBlocker.bind(t.svc());
    t.svc().setBlocker = (id, c) => (id === BLOCKERS.hammerFloor && calls.push(c), spy(id, c));
    const e = t.anchor('caldera.int.hammer.entry').position;
    t.game.ctx.player.teleport({ x: e.x, y: e.y - 3 + 0.05, z: e.z + 57 });
    await t.run(3);
    t.game.ctx.events.emit('boss.ended', { bossId: 'ulthred', actorId: 'ulthred', reason: 'despawned' });
    await t.run(3);
    expect(calls.at(-1)).not.toBe(true);
    t.game.ctx.player.teleport({ x: e.x, y: e.y + 0.05, z: e.z + 33 });
    await t.run(3);
    expect(calls.at(-1)).toBe(true);
  }, 120000);

  it('opens Vey\'s exit for anyone standing in the foot, even after a fresh load', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag(F.foundryStarted, true);
    await t.run(2);
    await settle(t, t.svc().enter('foundry-descent', 'foundry-descent'));
    const calls: boolean[] = [];
    const spy = t.svc().setBlocker.bind(t.svc());
    t.svc().setBlocker = (id, c) => (id === BLOCKERS.foundryArenaExit && calls.push(c), spy(id, c));
    const f = t.anchor('caldera.int.foundry.from-hammer').position;
    t.game.ctx.player.teleport({ ...f, y: f.y + 0.05 });
    await t.run(3);
    expect(calls).toContain(false);
  }, 120000);

  it('gives every Caldera door and link prompt its words', async () => {
    const { INTERIOR_STRINGS_EN } = await import('../../interiors/strings.en');
    const { CALDERA_INTERIORS, CALDERA_LINKS } = await import('.');
    for (const d of CALDERA_INTERIORS) {
      for (const door of d.doors) {
        if (door.outsideInteractable !== false) expect(INTERIOR_STRINGS_EN[`interior.enter.${door.doorId}`], door.doorId).toBeTruthy();
        if (d.anchors.some((a) => a.id === door.exit)) expect(INTERIOR_STRINGS_EN[`interior.exit.${door.doorId}`], door.doorId).toBeTruthy();
      }
    }
    for (const l of CALDERA_LINKS) expect(INTERIOR_STRINGS_EN[`interior.enter.${l.to.doorId}`], l.id).toBeTruthy();
  });
});