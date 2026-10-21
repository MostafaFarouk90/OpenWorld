import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import codexPlugin from '../codex/codex.plugin';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import type { Interactable } from '../interaction/InteractionSystem';
import inventoryPlugin from '../inventory/inventory.plugin';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import progressionPlugin from '../progression/progression.plugin';
import puzzlesPlugin from '../puzzles/puzzles.plugin';
import spellsPlugin from '../spells/spells.plugin';
import waystonesPlugin from '../waystones/waystones.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import weepingBellowsPlugin from './weepingBellows.plugin';
import shrinePlugin from './shrine.plugin';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/waystones.plugin.ts': { default: waystonesPlugin },
  '/src/test/spells.plugin.ts': { default: spellsPlugin },
  '/src/test/progression.plugin.ts': { default: progressionPlugin },
  '/src/test/shrine.plugin.ts': { default: shrinePlugin },
  '/src/test/codex.plugin.ts': { default: codexPlugin },
  '/src/test/inventory.plugin.ts': { default: inventoryPlugin },
  '/src/test/weeping-bellows.plugin.ts': { default: weepingBellowsPlugin },
  '/src/test/puzzles.plugin.ts': { default: puzzlesPlugin },
};

import { BELLOWS, initialRouting } from './weepingBellows.tuning';
import { WAYSTONE_LOCKS } from '../waystones/tuning';

const CENTER = { x: 20200, y: 150, z: 9500 };

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

async function boot(opts: { center?: boolean; stone?: boolean } = {}) {
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
  ctx.anchors.define({ id: 'waystone.quenchstone', position: { x: 5, y: 0, z: 5 }, yaw: 0, tags: ['waystone'] });
  if (opts.stone !== false) ctx.anchors.define({ id: 'waystone.weeping-bellows', position: { x: 9000, y: 0, z: 9000 }, yaw: 0, tags: ['waystone'] });
  if (opts.center !== false) ctx.anchors.define({ id: 'mines.weeping-bellows.center', position: CENTER, yaw: 0 });
  ctx.services.provide('enemies' as never, { setWarmthTier: () => {} } as never);
  const interactables = new Map<string, Interactable>();
  const register = ctx.interaction.register.bind(ctx.interaction);
  ctx.interaction.register = (i: Interactable) => {
    interactables.set(i.id, i);
    return register(i);
  };
  const statuses = await game.loadPlugins(modules);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.fixedUpdate();
  };
  const emitted: { type: string; payload: any }[] = [];
  for (const type of ['puzzle.state', 'puzzle.solved', 'puzzle.failed', 'shrine.rekindled', 'buff.applied', 'buff.removed']) {
    (ctx.events as any).on(type, (payload: unknown) => emitted.push({ type, payload }));
  }
  return { game, ctx, statuses, run, interactables, emitted };
}
type T = Awaited<ReturnType<typeof boot>>;

const wheel = (t: T, n: number) => t.interactables.get(`valve:bellows-${n}`)!;
const player = (t: T) => t.ctx.actors.player;
const turnTo = (t: T, n: number, pos: number) => {
  for (let k = 0; k < 4 && positionOf(t, n) !== pos; k++) wheel(t, n).onInteract(player(t));
};
const positionOf = (t: T, n: number): number => {
  // Read back through the prompt params: position is 1-based.
  return (wheel(t, n).promptParams?.() as { position: number }).position - 1;
};
const solveRouting = (t: T) => PLAQUE.forEach((p, i) => turnTo(t, i + 1, p));
const surgeAt = (t: T, brazier: number) => {
  const a = (brazier / 6) * Math.PI * 2;
  t.ctx.player.teleport({ x: CENTER.x + Math.cos(a) * 7, y: CENTER.y + 1, z: CENTER.z + Math.sin(a) * 7 }, 0);
};
const PLAQUE = BELLOWS.plaque;

