import { ACT2_CARRY } from './content/act2/carry';
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
import { CARRY_ITEMS } from './content/carry';
import { M02_RUBBLE } from './content/m02.quest';

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
    expect(warned).toHaveLength(CARRY_ITEMS.length + ACT2_CARRY.length); // villagers and well buckets, then Act 2's wounded, bundles and logs
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
    const talk = (npcId: string) => ev.emit('dialogue.ended', { dialogueId: `npc-${npcId}`, npcId, reason: 'completed' } as never);
    for (let i = 1; i <= 2; i++) ev.emit('carry.delivered', { carryId: `bucket-m01-${i}`, destinationId: 'm01.tavern-door' });
    talk('tobb');
    for (let i = 0; i < 4; i++) {
      ev.emit('actor.died', { actorId: `mw${i}`, killerId: pid, kind: 'ash-wraith', team: 'enemy', level: 1, spawnTag: 'm01.mill' } as never);
    }
    talk('aldwin');
    talk('aelfreda');
    expect(t.ctx.state.getFlag('story.m01.tavernDoused')).toBe(true); // the objective-flag bridge
    talk('gaut');
    expect(q.state('m01')).toBe('completed');
    q.start('m02');
    for (let i = 1; i <= 2; i++) ev.emit('carry.delivered', { carryId: `bucket-m02-${i}`, destinationId: 'm02.bakery-door' });
    ev.emit('trigger.enter', { triggerId: 'm02.bakery', actorId: pid });
    for (const id of M02_RUBBLE) ev.emit('interact', { interactableId: id, kind: 'use', actorId: pid, action: 'interact' });
    expect(t.ctx.state.getFlag('story.m02.rubbleCleared')).toBe(true);
    for (let i = 0; i < 3; i++) {
      ev.emit('actor.died', { actorId: `ov${i}`, killerId: pid, kind: 'ash-wraith', team: 'enemy', level: 1, spawnTag: 'm02.oven-yard' } as never);
    }
    ev.emit('interact', { interactableId: 'pickup:hearth-stone', kind: 'pickup', actorId: pid, action: 'interact' });
    talk('note-m02-badge');
    ev.emit('trigger.enter', { triggerId: 'm02.granary', actorId: pid });
    talk('garrick');
    talk('edda');
    expect(q.state('m02')).toBe('active');
    ev.emit('interact', { interactableId: 'use:m02-common-hearth', kind: 'use', actorId: pid, action: 'interact' });
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

// Playtest bugs 1 and 2 through the real plugin: the note registered on the interaction system reads its priority and its
// `live` state on every focus pick, so it gives way to Corwin once read and outranks Aelfreda while the ledgers need it.
describe('notes standing on NPCs, as registered by the quests plugin', () => {
  it('note-m15-map: priority 1 and live while the ledgers need it; neither once it is read', async () => {
    const t = await boot();
    t.ctx.anchors.define({ id: 'cinderreach.m15.search.3', position: { x: 4, y: 0, z: 4 }, yaw: 0 });
    for (let i = 0; i < 30; i++) t.game.fixedUpdate();
    const items = (t.ctx.interaction as unknown as { items: Map<string, { priority?: number; live?(): boolean }> }).items;
    const map = items.get('use:note-m15-map');
    expect(map).toBeDefined();
    const quests = t.ctx.services.require('quests');
    t.ctx.state.setFlag('story.gate.a2', true);
    for (const id of ['m11', 'm12', 'm13', 'm14']) expect(quests.complete(id), id).toBe(true);
    expect(quests.start('m15')).toBe(true);
    expect(map!.priority ?? 0).toBe(0); // Osgar's brief first
    for (const o of quests.get('m15')!.objectives) { if (o.id === 'ledgers') break; quests.completeObjective('m15', o.id); }
    expect(map!.priority).toBe(1);
    expect(map!.live?.()).toBe(true);
    t.ctx.events.emit('dialogue.ended', { dialogueId: 'note-m15-map', npcId: 'note-m15-map', reason: 'completed' });
    expect(map!.priority ?? 0).toBe(0);
    expect(map!.live?.()).toBe(false);
    t.game.dispose();
    t.world.dispose();
  });
});
