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
import interiorsPlugin from './interiors.plugin';
import { VAULT_GATE, VAULT_ID } from './vaultDef';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/nav.plugin.ts': { default: navPlugin },
  '/src/test/interiors.plugin.ts': { default: interiorsPlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
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
  const y = (x: number, z: number) => heightAt(x, z);
  game.ctx.anchors.define({ id: 'brightwater.player-spawn', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
  game.ctx.anchors.define({ id: 'waystone.chapel', position: { x: 40, y: y(40, 45), z: 45 }, yaw: 0, tags: ['waystone', 'waystone-lit'] });
  const statuses = await game.loadPlugins(modules);
  const events: { type: string; payload: unknown }[] = [];
  for (const type of ['interior.entered', 'interior.exited'] as const) game.ctx.events.on(type, (p) => events.push({ type, payload: p }));
  const run = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.fixedUpdate();
      if (i % 30 === 0) await Promise.resolve();
    }
  };
  // Thread 4 defines the chapel side after this plugin (the door must still appear).
  game.ctx.anchors.define({ id: 'vault.door', position: { x: 57, y: y(57, 66), z: 66 }, yaw: Math.PI });
  return { game, scene, statuses, run, events, interiors: () => game.ctx.services.get('interiors')!, nav: () => game.ctx.services.get('nav')! };
}

async function settle<T>(t: Awaited<ReturnType<typeof boot>>, p: Promise<T>): Promise<T> {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 400 && !done; i++) await t.run(1);
  return p;
}

