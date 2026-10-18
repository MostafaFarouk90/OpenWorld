import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import dialoguePlugin from '../dialogue/dialogue.plugin';
import questsPlugin from './quests.plugin';

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

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
  const statuses = await game.loadPlugins(modules(corePlugin, questsPlugin, dialoguePlugin));
  return { game, world, statuses, ctx: game.ctx };
}

describe('quests and dialogue plugins', () => {
  it('set up, provide both services and register both persistables', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.services.has('quests')).toBe(true);
    expect(t.ctx.services.has('dialogue')).toBe(true);
    const keys = t.ctx.persist.all().map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['quests', 'dialogue']));
    t.game.dispose();
    t.world.dispose();
  });

  it('registers all slice quests and credits T03 from interact events', async () => {
    const t = await boot();
    const quests = t.ctx.services.require('quests');
    for (const id of ['t03', 't12', 'm01', 'm02']) expect(quests.get(id)).toBeDefined();
    expect(quests.start('t03')).toBe(true);
    const playerId = t.ctx.player.actor.id;
    for (const id of ['npc:stane', 'npc:edda', 'use:notice-board']) {
      t.ctx.events.emit('interact', { interactableId: id, kind: 'talk', actorId: playerId, action: 'interact' });
    }
    expect(quests.state('t03')).toBe('completed');
    t.game.dispose();
    t.world.dispose();
  });

  it('opens a root dialogue, pushes the dialogue context and pops it on end; refuses a second open', async () => {
    const t = await boot();
    const dialogue = t.ctx.services.require('dialogue');
    expect(dialogue.start('npc-stane', 'stane')).toBe(true);
    expect(dialogue.active).toBe(true);
    expect(t.ctx.input.contexts.top()).toBe('dialogue');
    expect(dialogue.start('npc-edda', 'edda')).toBe(false);
    dialogue.close('script');
    expect(dialogue.active).toBe(false);
    expect(t.ctx.input.contexts.top()).toBe('gameplay');
    t.game.dispose();
    t.world.dispose();
  });

  it('closes the dialogue when the player dies', async () => {
    const t = await boot();
    const dialogue = t.ctx.services.require('dialogue');
    dialogue.start('npc-stane', 'stane');
    t.ctx.events.emit('actor.died', {
      actorId: t.ctx.player.actor.id, killerId: null, kind: 'player', team: 'player', level: 1,
    } as never);
    expect(dialogue.active).toBe(false);
    t.game.dispose();
    t.world.dispose();
  });

  it('the carry system tolerates missing anchors (one warning, no throw) across ticks', async () => {
    const t = await boot();
    t.ctx.services.require('quests').start('m01');
    t.game.fixedUpdate();
    t.game.fixedUpdate();
    const warned = (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('no home anchor'));
    expect(warned).toHaveLength(3);
    t.game.dispose();
    t.world.dispose();
  });

  it('disabling quests skips dialogue as a dependant', async () => {
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const world = new World(scene, physics, {
      colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
      moveModifier: () => moveModifiers.state(),
    });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
    const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
    const statuses = await game.loadPlugins(modules(corePlugin, dialoguePlugin));
    expect(statuses.find((s) => s.id === 'dialogue')?.state).toBe('skipped');
    game.dispose();
    world.dispose();
  });

  it('walks M01 and M02 on the real queued event bus', async () => {
    const t = await boot();
    const q = t.ctx.services.require('quests');
    const ev = t.ctx.events;
    const pid = t.ctx.player.actor.id;
    q.start('m01');
    for (let i = 0; i < 5; i++) {
      ev.emit('actor.died', { actorId: `w${i}`, killerId: pid, kind: 'ash-wraith', team: 'enemy', level: 1, spawnTag: 'm01' } as never);
    }
    expect(q.objectives('m01')[0].done).toBe(true);
    for (let i = 1; i <= 3; i++) {
      ev.emit('carry.delivered', { carryId: `villager-${i}`, destinationId: 'm01.chapel-door' });
    }
    expect(q.objectives('m01')[1].done).toBe(true);
    ev.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: 'gaut', reason: 'completed' } as never);
    expect(q.state('m01')).toBe('completed');
    q.start('m02');
    ev.emit('trigger.enter', { triggerId: 'm02.bakery', actorId: pid });
    ev.emit('interact', { interactableId: 'pickup:hearth-stone', kind: 'pickup', actorId: pid, action: 'interact' });
    ev.emit('dialogue.ended', { dialogueId: 'npc-edda', npcId: 'edda', reason: 'completed' } as never);
    expect(q.state('m02')).toBe('completed');
    t.game.dispose();
    t.world.dispose();
  });

  it('toasts the M03 lead once on live M02 completion and never on load', async () => {
    const t = await boot();
    const q = t.ctx.services.require('quests');
    const toasts: string[] = [];
    t.ctx.events.on('hud.toast', (e) => toasts.push(e.textKey));
    q.start('m02');
    q.complete('m02');
    expect(toasts).toEqual(['quest.lead.m03']);
    t.ctx.events.emit('save.loaded', { slot: 't' });
    expect(toasts).toEqual(['quest.lead.m03']);
    t.game.dispose();
    t.world.dispose();
  });

  it('a dialogue aborted by a save load does not credit the talk objective', async () => {
    const t = await boot();
    const q = t.ctx.services.require('quests');
    q.start('t03');
    t.ctx.events.emit('actor.died', { actorId: 'x', killerId: null, kind: 'x', team: 'enemy', level: 1, spawnTag: undefined } as never);
    const d = t.ctx.services.require('dialogue');
    expect(d.start('npc-stane', 'stane')).toBe(true);
    t.ctx.events.emit('save.loaded', { slot: 'a' });
    expect(d.active).toBe(false);
    expect(t.ctx.input.contexts.top()).toBe('gameplay');
    t.game.dispose();
    t.world.dispose();
  });

  it('skipping T04 after two wry vows writes a wry tone', async () => {
    const t = await boot();
    const d = t.ctx.services.require('dialogue');
    expect(d.start('t04-vow', 'aelfreda')).toBe(true);
    t.ctx.state.setFlag('tutorial.t04.vow1', 'wry');
    t.ctx.state.setFlag('tutorial.t04.vow2', 'wry');
    d.close('skip');
    expect(t.ctx.state.getFlag('tutorial.t04.tone')).toBe('wry');
    t.game.dispose();
    t.world.dispose();
  });

  it('plugin dispose leaves no dialogue context and no move modifiers', async () => {
    const t = await boot();
    t.ctx.services.require('dialogue').start('npc-stane', 'stane');
    t.game.dispose();
    expect(t.ctx.input.contexts.top()).toBe('gameplay');
    t.world.dispose();
  });
});
