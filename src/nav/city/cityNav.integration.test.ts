import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import navPlugin from '../nav.plugin';
import { PathFollower } from '../../enemies/steering/pathFollower';
import { NavAgent } from '../NavAgent';
import cityNavPlugin from './cityNav.plugin';

/** Stands in for thread 17's city: city-nav only needs it to have loaded. */
const cityStub: GamePlugin = { id: 'harrowmark', dependsOn: ['core'], setup() {} };

let physics: PhysicsWorld;
const games: Game[] = [];
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const g of games.splice(0)) g.dispose();
  for (const w of worlds.splice(0)) w.dispose();
  vi.restoreAllMocks();
});

async function boot(withCity = true) {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  worlds.push(world);
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, new EventTarget(), doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  games.push(game);
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  const modules: Record<string, PluginModule> = {
    '/src/test/core.plugin.ts': { default: corePlugin },
    '/src/test/nav.plugin.ts': { default: navPlugin },
    '/src/test/city-nav.plugin.ts': { default: cityNavPlugin },
    ...(withCity ? { '/src/test/harrowmark.plugin.ts': { default: cityStub } } : {}),
  };
  const statuses = await game.loadPlugins(modules);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  const at = (x: number, z: number) => ({ x, y: heightAt(x, z), z });
  const go = (x: number, z: number) => game.ctx.player.teleport({ ...at(x, z), y: heightAt(x, z) + 0.05 }, 0);
  return { game, statuses, run, at, go, nav: game.ctx.services.get('nav')!, city: () => game.ctx.services.get('cityNav')! };
}

describe('city-nav plugin (real Game)', () => {
  it('streams the Forge Row grid in near it and out far away, and paths around the forges', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'city-nav')?.state).toBe('ok');
    const street = t.at(8180, 1520);
    expect(t.nav.hasGrid(street)).toBe(false);
    t.go(8180, 1520);
    t.run(3);
    expect(t.city().active()).toContain('forge-row');
    expect(t.nav.gridId(street)).toBe('city.forge-row');
    // From Forge Row's street to the far side of the south row, which a straight line would cut through forge.a2.
    const path = t.nav.path(street, t.at(8178, 1460))!;
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((w) => !(Math.abs(w.x - 8178) < 15 && Math.abs(w.z - 1480) < 12))).toBe(true);

    t.go(8180, 1520 + 1200);
    t.run(2);
    expect(t.city().active()).not.toContain('forge-row');
    expect(t.nav.hasGrid(street)).toBe(false);
  });

  it('lets a chaser leave the block: the agent walks to the edge, then straight at a goal outside', async () => {
    const t = await boot();
    t.go(8180, 1520);
    t.run(3);
    const agent = new NavAgent(() => t.nav);
    const goal = t.at(8180, 1650); // north of the grid (it ends at z 1590)
    let self = t.at(8180, 1520);
    let steer = agent.desired(self, goal, 0.016)!;
    for (let i = 0; i < 400 && (steer.x !== goal.x || steer.z !== goal.z); i++) {
      const dx = steer.x - self.x;
      const dz = steer.z - self.z;
      const d = Math.hypot(dx, dz) || 1;
      self = { x: self.x + (dx / d) * 0.5, y: self.y, z: self.z + (dz / d) * 0.5 };
      steer = agent.desired(self, goal, 0.016)!;
    }
    expect(steer).toEqual({ x: goal.x, z: goal.z });
    expect(self.z).toBeGreaterThan(1580);
  });

  // The followers other threads wrote (thread 5's PathFollower, Tobb's steer) take a path's last point as the end: the
  // open-edged grid makes that point the goal itself, so none of them parks on the block edge.
  it('walks thread 5\'s PathFollower off the block to a goal in no grid', async () => {
    const t = await boot();
    t.go(8180, 1520);
    t.run(3);
    const follower = new PathFollower(() => t.nav, () => {});
    const goal = t.at(8180, 1650);
    let self = t.at(8180, 1520);
    for (let i = 0; i < 600 && Math.hypot(goal.x - self.x, goal.z - self.z) > 0.6; i++) {
      const w = follower.goalFor(1 / 60, self, goal) ?? goal; // null = no grid here: steer straight, as Enemy does
      const dx = w.x - self.x;
      const dz = w.z - self.z;
      const d = Math.hypot(dx, dz) || 1;
      self = { x: self.x + (dx / d) * Math.min(0.5, d), y: self.y, z: self.z + (dz / d) * Math.min(0.5, d) };
    }
    expect(Math.hypot(goal.x - self.x, goal.z - self.z)).toBeLessThanOrEqual(0.6);
  });

  it('ends a street path at the goal, so a follower that stops at the last point (Tobb) reaches it', async () => {
    const t = await boot();
    t.go(8180, 1520);
    t.run(3);
    const goal = t.at(8180, 1650);
    const path = t.nav.path(t.at(8180, 1520), goal)!;
    expect(path.at(-1)).toMatchObject({ x: goal.x, z: goal.z });
  });

  it('does not load without the city', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await boot(false);
    expect(t.statuses.find((s) => s.id === 'city-nav')?.state).not.toBe('ok');
    t.go(8180, 1520);
    t.run(3);
    expect(t.nav.hasGrid(t.at(8180, 1520))).toBe(false);
    warn.mockRestore();
  });
});
