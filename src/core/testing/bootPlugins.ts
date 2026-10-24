// Reduced test manifests (contracts v0.7 item 24, the Act 2 lesson): a test that boots plugins loads only what it reads
// plus its dependencies, with an explicit timeout; no Act 3 test boots all plugins.
import * as THREE from 'three';
import { Game } from '../Game';
import { MoveModifiers } from '../MoveModifiers';
import type { GamePlugin, PluginModule, PluginStatus } from '../plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';

/** The timeout (ms) a test that boots plugins passes to `it` / `describe`: at least 30 s. */
export const PLUGIN_TEST_TIMEOUT = 30_000;

export interface BootOptions {
  /** plugin ids to leave disabled */
  disabled?: Set<string>;
}

/** The module map the loader takes for exactly these plugins. */
export const pluginModules = (plugins: readonly GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** Loads exactly the given plugins (no closure is added: list the dependencies the test needs) and returns their statuses. */
export function bootPlugins(game: Game, plugins: GamePlugin[], opts: BootOptions = {}): Promise<PluginStatus[]> {
  return game.loadPlugins(pluginModules(plugins), opts.disabled ? { disabled: opts.disabled } : {});
}

/** A bare Game over a real physics world, as the plugin integration tests build one (call `physics.init()` first). */
export function makeTestGame(physics: PhysicsWorld): Game {
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
  return new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
}
