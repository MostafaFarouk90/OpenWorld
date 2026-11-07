// The Act 5 HUD plugin on a reduced manifest: events drive the siege HUD, the cues read soft services, the screens service
// resolves, and no string key collides with another plugin's table.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { HudLayer } from '../../ui/HudLayer';
import { ACT3_HUD_STRINGS_EN } from '../act3/strings.en';
import { ACT4_ENDING_STRINGS_EN, ACT4_HUD_STRINGS_EN } from '../act4/strings.en';
import { textOf, type ElementLike } from '../dom';
import hudPlugin from '../hud.plugin';
import { HUD_STRINGS_EN } from '../strings.en';
import { HUD_JOURNAL_STRINGS_EN } from '../../hud-journal/strings.en';
import { HUD_JOURNAL_ACT4_STRINGS_EN } from '../../hud-journal/act4/strings.en';
import { MAP_STRINGS_EN } from '../../map/strings.en';
import { MAP_ACT4_STRINGS_EN } from '../../map/act4/strings.en';
import { MAP_ACT5_STRINGS_EN } from '../../map/act5/calderaLayer';
import act5Hud from './act5Hud.plugin';
import { ACT5_CREDITS_STRINGS_EN, ACT5_HUD_STRINGS_EN, ACT5_JOURNAL_STRINGS_EN } from './strings.en';

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
  const statuses = await bootPlugins(game, [corePlugin, hudPlugin, act5Hud]);
  expect(statuses.filter((x) => x.state !== 'ok')).toEqual([]);
  const widget = (id: string) => mounted.find((m) => m.id === id)!;
  const emit = (n: string, p: unknown) => (game.ctx.events as unknown as { emit(n: string, p: unknown): void }).emit(n, p);
  return { game, ctx: game.ctx, widget, emit };
}

describe('act5-hud plugin', () => {
  it('the siege HUD is hidden with no siege and follows the events; a load clears it', async () => {
    const t = await boot();
    const hud = t.widget('siege-hud');
    hud.update?.(0.1);
    expect(hud.element.style.display).toBe('none');
    t.emit('siege.wave.started', { siegeId: 'm52', n: 2 });
    t.emit('siege.gate.damaged', { siegeId: 'm52', pct: 55 });
    t.emit('enemies.shieldLine.broken', { lineId: 'l', members: ['a', 'b'] });
    hud.update?.(0.1);
    expect(textOf(hud.element)).toContain('Wave 2');
    expect(textOf(hud.element)).toContain('55%');
    expect(textOf(hud.element)).toContain('Line broken');
    t.emit('save.loaded', { slot: 'x' });
    hud.update?.(0.1);
    expect(hud.element.style.display).toBe('none');
  }, PLUGIN_TEST_TIMEOUT);

  it('the siege HUD hides once M52 is complete, and an unknown siege id never shows', async () => {
    const t = await boot();
    const hud = t.widget('siege-hud');
    t.emit('siege.wave.started', { siegeId: 'elsewhere', n: 1 });
    hud.update?.(0.1);
    expect(hud.element.style.display).toBe('none');
    t.emit('siege.wave.started', { siegeId: 'm52', n: 4 });
    t.ctx.state.setFlag('story.m52.complete', true);
    hud.update?.(0.1);
    expect(hud.element.style.display).toBe('none');
  }, PLUGIN_TEST_TIMEOUT);

  it('lava toasts, a vent list from the lava service shows the cue, and none shows nothing', async () => {
    const t = await boot();
    const toasts: string[] = [];
    t.ctx.events.on('hud.toast', (e) => toasts.push(e.textKey));
    t.emit('lava.entered', { volumeId: 'v' });
    t.emit('lava.thrown', { volumeId: 'v', to: { x: 0, y: 0, z: 0 } });
    expect(toasts).toEqual(['hud.lava.entered', 'hud.lava.thrown']);
    const vent = t.widget('vent-cue');
    vent.update?.(0);
    expect(vent.element.style.display).toBe('none');
    const f = t.ctx.player.feet;
    (t.ctx.services as unknown as { provide(n: string, v: unknown): void }).provide('lava', {
      vents: () => [{ id: 'v1', at: { x: f.x, z: f.z - 8 }, state: 'open', inS: 4 }],
    });
    vent.update?.(0);
    expect(textOf(vent.element)).toContain('Vent open: 4 s');
  }, PLUGIN_TEST_TIMEOUT);

  it('the screens service shows a phase card and resolves when dismissed headless', async () => {
    const t = await boot();
    const screens = t.ctx.services.require('act5Screens');
    const closed: string[] = [];
    t.ctx.events.on('hud.phaseCard.closed', (e) => closed.push(e.id));
    const p = screens.showPhaseCard('rim-holds', ['a']);
    expect(screens.active()).toBe(true);
    screens.advance();
    await p;
    expect(screens.active()).toBe(false);
    expect(closed).toEqual(['rim-holds']);
  }, PLUGIN_TEST_TIMEOUT);

  it('no string key collides with another HUD, journal or map table', () => {
    const mine = { ...ACT5_HUD_STRINGS_EN, ...ACT5_CREDITS_STRINGS_EN, ...ACT5_JOURNAL_STRINGS_EN, ...MAP_ACT5_STRINGS_EN };
    const others = new Set([
      ...Object.keys(HUD_STRINGS_EN), ...Object.keys(ACT3_HUD_STRINGS_EN), ...Object.keys(ACT4_HUD_STRINGS_EN), ...Object.keys(ACT4_ENDING_STRINGS_EN),
      ...Object.keys(HUD_JOURNAL_STRINGS_EN), ...Object.keys(HUD_JOURNAL_ACT4_STRINGS_EN), ...Object.keys(MAP_STRINGS_EN), ...Object.keys(MAP_ACT4_STRINGS_EN),
    ]);
    for (const k of Object.keys(mine)) expect(others.has(k), k).toBe(false);
    // And the three N9 tables do not share a key with each other.
    const n = Object.keys(ACT5_HUD_STRINGS_EN).length + Object.keys(ACT5_CREDITS_STRINGS_EN).length + Object.keys(ACT5_JOURNAL_STRINGS_EN).length + Object.keys(MAP_ACT5_STRINGS_EN).length;
    expect(Object.keys(mine).length).toBe(n);
  });
});
