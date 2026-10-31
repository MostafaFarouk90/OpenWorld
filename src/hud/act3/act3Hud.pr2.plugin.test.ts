// K15 PR 2 on a reduced manifest against the real game: the glide indicator off a `glide` service, and the Yield prompt with
// its hold off the real input's action state (replaced here by a hand-driven one) and a `trials` service.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { NO_ACTIONS, type Action, type ActionState } from '../../input/actions';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { HudLayer } from '../../ui/HudLayer';
import hudPlugin from '../hud.plugin';
import { textOf, type ElementLike } from '../dom';
import act3Hud from './act3Hud.plugin';
import { YIELD_HOLD_SECONDS } from './YieldPrompt';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  vi.restoreAllMocks();
  act3Hud.dispose?.();
});

async function boot() {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const widgets = new Map<string, ElementLike>();
  const mount = HudLayer.prototype.mount;
  vi.spyOn(HudLayer.prototype, 'mount').mockImplementation(function (this: HudLayer, slot, w) {
    widgets.set(w.id, w.element as never);
    return mount.call(this, slot, w);
  });
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, act3Hud]);
  expect(statuses.filter((x) => x.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const keys = new Set<Action>();
  const pressed = new Set<Action>();
  const fake: ActionState = { ...NO_ACTIONS, down: (a) => keys.has(a), pressed: (a) => pressed.has(a) };
  Object.defineProperty(ctx.input, 'actions', { get: () => fake, configurable: true });
  const provide = (n: string, v: unknown) => (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
  const step = () => {
    game.fixedUpdate();
    pressed.clear();
    ctx.hud.update(1 / 60);
  };
  return { game, ctx, widgets, keys, pressed, provide, step };
}
const shown = (e: ElementLike | undefined) => !!e && e.style.display !== 'none';

describe('act3-hud PR 2 widgets', () => {
  it('shows the glide indicator only while the glide service says gliding, with the interact glyph', async () => {
    const t = await boot();
    const g = { state: 'idle', yaw: 0, heading: 0, laneHalfAngle: 0.5, lift: 6, heightAboveGround: 41.6 };
    t.step();
    expect(shown(t.widgets.get('glide-indicator'))).toBe(false); // no service yet
    t.provide('glide', g);
    t.step();
    expect(shown(t.widgets.get('glide-indicator'))).toBe(false);
    g.state = 'gliding';
    t.step();
    const el = t.widgets.get('glide-indicator')!;
    expect(shown(el)).toBe(true);
    expect(textOf(el)).toContain('to let go');
    expect(textOf(el)).toContain('42 m');
    expect(textOf(el)).toContain('Rising');
    g.state = 'idle';
    t.step();
    expect(shown(el)).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('Yield: the prompt follows canYield, a held mercy key yields once after 1 s, a released one does not', async () => {
    const t = await boot();
    const yielded: string[] = [];
    const tr = { can: false, id: 'ysmeryth-trial' as string | null };
    t.provide('trials', { canYield: () => tr.can, state: () => (tr.id ? { id: tr.id } : null), yield: (id: string) => (yielded.push(id), true) });
    t.keys.add('mercy');
    t.pressed.add('mercy');
    t.step();
    for (let i = 0; i < 90; i++) t.step();
    expect(yielded).toEqual([]);
    expect(shown(t.widgets.get('yield-prompt'))).toBe(false);

    tr.can = true;
    t.keys.delete('mercy');
    t.step();
    expect(shown(t.widgets.get('yield-prompt'))).toBe(true);
    expect(textOf(t.widgets.get('yield-prompt')!)).toContain('Hold T to yield');
    // Early release.
    t.keys.add('mercy');
    t.pressed.add('mercy');
    for (let i = 0; i < YIELD_HOLD_SECONDS * 60 * 0.5; i++) t.step();
    t.keys.delete('mercy');
    for (let i = 0; i < 90; i++) t.step();
    expect(yielded).toEqual([]);
    // Full hold.
    t.keys.add('mercy');
    t.pressed.add('mercy');
    for (let i = 0; i < YIELD_HOLD_SECONDS * 60 + 3; i++) t.step();
    expect(yielded).toEqual(['ysmeryth-trial']);
  }, PLUGIN_TEST_TIMEOUT);
});
