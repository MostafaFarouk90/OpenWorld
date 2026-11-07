// The siege's test rig: a real Game (core, real damage and combat), the waves kit's fake enemies, the waves and siege
// plugins, and small fakes for the services the siege reads (weather, companions, inventory, quests, dialogue).
import * as THREE from 'three';
import { Game } from '../core/Game';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { fakeEnemies, secs, TICK } from '../waves/testKit';
import type { WaveDirector } from '../waves/director';
import wavesPlugin from '../waves/waves.plugin';
import siegePlugin, { type SiegeController } from './siege.plugin';
import { applySiegePreset, defineSiegeStandIns } from './siege.dev.plugin';
import { snapshotFlag, FAVOUR_TRACKS } from '../state/favour';
import type { SiegeId } from './roster';
import type { StormArea } from '../weather/types';
import { inStormArea } from '../weather/types';

export { TICK, secs };

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

export function fakeWeather() {
  const log: string[] = [];
  const clears = new Map<number, string>();
  const storms = new Map<number, { reason: string; area?: StormArea }>();
  const zones = new Map<string, { at: { x: number; z: number }; radius: number }>();
  let n = 0;
  const service = {
    state: () => ({ kind: storms.size > 0 && clears.size === 0 ? 'storm' : 'clear', t: 0, forced: storms.size > 0, held: clears.size > 0 }),
    forceStorm: (reason: string, opts?: { area: StormArea }) => {
      const k = ++n;
      storms.set(k, { reason, area: opts?.area });
      log.push(`storm:${reason}`);
      return () => void storms.delete(k);
    },
    holdClear: (reason: string) => {
      const k = ++n;
      clears.set(k, reason);
      log.push(`clear:${reason}`);
      return () => void clears.delete(k);
    },
    clock: { seed: 1, next: () => ({ kind: 'clear', at: 1e9 }) },
    onShelter: () => false,
    addShelterZone: (z: { id: string; at: { x: number; z: number }; radius: number }) => {
      zones.set(z.id, z);
      return () => void zones.delete(z.id);
    },
  };
  return {
    service,
    log,
    clears,
    storms,
    zones,
    storming: () => storms.size > 0,
    covers: (x: number, z: number) => [...storms.values()].some((s) => s.area && inStormArea(s.area, x, z)),
  };
}

export function fakeCompanions(party: string[]) {
  const sitting = new Map<string, string>();
  const service = {
    active: () => [...party],
    sitOut: (id: string, anchor: string) => {
      sitting.set(id, anchor);
      return () => void sitting.delete(id);
    },
  };
  return { service, sitting };
}

export function fakeInventory(known: readonly string[] = ['healing-flask']) {
  const counts = new Map<string, number>();
  return {
    counts,
    service: {
      add: (id: string, n: number) => {
        if (!known.includes(id)) return 0;
        counts.set(id, (counts.get(id) ?? 0) + n);
        return n;
      },
      count: (id: string) => counts.get(id) ?? 0,
    },
  };
}

export interface SiegeKitOptions {
  preset?: 'marshal' | 'keepers' | 'worst' | 'none';
  flags?: Record<string, string | number | boolean>;
  party?: string[];
  r29?: boolean;
  anchors?: boolean;
  /** Fake inventory knows these ids (default the shipped flask only). */
  items?: readonly string[];
  /** The real enemies plugin (real brains, taunts and dormancy) in place of the waves kit's fake, with this asset loader. */
  realEnemies?: { plugin: GamePlugin; assets: unknown };
  /** A fake `interiors` service reporting Cael inside this interior (R27's set runs only in the tunnel). */
  interior?: string;
}

