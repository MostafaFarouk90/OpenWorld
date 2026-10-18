// Phase B: Tobb's quest-derived waits and horseback following (plans/slice-2-tobb-phase-b.md and its review).
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import companionsPlugin from './companions.plugin';
import { TOBB } from './tobb';
import { COMPANION_TUNING } from './tuning';
import './types';

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const JOIN = TOBB.joinFlag;
const GATE = 'npc-post.tobb.south-gate';
const KEEP = 'npc-post.tobb.keep';
const INN = 'npc-post.tobb.tilted-anvil';

type V = { x: number; y: number; z: number };

/** Stand-ins for threads 6 (quests) and 3a (interiors), plus the three wait posts. */
function world(opts: { anchors?: string[] } = {}) {
  const quests = {
    states: new Map<string, string>(),
    done: new Set<string>(),
  };
  const boxes: { id: string; x: number; z: number; floor: number }[] = [];
  const interiors = {
    current: null as string | null,
    transitioning: false,
    interiorAt: (p: V) =>
      boxes.find((b) => Math.abs(p.x - b.x) < 20 && Math.abs(p.z - b.z) < 20 && p.y > b.floor - 5)?.id ?? null,
  };
  const posts: Record<string, { position: V; yaw: number }> = {};
  const plugin: GamePlugin = {
    id: 'fake-harrowmark',
    dependsOn: ['core'],
    setup(ctx) {
      const f = ctx.player.feet;
      const at = (dx: number, dz: number): V => ({ x: f.x + dx, y: heightAt(f.x + dx, f.z + dz), z: f.z + dz });
      // The player starts facing yaw 0 (-Z); the posts sit behind him (+Z), out of view.
      posts[GATE] = { position: at(5, 30), yaw: 0.5 };
      posts[KEEP] = { position: at(-6, 20), yaw: -1 };
      const inn = { x: f.x + 400, z: f.z, floor: heightAt(f.x + 400, f.z) + 150 };
      boxes.push({ id: 'tilted-anvil', ...inn });
      posts[INN] = { position: { x: inn.x, y: inn.floor, z: inn.z }, yaw: 2 };
      for (const id of opts.anchors ?? [GATE, KEEP, INN]) ctx.anchors.define({ id, ...posts[id] });
      ctx.services.provide('quests', {
        get: (id: string) => (quests.states.has(id) ? ({ id } as never) : undefined),
        state: (id: string) => quests.states.get(id) ?? 'inactive',
        objectiveDone: (q: string, o: string) => quests.done.has(`${q}.${o}`),
        onChange: () => () => {},
      } as never);
      ctx.services.provide('interiors' as never, interiors as never);
    },
  };
  return { plugin, quests, interiors, posts, boxes };
}

async function boot(plugins: GamePlugin[]) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const w = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world: w, input, moveModifiers, report: () => {} });
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const mods: Record<string, PluginModule> = Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));
  await game.loadPlugins(mods);
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const root = () => ctx.actors.get(svc().actorId('tobb')!)!.root!;
  const pos = () => root().position.clone();
  const dist = (p: V) => {
    const q = pos();
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  };
  const distToPlayer = () => dist(ctx.player.feet);
  const teleportPlayer = (x: number, z: number, yaw?: number) => {
    const h = ctx.player.teleport({ x, y: heightAt(x, z), z }, yaw);
    for (let i = 0; i < 600 && !h.ready(); i++) run(1);
  };
  const done = () => {
    game.dispose();
    w.dispose();
  };
  return { game, w, ctx, run, of, svc, root, pos, dist, distToPlayer, teleportPlayer, done };
}

async function joined(opts: { anchors?: string[]; extra?: GamePlugin[] } = {}) {
  const env = world(opts);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const t = await boot([corePlugin, env.plugin, ...(opts.extra ?? []), companionsPlugin]);
  t.ctx.state.setFlag(JOIN, true);
  t.run(60);
  return { ...t, ...env, warn };
}

/** Thread 2's hook, so Battle-song can be observed. */
function hookPlugin() {
  const calls: string[] = [];
  const plugin: GamePlugin = {
    id: 'fake-verbs',
    dependsOn: ['core'],
    setup(ctx) {
      ctx.services.provide('combatVerbs' as never, {
        addAttackSpeedMultiplier(id: string) {
          calls.push(id);
          return () => {};
        },
      } as never);
    },
  };
  return { plugin, calls };
}

const waiting = (t: { ctx: any }) => (t.ctx as any).__tobbWaiting;

