import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import chasePlugin from '../chase/chase.plugin';
import { m10FixtureRoute } from '../chase/testing/m10Fixture';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import stealthPlugin from './stealth.plugin';

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** Fakes for the services the plugins read: quests, save holds, enemies with thread 5's perception hook. */
function fakes() {
  const quests = new Map<string, { state: string; done: Set<string>; current?: string }>();
  const holds = new Set<string>();
  const checkpoints: string[] = [];
  const providers: { modifiers(t: string, o: unknown): unknown }[] = [];
  const guardStates = new Map<string, { awareness: number; sees: boolean; hears: boolean; distance: number }>();
  const plugin: GamePlugin = {
    id: 'fakes',
    dependsOn: ['core'],
    setup(ctx) {
      const s = ctx.services as unknown as { provide(n: string, v: unknown): void };
      s.provide('quests', {
        state: (id: string) => quests.get(id)?.state ?? 'inactive',
        objectiveDone: (id: string, o: string) => quests.get(id)?.done.has(o) ?? false,
        isObjectiveCurrent: (id: string, o: string) => quests.get(id)?.current === o,
      });
      let seq = 0;
      s.provide('save', {
        suspend: (reason: string) => {
          const k = `${reason}#${++seq}`;
          holds.add(k);
          return () => holds.delete(k);
        },
        checkpoint: (reason: string) => (checkpoints.push(reason), Promise.resolve({ ok: true })),
      });
      s.provide('enemies', {
        alive: (g: string) => (g === 'stealth.m06.watch' ? [...guardStates.keys()] : []),
        reset: () => {},
        spawnGroup: () => [],
        perception: {
          register: (p: (typeof providers)[number]) => (providers.push(p), () => providers.splice(providers.indexOf(p), 1)),
          state: (id: string) => guardStates.get(id) ?? null,
        },
      });
      // Thread 17's M06 anchors, on the flat spawn meadow.
      const at = (id: string, x: number, z: number) => ctx.anchors.define({ id, position: { x, y: heightAt(x, z), z }, yaw: 0 });
      at('stealth.m06.start', 20, 0);
      at('stealth.m06.cp.inside', 30, 0);
      at('stealth.m06.end', 45, 0);
      at('hide.m06.1', 32, 6);
      // A chase route north of the section, on one flat base height (the roofs keep their relative heights).
      const base = heightAt(-100, -80);
      for (const n of m10FixtureRoute()) {
        ctx.anchors.define({ id: n.id, position: { x: n.position.x - 100, y: base + n.position.y, z: n.position.z - 80 }, yaw: 0, tags: [n.kind] });
        if (n.detour) ctx.anchors.define({ id: `${n.id}.detour`, position: { x: n.detour.x - 100, y: base + n.detour.y, z: n.detour.z - 80 }, yaw: 0 });
      }
    },
  };
  return { plugin, quests, holds, checkpoints, providers, guardStates };
}

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
  const f = fakes();
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(modules(corePlugin, f.plugin, stealthPlugin, chasePlugin));
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const key = (type: 'keydown' | 'keyup', code: string) => win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} }));
  const teleport = (x: number, z: number) => {
    const h = ctx.player.teleport({ x, y: heightAt(x, z), z });
    for (let i = 0; i < 600 && !h.ready(); i++) run(1);
    run(2);
  };
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, f, statuses, run, of, key, teleport, done };
}

