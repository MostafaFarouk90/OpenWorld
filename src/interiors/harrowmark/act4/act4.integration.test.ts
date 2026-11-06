// Act 4 Harrowmark interiors on the real game (L2): the chamber, the Keep stairs and the deep run as one chain, with the
// chamber's front door shut from the betrayal and the deep run's ladder out to the north of the wall.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { PluginModule } from '../../../core/plugins';
import { InputManager } from '../../../input/InputManager';
import navPlugin from '../../../nav/nav.plugin';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { heightAt } from '../../../terrain/heightfield';
import waystonesPlugin from '../../../waystones/waystones.plugin';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { InteriorError } from '../../InteriorController';
import interiorsPlugin from '../../interiors.plugin';
import { CHAMBER_DOOR, CRUCIBLE_DOOR, DEEP_RUN_EXIT } from '../../../harrowmark/act4/sites';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
};

/** My outside door anchors (act4.layout.ts in the harrowmark plugin, which this boot leaves out). */
const OUTSIDE: Record<string, { x: number; z: number; heading: number }> = {
  [CHAMBER_DOOR.anchor]: CHAMBER_DOOR,
  [CRUCIBLE_DOOR.anchor]: CRUCIBLE_DOOR,
  [DEEP_RUN_EXIT.anchor]: DEEP_RUN_EXIT,
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

describe('the Act 4 chain on the real game', () => {
  it('boots every Act 4 interior with nothing failing', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (const id of ['harrowmark.a4.chamber.entry', 'harrowmark.a4.stairs.entry', 'harrowmark.a4.crucible.entry', 'harrowmark.a4.deeprun.entry']) {
      expect(t.game.ctx.services.get('nav')!.hasGrid(t.anchor(id).position), id).toBe(true);
    }
  });

  it('from M38 the chamber door refuses with its line, the stairs open, the deep run waits for M39 and its ladder lands outside the wall', async () => {
    const t = await boot();
    const flags = t.game.ctx.state;
    flags.setFlag('story.m38.started', true);
    await t.run(2);
    await settle(t, t.svc().enter('council-chamber', 'council-chamber'));
    expect(t.svc().current).toBe('council-chamber');
    // Before the betrayal the front door lets the player out.
    let exit = await interact(t, 'harrowmark.a4.chamber.exit');
    expect(exit?.id).toBe('door:council-chamber-exit');
    expect(exit?.promptKey).toBe('interior.exit.council-chamber');
    flags.setFlag('story.m38.complete', true);
    exit = await interact(t, 'harrowmark.a4.chamber.exit');
    expect(exit?.promptKey).toBe('interact.locked');
    exit!.onInteract(undefined as never);
    await t.run(30);
    expect(t.svc().current).toBe('council-chamber');
    // Down the stairs (open from the betrayal).
    const down = await interact(t, 'harrowmark.a4.chamber.stairs');
    expect(down?.id).toBe('link:chamber-to-stairs');
    down!.onInteract(undefined as never);
    await t.run(200);
    expect(t.svc().current).toBe('keep-stairs');
    // The deep run is shut until M40 starts (L10 PR 2: Rook's offer, after the stairs are held), not on M39 alone.
    expect(await reason(t, t.svc().transfer('deep-run', 'deep-run'))).toBe('locked');
    flags.setFlag('story.m39.complete', true);
    expect(await reason(t, t.svc().transfer('deep-run', 'deep-run'))).toBe('locked');
    flags.setFlag('story.m40.started', true);
    await settle(t, t.svc().transfer('deep-run', 'deep-run'));
    expect(t.svc().current).toBe('deep-run');
    // The ladder: out by the grate, outside the ring wall.
    const ladder = await interact(t, 'harrowmark.a4.deeprun.ladder');
    expect(ladder?.id).toBe('door:deep-run-exit-exit');
    expect(ladder?.promptKey).toBe('interior.exit.deep-run-exit');
    await settle(t, t.svc().exit('deep-run-exit'));
    expect(t.svc().current).toBeNull();
    const out = t.game.ctx.player.feet;
    expect(near(out, DEEP_RUN_EXIT)).toBeLessThan(4);
    expect(Math.hypot(out.x - 8500, out.z - 2000)).toBeGreaterThan(760);
  });

  it('the grate lets a player back in from the camp side once M40 has started, never before', async () => {
    const t = await boot();
    await t.run(2);
    expect(await reason(t, t.svc().enter('deep-run', 'deep-run-exit'))).toBe('locked');
    t.game.ctx.state.setFlag('story.m40.started', true);
    const grate = await interact(t, DEEP_RUN_EXIT.anchor);
    expect(grate?.promptKey).toBe('interior.enter.deep-run-exit');
    await settle(t, t.svc().enter('deep-run', 'deep-run-exit'));
    expect(t.svc().current).toBe('deep-run');
  });

  it('every Act 4 door and link prompt has its words', async () => {
    const { INTERIOR_STRINGS_EN } = await import('../../strings.en');
    const { ACT4_HARROWMARK_INTERIORS, ACT4_HARROWMARK_LINKS, ACT4_HARROWMARK_EXIT_LOCKS } = await import('.');
    for (const d of ACT4_HARROWMARK_INTERIORS) {
      for (const door of d.doors) {
        if (door.outsideInteractable !== false) expect(INTERIOR_STRINGS_EN[`interior.enter.${door.doorId}`], door.doorId).toBeTruthy();
        if (d.anchors.some((a) => a.id === door.exit)) expect(INTERIOR_STRINGS_EN[`interior.exit.${door.doorId}`], door.doorId).toBeTruthy();
      }
    }
    for (const l of ACT4_HARROWMARK_LINKS) expect(INTERIOR_STRINGS_EN[`interior.enter.${l.to.doorId}`], l.id).toBeTruthy();
    for (const l of Object.values(ACT4_HARROWMARK_EXIT_LOCKS)) expect(INTERIOR_STRINGS_EN[l.toastKey]).toBeTruthy();
  });

  it('every Act 4 door stands on a published world anchor (an interior door anchor or the city layout)', async () => {
    const { ACT4_HARROWMARK_INTERIORS } = await import('.');
    const { HARROWMARK_LAYOUT } = await import('../../../harrowmark/harrowmark.layout');
    const world = new Set(HARROWMARK_LAYOUT.anchors.map((a) => a.id));
    for (const d of ACT4_HARROWMARK_INTERIORS) for (const door of d.doors) expect(world.has(door.outside), `${d.id}/${door.doorId}: ${door.outside}`).toBe(true);
  });
});