describe('Tobb waits: the South Gate (M06 until objective 2)', () => {
  it('waits at the post while Cael walks 200 m away, ignores fast travel and respawns, and rejoins by teleport at o2', async () => {
    const t = await joined();
    expect(t.distToPlayer()).toBeLessThan(5);
    t.quests.states.set('m06', 'active');
    t.run(1);
    expect(t.dist(t.posts[GATE].position)).toBeLessThan(0.01);
    expect(t.root().rotation.y).toBeCloseTo(0.5);
    expect(t.root().visible).toBe(true);

    const f = t.ctx.player.feet;
    t.teleportPlayer(f.x - 200, f.z);
    t.ctx.events.emit('fastTravel', { from: 'a', to: 'b' } as never);
    t.ctx.events.emit('player.respawned', { source: 'test' });
    t.ctx.events.emit('interior.exited', { interiorId: 'x', doorId: 'y' });
    t.run(180);
    expect(t.dist(t.posts[GATE].position)).toBeLessThan(0.01);

    // M06 stays active through the brazier and Rook, but the wait ends once the gate is passed.
    t.quests.done.add('m06.o2');
    t.run(2);
    expect(t.distToPlayer()).toBeLessThan(5);
    expect(t.root().visible).toBe(true);
    t.done();
  });

  it('a 30 m exit in the same space walks back instead of popping', async () => {
    const t = await joined();
    t.quests.states.set('m06', 'active');
    t.run(1);
    const g = t.posts[GATE].position;
    t.teleportPlayer(g.x, g.z - 30);
    t.quests.done.add('m06.o2');
    t.run(1);
    expect(t.dist(g)).toBeLessThan(0.5);
    let maxStep = 0;
    let prev = t.pos();
    for (let i = 0; i < 600; i++) {
      t.run(1);
      maxStep = Math.max(maxStep, t.pos().distanceTo(prev));
      prev = t.pos();
    }
    expect(maxStep).toBeLessThan(0.5);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a post in view is taken only once he is out of view, or after the 10 s limit', async () => {
    const t = await joined();
    // Face the post: Cael looks at +Z, so Tobb (behind) is out of view but the post is in view.
    const f = t.ctx.player.feet;
    t.teleportPlayer(f.x, f.z, Math.PI);
    t.run(60);
    t.quests.states.set('m06', 'active');
    t.run(60);
    expect(t.dist(t.posts[GATE].position)).toBeGreaterThan(1);
    t.run(Math.ceil(COMPANION_TUNING.handoffMaxSeconds * 60));
    expect(t.dist(t.posts[GATE].position)).toBeLessThan(0.01);
    t.done();
  });

  it('a door fade (interiors.transitioning) relocates him at once even in view', async () => {
    const t = await joined();
    const f = t.ctx.player.feet;
    t.teleportPlayer(f.x, f.z, Math.PI);
    t.run(30);
    t.quests.states.set('m06', 'active');
    t.interiors.transitioning = true;
    t.run(1);
    expect(t.dist(t.posts[GATE].position)).toBeLessThan(0.01);
    t.done();
  });
});

describe('Tobb waits: the Keep Hall (M08)', () => {
  it('waits outside while Cael is inside, ignoring interior events, and walks back when Cael comes out', async () => {
    const t = await joined();
    t.interiors.current = 'keep-hall';
    t.interiors.transitioning = true;
    t.run(1);
    expect(t.dist(t.posts[KEEP].position)).toBeLessThan(0.01);
    t.ctx.events.emit('interior.entered', { interiorId: 'keep-hall', doorId: 'keep-hall' });
    t.interiors.transitioning = false;
    t.run(120);
    expect(t.dist(t.posts[KEEP].position)).toBeLessThan(0.01);

    const k = t.posts[KEEP].position;
    t.teleportPlayer(k.x + 10, k.z);
    t.interiors.current = null;
    t.ctx.events.emit('interior.exited', { interiorId: 'keep-hall', doorId: 'keep-hall' });
    t.run(1);
    expect(t.dist(k)).toBeLessThan(0.5);
    t.run(300);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a missing post warns once and he keeps following', async () => {
    const t = await joined({ anchors: [GATE, INN] });
    t.interiors.current = 'keep-hall';
    t.interiors.transitioning = true;
    t.run(30);
    expect(t.distToPlayer()).toBeLessThan(5);
    const warnings = t.warn.mock.calls.filter((c) => String(c[0]).includes(KEEP));
    expect(warnings).toHaveLength(1);
    t.done();
  });
});

