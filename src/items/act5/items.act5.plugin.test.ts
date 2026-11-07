// Act 5 N7: the items-act5 plugin on a reduced manifest (core, inventory, items-act4, items-act5): the heat ward service,
// the Gauntlet's poise through the real damage service, the Crown's warmth, Alric's anvil and Dunstan's forge following him.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { REFUGE_ANVIL } from '../../economy/refugePosts.act4';
import { RIM_ANVIL_ALRIC, RIM_FORGE_DUNSTAN } from '../../economy/rimCamp.act5';
import { InputManager } from '../../input/InputManager';
import type { Interactable } from '../../interaction/InteractionSystem';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import itemsAct4Plugin, { FORGE_ASHGATE_ID } from '../act4/items.act4.plugin';
import { ACT5_TRINKETS } from './catalog';
import itemsAct5Plugin, { FORGE_ALRIC_ID } from './items.act5.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/items.act4.plugin.ts': { default: itemsAct4Plugin },
  '/src/test/items.act5.plugin.ts': { default: itemsAct5Plugin },
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

async function boot() {
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
  ctx.anchors.define({ id: REFUGE_ANVIL, position: { x: 30, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: RIM_FORGE_DUNSTAN, position: { x: 500, y: 0, z: 0 }, yaw: 0 });
  ctx.anchors.define({ id: RIM_ANVIL_ALRIC, position: { x: 510, y: 0, z: 0 }, yaw: 0 });
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const mods = new Map<string, () => number>();
  const refresh = vi.fn();
  const states: Record<string, string> = {};
  const rim = vi.fn(() => true);
  const smith = vi.fn(() => true);
  const progressionStub: GamePlugin = {
    id: 'progression',
    dependsOn: ['core'],
    setup: (c) => void (c.services as any).provide('progression', { addMaxHealthModifier: (id: string, fn: () => number) => (mods.set(id, fn), () => mods.delete(id)), refreshMaxHealth: refresh }),
  };
  const statuses = await game.loadPlugins({ ...modules, '/src/test/progression.plugin.ts': { default: progressionStub } });
  (ctx.services as any).provide('classes', { chosen: () => true, current: () => 'knight' });
  (ctx.services as any).provide('quests', { state: (id: string) => states[id] ?? 'inactive' });
  (ctx.services as any).provide('gear', { openSmith: smith, openRimAnvil: rim });
  return { game, ctx, statuses, interactables, states, rim, smith, mods, refresh, inv: ctx.services.require('inventory') };
}

describe('items-act5 plugin', () => {
  it('sets up and registers the Act 5 strings', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'items-act5')?.state).toBe('ok');
    expect(t.ctx.strings.t('item.forge-heart-fragment.name')).toBe('Forge-Heart Fragment');
  }, 30_000);

  it('provides the heat ward of the worn trinket', async () => {
    const t = await boot();
    const svc = (t.ctx.services as any).get('heatWard');
    expect(svc.heatWard()).toEqual({ lava: 1, exposure: 1, forgeFire: 1 });
    t.inv.add(ACT5_TRINKETS.cinderproofMantle, 1);
    t.inv.equip(ACT5_TRINKETS.cinderproofMantle);
    expect(svc.heatWard().lava).toBe(0.7);
  }, 30_000);

  it('the Gauntlet adds 10% poise through the real damage service', async () => {
    const t = await boot();
    t.inv.add(ACT5_TRINKETS.regentsGauntlet, 1);
    const foe = t.ctx.actors.spawn({ kind: 'boar', team: 'hostile', maxHealth: 10000, maxPoise: 10000 });
    const hit = () => t.ctx.damage.apply({ attackerId: t.ctx.actors.player.id, targetId: foe.id, amount: 1, poise: 40, kind: 'melee' })!.poiseDealt;
    expect(hit()).toBe(40);
    t.inv.equip(ACT5_TRINKETS.regentsGauntlet);
    expect(hit()).toBeCloseTo(44, 5);
  }, 30_000);

  it('the Crown warms +8% only after the ending, and a trinket change refreshes max health', async () => {
    const t = await boot();
    const warmth = t.mods.get('item.ember-crown.warmth')!;
    t.inv.add(ACT5_TRINKETS.emberCrown, 1);
    t.inv.equip(ACT5_TRINKETS.emberCrown);
    expect(t.refresh).toHaveBeenCalled();
    expect(warmth()).toBe(1);
    const before = t.refresh.mock.calls.length;
    t.ctx.state.setFlag('world.afterEnding', true);
    expect(t.refresh.mock.calls.length).toBeGreaterThan(before);
    expect(warmth()).toBeCloseTo(1.08, 5);
    t.inv.unequip('trinket');
    expect(warmth()).toBe(1);
  }, 30_000);

  it("Alric's anvil stands from M47 at his anchor and opens the rim screen", async () => {
    const t = await boot();
    const anvil = t.interactables.get(FORGE_ALRIC_ID)!;
    expect(anvil.enabled!()).toBe(false);
    t.ctx.state.setFlag('story.m47.complete', true);
    expect(anvil.enabled!()).toBe(true);
    anvil.onInteract(t.ctx.actors.player);
    expect(t.rim).toHaveBeenCalledTimes(1);
    expect(anvil.position(new THREE.Vector3()).x).toBe(510);
  }, 30_000);

  it("Dunstan's forge follows him to the Rim Camp from M49 and re-derives on load", async () => {
    const t = await boot();
    const forge = t.interactables.get(FORGE_ASHGATE_ID)!;
    t.ctx.state.setFlag('story.m41.complete', true);
    t.states.m14 = 'completed';
    expect(forge.position(new THREE.Vector3()).x).toBe(30);
    t.ctx.state.setFlag('story.m49.complete', true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(forge.position(new THREE.Vector3()).x).toBe(500);
    expect(forge.enabled!()).toBe(true);
    forge.onInteract(t.ctx.actors.player);
    expect(t.smith).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('registers chest:foundry-cache once its anchor exists and pays one fragment, once', async () => {
    const t = await boot();
    expect(t.interactables.get('chest:foundry-cache')).toBeUndefined();
    t.ctx.anchors.define({ id: 'caldera.int.foundry.chest', position: { x: 70, y: 150, z: 80 }, yaw: 0 });
    t.game.fixedUpdate();
    const chest = t.interactables.get('chest:foundry-cache');
    expect(chest).toBeDefined();
    const granted: unknown[] = [];
    t.ctx.events.on('loot.granted', (e) => granted.push(e));
    chest!.onInteract(t.ctx.actors.player);
    chest!.onInteract(t.ctx.actors.player);
    expect(granted).toEqual([{ sourceId: 'chest:foundry-cache', items: [{ itemId: 'forge-heart-fragment', count: 1 }] }]);
    expect(chest!.enabled!()).toBe(false);
  }, 30_000);
});
