// The Act 3 HUD plugin on reduced manifests against the real game: the breath meter off K7's water service, K7's ferry stop
// interact with and without the menu (Cancel cannot strand the player; the fallback still boards), and K10's socket point
// with and without the screen (the fallback panel, the full-stack guard, a second open).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import { PLUGIN_TEST_TIMEOUT, bootPlugins, makeTestGame } from '../../core/testing/bootPlugins';
import type { GamePlugin } from '../../core/plugins';
import gearPlugin from '../../gear/gear.plugin';
import shardGemsPlugin from '../../gear/sockets/shardGems.plugin';
import { SOCKET_TUNING } from '../../gear/sockets/tuning';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { InteractionSystem, type Interactable } from '../../interaction/InteractionSystem';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { HudLayer } from '../../ui/HudLayer';
import traversal, { FERRY_RUNNING_FLAG } from '../../traversal/traversal.plugin';
import hudPlugin from '../hud.plugin';
import { StubElement, textOf, type ElementLike } from '../dom';
import act3Hud from './act3Hud.plugin';
import { FERRY_MENU_ID } from './FerryMenu';
import { SOCKET_SCREEN_ID } from './SocketScreen';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
}, PLUGIN_TEST_TIMEOUT);
afterEach(() => {
  vi.restoreAllMocks();
  act3Hud.dispose?.();
});

