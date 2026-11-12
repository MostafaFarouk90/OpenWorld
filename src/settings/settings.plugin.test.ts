import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import promptsPlugin from '../prompts/prompts.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { StubElement } from '../hud/dom';
import { leaveGuardActive } from '../world/leaveGuard';
import settingsPlugin, { setSettingsEnvForTest } from './settings.plugin';

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  setSettingsEnvForTest(null);
  vi.restoreAllMocks();
});

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const key = (type: 'keydown' | 'keyup', code: string) =>
  Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {}, stopPropagation: () => {} });

async function setup(opts: { beat?: boolean } = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = Object.assign(new EventTarget(), { setTimeout: (fn: () => void) => (fn(), 0) });
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null, createElement: (tag: string) => new StubElement(tag) });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const audio = { setMasterVolume: vi.fn(), setMuted: vi.fn(), setMusicVolume: vi.fn(), setEffectsVolume: vi.fn() };
  game.ctx.services.provide('audio', audio as never);
  const reload = vi.fn();
  let now = 0;
  setSettingsEnvForTest(() => ({ doc: doc as never, win: win as never, reload, now: () => now, storage: null }));
  const events: string[] = [];
  game.events.onAny((type) => events.push(type));
  await game.loadPlugins(modules(corePlugin, promptsPlugin, settingsPlugin));
  if (opts.beat !== undefined) game.ctx.services.provide('tutorial', { target: () => null, skipBeatActive: () => opts.beat === true });
  const ticks = { n: 0 };
  game.ctx.systems.add({ id: 'test.count', fixedPhase: 'late', order: 999, fixedUpdate: () => void ticks.n++ });
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  return {
    game, ctx: game.ctx, win, doc, audio, reload, events, ticks, run,
    advance: (ms: number) => void (now += ms),
    esc: (type: 'keydown' | 'keyup' = 'keydown') => win.dispatchEvent(key(type, 'Escape')),
    pause: () => game.ctx.services.get('pauseMenu')!,
    dispose() {
      game.dispose();
      world.dispose();
    },
  };
}

describe('settings plugin', () => {
  it('applies the stored audio settings at boot and on every change', async () => {
    const h = await setup();
    expect(h.audio.setMasterVolume).toHaveBeenCalledWith(1);
    expect(h.audio.setMusicVolume).toHaveBeenCalledWith(1);
    h.ctx.services.get('settings')!.set({ music: 30, effects: 50 });
    expect(h.audio.setMusicVolume).toHaveBeenLastCalledWith(0.3);
    expect(h.audio.setEffectsVolume).toHaveBeenLastCalledWith(0.5);
    h.dispose();
  });

  it('Esc in play opens the menu and freezes the world; Esc again resumes it', async () => {
    const h = await setup();
    h.esc();
    expect(h.pause().isOpen).toBe(true);
    expect(h.ctx.hud.modalOpen).toBe('pause-menu');
    expect(h.ctx.input.contexts.top()).toBe('menu');
    const before = h.ticks.n;
    h.run(10);
    expect(h.ticks.n).toBe(before);
    h.esc('keyup');
    h.esc();
    expect(h.pause().isOpen).toBe(false);
    expect(h.ctx.hud.modalOpen).toBeNull();
    h.esc('keyup');
    h.run(3);
    expect(h.ticks.n).toBe(before + 3);
    expect(h.pause().isOpen).toBe(false); // the latched Esc does not reopen it
    h.dispose();
  });

  it('losing the pointer lock in play opens it; a cutscene or another screen keeps it shut', async () => {
    const h = await setup();
    const pop = h.ctx.input.contexts.push('cutscene', 'test');
    h.doc.dispatchEvent(new Event('pointerlockchange'));
    h.esc();
    expect(h.pause().isOpen).toBe(false);
    h.esc('keyup');
    pop();
    h.run(2);
    const close = h.ctx.hud.openModal({ id: 'map.modal', element: {} as HTMLElement });
    h.esc();
    expect(h.pause().isOpen).toBe(false);
    h.esc('keyup');
    close?.();
    h.run(2);
    h.doc.dispatchEvent(new Event('pointerlockchange'));
    expect(h.pause().isOpen).toBe(true);
    h.dispose();
  });

  it('during a tutorial beat a short Esc tap opens it and a long hold leaves it to the skip', async () => {
    const h = await setup({ beat: true });
    h.esc();
    h.advance(1600);
    h.esc('keyup');
    expect(h.pause().isOpen).toBe(false);
    h.esc();
    h.advance(100);
    h.esc('keyup');
    expect(h.pause().isOpen).toBe(true);
    h.dispose();
  });

  it('quit to title announces itself, lifts the leave guard and reloads', async () => {
    const h = await setup();
    h.pause().open();
    const menu = (h.ctx.hud as unknown as { modal: { widget: { element: unknown } } }).modal;
    expect(menu).toBeTruthy();
    // Drive the menu through its own buttons via the service-free path: open the quit page and confirm.
    const el = menu.widget.element as import('../hud/dom').ElementLike;
    const find = (e: import('../hud/dom').ElementLike, id: string): import('../hud/dom').ElementLike | null =>
      e.getAttribute?.('data-id') === id ? e : e.children.map((c) => find(c, id)).find(Boolean) ?? null;
    find(el, 'quit')!.onclick!();
    find(el, 'quit-confirm')!.onclick!();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.events).toContain('settings.quitting');
    expect(leaveGuardActive()).toBe(false);
    expect(h.reload).toHaveBeenCalledTimes(1);
    h.dispose();
  });

  it('pauseMenu.addItem shows an item while its condition holds', async () => {
    const h = await setup();
    let on = false;
    const onSelect = vi.fn();
    const off = h.pause().addItem({ id: 'leave', labelKey: 'settings.back', when: () => on, onSelect });
    h.pause().open();
    const el = (h.ctx.hud as unknown as { modal: { widget: { element: import('../hud/dom').ElementLike } } }).modal.widget.element;
    const has = (e: import('../hud/dom').ElementLike): boolean => e.getAttribute?.('data-id') === 'item-leave' || e.children.some(has);
    expect(has(el)).toBe(false);
    h.pause().back();
    on = true;
    h.run(2);
    h.pause().open();
    const el2 = (h.ctx.hud as unknown as { modal: { widget: { element: import('../hud/dom').ElementLike } } }).modal.widget.element;
    expect(has(el2)).toBe(true);
    off();
    h.dispose();
  });
});
