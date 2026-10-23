// Review B L4 (plans/act2-followups/review-b.md): the Phase C "Act 2 continues" card on a load. It kept only an in-memory
// `continuesDue`, cleared on load, and hid a pending card only when the loaded save had seen it, so it could be lost
// (D03 done, card never shown) or outlive a load of a save from before D03.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import promptsPlugin from '../prompts/prompts.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import './events';
import { ACT2_CONTINUES, act2ContinuesLive, act2ContinuesOnLoad } from './act2Continues';
import hudPlugin from './hud.plugin';

describe('act2ContinuesOnLoad', () => {
  it('owes the card when D03 is done, the hold stands and it was never seen', () => {
    expect(act2ContinuesOnLoad({ live: true, d03Done: true, seen: false })).toEqual({ hide: false, due: true });
  });
  it('hides it when the loaded save has no D03; owes nothing once seen or once the hold is gone', () => {
    expect(act2ContinuesOnLoad({ live: true, d03Done: false, seen: false })).toEqual({ hide: true, due: false });
    expect(act2ContinuesOnLoad({ live: true, d03Done: true, seen: true })).toEqual({ hide: false, due: false });
    expect(act2ContinuesOnLoad({ live: false, d03Done: true, seen: false })).toEqual({ hide: false, due: false });
  });
});

describe('the card on a load (real HUD plugin)', () => {
  let physics: PhysicsWorld;
  const disposers: Array<() => void> = [];
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const d of disposers.splice(0)) d();
    vi.restoreAllMocks();
  });

  async function setup() {
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const world = new World(scene, physics, {
      colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
      moveModifier: () => moveModifiers.state(),
    });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
    const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
    const quest = { d03: 'active' };
    const dialogue = { active: false };
    game.ctx.services.provide('quests' as never, {
      state: (id: string) => (id === 'd03' ? quest.d03 : 'inactive'),
      active: () => [], objectives: () => [], get: () => undefined, onChange: () => () => {},
      objectiveDone: () => false, isObjectiveCurrent: () => false,
    } as never);
    game.ctx.services.provide('dialogue' as never, dialogue as never);
    const plugins: GamePlugin[] = [corePlugin, inventoryPlugin, progressionPlugin, promptsPlugin, hudPlugin];
    const statuses = await game.loadPlugins(Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }])) as Record<string, PluginModule>);
    disposers.push(() => { game.dispose(); world.dispose(); });
    expect(statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const run = (n: number) => {
      for (let i = 0; i < n; i++) {
        game.fixedUpdate();
        game.ctx.hud.update(1 / 60);
      }
    };
    const card = game.ctx.services.require('actEndingCard');
    const seen = () => game.ctx.state.getBool(ACT2_CONTINUES.seenFlag);
    return { ctx: game.ctx, quest, dialogue, run, card, seen };
  }

  it('the hold stands in this build (the card is live), so these cases mean something', () => {
    expect(act2ContinuesLive()).toBe(true);
  });

  it('card lost: D03 completed while the closing dialogue is open, saved there, reloaded: the card still comes', async () => {
    const t = await setup();
    t.dialogue.active = true;
    t.quest.d03 = 'completed';
    t.ctx.events.emit('quest.completed', { questId: 'd03' });
    t.run(5);
    expect(t.card.active()).toBe(false); // waits for the dialogue
    // the load (the dialogue plugin closes dialogues on load)
    t.dialogue.active = false;
    t.ctx.events.emit('save.loaded', { slot: 'auto' });
    t.run(5);
    expect(t.card.active()).toBe(true);
    expect(t.seen()).toBe(true);
  });

  it('card survives: a card up after D03, then a load of a save from before D03, hides it and owes nothing', async () => {
    const t = await setup();
    t.quest.d03 = 'completed';
    t.ctx.events.emit('quest.completed', { questId: 'd03' });
    t.run(5);
    expect(t.card.active()).toBe(true);
    // the earlier save: D03 active, the card never seen
    t.quest.d03 = 'active';
    t.ctx.state.clearFlag(ACT2_CONTINUES.seenFlag);
    t.ctx.events.emit('save.loaded', { slot: 'auto' });
    t.run(5);
    expect(t.card.active()).toBe(false);
    expect(t.seen()).toBe(false);
  });

  it('a save with D03 done and the card already seen shows nothing on load', async () => {
    const t = await setup();
    t.quest.d03 = 'completed';
    t.ctx.state.setFlag(ACT2_CONTINUES.seenFlag, true);
    t.ctx.events.emit('save.loaded', { slot: 'auto' });
    t.run(5);
    expect(t.card.active()).toBe(false);
  });
});