describe('stealth and chase plugins on the real core', () => {
  it('load, provide their services and register the perception provider', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    t.run(1);
    expect(t.f.providers).toHaveLength(1);
    expect(t.ctx.services.get('stealth')?.active()).toBe(false);
    expect(t.ctx.services.get('chase')?.active()).toBe(false);
    t.done();
  });

  it('holding left Alt sneaks: sprint locked, provider returns sneak modifiers for the player only', async () => {
    const t = await boot();
    t.run(1);
    expect(t.f.providers[0].modifiers('player', {})).toBeNull();
    t.key('keydown', 'AltLeft');
    t.run(2);
    expect(t.ctx.services.get('stealth')?.sneaking()).toBe(true);
    expect(t.f.providers[0].modifiers('player', {})).toMatchObject({ sightRangeScale: 0.5 });
    expect(t.f.providers[0].modifiers('npc:x', {})).toBeNull();
    expect(t.ctx.services.get('stealth')?.noise()).toBe(0); // still: silent
    t.key('keyup', 'AltLeft');
    t.run(2);
    expect(t.ctx.services.get('stealth')?.sneaking()).toBe(false);
    t.done();
  });

  it('M06 section: quest-derived, holds the save, checkpoint save, cleared on o2, dispose releases', async () => {
    const t = await boot();
    t.teleport(30, 0);
    expect(t.of('stealth.section')).toEqual([]); // M06 not active
    t.f.quests.set('m06', { state: 'active', done: new Set(), current: 'o2' });
    t.run(2);
    expect(t.of('stealth.section').at(-1)).toEqual({ sectionId: 'm06.south-gate', phase: 'entered' });
    expect(t.f.checkpoints).toEqual(['stealth:gate.inside']);
    expect(t.of('stealth.checkpoint').at(-1)).toEqual({ sectionId: 'm06.south-gate', checkpointId: 'gate.inside' });
    expect(t.f.holds.size).toBe(1);
    expect(t.ctx.services.get('stealth')?.eye()).toMatchObject({ state: 'calm' });
    t.f.quests.get('m06')!.done.add('o2'); // a bribe settled it
    t.run(1);
    expect(t.of('stealth.section').at(-1)).toEqual({ sectionId: 'm06.south-gate', phase: 'exited' });
    expect(t.f.holds.size).toBe(0);
    t.f.quests.get('m06')!.done.delete('o2');
    t.run(1);
    expect(t.f.holds.size).toBe(1);
    t.done();
    expect(t.f.holds.size).toBe(0);
  });

  it('a watch guard spotting the player maps to stealth.noticed and a long look catches', async () => {
    const t = await boot();
    t.f.quests.set('m06', { state: 'active', done: new Set(), current: 'o2' });
    t.f.guardStates.set('guard-1', { awareness: 0, sees: false, hears: false, distance: 9 });
    t.teleport(30, 0);
    t.ctx.events.emit('ai.spotted' as never, { actorId: 'guard-1', targetId: 'player' } as never);
    expect(t.of('stealth.noticed')).toEqual([{ observerId: 'guard-1', sectionId: 'm06.south-gate', level: 1 }]);
    t.f.guardStates.set('guard-1', { awareness: 1, sees: true, hears: false, distance: 9 });
    t.run(80);
    expect(t.of('stealth.caught')[0]).toEqual({ observerId: 'guard-1', sectionId: 'm06.south-gate', checkpointId: 'gate.inside' });
    t.done();
  });

  it('the persisted checkpoint round-trips through the stealth persistable', async () => {
    const t = await boot();
    t.f.quests.set('m06', { state: 'active', done: new Set(), current: 'o2' });
    t.teleport(30, 0);
    const p = t.ctx.persist.all().find((x) => x.key === 'stealth')!;
    expect(p.version).toBe(1);
    expect(p.serialize()).toEqual({ checkpoints: { 'm06.south-gate': 'gate.inside' } });
    p.load({ checkpoints: {} }, 1);
    expect(p.serialize()).toEqual({ checkpoints: {} });
    t.done();
  });

  it('M10 chase: starts standing at node 0, holds, a dialogue aborts it with chase.lost, load leaves it idle', async () => {
    const t = await boot();
    const start = t.ctx.anchors.get('chase.m10.0').position;
    t.teleport(start.x, start.z);
    expect(t.of('chase.started')).toEqual([]);
    t.f.quests.set('m10', { state: 'active', done: new Set(), current: 'o2' });
    t.run(1);
    expect(t.of('chase.started')).toEqual([{ chaseId: 'm10.rooftops' }]);
    expect(t.ctx.services.get('chase')?.active()).toBe(true);
    const timer = t.ctx.services.get('chase')?.timer();
    expect(timer?.phase).toBe('running');
    expect(timer?.total).toBeGreaterThan(30);
    expect([...t.f.holds].some((h) => h.startsWith('chase'))).toBe(true);
    t.ctx.events.emit('dialogue.started', { dialogueId: 'x', npcId: 'y' });
    expect(t.of('chase.lost').at(-1)).toEqual({ chaseId: 'm10.rooftops', reason: 'distance' });
    expect(t.ctx.services.get('chase')?.active()).toBe(false);
    t.ctx.events.emit('save.loaded', { slot: 'auto' });
    expect(t.ctx.services.get('chase')?.active()).toBe(false);
    t.done();
    expect(t.f.holds.size).toBe(0);
  });

  it('M10 chase: never starts while a dialogue is open, and before the briefing objective', async () => {
    const t = await boot();
    const start = t.ctx.anchors.get('chase.m10.0').position;
    t.teleport(start.x, start.z);
    t.f.quests.set('m10', { state: 'active', done: new Set(), current: 'o1' });
    t.run(2);
    expect(t.of('chase.started')).toEqual([]);
    t.f.quests.get('m10')!.current = 'o2';
    const pop = t.ctx.input.contexts.push('dialogue', 'test');
    t.run(2);
    expect(t.of('chase.started')).toEqual([]);
    pop();
    t.run(1);
    expect(t.of('chase.started')).toEqual([{ chaseId: 'm10.rooftops' }]);
    t.done();
  });
});
