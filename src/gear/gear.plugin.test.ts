import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import type { Interactable } from '../interaction/InteractionSystem';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import gearPlugin from './gear.plugin';
import { PATTERNS } from './rhythm';
import type { TemperingScreenFactory } from './session';

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

async function boot(opts: { anchor?: boolean; withStation?: boolean; withMount?: boolean } = {}) {
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
  if (opts.anchor !== false) ctx.anchors.define({ id: 'shop.dunstan', position: { x: 50, y: 0, z: 0 }, yaw: 0 });
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const quest = { m14: 'inactive' };
  const handlers: ((id: string, o: { firstTemperOfTier: boolean }) => void)[] = [];
  const bonuses: (() => number)[] = [];
  const fake: GamePlugin = {
    id: 'fake-others',
    dependsOn: ['core'],
    setup(c) {
      c.services.provide('quests', { state: (id: string) => quest[id as 'm14'] ?? 'inactive' } as never);
      if (opts.withStation !== false) {
        (c.services as unknown as { provide(n: string, v: unknown): void }).provide('temperStation', {
          stations: () => [],
          setHandler: (fn: (typeof handlers)[number]) => {
            handlers.push(fn);
            return () => handlers.splice(handlers.indexOf(fn), 1);
          },
        } as never);
      }
      if (opts.withMount) c.services.provide('mount', { addStaminaBonus: (fn: () => number) => (bonuses.push(fn), () => {}) } as never);
    },
  };
  const modules: Record<string, PluginModule> = {
    '/src/test/core.plugin.ts': { default: corePlugin },
    '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
    '/src/test/fake.plugin.ts': { default: fake },
    '/src/test/gear.plugin.ts': { default: gearPlugin },
  };
  const statuses = await game.loadPlugins(modules);
  const run = (n = 1) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run();
  return { game, ctx, statuses, quest, handlers, bonuses, interactables, run, inv: ctx.services.require('inventory'), gear: ctx.services.require('gear') };
}