describe('interiors on the real game', () => {
  it('sets up with the vault anchors, trigger, door interactables and nav grid', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const entry = t.game.ctx.anchors.get('vault.entry');
    expect(entry.position.y).toBeGreaterThan(140);
    expect(t.nav().hasGrid(entry.position)).toBe(true);
    expect(t.nav().floorAt(entry.position)).toBeCloseTo(entry.position.y);
    expect(t.nav().hasGrid({ ...entry.position, y: 0 })).toBe(false);
    await t.run(2);
    // The outside door registered late, once thread 4's anchor existed.
    t.game.ctx.player.teleport({ x: 57, y: heightAt(57, 66) + 0.05, z: 64.5 });
    await t.run(3);
    expect(t.game.ctx.interaction.focusFor('interact')?.id).toBe('door:vault');
    const root = t.scene.getObjectByName(`interior-${VAULT_ID}`)!;
    expect(root.visible).toBe(false);
  });

  it('enters the vault onto a real floor, shows it, and exits back to the chapel', async () => {
    const t = await boot();
    t.game.ctx.player.teleport({ x: 57, y: heightAt(57, 66) + 0.05, z: 64.5 });
    await t.run(3);
    await settle(t, t.interiors().enter(VAULT_ID, 'vault'));
    expect(t.interiors().current).toBe(VAULT_ID);
    const entry = t.game.ctx.anchors.get('vault.entry').position;
    const feet = t.game.ctx.player.feet;
    expect(Math.hypot(feet.x - entry.x, feet.z - entry.z)).toBeLessThan(0.5);
    expect(groundDistance(t.game.ctx, 0.5)).not.toBeNull();
    expect(t.scene.getObjectByName(`interior-${VAULT_ID}`)!.visible).toBe(true);
    expect(t.scene.getObjectByName('interior-light')).toBeTruthy();
    // Gravity runs for two seconds: the floor holds.
    await t.run(120);
    expect(t.game.ctx.player.feet.y).toBeGreaterThan(entry.y - 0.2);
    expect(t.game.ctx.player.feet.y).toBeLessThan(entry.y + 0.5);

    await settle(t, t.interiors().exit());
    expect(t.interiors().current).toBeNull();
    expect(t.game.ctx.player.feet.y).toBeLessThan(5);
    expect(t.game.ctx.player.feet.z).toBeCloseTo(66 + 1.6, 0); // yaw PI faces +Z
    expect(t.scene.getObjectByName(`interior-${VAULT_ID}`)!.visible).toBe(false);
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered', 'interior.exited']);
  });

  it('closes the arena gate for both the collider and nav', async () => {
    const t = await boot();
    const svc = t.interiors();
    const entry = t.game.ctx.anchors.get('vault.entry').position;
    const centre = t.game.ctx.anchors.get('vault.arena.centre').position;
    expect(svc.setBlocker(VAULT_GATE, true)).toBe(true);
    await t.run(1);
    const path = t.nav().path(entry, centre)!;
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - centre.x, end.z - centre.z)).toBeGreaterThan(5);
    // A ray across the doorway now hits the gate.
    const door = t.game.ctx.anchors.get('vault.arena.door').position;
    const hit = t.game.ctx.physics.raycast({ x: door.x, y: door.y + 1, z: door.z }, { x: 0, y: 0, z: -1 }, 4);
    expect(hit).not.toBeNull();
    expect(svc.setBlocker(VAULT_GATE, false)).toBe(true);
    await t.run(1);
    const open = t.nav().path(entry, centre)!;
    expect(Math.hypot(open.at(-1)!.x - centre.x, open.at(-1)!.z - centre.z)).toBeLessThan(1e-6);
    expect(svc.setBlocker('nope', true)).toBe(false);
  });

  it('saves inside and loads into a fresh game inside the vault, with current set before save.loaded', async () => {
    const a = await boot();
    a.game.ctx.player.teleport({ x: 57, y: heightAt(57, 66) + 0.05, z: 64.5 });
    await a.run(3);
    await settle(a, a.interiors().enter(VAULT_ID, 'vault'));
    const entries = a.game.ctx.persist.saveAll();
    const saved = { ...a.game.ctx.player.feet };
    expect(entries.find((e) => e.key === 'interior')?.data).toEqual({ interiorId: VAULT_ID, doorId: 'vault' });

    const b = await boot();
    let currentAtLoad: string | null | undefined;
    b.game.ctx.events.on('save.loaded', () => (currentAtLoad = b.interiors().current));
    // The save loader's order: every persistable loads, the player is placed at black, then save.loaded.
    for (const e of entries) b.game.ctx.persist.get(e.key)?.load(e.data, e.version);
    const handle = b.game.ctx.player.teleport(saved);
    for (let i = 0; i < 60 && !handle.ready(); i++) await b.run(1);
    await b.run(1);
    expect(groundDistance(b.game.ctx, 0.5)).not.toBeNull();
    b.game.ctx.events.emit('save.loaded', { slot: 'test' });
    await b.run(5);
    expect(currentAtLoad).toBe(VAULT_ID);
    expect(b.interiors().current).toBe(VAULT_ID);
    expect(b.scene.getObjectByName(`interior-${VAULT_ID}`)!.visible).toBe(true);
    expect(b.events.map((e) => e.type)).toEqual(['interior.entered']);
  });

  it('a death respawn from inside takes the player out with one exited event', async () => {
    const t = await boot();
    t.game.ctx.player.teleport({ x: 57, y: heightAt(57, 66) + 0.05, z: 64.5 });
    await t.run(3);
    await settle(t, t.interiors().enter(VAULT_ID, 'vault'));
    await settle(t, t.game.ctx.services.get('waystones')!.respawnPlayer());
    await t.run(5);
    expect(t.interiors().current).toBeNull();
    expect(t.scene.getObjectByName(`interior-${VAULT_ID}`)!.visible).toBe(false);
    expect(t.events.map((e) => e.type)).toEqual(['interior.entered', 'interior.exited']);
  });

  it('disposes cleanly: the root leaves the scene and the outdoors returns', async () => {
    const t = await boot();
    t.game.ctx.player.teleport({ x: 57, y: heightAt(57, 66) + 0.05, z: 64.5 });
    await t.run(3);
    await settle(t, t.interiors().enter(VAULT_ID, 'vault'));
    t.game.dispose();
    expect(t.scene.getObjectByName(`interior-${VAULT_ID}`)).toBeUndefined();
    expect((t.scene.fog as THREE.Fog).far).toBeCloseTo(4560);
  });
});
