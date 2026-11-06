// Act 4 L7: the items-act4 plugin on a reduced manifest: the Oathblade follows the class, the carried form's poise bonus
// goes through the real damage service, and Dunstan's refuge forge opens from M41.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../../actors/classes';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { REFUGE_ANVIL } from '../../economy/refugePosts.act4';
import { InputManager } from '../../input/InputManager';
import type { Interactable } from '../../interaction/InteractionSystem';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { OATHBLADE } from './catalog';
import itemsAct4Plugin, { FORGE_ASHGATE_ID } from './items.act4.plugin';
import { grantOathblade } from './oathblade';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/items.act4.plugin.ts': { default: itemsAct4Plugin },
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

async function boot(anvil = true) {
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
  if (anvil) ctx.anchors.define({ id: REFUGE_ANVIL, position: { x: 30, y: 0, z: 0 }, yaw: 0 });
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const cls: { id: ClassId | null } = { id: 'knight' };
  const states: Record<string, string> = {};
  const smith = vi.fn(() => true);
  const statuses = await game.loadPlugins(modules);
  (ctx.services as any).provide('classes', { chosen: () => cls.id !== null, current: () => cls.id ?? 'knight' });
  (ctx.services as any).provide('quests', { state: (id: string) => states[id] ?? 'inactive' });
  (ctx.services as any).provide('gear', { openSmith: smith });
  const inv = ctx.services.require('inventory');
  return { game, ctx, statuses, interactables, cls, states, smith, inv };
}

describe('items-act4 plugin', () => {
  it('sets up', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'items-act4')?.state).toBe('ok');
  }, 30_000);

  it('swaps the Oathblade on class.changed and back, keeping +5 Sworn', async () => {
    const t = await boot();
    const ports = {
      classId: () => t.cls.id,
      has: (id: string) => t.inv.has(id),
      add: (id: string, n: number) => t.inv.add(id, n),
      remove: (id: string, n: number) => t.inv.remove(id, n),
      setTemper: (id: string, l: number, a?: string) => t.inv.setTemper(id, l, a),
      equipped: (s: never) => t.inv.equipped(s),
      equip: (id: string) => t.inv.equip(id),
    };
    grantOathblade(ports);
    t.cls.id = 'emberwright';
    t.ctx.events.emit('class.changed', { classId: 'emberwright', previous: 'knight', free: true, cost: 0 });
    expect(t.inv.has(OATHBLADE.carried)).toBe(true);
    expect(t.inv.has(OATHBLADE.sword)).toBe(false);
    t.cls.id = 'knight';
    t.ctx.events.emit('class.changed', { classId: 'knight', previous: 'emberwright', free: true, cost: 0 });
    expect(t.inv.gear(OATHBLADE.sword)).toEqual({ temper: 5, affix: 'sworn' });
    expect(t.inv.has(OATHBLADE.carried)).toBe(false);
  }, 30_000);

  it('a load with the wrong form for the class reconciles it', async () => {
    const t = await boot();
    t.inv.add(OATHBLADE.carried, 1);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(t.inv.has(OATHBLADE.sword)).toBe(true);
    expect(t.inv.gear(OATHBLADE.sword).temper).toBe(5);
  }, 30_000);

  it('the carried form adds 10% poise through the real damage service', async () => {
    const t = await boot();
    t.inv.add(OATHBLADE.carried, 1);
    const foe = t.ctx.actors.spawn({ kind: 'boar', team: 'hostile', maxHealth: 10000, maxPoise: 10000 });
    const hit = () => t.ctx.damage.apply({ attackerId: t.ctx.actors.player.id, targetId: foe.id, amount: 1, poise: 40, kind: 'melee' })!.poiseDealt;
    expect(hit()).toBe(40);
    t.inv.equip(OATHBLADE.carried);
    expect(hit()).toBeCloseTo(44, 5);
  }, 30_000);

  it('the refuge forge opens from M41 once the Hushed Anvil lesson is done, and calls the smith screen', async () => {
    const t = await boot();
    const forge = t.interactables.get(FORGE_ASHGATE_ID)!;
    expect(forge.enabled!()).toBe(false);
    t.ctx.state.setFlag('story.m41.complete', true);
    expect(forge.enabled!()).toBe(false);
    t.states.m14 = 'completed';
    expect(forge.enabled!()).toBe(true);
    forge.onInteract(t.ctx.actors.player);
    expect(t.smith).toHaveBeenCalledTimes(1);
    expect(forge.position(new THREE.Vector3()).x).toBe(30);
  }, 30_000);

  it('without the refuge anvil anchor the forge stays closed', async () => {
    const t = await boot(false);
    t.ctx.state.setFlag('story.m41.complete', true);
    t.states.m14 = 'completed';
    expect(t.interactables.get(FORGE_ASHGATE_ID)!.enabled!()).toBe(false);
  }, 30_000);
});
