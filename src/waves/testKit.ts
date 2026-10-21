import * as THREE from 'three';
import { Game } from '../core/Game';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { CINDERFORD_ANCHORS, CINDERFORD_RAID } from './defs/cinderford';
import { WaveDirector } from './director';
import { WAVE_SETS } from './defs';
import { defenderBodyFactory } from './defenders';
import enemiesPlugin from '../enemies/enemies.plugin';
import wavesPlugin from './waves.plugin';

export const TICK = 1 / 60;
export const secs = (s: number): number => Math.round(s / TICK);

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** The enemies service as the waves use it: spawnGroup(count:1) makes one hostile actor per call, reset despawns the group. */
export function fakeEnemies() {
  const live = new Map<string, string[]>();
  const calls: string[] = [];
  const states = new Map<string, string>();
  const spawnOpts: unknown[] = [];
  let ctx: Game['ctx'] | null = null;
  const service = {
    spawnGroup: (id: string, opts?: { aggro?: boolean; count?: number }) => {
      calls.push(`spawn:${id}`);
      spawnOpts.push(opts);
      const ids: string[] = [];
      for (let i = 0; i < (opts?.count ?? 1); i++) {
        const a = ctx!.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth: 40, maxPoise: 15, root: new THREE.Group(), spawnTag: 'm12' });
        ids.push(a.id);
      }
      live.set(id, [...(live.get(id) ?? []), ...ids]);
      return ids;
    },
    reset: (id: string) => {
      calls.push(`reset:${id}`);
      for (const a of live.get(id) ?? []) if (ctx!.actors.get(a)) ctx!.actors.despawn(a);
      live.delete(id);
    },
    alive: (id: string) => (live.get(id) ?? []).filter((a) => ctx!.actors.get(a) && !ctx!.actors.get(a)!.dead),
    despawnGroup: () => {},
    view: (id: string) => (states.has(id) ? { state: states.get(id) } : undefined),
  };
  const plugin: GamePlugin = {
    id: 'enemies',
    dependsOn: ['core'],
    setup(c) {
      ctx = c as Game['ctx'];
      c.services.provide('enemies', service as never);
    },
  };
  return { plugin, service, calls, states, spawnOpts, all: () => [...live.values()].flat() };
}

export interface KitOptions {
  /** Where the set stands relative to the player's start; default on top of the player. */
  at?: { x: number; z: number };
  withWaves?: boolean;
  /** Use the real enemies plugin (headless: no models) instead of the fake service. */
  realEnemies?: boolean;
  anchors?: boolean;
  interior?: { current: string | null };
  travelling?: { value: boolean };
  /** Replaces the player's feet as the director sees them (the headless world clamps a real far teleport). */
  feet?: { x: number; y: number; z: number };
}

/** A real Game (core plugin, real damage and combat) with the fake enemies and the waves plugin; anchors for Cinderford placed around `at`. */
export async function makeKit(physics: PhysicsWorld, opts: KitOptions = {}) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null, cameraRig: null, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const extra: GamePlugin[] = [];
  if (opts.interior) {
    const interior = opts.interior;
    extra.push({ id: 'interiors', dependsOn: ['core'], setup: (c) => void (c.services.provide as (n: string, v: unknown) => void)('interiors', { get current() { return interior.current; } }) });
  }
  if (opts.travelling) {
    const t = opts.travelling;
    extra.push({ id: 'waystones', dependsOn: ['core'], setup: (c) => void (c.services.provide as (n: string, v: unknown) => void)('waystones', { get travelling() { return t.value; } }) });
  }
  await game.loadPlugins(modules(corePlugin, opts.realEnemies ? enemiesPlugin : enemies.plugin, ...extra, ...(opts.withWaves === false ? [] : [opts.feet ? feetPlugin(opts.feet) : wavesPlugin])));
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const p0 = ctx.player.feet.clone();
  const at = opts.at ?? { x: p0.x, z: p0.z };
  const y = p0.y;
  if (opts.anchors !== false) defineCinderford(ctx, at, y);
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const waves = () => ctx.services.require('waves');
  const director = () => ctx.services.require('waves') as unknown as WaveDirector;
  const clearEvents = () => void events.splice(0);
  return {
    game, ctx, world, events, of, run, runSecs: (s: number) => run(secs(s)), enemies, waves, director, at, y, clearEvents,
    teardown: () => {
      game.dispose();
      world.dispose();
    },
  };
}

export type Kit = Awaited<ReturnType<typeof makeKit>>;

/**
 * Cinderford's anchors as the tests see them: the barricade line along z at `at`, lanes 50 m to the west (-x), the wyrm
 * approach further out, militia on the line.
 */
export function defineCinderford(ctx: Game['ctx'], at: { x: number; z: number }, y: number): void {
  const put = (id: string, x: number, z: number) => ctx.anchors.define({ id, position: { x: at.x + x, y, z: at.z + z }, yaw: 0 });
  CINDERFORD_ANCHORS.barricade.forEach((id, i) => put(id, 0, (i - 1.5) * 4));
  (['1', '2', '3'] as const).forEach((k, i) => put(CINDERFORD_ANCHORS.lanes[k], -50, (i - 1) * 10));
  put(CINDERFORD_ANCHORS.lanes.wyrm, -70, 0);
  CINDERFORD_ANCHORS.militia.forEach((id, i) => put(id, 1.5, (i - 2.5) * 2.5));
}

export { CINDERFORD_RAID };

/** The waves plugin with the player's feet replaced by `feet` (mutable). */
function feetPlugin(feet: { x: number; y: number; z: number }): GamePlugin {
  return {
    id: 'waves',
    dependsOn: ['core', 'enemies'],
    setup(ctx) {
      const host = Object.create(ctx, { player: { value: { get feet() { return feet; } } } });
      const d = new WaveDirector(host, { defs: WAVE_SETS, makeBody: defenderBodyFactory(null) });
      ctx.services.provide('waves', d);
      ctx.persist.register({ key: 'waves', version: 1, serialize: () => d.serialize(), load: (data, v) => d.load(data, v) });
      ctx.systems.add({ id: 'waves.director', fixedPhase: 'rules', order: 0, fixedUpdate: (dt) => d.fixedUpdate(dt) });
    },
  };
}
