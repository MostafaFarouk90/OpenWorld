import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import type { GameEventMap } from '../../../core/events';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../core/plugins';
import { InputManager } from '../../../input/InputManager';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { YSMERYTH_HUB } from '../overlays';
import wyrmPlugin from '../wyrm.plugin';
import { YSMERYTH_IDS } from './def';
import ysmerythPlugin from './ysmeryth.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));
const enemiesStub: GamePlugin = { id: 'enemies', dependsOn: ['core'], setup() {} };

async function boot() {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const registered: string[] = [];
  const unlocked: string[] = [];
  const extra: GamePlugin = {
    id: 'stubs',
    dependsOn: ['core'],
    setup(ctx) {
      ctx.services.provide('codex', {
        unlock: (id: string) => void unlocked.push(id),
        has: () => false,
        open: () => {},
        register: (entries: { id: string }[]) => {
          registered.push(...entries.map((e) => e.id));
          return () => {};
        },
      } as never);
    },
  };
  const statuses = await game.loadPlugins(modules(corePlugin, enemiesStub, extra, wyrmPlugin, ysmerythPlugin));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) game.fixedUpdate();
  };
  return { game, ctx: game.ctx, scene, moveModifiers, of, run, statuses, registered, unlocked };
}

describe('ysmeryth plugin (K6a PR 2)', () => {
  it('sets up: the ysmeryth service, her codex entry and strings, the hub; dispose clears the hub', { timeout: 60_000 }, async () => {
    const h = await boot();
    expect(h.statuses.find((s) => s.id === 'ysmeryth')?.state).toBe('ok');
    const svc = h.ctx.services.get('ysmeryth')!;
    expect(svc.actorId).toBeNull();
    expect(svc.airborne).toBe(false);
    expect(svc.scenePose).toBeNull();
    h.run(0.1);
    expect(h.registered).toContain(YSMERYTH_IDS.codexId);
    expect(h.ctx.strings.t('codex.lore.ysmeryth.name')).toBe('Ysmeryth the Coal-Mother');
    expect(typeof YSMERYTH_HUB.callAllowed).toBe('function');
    h.game.dispose();
    expect(YSMERYTH_HUB.callAllowed).toBeUndefined();
  });

  it('failure: beginTrial without the roost anchors or the trials service is refused (a warning, no throw)', { timeout: 60_000 }, async () => {
    const h = await boot();
    expect(h.ctx.services.get('ysmeryth')!.beginTrial()).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ysmeryth.beginTrial'));
    h.game.dispose();
  });

  it('the Hearth perch follows story.m31.complete; K13 poses through the service, emitted as wyrm.ysmeryth pose beats; a load resets', { timeout: 60_000 }, async () => {
    const h = await boot();
    for (const [i, id] of Object.values(YSMERYTH_IDS.hearth).entries()) h.ctx.anchors.define({ id, position: { x: i * 20, y: 30, z: 0 }, yaw: 0 });
    const svc = h.ctx.services.get('ysmeryth')!;
    h.run(0.1);
    expect(svc.scenePose).toBeNull();
    h.ctx.state.setFlag(YSMERYTH_IDS.m31Complete, true);
    h.run(0.1);
    expect(svc.scenePose).toBe('perch');
    expect(h.scene.getObjectByName('ysmeryth')).toBeDefined();
    expect(svc.pose('oath')).toBe(true);
    h.run(0.1);
    expect(h.of('wyrm.ysmeryth').map((e) => e.pose)).toEqual(['perch', 'oath']);
    h.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(svc.scenePose).toBe('perch');
    h.game.dispose();
    expect(h.scene.getObjectByName('ysmeryth')).toBeUndefined();
  });
});
