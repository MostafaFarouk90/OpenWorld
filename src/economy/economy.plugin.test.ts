import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import type { Interactable } from '../interaction/InteractionSystem';
import inventoryPlugin from '../inventory/inventory.plugin';
import { getItem, registerItems } from '../inventory/items';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import shrinePlugin from '../shrine/shrine.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import economyPlugin from './economy.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/shrine.plugin.ts': { default: shrinePlugin },
  '/src/test/economy.plugin.ts': { default: economyPlugin },
};

let physics: PhysicsWorld;
const worlds: World[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  // The pick is thread 6's item; register a stand-in only when it is not on main yet.
  if (!getItem('oswin-lockpicks')) {
    registerItems([{ id: 'oswin-lockpicks', nameKey: 'k', descKey: 'k', kind: 'consumable', stackMax: 10 }]);
  }
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
  const spots: Record<string, { x: number; z: number }> = {
    'brightwater.player-spawn': { x: 0, z: 0 },
    'chest.deadroad.camp-1': { x: 10, z: 0 },
    'chest.harrowmark.1': { x: 20, z: 0 },
    'chest.harrowmark.2': { x: 30, z: 0 },
    'shop.wystan': { x: 40, z: 0 },
    'shop.dunstan': { x: 50, z: 0 },
  };
  for (const [id, p] of Object.entries(spots)) ctx.anchors.define({ id, position: { x: p.x, y: 0, z: p.z }, yaw: 0 });
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const statuses = await game.loadPlugins(modules);
  const use = (id: string) => interactables.get(id)!.onInteract(ctx.actors.player);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  return { game, ctx, statuses, interactables, use, run, inv: ctx.services.require('inventory') };
}

describe('economy plugin on the real game', () => {
  it('sets up cleanly and places the anchored chests and shop points', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (const id of ['chest:deadroad-camp-1', 'chest:harrowmark-1', 'chest:harrowmark-2', 'shop:wystan', 'shop:dunstan']) {
      expect(t.interactables.has(id), id).toBe(true);
    }
    expect(t.interactables.has('chest:harrowmark-3')).toBe(false); // its anchor is thread 17's, not defined here
    expect(t.interactables.get('shop:wystan')!.kind).toBe('shop');
  });

  it('a camp chest pays 15 once, across a reload', async () => {
    const t = await boot();
    t.use('chest:deadroad-camp-1');
    expect(t.inv.gold).toBe(15);
    t.use('chest:deadroad-camp-1');
    t.ctx.events.emit('save.loaded', { slot: 'a' });
    t.use('chest:deadroad-camp-1');
    expect(t.inv.gold).toBe(15);
    expect(t.interactables.get('chest:deadroad-camp-1')!.enabled?.()).toBe(false);
  });

  it('a locked Harrowmark chest stays shut without a pick and opens with one, using the pick up', async () => {
    const t = await boot();
    t.use('chest:harrowmark-1');
    expect(t.inv.gold).toBe(0);
    expect(t.ctx.state.getBool('chest.harrowmark-1.opened')).toBe(false);
    t.inv.add('oswin-lockpicks', 2);
    t.use('chest:harrowmark-1');
    expect(t.inv.gold).toBe(70);
    expect(t.inv.count('oswin-lockpicks')).toBe(1);
    t.use('chest:harrowmark-1'); // already open: no second pick, no second payment
    expect(t.inv.gold).toBe(70);
    expect(t.inv.count('oswin-lockpicks')).toBe(1);
    t.inv.add('oswin-lockpicks', 0);
    t.use('chest:harrowmark-2');
    expect(t.inv.gold).toBe(70 + 80);
    expect(t.inv.count('oswin-lockpicks')).toBe(0);
  });

  it('a Footman purse pays only for the player at a camp', async () => {
    const t = await boot();
    const died = (over: object) => t.ctx.events.emit('actor.died', { actorId: 'e1', killerId: 'player', kind: 'blighted-soldier', team: 'enemy', level: 1, spawnTag: 'deadroad.camp-1', ...over } as never);
    died({ spawnTag: 'replay.blocker', actorId: 'e0' });
    died({ killerId: 'tobb' , actorId: 'e9' });
    expect(t.inv.gold).toBe(0);
    died({});
    died({});
    expect(t.inv.gold).toBe(4);
  });

  it('the inn room flag is set once by M07 objective 4 and by nothing earlier', async () => {
    const t = await boot();
    const obj = (objectiveId: string, done: boolean) => t.ctx.events.emit('quest.objective', { questId: 'm07', objectiveId, progress: 1, required: 1, done });
    obj('o3', true);
    obj('o4', false);
    expect(t.ctx.state.getBool('world.harrowmark.inn.room')).toBe(false);
    obj('o4', true);
    expect(t.ctx.state.getBool('world.harrowmark.inn.room')).toBe(true);
    t.ctx.events.emit('save.loaded', { slot: 'a' });
    expect(t.ctx.state.getBool('world.harrowmark.inn.room')).toBe(true);
  });

  it('vendor gates: Wystan opens on story.m08.favourTab, Dunstan on story.m06.route', async () => {
    const t = await boot();
    expect(t.interactables.get('shop:wystan')!.enabled!()).toBe(false);
    expect(t.interactables.get('shop:dunstan')!.enabled!()).toBe(false);
    t.ctx.state.setFlag('story.m08.favourTab', true);
    t.ctx.state.setFlag('story.m06.route', 'bribe');
    expect(t.interactables.get('shop:wystan')!.enabled!()).toBe(true);
    expect(t.interactables.get('shop:dunstan')!.enabled!()).toBe(true);
  });

  it('Hearty from the inn service refreshes without stacking with the shrine\'s Cooled', async () => {
    const t = await boot();
    const a = t.ctx.actors.player;
    const base = a.maxHealth;
    t.ctx.services.require('inn').applyHearty(1200);
    expect(a.maxHealth).toBeCloseTo(base * 1.1, 1);
    t.ctx.events.emit('rest', { waystoneId: 'quenchstone' });
    expect(t.ctx.services.require('shrine').cooledSeconds()).toBe(1200);
    t.ctx.services.require('progression').refreshMaxHealth();
    expect(a.maxHealth).toBeCloseTo(base * 1.1, 1);
  });

  it('vendor and persistence registrations exist', async () => {
    const t = await boot();
    expect(t.ctx.persist.get('vendors')).toBeTruthy();
    expect(t.ctx.persist.get('inn')).toBeTruthy();
    expect(typeof t.ctx.services.require('vendors').open).toBe('function');
  });
});
