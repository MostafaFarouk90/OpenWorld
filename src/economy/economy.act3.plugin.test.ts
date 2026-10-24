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
import '../gear/tier4/catalog';

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
    'shop.osgar': { x: 60, z: 0 },
    'shop.ketta': { x: 70, z: 0 },
    'shop.maud': { x: 80, z: 0 },
    'shop.slagg': { x: 90, z: 0 },
    'shop.pike': { x: 100, z: 0 },
    'shop.aldous': { x: 110, z: 0 },
    'shop.leofa': { x: 120, z: 0 },
    'shop.dudda': { x: 130, z: 0 },
    'shop.gytha': { x: 140, z: 0 },
    'shop.thorgar': { x: 150, z: 0 },
    'shop.eadgyth': { x: 160, z: 0 },
    'shop.ansgar': { x: 170, z: 0 },
    'shop.ysmeryth': { x: 180, z: 0 },
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

const GATES: [string, string][] = [['leofa', 'm23'], ['dudda', 'm24'], ['gytha', 'm25'], ['thorgar', 'm28'], ['eadgyth', 'm29'], ['ansgar', 'm30']];

describe('Act 3 economy on the real game', () => {
  it('each quest-gated vendor is closed while its quest is inactive and open once it has started', async () => {
    const t = await boot();
    const states: Record<string, string> = {};
    (t.ctx.services as any).provide('quests', { state: (id: string) => states[id] ?? 'inactive' });
    const open = (v: string) => t.interactables.get(`shop:${v}`)!.enabled!();
    for (const [v] of GATES) expect(open(v), v).toBe(false);
    for (const [v, q] of GATES) {
      states[q] = 'active';
      expect(open(v), `${v} started`).toBe(true);
      for (const [other] of GATES) if (other !== v && !(states[GATES.find((g) => g[0] === other)![1]])) expect(open(other), `${other} stays closed`).toBe(false);
    }
  });

  it('ysmeryth opens on M32 completed or the story.m32.complete flag, not on started', async () => {
    const t = await boot();
    const states: Record<string, string> = {};
    (t.ctx.services as any).provide('quests', { state: (id: string) => states[id] ?? 'inactive' });
    const open = () => t.interactables.get('shop:ysmeryth')!.enabled!();
    expect(open()).toBe(false);
    states.m32 = 'active';
    expect(open()).toBe(false);
    states.m32 = 'completed';
    expect(open()).toBe(true);
    states.m32 = 'inactive';
    expect(open()).toBe(false);
    t.ctx.state.setFlag('story.m32.complete', true);
    expect(open()).toBe(true);
  });

  it("the plugin shop starts with the limited Act 3 lines at default", async () => {
    const t = await boot();
    t.ctx.state.setFlag('story.m32.complete', true);
    t.inv.addGold(5000);
    const vendors = (t.ctx.services as any).require('vendors');
    expect(vendors.open).toBeTypeOf('function');
    const shop = t.ctx.persist.get('vendors')!.serialize() as { stock: Record<string, Record<string, number>> };
    expect(shop.stock.ysmeryth).toEqual({ 'keepers-scale-brooch': 1, 'ember-mothers-scale': 1 });
    expect(shop.stock.thorgar).toEqual({ 'shed-wyrm-scale': 9 });
  });

  it('npc.gytha.brew brews one Fen Salve from the recipe, three herbs and 15 gold, and a refusal takes nothing', async () => {
    const t = await boot();
    const brew = () => (t.ctx.events as any).emit('npc.gytha.brew', {});
    t.inv.addGold(100);
    brew();
    expect(t.inv.count('fen-salve')).toBe(0);
    expect(t.inv.gold).toBe(100);
    t.inv.add('fen-salve-recipe', 1);
    t.inv.add('bog-myrtle', 1);
    t.inv.add('sundew', 1);
    brew();
    expect(t.inv.count('fen-salve')).toBe(0);
    expect(t.inv.count('sundew')).toBe(1);
    t.inv.add('mire-lily', 1);
    brew();
    expect(t.inv.count('fen-salve')).toBe(1);
    expect([t.inv.count('bog-myrtle'), t.inv.count('sundew'), t.inv.count('mire-lily')]).toEqual([0, 0, 0]);
    expect(t.inv.gold).toBe(85);
  });

  it('using a Fen Salve removes 20 Burn through the real spells service and does not heal', async () => {
    const t = await boot();
    const spells = t.ctx.services.require('spells');
    spells.addBurn(50, 'test');
    expect(spells.burn).toBe(50);
    t.inv.add('fen-salve', 1);
    const hp = t.ctx.actors.player.health;
    expect(t.inv.use('fen-salve').ok).toBe(true);
    for (let i = 0; i < 120; i++) t.game.fixedUpdate();
    expect(spells.burn).toBeLessThanOrEqual(30);
    expect(spells.burn).toBeGreaterThan(25);
    expect(t.inv.count('fen-salve')).toBe(0);
    expect(t.ctx.actors.player.health).toBe(hp);
  });
});