describe('Weeping Bellows plugin', () => {
  it('sets up cleanly, builds from the centre anchor and registers six valves and the plaque', async () => {
    const t = await boot();
    t.run(2);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    for (let n = 1; n <= 6; n++) expect(t.interactables.get(`valve:bellows-${n}`)?.kind).toBe('valve');
    expect(t.interactables.has('use:bellows-plaque')).toBe(true);
  });

  it('without the centre anchor it builds nothing and does not throw', async () => {
    const t = await boot({ center: false });
    expect(() => t.run(5)).not.toThrow();
    expect(t.interactables.has('valve:bellows-1')).toBe(false);
    t.ctx.anchors.define({ id: 'mines.weeping-bellows.center', position: CENTER, yaw: 0 });
    t.run(2);
    expect(t.interactables.has('valve:bellows-6')).toBe(true);
  });

  it('the plaque reads and sets its flag', async () => {
    const t = await boot();
    t.run(2);
    t.interactables.get('use:bellows-plaque')!.onInteract(player(t));
    expect(t.ctx.state.getBool('world.bellows.plaqueRead')).toBe(true);
  });

  it('the first valve turn starts the HUD clock under the id the pressure bar reads, and the clock counts down', async () => {
    const t = await boot();
    t.run(2);
    const puzzles = t.ctx.services.require('puzzles');
    expect(puzzles.pressure('weeping-bellows')).toBeNull();
    wheel(t, 1).onInteract(player(t));
    expect(t.emitted.filter((e) => e.type === 'puzzle.state').at(-1)!.payload).toEqual({ id: 'weeping-bellows', phase: 'pressure' });
    expect(puzzles.pressure('weeping-bellows')).toEqual({ remaining: 45, total: 45 });
    t.run(60 * 10);
    expect(puzzles.pressure('weeping-bellows')!.remaining).toBeCloseTo(35, 0);
  });

  it('wrong routing for 45 s fails, resets the valves and sets no flags', async () => {
    const t = await boot();
    t.run(2);
    wheel(t, 1).onInteract(player(t));
    t.run(60 * 46);
    expect(t.emitted.some((e) => e.type === 'puzzle.failed')).toBe(true);
    expect(t.ctx.services.require('puzzles').pressure('weeping-bellows')).toBeNull();
    expect(positionOf(t, 1)).toBe(initialRouting()[0]);
    expect(t.ctx.state.getBool('world.bellows.solved')).toBe(false);
    expect(t.ctx.state.getBool('shrine.weeping-bellows.lit')).toBe(false);
  });

  it('death, a load and fast travel each reset a puzzle in progress', async () => {
    const t = await boot();
    t.run(2);
    const puzzles = t.ctx.services.require('puzzles');
    wheel(t, 1).onInteract(player(t));
    t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined });
    expect(puzzles.pressure('weeping-bellows')).toBeNull();
    wheel(t, 1).onInteract(player(t));
    t.ctx.events.emit('save.loaded', {} as never);
    expect(puzzles.pressure('weeping-bellows')).toBeNull();
    wheel(t, 1).onInteract(player(t));
    let travelling = true;
    Object.defineProperty(t.ctx.services.require('waystones'), 'travelling', { get: () => travelling, configurable: true });
    t.run(3);
    expect(puzzles.pressure('weeping-bellows')).toBeNull();
    travelling = false;
    expect(positionOf(t, 1)).toBe(initialRouting()[0]);
  });

  it('a correct routing then braziers in order solves: flags, W, Blessing and events', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('shrine.quenchstone.lit', true);
    solveRouting(t);
    expect(t.emitted.filter((e) => e.type === 'puzzle.state').at(-1)!.payload.phase).toBe('lighting');
    for (const b of BELLOWS.order) {
      surgeAt(t, b);
      t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
    }
    expect(t.emitted.some((e) => e.type === 'puzzle.solved')).toBe(true);
    expect(t.ctx.state.getBool('world.bellows.solved')).toBe(true);
    expect(t.ctx.state.getBool('world.bellows.shortcutOpen')).toBe(true);
    expect(t.ctx.state.getBool('shrine.weeping-bellows.lit')).toBe(true);
    expect(t.ctx.services.require('warmth').tier()).toBe(2);
    expect(t.ctx.services.require('bellowsBlessing').active()).toBe(true);
    expect(t.emitted.some((e) => e.type === 'buff.applied' && e.payload.id === 'shrine.bellows-blessing')).toBe(true);
  });

  it('a Surge out of order or away from a brazier does not solve; a Surge before routing does nothing', async () => {
    const t = await boot();
    t.run(2);
    surgeAt(t, 0);
    t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
    solveRouting(t);
    surgeAt(t, 3);
    t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
    t.ctx.events.emit('spell.released', { casterId: 'wolf', spellId: 'heartshard-surge' });
    t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'rally-cry' });
    expect(t.emitted.some((e) => e.type === 'puzzle.solved')).toBe(false);
    expect(t.ctx.state.getBool('world.bellows.solved')).toBe(false);
  });

  it('with no shaft-head stone the shrine still lights on solve', async () => {
    const t = await boot({ stone: false });
    t.run(2);
    solveRouting(t);
    for (const b of BELLOWS.order) {
      surgeAt(t, b);
      t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
    }
    expect(t.ctx.state.getBool('shrine.weeping-bellows.lit')).toBe(true);
  });

  it('the shaft-head stone refuses a rekindle by hand until solved (lock), and no early shrine flag from a script', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.services.require('waystones').rekindle('weeping-bellows', 'script');
    expect(t.ctx.state.getBool('shrine.weeping-bellows.lit')).toBe(false);
    expect(WAYSTONE_LOCKS['weeping-bellows']).toBe('world.bellows.solved');
  });

  it('hold-F on the locked shaft-head stone refuses and lights nothing; after the solve it is usable', async () => {
    const t = await boot();
    t.run(3);
    t.ctx.state.setFlag('tutorial.heartshard-awakened', true);
    const stone = t.interactables.get('waystone:weeping-bellows')!;
    stone.onInteract(player(t));
    expect(t.ctx.state.getBool('shrine.weeping-bellows.lit')).toBe(false);
    expect(t.ctx.services.require('waystones').isLit('weeping-bellows')).toBe(false);
    solveRouting(t);
    for (const b of BELLOWS.order) {
      surgeAt(t, b);
      t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
    }
    expect(t.ctx.services.require('waystones').isLit('weeping-bellows')).toBe(true);
  });

  it('a solved puzzle re-derives on load: valves at the plaque and locked, shrine and W lit', async () => {
    const t = await boot();
    t.run(2);
    t.ctx.state.setFlag('world.bellows.solved', true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(positionOf(t, 1)).toBe(PLAQUE[0]);
    expect(wheel(t, 1).enabled?.()).toBe(false);
    expect(t.ctx.services.require('puzzles').pressure('weeping-bellows')).toBeNull();
  });

  it('only the player counts: another actor dying does not reset the puzzle', async () => {
    const t = await boot();
    t.run(2);
    wheel(t, 1).onInteract(player(t));
    t.ctx.events.emit('actor.died', { actorId: 'wolf-1', killerId: null, kind: 'wolf', team: 'hostile', level: 1, spawnTag: undefined } as never);
    expect(t.ctx.services.require('puzzles').pressure('weeping-bellows')).not.toBeNull();
  });
});