describe('gear plugin', () => {
  it('sets up cleanly and provides the gear service', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.gear.session.state).toBe('idle');
    expect(t.ctx.strings.t('item.ashplate.name')).toBe('Ashplate');
  });

  it('registers the anvil handler softly, and works without the station service', async () => {
    const t = await boot();
    expect(t.handlers).toHaveLength(1);
    t.quest.m14 = 'active';
    t.handlers[0]('hushed-anvil', { firstTemperOfTier: true });
    expect(t.gear.session.state).toBe('picking');
    t.gear.session.close();
    t.handlers[0]('other-station', { firstTemperOfTier: true });
    expect(t.gear.session.state).toBe('idle');
    const bare = await boot({ withStation: false });
    expect(bare.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(bare.gear.openAnvil()).toBe(false);
  });

  it('gates the anvil on m14 active or completed and the smith on completed', async () => {
    const t = await boot();
    expect(t.gear.openAnvil()).toBe(false);
    t.handlers[0]('hushed-anvil', { firstTemperOfTier: true });
    expect(t.gear.session.state).toBe('idle');
    t.quest.m14 = 'active';
    expect(t.gear.openSmith()).toBe(false);
    expect(t.gear.openAnvil()).toBe(true);
    expect(t.gear.openAnvil()).toBe(false); // already open
    t.gear.session.close();
    t.quest.m14 = 'completed';
    expect(t.gear.openSmith()).toBe(true);
  });

  it('places the forge interactable beside shop.dunstan, enabled when m14 is completed', async () => {
    const t = await boot();
    const i = t.interactables.get('use:forge-dunstan')!;
    expect(i.kind).toBe('use');
    expect(i.position(new THREE.Vector3()).x).toBeCloseTo(51.6);
    expect(i.enabled!()).toBe(false);
    t.quest.m14 = 'active';
    expect(i.enabled!()).toBe(false);
    t.quest.m14 = 'completed';
    expect(i.enabled!()).toBe(true);
    i.onInteract(t.ctx.actors.player);
    expect(t.gear.session.state).toBe('picking');
    expect((await boot({ anchor: false })).interactables.has('use:forge-dunstan')).toBe(false);
  });

  it('opens the default panel in a run and a close cancels it without a charge', async () => {
    const t = await boot();
    t.quest.m14 = 'active';
    t.inv.add('squires-arming-sword', 1);
    const events: unknown[] = [];
    t.ctx.events.on('gear.tempered', (e) => events.push(e));
    expect(t.gear.openAnvil()).toBe(true);
    t.gear.session.select('squires-arming-sword');
    t.gear.session.start();
    expect(t.gear.session.state).toBe('rhythm');
    expect(t.gear.session.view().run?.steps).toEqual(PATTERNS[1]);
    t.gear.session.close();
    expect(t.gear.session.state).toBe('idle');
    expect(events).toEqual([]);
    expect(t.inv.gold).toBe(0);
  });

  it('lets A15 swap the screen and a null result closes the session', async () => {
    const t = await boot();
    t.quest.m14 = 'active';
    const dispose = vi.fn();
    const custom: TemperingScreenFactory = vi.fn(() => ({ dispose }));
    t.gear.setScreen(custom);
    expect(t.gear.openAnvil()).toBe(true);
    expect(custom).toHaveBeenCalledOnce();
    t.gear.session.close();
    expect(dispose).toHaveBeenCalledOnce();
    t.gear.setScreen(() => null);
    expect(t.gear.openAnvil()).toBe(false);
    expect(t.gear.session.state).toBe('idle');
    t.gear.setScreen(null); // back to the default panel
    expect(t.gear.openAnvil()).toBe(true);
  });

  it('forges through the service', async () => {
    const t = await boot();
    t.quest.m14 = 'completed';
    expect(t.gear.forge('brigandine')).toBeNull(); // no screen open
    t.inv.add('brigandine', 1);
    t.inv.add('cinder-steel-ingot', 1);
    t.inv.addGold(200);
    t.gear.openAnvil();
    expect(t.gear.forge('brigandine')).toEqual({ ok: true, from: 'brigandine', to: 'ashplate' });
    expect(t.gear.forge('brigandine')).toEqual({ ok: false, reason: 'not-held' });
  });

  it('persists anvilTiers and lessonRuns as gear v1, sanitised, and resets without an entry', async () => {
    const t = await boot();
    const read = () => t.ctx.persist.saveAll().find((e) => e.key === 'gear');
    expect(read()).toEqual({ key: 'gear', version: 1, data: { anvilTiers: [], lessonRuns: 0 } });
    t.ctx.persist.loadAll([{ key: 'gear', version: 1, data: { anvilTiers: [2, 2, 9, 'x', 3], lessonRuns: 1.9 } }], t.ctx.events, 'a');
    expect(read()!.data).toEqual({ anvilTiers: [2, 3], lessonRuns: 1 });
    t.ctx.persist.loadAll([{ key: 'gear', version: 1, data: 'junk' }], t.ctx.events, 'a');
    expect(read()!.data).toEqual({ anvilTiers: [], lessonRuns: 0 });
    t.ctx.persist.loadAll([{ key: 'gear', version: 1, data: { anvilTiers: [1], lessonRuns: 2 } }], t.ctx.events, 'a');
    t.ctx.persist.loadAll([], t.ctx.events, 'a');
    expect(read()!.data).toEqual({ anvilTiers: [], lessonRuns: 0 });
  });

  it('a loaded lessonRuns of 2 ends the free runs', async () => {
    const t = await boot();
    t.quest.m14 = 'active';
    t.gear.openAnvil();
    expect(t.gear.session.view().free).toBe(true);
    t.gear.session.close();
    t.ctx.persist.loadAll([{ key: 'gear', version: 1, data: { anvilTiers: [1], lessonRuns: 2 } }], t.ctx.events, 'a');
    t.gear.openAnvil();
    expect(t.gear.session.view().free).toBe(false);
  });

  it('adds the saddle stamina bonus softly from the held item', async () => {
    const t = await boot({ withMount: true });
    expect(t.bonuses).toHaveLength(1);
    expect(t.bonuses[0]()).toBe(0);
    t.inv.add('ashmare-saddle', 1);
    expect(t.bonuses[0]()).toBe(30);
    expect((await boot()).statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  });

  it('applies the combat modifiers to the player\'s hits', async () => {
    const t = await boot();
    t.inv.add('ashforged-longsword', 1);
    t.inv.equip('ashforged-longsword');
    const foe = t.ctx.actors.spawn({ kind: 'boar', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
    const r = t.ctx.damage.apply({ attackerId: 'player', targetId: foe.id, amount: 18, kind: 'melee' })!;
    expect(r.dealt).toBeCloseTo(34, 3);
  });
});