export async function makeSiegeKit(physics: PhysicsWorld, opts: SiegeKitOptions = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    // The real enemies sleep off resident collider patches: their runs stream 200 m and more round Cael, as the game's 200 m patches do.
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16, ...(opts.realEnemies ? { radius: 4 } : {}) }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const assets = (opts.realEnemies?.assets ?? null) as ConstructorParameters<typeof Game>[0]['assets'];
  const game = new Game({ scene, physics, world, input, moveModifiers, assets, cameraRig: null, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const weather = fakeWeather();
  const companions = fakeCompanions(opts.party ?? ['aelfreda', 'hrolf']);
  const inventory = fakeInventory(opts.items);
  const dialogues: string[] = [];
  const travel = { value: false };
  const quests = { r29: opts.r29 ? 'completed' : 'inactive' };
  const provide = (id: string, value: unknown): GamePlugin => ({
    id: `fake-${id}`,
    dependsOn: ['core'],
    setup: (c) => void (c.services.provide as (n: string, v: unknown) => void)(id, value),
  });
  await game.loadPlugins(
    modules(
      corePlugin,
      opts.realEnemies?.plugin ?? enemies.plugin,
      wavesPlugin,
      siegePlugin,
      provide('weather', weather.service),
      provide('companions', companions.service),
      provide('inventory', inventory.service),
      provide('quests', { state: (id: string) => (quests as Record<string, string>)[id] ?? 'inactive' }),
      provide('waystones', { get travelling() { return travel.value; } }),
      ...(opts.interior ? [provide('interiors', { current: opts.interior })] : []),
      provide('dialogue', { start: (id: string) => (dialogues.push(id), true), active: false, close: () => {}, hasSeen: () => false }),
    ),
  );
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const f = ctx.player.feet.clone();
  const at = { x: f.x, y: f.y, z: f.z };
  const preset = opts.preset ?? 'marshal';
  if (preset !== 'none') applySiegePreset(ctx, preset);
  for (const [k, v] of Object.entries(opts.flags ?? {})) ctx.state.setFlag(k, v);
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const siege = () => ctx.services.require('siege') as unknown as SiegeController;
  const director = () => ctx.services.require('waves') as unknown as WaveDirector;
  const standIns = (id: SiegeId = 'm52') => defineSiegeStandIns(ctx, id, at);
  if (opts.anchors !== false) standIns('m52');
  return {
    game, ctx, world, events, of, run, runSecs: (s: number) => run(secs(s)), enemies, weather, companions, inventory, quests, dialogues,
    siege, director, at, standIns, travel,
    /** Stand-ins round another point (the gate 14 m ahead of it, -Z). */
    standInsFrom: (id: SiegeId, from: { x: number; y: number; z: number }) => defineSiegeStandIns(ctx, id, from),
    clearEvents: () => void events.splice(0),
    teardown: () => {
      game.dispose();
      world.dispose();
    },
  };
}

export type SiegeKit = Awaited<ReturnType<typeof makeSiegeKit>>;

/** Writes an M52 snapshot directly (every track at `value`). */
export function setSnapshot(k: SiegeKit, values: Partial<Record<(typeof FAVOUR_TRACKS)[number], number>>, base = 0): void {
  for (const t of FAVOUR_TRACKS) k.ctx.state.setFlag(snapshotFlag('m52', t), values[t] ?? base);
  k.ctx.state.setFlag(snapshotFlag('m52', 'taken'), true);
}

/** Kills every live wave member for the player, and every live cart. */
export function clearWave(k: SiegeKit): void {
  for (const id of k.director().members) if (!k.ctx.actors.get(id)?.dead) k.ctx.damage.kill(id, 'player');
  for (const c of k.director().parts?.carts.all ?? []) if (c.active) k.ctx.damage.kill(c.actor.id, 'player');
}

/** Runs until `pred` holds, clearing the field every half second (fails after `max` seconds). */
export function runUntil(k: SiegeKit, pred: () => boolean, max = 600, clear = true): void {
  for (let i = 0; i < secs(max); i++) {
    if (pred()) return;
    if (clear && i % 30 === 0) clearWave(k);
    k.ctx.player.actor.health = k.ctx.player.actor.maxHealth;
    k.run(1);
  }
  throw new Error('runUntil: timed out');
}