describe('Bellows Blessing', () => {
  const hit = (t: T, extra: Record<string, unknown>, amount = 100, target = 'player') => {
    const before = t.ctx.actors.get(target)!.health;
    t.ctx.damage.apply({ attackerId: null, targetId: target, amount, kind: 'script', ...extra } as never);
    return before - t.ctx.actors.get(target)!.health;
  };

  it('takes 15% off ignite ticks and fire-tagged hits only while active, and not off other damage', async () => {
    const t = await boot();
    t.run(2);
    player(t).health = player(t).maxHealth;
    const plain = hit(t, {}, 10);
    player(t).health = player(t).maxHealth;
    solveBlessing(t);
    const fire = hit(t, { element: 'fire' }, 20);
    const ignite = hit(t, { kind: 'status', statusKind: 'ignite', statusId: 's' }, 20);
    const other = hit(t, {}, 20);
    expect(plain).toBeGreaterThan(0);
    expect(fire).toBeCloseTo(17, 5);
    expect(ignite).toBeCloseTo(17, 5);
    expect(other).toBeCloseTo(20, 5);
  });

  it('expires after 30 minutes and persists', async () => {
    const t = await boot();
    t.run(2);
    solveBlessing(t);
    const svc = t.ctx.services.require('bellowsBlessing');
    expect(svc.active()).toBe(true);
    const saved = t.ctx.persist.get('shrine.bellowsBlessing')!.serialize();
    expect(saved).toMatchObject({ remaining: expect.any(Number) });
    t.run(60 * 60 * 30 + 5);
    expect(svc.active()).toBe(false);
    expect(t.emitted.some((e) => e.type === 'buff.removed' && e.payload.id === 'shrine.bellows-blessing')).toBe(true);
    t.ctx.persist.get('shrine.bellowsBlessing')!.load(saved, 1);
    expect(svc.active()).toBe(true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(svc.active()).toBe(true);
    t.ctx.events.emit('save.loaded', {} as never);
    expect(svc.active()).toBe(false); // the next load carries no entry
  });
});

const solveBlessing = (t: T) => {
  solveRouting(t);
  for (const b of BELLOWS.order) {
    surgeAt(t, b);
    t.ctx.events.emit('spell.released', { casterId: 'player', spellId: 'heartshard-surge' });
  }
};
