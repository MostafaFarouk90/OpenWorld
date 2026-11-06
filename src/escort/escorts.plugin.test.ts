import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import escortsPlugin, { escortEngine } from './escorts.plugin';
import { ESCORT_ENGINE } from './EscortEngine';

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('escorts plugin', () => {
  it('provides escorts (L0 interface) and escortsAct4, registers its persistable and strings, inert by default', async () => {
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const w = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
    const input = new InputManager(element, new EventTarget(), doc, { storage: null });
    const game = new Game({ scene, physics, world: w, input, moveModifiers, report: () => {} });
    const mods: Record<string, PluginModule> = Object.fromEntries([corePlugin, escortsPlugin].map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));
    await game.loadPlugins(mods);
    const ctx = game.ctx;
    expect(ctx.services.get('escorts')?.active()).toBeNull();
    expect(ctx.services.get('escortsAct4')).toBe(escortEngine());
    expect(ctx.persist.all().some((p) => p.key === ESCORT_ENGINE.persistKey)).toBe(true);
    expect(ctx.strings.t('escort.callout', { name: 'Edric' })).toMatch(/Edric/);
    for (let i = 0; i < 30; i++) game.fixedUpdate();
    expect(ctx.services.require('movementMode').current).toBe('walk');
    game.dispose();
    w.dispose();
    expect(escortEngine()).toBeNull();
  }, 30_000);
});
