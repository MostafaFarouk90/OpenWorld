import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import companionsPlugin from './companions.plugin';
import { TOBB } from './tobb';
import './types';

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
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const plugins: GamePlugin[] = [corePlugin, companionsPlugin];
  await game.loadPlugins(Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p } as PluginModule])));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  return { game, world, ctx: game.ctx, run };
}

/** Signed distance of `p` along the player's facing: negative is behind. */
function along(ctx: Game['ctx'], p: THREE.Vector3): number {
  const f = ctx.player.feet;
  const yaw = ctx.player.facingYaw;
  return (p.x - f.x) * -Math.sin(yaw) + (p.z - f.z) * -Math.cos(yaw);
}

describe('teleport-behind after a player teleport (a ?act1= jump)', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -2]) {
    it(`lands behind the player's new facing (yaw ${yaw.toFixed(2)})`, async () => {
      const t = await boot();
      t.ctx.state.setFlag(TOBB.joinFlag, true);
      t.run(60);
      const f = t.ctx.player.feet;
      const to = { x: f.x + 120, z: f.z + 40 };
      const h = t.ctx.player.teleport({ x: to.x, y: heightAt(to.x, to.z), z: to.z }, yaw);
      for (let i = 0; i < 600 && !h.ready(); i++) t.run(1);
      t.run(3);
      const root = t.ctx.actors.get(t.ctx.services.require('companions').actorId('tobb')!)!.root!;
      expect(root.visible).toBe(true);
      expect(along(t.ctx, root.position)).toBeLessThan(-1);
      t.game.dispose();
      t.world.dispose();
    });
  }
});

describe('after a real ?act1= jump (chapter harness)', () => {
  // The Phase B jumps stand Cael 2.5 m in front of the giver, turned to face them; Tobb must not stand in between.
  for (const [id, giver] of [['d01', 'aelfreda'], ['m06', 'rook'], ['m09', 'merrin']] as const) {
    it(`${id}: Tobb is behind Cael and the giver ahead`, async () => {
      const { bootChapter } = await import('../integration/chapterHarness');
      (globalThis as { location?: unknown }).location = { search: `?act1=${id}&new` };
      const h = await bootChapter();
      try {
        for (let i = 0; i < 20 && !(globalThis as { __act1?: { finished: boolean } }).__act1?.finished; i++) await h.runAsync(60);
        await h.runAsync(120);
        const tobbId = h.ctx.services.require('companions').actorId('tobb');
        const root = h.ctx.actors.get(tobbId!)!.root!;
        const giverAt = h.ctx.services.get('npcs')!.position(giver)!;
        expect(root.visible).toBe(true);
        expect(along(h.ctx, root.position)).toBeLessThan(-1);
        expect(along(h.ctx, new THREE.Vector3(giverAt.x, giverAt.y, giverAt.z))).toBeGreaterThan(0.5);
      } finally {
        h.dispose();
        delete (globalThis as { location?: unknown }).location;
        delete (globalThis as { __act1?: unknown }).__act1;
      }
    }, 120_000);
  }
});