/** Spies before boot (the scoped context binds at setup): every interactable and every modal widget opened. */
function spies() {
  const interactables: Interactable[] = [];
  const reg = InteractionSystem.prototype.register;
  vi.spyOn(InteractionSystem.prototype, 'register').mockImplementation(function (this: InteractionSystem, i) {
    interactables.push(i);
    return reg.call(this, i);
  });
  const modals: Array<{ id: string; element: ElementLike }> = [];
  const open = HudLayer.prototype.openModal;
  vi.spyOn(HudLayer.prototype, 'openModal').mockImplementation(function (this: HudLayer, w, o) {
    modals.push(w as never);
    return open.call(this, w, o);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  return { interactables, modals };
}
const buttons = (el: ElementLike): StubElement[] => {
  const out: StubElement[] = [];
  const walk = (e: ElementLike): void => {
    if ((e as StubElement).tag === 'button') out.push(e as StubElement);
    e.children.forEach(walk);
  };
  walk(el);
  return out;
};

describe('act3-hud with the traversal plugin', () => {
  async function boot(plugins: GamePlugin[]) {
    const s = spies();
    const game = makeTestGame(physics);
    const statuses = await bootPlugins(game, plugins);
    expect(statuses.filter((x) => x.state !== 'ok')).toEqual([]);
    // The hooks are set on the first tick if the other plugin set up after this one.
    game.fixedUpdate();
    const ctx = game.ctx;
    const provide = (n: string, v: unknown) => (ctx.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
    const token = { held: true };
    provide('inventory', { has: (id: string) => id === 'key.ferry-token' && token.held, count: () => 1 });
    ctx.state.setFlag(FERRY_RUNNING_FLAG, true);
    const stop = (id: string) => s.interactables.find((i) => i.id === `ferry:${id}`)!;
    const boarded: Array<{ from: string; to: string }> = [];
    ctx.events.on('ferry.boarded', (e) => boarded.push({ from: e.from, to: e.to }));
    return { game, ctx, ...s, stop, token, boarded, ferry: ctx.services.require('ferry') };
  }
  const full = () => [corePlugin, traversal, hudPlugin, act3Hud];

  it('provides the breath meter, hooks the ferry and sets up cleanly', async () => {
    const t = await boot(full());
    expect(t.ctx.strings.t('act3.hud.breath')).toBe('Breath');
    expect(t.ctx.strings.t('act3.ferry.menu.cancel')).toBe('Stay ashore');
  }, PLUGIN_TEST_TIMEOUT);

  it('the stop interact opens the menu with both legs from the Mere; Cancel leaves riding false and the player in place', async () => {
    const t = await boot(full());
    const before = { ...t.ctx.player.feet };
    t.stop('mere').onInteract(t.ctx.player.actor);
    expect(t.ctx.hud.modalOpen).toBe(FERRY_MENU_ID);
    const widget = t.modals.at(-1)!;
    const text = textOf(widget.element);
    expect(text).toContain('Ride to Reedgate');
    expect(text).toContain('Ride to the Greywatch posts');
    expect(text).toContain('Ride to Mireweather Hut');
    // The live refusal does not count the menu's own modal as busy: every leg is offered.
    expect(buttons(widget.element).filter((b) => (b as unknown as { disabled?: boolean }).disabled)).toHaveLength(0);
    buttons(widget.element).find((b) => b.textContent === 'Stay ashore')!.click();
    expect(t.ctx.hud.modalOpen).toBeNull();
    expect(t.ferry.riding).toBe(false);
    expect(t.boarded).toEqual([]);
    expect(t.ctx.player.feet).toEqual(before);
    expect(t.ctx.services.require('movementMode').current).toBe('walk');
  }, PLUGIN_TEST_TIMEOUT);

  it('choosing a leg boards exactly that leg (ride, not the default destination) and closes the menu', async () => {
    const t = await boot(full());
    t.stop('mere').onInteract(t.ctx.player.actor);
    const widget = t.modals.at(-1)!;
    // The default from the Mere would be Reedgate (first registered); the third leg proves the menu chose.
    buttons(widget.element).find((b) => b.textContent === 'Ride to Mireweather Hut')!.click();
    expect(t.boarded).toEqual([{ from: 'mere', to: 'mireweather' }]);
    expect(t.ferry.riding).toBe(true);
    expect(t.ctx.hud.modalOpen).toBeNull();
    // Seated: the stop is not interactable and asking for the menu does nothing.
    expect(t.stop('mere').enabled?.()).toBe(false);
    t.stop('mere').onInteract(t.ctx.player.actor);
    expect(t.ctx.hud.modalOpen).toBeNull();
    expect(t.boarded).toHaveLength(1);
  }, PLUGIN_TEST_TIMEOUT);

  it('a refused leg is a disabled line with its reason, and cannot be chosen', async () => {
    const t = await boot(full());
    t.token.held = false;
    t.stop('mere').onInteract(t.ctx.player.actor);
    const widget = t.modals.at(-1)!;
    const text = textOf(widget.element);
    expect(text).toContain('Dudda keeps the ferry for those who carry his token.');
    const go = buttons(widget.element).filter((b) => b.textContent?.startsWith('Ride to'));
    expect(go).toHaveLength(3);
    for (const b of go) {
      expect((b as unknown as { disabled: boolean }).disabled).toBe(true);
      b.click();
    }
    expect(t.boarded).toEqual([]);
    expect(t.ctx.hud.modalOpen).toBe(FERRY_MENU_ID);
    // Before M24 the ferry is moored: the reason changes with the live state.
    buttons(widget.element).find((b) => b.textContent === 'Stay ashore')!.click();
    t.token.held = true;
    t.ctx.state.setFlag(FERRY_RUNNING_FLAG, false);
    t.stop('reedgate').onInteract(t.ctx.player.actor);
    expect(textOf(t.modals.at(-1)!.element)).toContain('The ferry is moored.');
  }, PLUGIN_TEST_TIMEOUT);

  it('without the act3-hud plugin the interact boards the default destination as before', async () => {
    const t = await boot([corePlugin, traversal]);
    t.stop('reedgate').onInteract(t.ctx.player.actor);
    expect(t.boarded).toEqual([{ from: 'reedgate', to: 'mere' }]);
    expect(t.ferry.riding).toBe(true);
    expect(t.ctx.hud.modalOpen).toBeNull();
  }, PLUGIN_TEST_TIMEOUT);

  it('setMenu(null), a menu that does not open and a menu that throws all leave the default boarding', async () => {
    const off = await boot(full());
    off.ferry.setMenu(null);
    off.stop('reedgate').onInteract(off.ctx.player.actor);
    expect(off.boarded).toEqual([{ from: 'reedgate', to: 'mere' }]);

    const closed = await boot(full());
    const asked: string[] = [];
    closed.ferry.setMenu((s) => (asked.push(s), false));
    closed.stop('reedgate').onInteract(closed.ctx.player.actor);
    expect(asked).toEqual(['reedgate']);
    expect(closed.boarded).toEqual([{ from: 'reedgate', to: 'mere' }]);

    const broken = await boot(full());
    broken.ferry.setMenu(() => {
      throw new Error('menu bug');
    });
    broken.stop('reedgate').onInteract(broken.ctx.player.actor);
    expect(broken.boarded).toEqual([{ from: 'reedgate', to: 'mere' }]);
  }, PLUGIN_TEST_TIMEOUT);

  it('dispose puts the default boarding back', async () => {
    const t = await boot(full());
    act3Hud.dispose?.();
    t.stop('reedgate').onInteract(t.ctx.player.actor);
    expect(t.ctx.hud.modalOpen).toBeNull();
    expect(t.boarded).toEqual([{ from: 'reedgate', to: 'mere' }]);
  }, PLUGIN_TEST_TIMEOUT);

  it('the breath meter mounts, shows only while diving and hides after a load', async () => {
    const t = await boot(full());
    const hud = t.ctx.hud as unknown as { lists?: Map<string, Array<{ widget: { id: string; update?(dt: number): void; element: StubElement } }>> };
    const mounted = [...(hud.lists?.values() ?? [])].flat().map((m) => m.widget).find((w) => w.id === 'breath-meter');
    expect(mounted).toBeDefined();
    const water = t.ctx.services.require('water');
    mounted!.update?.(0);
    expect(mounted!.element.style.display).toBe('none');
    // Dive the way the traversal tests do: a pool the player stands under.
    const { heightAt } = await import('../../terrain/heightfield');
    const X = 40;
    const Z = 40;
    const g = heightAt(X, Z);
    water.register({ id: 'water.test.pool', kind: 'dive', surfaceY: g + 5, area: { box: { x0: X - 6, z0: Z - 6, x1: X + 6, z1: Z + 6 } } });
    water.registerRoute({ id: 'dive.test.pool', volumeId: 'water.test.pool', points: [{ x: X - 5, y: g + 2, z: Z }, { x: X + 5, y: g + 2, z: Z }], airPockets: [], entryStand: { x: X - 10, y: heightAt(X - 10, Z) + 0.05, z: Z } } as never);
    t.ctx.player.teleport({ x: X - 10, y: heightAt(X - 10, Z) + 0.3, z: Z });
    for (let i = 0; i < 20; i++) t.game.fixedUpdate();
    t.ctx.player.teleport({ x: X, y: g + 0.5, z: Z });
    for (let i = 0; i < 5; i++) t.game.fixedUpdate();
    expect(water.state).toBe('diving');
    mounted!.update?.(0);
    expect(mounted!.element.style.display).not.toBe('none');
    t.ctx.player.teleport({ x: X - 10, y: heightAt(X - 10, Z) + 0.3, z: Z });
    t.ctx.events.emit('save.loaded', { slot: 'test' });
    for (let i = 0; i < 2; i++) t.game.fixedUpdate();
    expect(water.state).not.toBe('diving');
    mounted!.update?.(0);
    expect(mounted!.element.style.display).toBe('none');
  }, PLUGIN_TEST_TIMEOUT);
});

describe('act3-hud with the shard-gems plugin', () => {
  const BLADE = 'wyrm-tempered-oathblade';
  const BULWARK = 'shard-gem.bulwark';

  async function boot(withScreen: boolean) {
    const s = spies();
    (globalThis as { self?: unknown }).self ??= globalThis;
    const game = makeTestGame(physics);
    const ctx = game.ctx;
    const stand: GamePlugin = {
      id: 'sockets-stand-in',
      dependsOn: ['core'],
      setup(c) {
        const p = (n: string, v: unknown) => (c.services as unknown as { provide(n: string, v: unknown): void }).provide(n, v);
        p('quests', { state: () => 'completed' });
        p('classes', { chosen: () => true, current: () => 'knight' });
      },
    };
    const plugins = [corePlugin, inventoryPlugin, stand, gearPlugin, shardGemsPlugin, ...(withScreen ? [hudPlugin, act3Hud] : [])];
    const statuses = await bootPlugins(game, plugins);
    expect(statuses.filter((x) => x.state !== 'ok')).toEqual([]);
    game.fixedUpdate();
    const inv = ctx.services.require('inventory');
    inv.add(BLADE, 1);
    inv.addGold(500);
    return { ctx, inv, svc: ctx.services.require('shardGems'), ...s };
  }

  it('openScreen draws K15 screen when set, with the fit, take-out and refusal paths on the real inventory', async () => {
    const t = await boot(true);
    t.inv.add(BULWARK, 1);
    expect(t.svc.openScreen()).toBe(true);
    expect(t.ctx.hud.modalOpen).toBe(SOCKET_SCREEN_ID);
    const w = t.modals.at(-1)!;
    expect(w.element.className).toContain('owg-sockets');
    buttons(w.element).find((b) => b.textContent === 'Choose')!.click();
    buttons(w.element).find((b) => b.textContent === `Fit (${SOCKET_TUNING.fitGold} gold)`)!.click();
    expect(t.inv.socketsOf!(BLADE)).toEqual([{ slot: 0, shardId: BULWARK }]);
    expect(t.inv.count(BULWARK)).toBe(0);
    expect(textOf(w.element)).toContain('Done: Bulwark Shard-gem.');
  }, PLUGIN_TEST_TIMEOUT);

  it('a removal with the gem stack full is refused through the real plugin and the gem stays fitted', async () => {
    const t = await boot(true);
    const cap = t.inv.capOf!(BULWARK);
    t.inv.add(BULWARK, cap + 1);
    expect(t.inv.setSockets!(BLADE, [{ slot: 0, shardId: BULWARK }])).toBe(true);
    expect(t.inv.count(BULWARK)).toBe(cap);
    const gold = t.inv.gold;
    t.svc.openScreen();
    const w = t.modals.at(-1)!;
    buttons(w.element).find((b) => b.textContent === `Take out (${SOCKET_TUNING.removeGold} gold)`)!.click();
    expect(textOf(w.element)).toContain('No room in your pack for that shard-gem.');
    expect(t.inv.socketsOf!(BLADE)).toEqual([{ slot: 0, shardId: BULWARK }]);
    expect(t.inv.count(BULWARK)).toBe(cap);
    expect(t.inv.gold).toBe(gold);
  }, PLUGIN_TEST_TIMEOUT);

  it("the smith's dialogue event reaches the screen too (one hook covers it and the socket point); a second open while it is up returns false", async () => {
    const t = await boot(true);
    t.ctx.events.emit('npc.sockets.open', {});
    expect(t.ctx.hud.modalOpen).toBe(SOCKET_SCREEN_ID);
    expect(t.modals.at(-1)!.element.className).toContain('owg-sockets');
    expect(t.svc.openScreen()).toBe(false);
    expect(t.ctx.hud.modalOpen).toBe(SOCKET_SCREEN_ID);
  }, PLUGIN_TEST_TIMEOUT);

  it('with no screen set the fallback panel opens as before', async () => {
    const t = await boot(false);
    expect(t.svc.openScreen()).toBe(true);
    const w = t.modals.at(-1)!;
    expect(w.id).toBe('shard-gems');
    expect(w.element.className).toBe('owg-respec');
    expect(w.element.className).not.toContain('owg-sockets');
    expect(t.svc.openScreen()).toBe(false);
  }, PLUGIN_TEST_TIMEOUT);

  it('setScreen(null) restores the fallback panel', async () => {
    const t = await boot(true);
    t.svc.setScreen(null);
    t.svc.openScreen();
    expect(t.modals.at(-1)!.element.className).toBe('owg-respec');
  }, PLUGIN_TEST_TIMEOUT);

  it('dispose restores the fallback panel', async () => {
    const t = await boot(true);
    act3Hud.dispose?.();
    expect(t.svc.openScreen()).toBe(true);
    const w = t.modals.at(-1)!;
    expect(w.element.className).toBe('owg-respec');
    expect(w.element.className).not.toContain('owg-sockets');
  }, PLUGIN_TEST_TIMEOUT);
});
