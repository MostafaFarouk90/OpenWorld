// The Act 4 HUD plugin on a reduced manifest: it sets up cleanly with and without a weather service, reads a provided one
// through its widgets, and the prompt font rule ships in its sheet.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { HudLayer } from '../../ui/HudLayer';
import hudPlugin from '../hud.plugin';
import { textOf, type ElementLike } from '../dom';
import act4Hud, { ACT4_HUD_CSS, MASK_KNOWN_FLAG, PHASE_SECONDS } from './act4Hud.plugin';
import type { WeatherState } from '../../weather/types';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => vi.restoreAllMocks());

async function boot() {
  const mounted: Array<{ id: string; element: ElementLike; update?: (dt?: number) => void }> = [];
  const mount = HudLayer.prototype.mount;
  vi.spyOn(HudLayer.prototype, 'mount').mockImplementation(function (this: HudLayer, slot, w) {
    mounted.push(w as never);
    return mount.call(this, slot, w);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const game = makeTestGame(physics);
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, act4Hud]);
  expect(statuses.filter((x) => x.state !== 'ok')).toEqual([]);
  const ctx = game.ctx;
  const widget = (id: string) => mounted.find((m) => m.id === id)!;
  const frame = () => {
    widget('act4-storm-meter').update?.(0);
    widget('act4-shelter-arrow').update?.(0);
  };
  return { game, ctx, widget, frame };
}

describe('act4-hud', () => {
  it('with no weather service nothing shows and nothing throws', async () => {
    const t = await boot();
    expect(() => t.frame()).not.toThrow();
    expect(t.widget('act4-storm-meter').element.style.display).toBe('none');
    expect(t.widget('act4-shelter-arrow').element.style.display).toBe('none');
  }, PLUGIN_TEST_TIMEOUT);

  it('reads a weather provider: storm, exposure from the event, the arrow, and the mask chip from M42', async () => {
    const t = await boot();
    const s: WeatherState = { kind: 'storm', t: 30, forced: false, held: false };
    const provide = (n: string, v: unknown) => (t.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
    provide('weather', {
      state: () => s,
      forceStorm: () => () => {},
      holdClear: () => () => {},
      clock: { seed: 1, next: () => ({ kind: 'clear', at: 60 }) },
      onShelter: () => false,
      inRegion: true,
      shelterPoints: () => [{ id: 'shelter.x', x: t.ctx.player.feet.x + 30, z: t.ctx.player.feet.z }],
    });
    t.ctx.events.emit('storm.exposed', { seconds: 4 });
    t.frame();
    const meter = t.widget('act4-storm-meter').element;
    expect(meter.style.display).not.toBe('none');
    expect(textOf(meter)).toContain('Ash storm: 1:00 left');
    expect(textOf(meter)).toContain('Exposed');
    expect(textOf(meter)).not.toContain('Mask');
    // The bar measures the time left against the longest storm, not the runtime's kind time (it restarts at the Waste's edge).
    s.t = 0;
    t.frame();
    const find = (e: ElementLike, cls: string): ElementLike | undefined =>
      e.className.split(' ').includes(cls) ? e : e.children.map((c) => find(c, cls)).find(Boolean);
    expect(find(meter, 'owg-bar-fill')!.style.width).toBe(`${Math.round((60 / PHASE_SECONDS.storm) * 10000) / 100}%`);
    const arrow = t.widget('act4-shelter-arrow').element;
    expect(arrow.style.display).not.toBe('none');
    expect(textOf(arrow)).toContain('Shelter 30 m');
    t.ctx.state.setFlag(MASK_KNOWN_FLAG, true);
    t.frame();
    expect(textOf(meter)).toContain('No mask');
    // A boss fight hides the meter and the arrow; its end brings them back.
    t.ctx.events.emit('boss.started', { bossId: 'x' } as never);
    t.frame();
    expect(meter.style.display).toBe('none');
    expect(arrow.style.display).toBe('none');
    t.ctx.events.emit('boss.ended', { bossId: 'x' } as never);
    t.frame();
    expect(meter.style.display).not.toBe('none');
    // The storm ends: exposure clears, the arrow goes.
    s.kind = 'clear';
    t.ctx.events.emit('weather.changed', { kind: 'clear', from: 'storm' });
    t.frame();
    expect(textOf(meter)).toContain('Clear: ash rises in 1:00');
    expect(arrow.style.display).toBe('none');
  }, PLUGIN_TEST_TIMEOUT);

  it('the sheet gives the interaction prompt the HUD font (Phase G playthrough L3)', () => {
    expect(ACT4_HUD_CSS).toMatch(/\.interaction-prompt\{font:[^}]*system-ui,sans-serif/);
  });
});