describe('Tobb waits: the Tilted Anvil (M09 stealth, M10 chase)', () => {
  it('M09 until objective 6 puts him at the hearth; chase events never release a chase wait; o3 ends it', async () => {
    const t = await joined();
    t.quests.states.set('m09', 'active');
    t.run(1);
    expect(t.dist(t.posts[INN].position)).toBeLessThan(0.01);
    t.quests.done.add('m09.o6');
    t.quests.states.set('m10', 'active');
    t.run(1);
    expect(t.dist(t.posts[INN].position)).toBeLessThan(0.01);
    t.ctx.events.emit('chase.started', { chaseId: 'm10.rooftops' });
    t.ctx.events.emit('chase.lost', { chaseId: 'm10.rooftops', reason: 'distance' });
    t.ctx.events.emit('stealth.section', { sectionId: 'm09.counting-house', phase: 'exited' });
    t.run(60);
    expect(t.dist(t.posts[INN].position)).toBeLessThan(0.01);
    // The post is in another space (the inn floats 150 m up): the exit is a teleport, never a walk.
    t.quests.done.add('m10.o3');
    t.run(2);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('stealth beats the Keep and the gate', async () => {
    const t = await joined();
    t.quests.states.set('m06', 'active');
    t.interiors.current = 'keep-hall';
    t.quests.states.set('m09', 'active');
    t.interiors.transitioning = true;
    t.run(1);
    expect(t.dist(t.posts[INN].position)).toBeLessThan(0.01);
    t.done();
  });

  it("with 3a's hider (render order 400) he is hidden while Cael is outside the inn and visible inside it", async () => {
    const t = await joined();
    t.quests.states.set('m09', 'active');
    t.run(1);
    t.ctx.systems.add({
      id: 'test.hider',
      renderPhase: 'world',
      order: 400,
      render: () => {
        const r = t.root();
        if (t.interiors.interiorAt(r.position) !== t.interiors.current) r.visible = false;
      },
    });
    t.game.render(0.5, 1 / 60);
    expect(t.root().visible).toBe(false);
    t.interiors.current = 'tilted-anvil';
    t.run(1);
    t.game.render(0.5, 1 / 60);
    expect(t.root().visible).toBe(true);
    expect(t.dist(t.posts[INN].position)).toBeLessThan(0.01);
    t.done();
  });
});

describe('Tobb waits: while waiting', () => {
  it('gives no Battle-song and no banter, but turns to face Cael while they talk', async () => {
    const hook = hookPlugin();
    const t = await joined({ extra: [hook.plugin] });
    t.quests.states.set('m06', 'active');
    t.run(1);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.ford.toll-post', actorId: t.ctx.player.actor.id });
    t.run(600);
    expect(hook.calls).toEqual([]);
    expect(t.of('companion.banter')).toEqual([]);

    t.ctx.events.emit('dialogue.started', { dialogueId: 'npc-tobb', npcId: 'tobb' });
    t.run(1);
    const p = t.pos();
    const f = t.ctx.player.feet;
    const face = Math.atan2(-(f.x - p.x), -(f.z - p.z));
    expect(Math.abs(Math.atan2(Math.sin(t.root().rotation.y - face), Math.cos(t.root().rotation.y - face)))).toBeLessThan(0.01);
    t.ctx.events.emit('dialogue.ended', { dialogueId: 'npc-tobb', npcId: 'tobb' });
    t.run(1);
    expect(t.root().rotation.y).toBeCloseTo(0.5);
    t.done();
  });

  it('a load mid-wait keeps him at the post and ignores the saved spot', async () => {
    const t = await joined();
    t.quests.states.set('m06', 'active');
    t.run(1);
    const f = t.ctx.player.feet;
    const spot = { x: f.x + 2, y: heightAt(f.x + 2, f.z + 2), z: f.z + 2, yaw: 1 };
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: { positions: { tobb: spot } } }], t.ctx.events, 'test');
    t.run(1);
    expect(t.dist(t.posts[GATE].position)).toBeLessThan(0.01);
    t.done();
  });

  it('a load while waiting into a state where the wait has ended puts him behind Cael (the 150 m-up spot is ignored)', async () => {
    const t = await joined();
    t.quests.states.set('m09', 'active');
    t.run(1);
    const saved = t.ctx.persist.get('companions')!.serialize();
    t.quests.done.add('m09.o6');
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: saved }], t.ctx.events, 'test');
    t.run(2);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a load straight into the Keep Hall applies the wait without a handoff delay', async () => {
    const t = await joined();
    t.interiors.current = 'keep-hall';
    t.ctx.persist.loadAll([], t.ctx.events, 'test');
    t.run(1);
    expect(t.dist(t.posts[KEEP].position)).toBeLessThan(0.01);
    t.done();
  });

  it('with no quests service he never waits for a quest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await boot([corePlugin, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(120);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });
});

describe('Tobb on horseback', () => {
  it('follows, is hidden quietly once 40 m back (no teleport loop) and reappears behind Cael on dismount', async () => {
    const t = await joined();
    t.ctx.events.emit('mount.mounted', { mountId: 'ashmare' });
    const f = { ...t.ctx.player.feet };
    let shownFar = 0;
    for (let i = 1; i <= 15 * 60; i++) {
      const x = f.x - i * 0.2;
      t.ctx.player.teleport({ x, y: heightAt(x, f.z), z: f.z }, Math.PI / 2);
      t.run(1);
      if (t.root().visible && t.distToPlayer() > COMPANION_TUNING.mountHideDistance + 2) shownFar++;
    }
    expect(t.root().visible).toBe(false);
    expect(shownFar).toBe(0);
    t.ctx.events.emit('mount.dismounted', { mountId: 'ashmare', reason: 'player' });
    t.run(2);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a load clears the mounted state (thread 20 re-emits mount.mounted for a mounted load)', async () => {
    const t = await joined();
    t.ctx.events.emit('mount.mounted', { mountId: 'ashmare' });
    t.ctx.persist.loadAll([], t.ctx.events, 'test');
    t.run(2);
    // Not mounted any more: a 60 m jump teleports him behind instead of hiding him.
    const f = t.ctx.player.feet;
    t.teleportPlayer(f.x - 60, f.z);
    t.run(3);
    expect(t.root().visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });
});

void waiting;
