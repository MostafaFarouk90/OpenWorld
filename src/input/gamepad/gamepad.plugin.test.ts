import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import { PLUGIN_TEST_TIMEOUT, bootPlugins } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { InputManager } from '../InputManager';
import gamepadPlugin from './gamepad.plugin';
import { PAD } from './padLayout';
import { FakePad } from './testing/fakePad';

vi.setConfig({ testTimeout: PLUGIN_TEST_TIMEOUT });

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  physics.dispose();
  vi.restoreAllMocks();
});

async function boot(opts: { provide?: boolean; pads?: FakePad[]; settings?: Record<string, unknown> } = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const pads = opts.pads ?? [new FakePad()];
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null, getGamepads: () => pads });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  if (opts.provide !== false) game.ctx.services.provide('gamepad', { pad: input.pad, bindings: input.padBindings });
  if (opts.settings) {
    const s = opts.settings;
    (game.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('settings', {
      get: () => s,
      set: () => {},
      onChange: () => () => {},
    });
  }
  const statuses = await bootPlugins(game, [corePlugin, gamepadPlugin]);
  const frame = () => game.render(0, 1 / 60);
  return { game, input, pad: pads[0], statuses, frame };
}

describe('gamepad plugin', () => {
  it('loads, polls the pad each rendered frame (even with the fixed ticks paused) and feeds look', async () => {
    const { input, pad, statuses, frame, game } = await boot();
    expect(statuses.find((s) => s.id === 'gamepad')?.state).toBe('ok');
    game.clock.setPaused('test', true);
    pad.right(1, 0);
    frame();
    expect(input.pad.connected).toBe(true);
    expect(input.consumeMouseDelta().dx).toBeGreaterThan(0);
  });

  it('applies the G1 look settings when the settings service exists', async () => {
    const { input, frame } = await boot({ settings: { padLookSensitivity: 1.5, padInvertY: true } });
    frame();
    expect(input.pad.sensitivity).toBe(1.5);
    expect(input.pad.invertY).toBe(true);
  });

  it('rumbles when the player is hit, only while the pad is in use', async () => {
    const { game, pad, frame } = await boot();
    const player = game.ctx.player.actor;
    const enemy = game.ctx.actors.spawn({ kind: 'foe', team: 'hostile', level: 1, maxHealth: 50 });
    game.ctx.damage.apply({ attackerId: enemy.id, targetId: player.id, amount: 5, kind: 'melee' } as never);
    expect(pad.vibrationActuator.playEffect).not.toHaveBeenCalled();
    pad.set(PAD.A, true);
    frame();
    game.ctx.damage.apply({ attackerId: enemy.id, targetId: player.id, amount: 5, kind: 'melee' } as never);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledWith('dual-rumble', expect.objectContaining({ duration: 120 }));
  });

  it('rumble is off when the setting says so', async () => {
    const { game, pad, frame } = await boot({ settings: { padRumble: false } });
    pad.set(PAD.A, true);
    frame();
    game.events.emit('boss.phase', { bossId: 'x', phase: 2, previous: 1 });
    expect(pad.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('an unsupported pad shows one toast', async () => {
    const odd = Object.assign(new FakePad(), { mapping: '' });
    const { game, frame } = await boot({ pads: [odd] });
    const toasts: unknown[] = [];
    game.events.on('hud.toast', (e) => toasts.push(e));
    frame();
    frame();
    expect(toasts).toEqual([{ textKey: 'gamepad.unsupported' }]);
  });

  it('without the gamepad service (headless harness) it loads and does nothing', async () => {
    const { statuses, frame } = await boot({ provide: false });
    expect(statuses.find((s) => s.id === 'gamepad')?.state).toBe('ok');
    expect(() => frame()).not.toThrow();
  });

  it('dispose releases held pad input', async () => {
    const { game, input, pad, frame } = await boot();
    pad.set(PAD.LT, true);
    frame();
    expect(input.sampleTick().actions.down('block')).toBe(true);
    expect(input.actionMap.isTokenHeld('p:base:6')).toBe(true);
    game.dispose();
    expect(input.actionMap.isTokenHeld('p:base:6')).toBe(false);
  });
});
